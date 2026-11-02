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


def recipe_request(row: dict, day: Day, meal_type: MealType, latest: dict) -> dict:
    """Prepare lossless recipe input; response envelope still needs AI agreement."""
    entry = next(entry for entry in row["result"]["weekly_plan"] if entry["day"] == day)
    return {
        "items": entry["meals"][meal_type]["items"],
        "food_allergens": latest["food_allergens"],
        "disliked_foods": row["request_context"]["disliked_foods"],
    }


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

    return router
