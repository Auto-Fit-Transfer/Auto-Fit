"""Preview AI changes without modifying a weekly plan; confirm atomically later."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.app.ai_server import AIEndpoint
from backend.app.diet_rebalance import (
    RebalanceConfirmRequest, RebalancePreviewRequest, TodayStatus,
    load_today_status, reduction_budget, tomorrow_entry,
)
from backend.app.weekly_diet import (
    call_ai, check_restrictions, get_weekly_ai_client,
    require_current_context, saved_ingredient_names,
)
from backend.app.weekly_diet_contract import Meal, MealAdjustment, MealType, ReplacementReply, MEALS
from backend.app.weekly_diet_store import WeeklyDietStore, fail


class PreviewMeal(BaseModel):
    meal_type: MealType
    status: Literal["unchanged", "ready", "unavailable"]
    before: Meal
    after: Meal
    requested_reduction_kcal: float = Field(ge=0)
    actual_reduction_kcal: float = Field(ge=0)
    adjustment: MealAdjustment | None = None
    error_code: str | None = None


class TomorrowPreview(BaseModel):
    date: date
    daily_target_kcal: float = Field(gt=0)
    floor_kcal: float = Field(ge=0)
    total_before_kcal: float = Field(ge=0)
    total_after_kcal: float = Field(ge=0)
    actual_reduction_kcal: float = Field(ge=0)
    unapplied_reduction_kcal: float = Field(ge=0)
    meals: list[PreviewMeal] = Field(min_length=4, max_length=4)


class PreviewResponse(BaseModel):
    ok: Literal[True]
    preview_id: UUID | None
    expires_at: datetime | None
    weekly_diet_plan_id: UUID
    base_version: int = Field(ge=1)
    today: TodayStatus
    tomorrow: TomorrowPreview
    failed_meal_types: list[MealType]


class ConfirmResponse(BaseModel):
    ok: Literal[True]
    weekly_diet_plan_id: UUID
    version: int = Field(ge=2)
    tomorrow_date: date
    applied_meal_types: list[MealType] = Field(min_length=1, max_length=4)
    failed_meals: list[dict]
    decision: Literal["adjusted"]


def valid_candidate(reply: dict, day: str, meal_type: str, before: dict,
                    requested: Decimal, slot_target: dict, floor: Decimal,
                    current_total: Decimal) -> Decimal:
    replacement = reply["meal"]
    if replacement["day"] != day or replacement["meal_type"] != meal_type:
        fail("AI_SLOT_MISMATCH")
    adjustment = replacement.get("adjustment")
    if not isinstance(adjustment, dict):
        fail("AI_INVALID_RESPONSE")
    baseline = Decimal(str(slot_target["calories_kcal"]))
    if (abs(Decimal(str(adjustment["baseline_calories_kcal"])) - baseline) > Decimal("0.11")
            or abs(Decimal(str(adjustment["requested_reduction_kcal"])) - requested)
            > Decimal("0.11")):
        fail("AI_INVALID_RESPONSE")
    before_kcal = Decimal(str(before["estimated_calories_kcal"]))
    after_kcal = Decimal(str(replacement["meal"]["estimated_calories_kcal"]))
    actual = before_kcal - after_kcal
    # A lower goal is only useful if the displayed plan really gets lighter.
    if actual < 0 or actual > requested + Decimal("0.11"):
        fail("AI_INVALID_RESPONSE")
    if current_total - actual + Decimal("0.01") < floor:
        fail("AI_INVALID_RESPONSE")
    return actual


def create_weekly_rebalance_router(get_user, get_settings, load_context,
                                   load_ai_context, require_adult):
    router = APIRouter(prefix="/api/diet/weekly-recommendations", tags=["Diet"])

    def store_dependency(user=Depends(get_user), settings=Depends(get_settings)):
        return WeeklyDietStore(settings, user.id)

    @router.post("/{plan_id}/tomorrow-rebalance/preview", response_model=PreviewResponse)
    async def preview(plan_id: UUID, body: RebalancePreviewRequest,
                      store=Depends(store_dependency), settings=Depends(get_settings),
                      ai=Depends(get_weekly_ai_client)):
        await require_adult(store.user_id, settings)
        status = await load_today_status(store, settings, load_context)
        today = status["today"]
        if status["target_status"] != "available":
            raise HTTPException(409, detail={"code": "DIET_TARGET_UNAVAILABLE"})
        if today["has_unknown_calories"]:
            raise HTTPException(409, detail={"code": "DIET_CALORIES_INCOMPLETE"})
        if today["decision"] != "none":
            raise HTTPException(409, detail={"code": "DIET_REBALANCE_ALREADY_DECIDED"})
        if today["overage_kcal"] <= 0:
            raise HTTPException(409, detail={"code": "DIET_NO_OVERAGE"})

        tomorrow_reference = status["tomorrow_plan"]
        if tomorrow_reference["weekly_diet_plan_id"] != str(plan_id):
            raise HTTPException(409, detail={"code": "DIET_TOMORROW_PLAN_MISMATCH"})
        if tomorrow_reference["target_status"] != "available":
            raise HTTPException(409, detail={"code": "DIET_TARGET_UNAVAILABLE"})

        tomorrow = today["date"] + timedelta(days=1)
        plan = await store.get(plan_id=plan_id)
        if plan is None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        if plan["version"] != body.expected_version:
            fail("WEEKLY_DIET_VERSION_CONFLICT", 409)
        latest = await load_ai_context(store.user_id, settings)
        if "reference_standard" in plan["request_context"] and "reference_standard" not in latest:
            fail("AI_KDRI_DISABLED", 503)
        require_current_context(plan, latest)
        day, meals = tomorrow_entry(plan, tomorrow)
        total_before, daily_goal, floor, requests = reduction_budget(
            plan, meals, body.meal_types, today["overage_kcal"],
        )
        excluded = [meal["menu_name"] for entry in plan["result"]["weekly_plan"]
                    for meal in entry["meals"].values()]
        seen_names = {name.strip().casefold() for name in excluded}
        context = dict(plan["request_context"])
        successes, failures, proposed = [], [], {}
        current_total = total_before

        for meal_type in body.meal_types:
            requested = requests[meal_type]
            if requested <= 0:
                failures.append({"meal_type": meal_type, "code": "DIET_NO_REDUCTION_ROOM"})
                continue
            current = meals[meal_type]
            payload = {
                **context, "target_day": day, "target_meal": meal_type,
                "current_menu_name": current["menu_name"],
                "excluded_menu_names": excluded,
                "current_ingredients": saved_ingredient_names(current),
                "meal_target": plan["result"]["slot_targets"][meal_type],
                "adjustment_policy": "gentle_rebalance_v1",
                "requested_calorie_reduction_kcal": float(requested),
            }
            await store.consume_generation_quota()
            try:
                reply = await call_ai(ai, AIEndpoint.REPLACE_MEAL, payload, ReplacementReply)
            except HTTPException as exc:
                if exc.status_code != 503:
                    raise
                failures.append({"meal_type": meal_type, "code": "AI_UNAVAILABLE"})
                continue
            replacement = reply["meal"]["meal"]
            actual = valid_candidate(
                reply, day, meal_type, current, requested,
                plan["result"]["slot_targets"][meal_type], floor, current_total,
            )
            check_restrictions([replacement], context)
            name = replacement["menu_name"].strip().casefold()
            if name in seen_names:
                fail("AI_DUPLICATE_MENU")
            seen_names.add(name)
            excluded.append(replacement["menu_name"])
            current_total -= actual
            successes.append({"meal_type": meal_type, "replacement": reply})
            proposed[meal_type] = reply

        if latest != await load_ai_context(store.user_id, settings):
            fail("WEEKLY_DIET_CONTEXT_CHANGED", 409)
        current_plan = await store.get(plan_id=plan_id)
        if current_plan is None or current_plan["version"] != body.expected_version:
            fail("WEEKLY_DIET_VERSION_CONFLICT", 409)

        meal_rows = []
        for meal_type in MEALS:
            before = meals[meal_type]
            reply = proposed.get(meal_type)
            failed = next((item for item in failures if item["meal_type"] == meal_type), None)
            after = reply["meal"]["meal"] if reply else before
            meal_rows.append({
                "meal_type": meal_type,
                "status": "ready" if reply else "unavailable" if failed else "unchanged",
                "before": before, "after": after,
                "requested_reduction_kcal": float(requests.get(meal_type, 0)),
                "actual_reduction_kcal": float(Decimal(str(before["estimated_calories_kcal"]))
                                               - Decimal(str(after["estimated_calories_kcal"]))),
                "adjustment": reply["meal"]["adjustment"] if reply else None,
                "error_code": failed["code"] if failed else None,
            })
        actual_total = total_before - current_total
        preview_data = {
            "ok": True, "preview_id": None, "expires_at": None,
            "weekly_diet_plan_id": str(plan_id), "base_version": body.expected_version,
            "today": today,
            "tomorrow": {
                "date": tomorrow, "daily_target_kcal": float(daily_goal),
                "floor_kcal": float(floor), "total_before_kcal": float(total_before),
                "total_after_kcal": float(current_total),
                "actual_reduction_kcal": float(actual_total),
                "unapplied_reduction_kcal": float(max(
                    Decimal(0), Decimal(str(today["overage_kcal"])) - actual_total,
                )),
                "meals": meal_rows,
            },
            "failed_meal_types": [item["meal_type"] for item in failures],
        }
        parsed = PreviewResponse.model_validate(preview_data)
        if successes:
            saved = await store.request("POST", "rpc/save_diet_rebalance_preview", body={
                "p_user_id": store.user_id, "p_plan_id": str(plan_id),
                "p_base_version": body.expected_version,
                "p_today_date": today["date"].isoformat(),
                "p_tomorrow_date": tomorrow.isoformat(),
                "p_successes": successes, "p_failures": failures,
                "p_public_preview": parsed.model_dump(mode="json"),
            })
            if not isinstance(saved, dict):
                fail("WEEKLY_DIET_STORAGE_ERROR")
            try:
                return PreviewResponse.model_validate({**preview_data, **saved})
            except ValueError:
                fail("WEEKLY_DIET_STORAGE_ERROR")
        return parsed

    @router.post("/{plan_id}/tomorrow-rebalance/confirm", response_model=ConfirmResponse)
    async def confirm(plan_id: UUID, body: RebalanceConfirmRequest,
                      store=Depends(store_dependency), settings=Depends(get_settings)):
        await require_adult(store.user_id, settings)
        plan = await store.get(plan_id=plan_id)
        if plan is None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        latest = await load_ai_context(store.user_id, settings)
        if "reference_standard" in plan["request_context"] and "reference_standard" not in latest:
            fail("AI_KDRI_DISABLED", 503)
        require_current_context(plan, latest)
        result = await store.request("POST", "rpc/confirm_diet_rebalance_preview", body={
            "p_user_id": store.user_id, "p_plan_id": str(plan_id),
            "p_preview_id": str(body.preview_id),
        })
        try:
            return ConfirmResponse.model_validate({"ok": True, **result})
        except (TypeError, ValueError):
            fail("WEEKLY_DIET_STORAGE_ERROR")

    return router
