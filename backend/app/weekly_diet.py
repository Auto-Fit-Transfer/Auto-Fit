"""Weekly generation and atomic replacement using the structured AI endpoints."""

from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ValidationError

from backend.app.ai_server import AIEndpoint, AIServerClient, AIServerError, get_ai_server_config
from backend.app.diet_ai import conflicts_allergy
from backend.app.weekly_diet_contract import (
    Day, MealType, WeeklyGenerateRequest, ReplaceWeeklyMealRequest,
    WeeklyReply, ReplacementReply, WeeklyPlanResponse, current_week_start,
)
from backend.app.weekly_diet_store import WeeklyDietStore, fail, public_plan
from backend.app.weekly_recipe_contract import RecipeReply, RecipeRequest


def get_weekly_ai_client():
    try:
        config = get_ai_server_config()
    except ValueError:
        fail("AI_CONFIGURATION_ERROR", 503)
    if config is None:
        fail("AI_DISABLED", 503)
    return AIServerClient(config)


async def call_ai(client, endpoint, payload, schema):
    try:
        data = await client.post(endpoint, payload)
        schema.model_validate(data)
        if data.get("ok") is not True:
            raise ValueError("AI result is not successful")
        # Validate without replacing the raw items by rounded or normalized DTOs.
        return data
    except AIServerError as exc:
        code = exc.code
        status = 503 if code in {"AI_UNAVAILABLE", "AI_TIMEOUT", "AI_CONNECTION_ERROR"} else 502
        fail(code, status)
    except (ValidationError, ValueError):
        fail("AI_INVALID_RESPONSE")


def check_restrictions(meals, context):
    exclusions = context["food_allergens"] + context["disliked_foods"]
    for meal in meals:
        names = [meal["menu_name"], *(item["food_name"] for item in meal["items"])]
        if any(conflicts_allergy(name, exclusions) for name in names):
            fail("AI_FOOD_RESTRICTION_CONFLICT")


def request_context(body: WeeklyGenerateRequest, latest: dict) -> dict:
    return {
        "metric_statuses": latest.get("metric_statuses", {}),
        "food_allergens": latest["food_allergens"],
        "disliked_foods": body.disliked_foods, "goal_type": latest.get("goal_type"),
        "additional_input": body.additional_input,
        "sido": None, "sigungu": None, "nearby_regions": [],
        "meal_target": body.meal_target.model_dump(mode="json") if body.meal_target else None,
    }


def require_current_context(row: dict, latest: dict):
    if any(row["request_context"].get(key) != value for key, value in latest.items()):
        raise HTTPException(409, detail={
            "code": "WEEKLY_DIET_CONTEXT_CHANGED",
            "message": "알레르기 또는 목표가 변경되었습니다. 주간 식단 전체를 다시 생성해 주세요.",
            "weekly_diet_plan_id": row["weekly_diet_plan_id"], "version": row["version"],
        })


def recipe_request(row: dict, day: Day, meal_type: MealType, latest: dict,
                   servings: int = 1) -> dict:
    """Prepare one slot from the saved recommendation, without inferred ingredients."""
    entry = next(entry for entry in row["result"]["weekly_plan"] if entry["day"] == day)
    meal = entry["meals"][meal_type]
    items = meal["items"]
    related = [
        {"menu_name": other["menu_name"], "day": other_day["day"],
         "meal_type": other_type, "estimated_calories_kcal": other["estimated_calories_kcal"]}
        for other_day in row["result"]["weekly_plan"]
        for other_type, other in other_day["meals"].items()
        if (other_day["day"], other_type) != (day, meal_type)
    ][:10]
    payload = {
        "day": day, "meal_type": meal_type,
        "menu_name": meal["menu_name"], "menu_description": meal["menu_description"],
        "guidance": meal.get("guidance") or "", "tags": (meal.get("tags") or [])[:6],
        "personalization_reasons": (meal.get("personalization_reasons") or [])[:5],
        "servings": servings,
        "related_menus": related,
        "items": [{key: item[key] for key in (
            "food_name", "portion_g", "calories_kcal", "carbohydrate_g", "protein_g", "fat_g"
        )} for item in items],
        "food_allergens": latest["food_allergens"],
        "disliked_foods": row["request_context"]["disliked_foods"],
    }
    try:
        RecipeRequest.model_validate(payload)
    except ValidationError:
        fail("AI_INPUT_REJECTED", 422)
    return payload


def validate_recipe_reply(payload: dict, reply: dict) -> None:
    result = reply["meal"]
    if (result["day"] != payload["day"] or result["meal_type"] != payload["meal_type"]
            or result["servings"] != payload["servings"]):
        fail("AI_SLOT_MISMATCH")
    if result["menu_name"] != payload["menu_name"] or len(result["items"]) != len(payload["items"]):
        fail("AI_INVALID_RESPONSE")
    if any(any(actual[key] != expected[key] for key in expected)
           for actual, expected in zip(result["items"], payload["items"])):
        fail("AI_INVALID_RESPONSE")
    totals = {
        "estimated_calories_kcal": sum(item["calories_kcal"] for item in payload["items"]),
        **{key: sum(item[key] for item in payload["items"])
           for key in ("carbohydrate_g", "protein_g", "fat_g")},
    }
    if (abs(result["estimated_calories_kcal"] - totals["estimated_calories_kcal"]) > 0.11
            or any(abs(result["nutrition"][key] - totals[key]) > 0.11
                   for key in ("carbohydrate_g", "protein_g", "fat_g"))
            or result["daily_target_percentages"] is not None
            or result["related_menus"] != payload["related_menus"]):
        fail("AI_INVALID_RESPONSE")


def create_weekly_diet_router(get_user, get_settings, load_context):
    router = APIRouter(prefix="/api/diet/weekly-recommendations", tags=["Diet"])

    def store_dependency(user=Depends(get_user), settings=Depends(get_settings)):
        return WeeklyDietStore(settings, user.id)

    @router.get("", response_model=WeeklyPlanResponse)
    async def get_week(week_start_date: date | None = Query(default=None),
                       store=Depends(store_dependency), settings=Depends(get_settings)) -> dict[str, Any]:
        week = week_start_date or current_week_start()
        if week.weekday() != 0:
            fail("WEEKLY_DIET_INVALID_WEEK", 422)
        row = await store.get(week_start=week)
        if row is None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        require_current_context(row, await load_context(store.user_id, settings))
        return public_plan(row)

    @router.get("/{plan_id}", response_model=WeeklyPlanResponse)
    async def get_plan(plan_id: UUID, store=Depends(store_dependency), settings=Depends(get_settings)) -> dict[str, Any]:
        row = await store.get(plan_id=plan_id)
        if row is None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        require_current_context(row, await load_context(store.user_id, settings))
        return public_plan(row)

    @router.post("/generate", status_code=201, response_model=WeeklyPlanResponse,
                 responses={200: {"model": WeeklyPlanResponse, "description": "Existing week regenerated"}})
    async def generate(body: WeeklyGenerateRequest, response: Response, store=Depends(store_dependency),
                       settings=Depends(get_settings), ai=Depends(get_weekly_ai_client)) -> dict[str, Any]:
        existing = await store.get(week_start=body.week_start_date)
        if existing is not None:
            if body.expected_version is None:
                fail("WEEKLY_DIET_EXISTS", 409)
            if existing["version"] != body.expected_version:
                fail("WEEKLY_DIET_VERSION_CONFLICT", 409)
            options = body.model_dump()
            for field in ("disliked_foods", "additional_input", "meal_target"):
                if field not in body.model_fields_set:
                    options[field] = existing["request_context"][field]
            body = WeeklyGenerateRequest.model_validate(options)
        elif body.expected_version is not None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        latest = await load_context(store.user_id, settings)
        context = request_context(body, latest)
        await store.consume_generation_quota()
        reply = await call_ai(ai, AIEndpoint.DIET, context, WeeklyReply)
        check_restrictions(
            [meal for day in reply["result"]["weekly_plan"] for meal in day["meals"].values()], context
        )
        if latest != await load_context(store.user_id, settings):
            fail("WEEKLY_DIET_CONTEXT_CHANGED", 409)
        if existing is None:
            row = await store.create(body.week_start_date, reply, context)
        else:
            row = await store.refresh(existing["weekly_diet_plan_id"], body.expected_version, reply, context)
            response.status_code = 200
        return public_plan(row)

    @router.post("/{plan_id}/meals/{day}/{meal_type}/regenerate", response_model=WeeklyPlanResponse)
    async def regenerate(plan_id: UUID, day: Day, meal_type: MealType,
                         body: ReplaceWeeklyMealRequest, store=Depends(store_dependency),
                         settings=Depends(get_settings), ai=Depends(get_weekly_ai_client)) -> dict[str, Any]:
        row = await store.get(plan_id=plan_id)
        if row is None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        if row["version"] != body.expected_version:
            fail("WEEKLY_DIET_VERSION_CONFLICT", 409)
        latest = await load_context(store.user_id, settings)
        require_current_context(row, latest)
        context = {**row["request_context"], **latest}
        current = next(entry for entry in row["result"]["weekly_plan"] if entry["day"] == day)["meals"][meal_type]
        excluded = list(dict.fromkeys(
            meal["menu_name"] for entry in row["result"]["weekly_plan"] for meal in entry["meals"].values()
        ))
        payload = {
            **context, "target_day": day, "target_meal": meal_type,
            "current_menu_name": current["menu_name"], "excluded_menu_names": excluded,
            # Items are complete foods, not verified recipe ingredients.
            "current_ingredients": [],
        }
        await store.consume_generation_quota()
        reply = await call_ai(ai, AIEndpoint.REPLACE_MEAL, payload, ReplacementReply)
        replacement = reply["meal"]
        if replacement["day"] != day or replacement["meal_type"] != meal_type:
            fail("AI_SLOT_MISMATCH")
        check_restrictions([replacement["meal"]], context)
        if replacement["meal"]["menu_name"].strip().casefold() in {name.strip().casefold() for name in excluded}:
            fail("AI_DUPLICATE_MENU")
        if latest != await load_context(store.user_id, settings):
            fail("WEEKLY_DIET_CONTEXT_CHANGED", 409)
        updated = await store.replace(plan_id, body.expected_version, day, meal_type, reply, context)
        return public_plan(updated)

    @router.get("/{plan_id}/meals/{day}/{meal_type}/recipe", response_model=RecipeReply)
    async def get_recipe(plan_id: UUID, day: Day, meal_type: MealType,
                         servings: int = Query(default=1, ge=1, le=20),
                         store=Depends(store_dependency), settings=Depends(get_settings),
                         ai=Depends(get_weekly_ai_client)) -> dict[str, Any]:
        row = await store.get(plan_id=plan_id)
        if row is None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        latest = await load_context(store.user_id, settings)
        require_current_context(row, latest)
        payload = recipe_request(row, day, meal_type, latest, servings)
        reply = await call_ai(ai, AIEndpoint.RECIPE, payload, RecipeReply)
        validate_recipe_reply(payload, reply)
        current = await store.get(plan_id=plan_id)
        if current is None or current["version"] != row["version"]:
            fail("WEEKLY_DIET_VERSION_CONFLICT", 409)
        if latest != await load_context(store.user_id, settings):
            fail("WEEKLY_DIET_CONTEXT_CHANGED", 409)
        return reply

    return router
