"""Stable daily overage numbers for the weekly-diet tomorrow decision."""

from datetime import date, timedelta
from decimal import Decimal, ROUND_DOWN
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.weekly_diet import require_current_context
from backend.app.weekly_diet_contract import MealType
from backend.app.weekly_diet_store import WeeklyDietStore, fail


class TodayTotals(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    consumed_kcal: Decimal = Field(ge=0)
    has_unknown_calories: bool
    exercise_burned_kcal: Decimal = Field(ge=0)
    running_burned_kcal: Decimal = Field(ge=0)
    decision: Literal["none", "cheat", "adjusted"]


class TodayStatus(BaseModel):
    date: date
    consumed_kcal: float = Field(ge=0)
    has_unknown_calories: bool
    exercise_burned_kcal: float = Field(ge=0)
    running_burned_kcal: float = Field(ge=0)
    total_burned_kcal: float = Field(ge=0)
    target_kcal: float | None = Field(default=None, gt=0)
    overage_kcal: float | None = Field(default=None, ge=0)
    decision: Literal["none", "cheat", "adjusted"]


class TodayStatusResponse(BaseModel):
    ok: Literal[True]
    target_status: Literal["available", "weekly_plan_missing", "target_pending"]
    weekly_diet_plan_id: UUID | None
    version: int | None
    today: TodayStatus
    tomorrow_plan: "TomorrowPlanStatus"


class TomorrowPlanStatus(BaseModel):
    date: date
    target_status: Literal["available", "weekly_plan_missing", "target_pending"]
    weekly_diet_plan_id: UUID | None
    version: int | None


class CheatDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["cheat"]


class CheatDecisionResponse(BaseModel):
    ok: Literal[True]
    date: date
    decision: Literal["cheat"]


class RebalancePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1, strict=True)
    meal_types: list[MealType] = Field(min_length=1, max_length=4)

    @field_validator("meal_types")
    @classmethod
    def unique_meals(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("meal_types must not repeat")
        return value


class RebalanceConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preview_id: UUID


def tomorrow_entry(plan: dict, tomorrow: date) -> tuple[str, dict]:
    week_start = date.fromisoformat(plan["week_start_date"])
    offset = (tomorrow - week_start).days
    if not 0 <= offset < 7:
        raise HTTPException(422, detail={"code": "DIET_TOMORROW_OUTSIDE_PLAN"})
    day = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")[offset]
    entry = next(item for item in plan["result"]["weekly_plan"] if item["day"] == day)
    return day, entry["meals"]


def reduction_budget(plan: dict, meals: dict, selected: list[str], overage: float):
    target = plan["result"].get("daily_target")
    slots = plan["result"].get("slot_targets")
    if target is None or slots is None:
        raise HTTPException(409, detail={"code": "DIET_TARGET_UNAVAILABLE"})
    before = sum(Decimal(str(meal["estimated_calories_kcal"])) for meal in meals.values())
    daily_goal = Decimal(str(target["calories_kcal"]))
    floor = (daily_goal * Decimal("0.85")).quantize(Decimal("0.01"))
    available = max(Decimal(0), before - floor)
    if available <= 0:
        raise HTTPException(409, detail={
            "code": "DIET_DAILY_FLOOR_REACHED", "daily_target_kcal": float(daily_goal),
            "floor_kcal": float(floor), "total_before_kcal": float(before),
        })
    equal_share = min(Decimal(str(overage)), available) / len(selected)
    requests = {}
    for meal_type in selected:
        slot_goal = Decimal(str(slots[meal_type]["calories_kcal"]))
        requested = min(equal_share, slot_goal * Decimal("0.15"))
        requests[meal_type] = requested.quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    return before, daily_goal, floor, requests


def calculate_status(totals: TodayTotals, plan: dict | None) -> dict[str, Any]:
    target = (plan or {}).get("result", {}).get("daily_target")
    target_kcal = Decimal(str(target["calories_kcal"])) if target else None
    total_burned = totals.exercise_burned_kcal + totals.running_burned_kcal
    overage = (max(Decimal(0), totals.consumed_kcal - total_burned - target_kcal)
               if target_kcal is not None and not totals.has_unknown_calories else None)
    return {
        "ok": True,
        "target_status": ("weekly_plan_missing" if plan is None else
                          "target_pending" if target is None else "available"),
        "weekly_diet_plan_id": plan["weekly_diet_plan_id"] if plan else None,
        "version": plan["version"] if plan else None,
        "today": {
            "date": totals.date,
            "consumed_kcal": float(totals.consumed_kcal),
            "has_unknown_calories": totals.has_unknown_calories,
            "exercise_burned_kcal": float(totals.exercise_burned_kcal),
            "running_burned_kcal": float(totals.running_burned_kcal),
            "total_burned_kcal": float(total_burned),
            "target_kcal": float(target_kcal) if target_kcal is not None else None,
            "overage_kcal": float(overage) if overage is not None else None,
            "decision": totals.decision,
        },
    }


async def load_today_status(store, settings, load_context):
    raw = await store.request("POST", "rpc/diet_rebalance_today_totals",
                              body={"p_user_id": store.user_id})
    try:
        totals = TodayTotals.model_validate(raw)
    except ValueError:
        fail("WEEKLY_DIET_STORAGE_ERROR")
    week_start = totals.date - timedelta(days=totals.date.weekday())
    plan = await store.get(week_start=week_start)
    if plan is not None:
        require_current_context(plan, await load_context(store.user_id, settings))
    tomorrow = totals.date + timedelta(days=1)
    next_week = tomorrow - timedelta(days=tomorrow.weekday())
    tomorrow_plan = (plan if next_week == week_start
                     else await store.get(week_start=next_week))
    if tomorrow_plan is not None and tomorrow_plan is not plan:
        require_current_context(tomorrow_plan, await load_context(store.user_id, settings))
    result = calculate_status(totals, plan)
    result["tomorrow_plan"] = {
        "date": tomorrow,
        "target_status": ("weekly_plan_missing" if tomorrow_plan is None else
                          "target_pending" if tomorrow_plan["result"].get("daily_target") is None
                          else "available"),
        "weekly_diet_plan_id": (tomorrow_plan["weekly_diet_plan_id"]
                                if tomorrow_plan else None),
        "version": tomorrow_plan["version"] if tomorrow_plan else None,
    }
    return result


def create_diet_rebalance_router(get_user, get_settings, load_context):
    router = APIRouter(prefix="/api/diet/tomorrow-rebalance", tags=["Diet"])

    def store_dependency(user=Depends(get_user), settings=Depends(get_settings)):
        return WeeklyDietStore(settings, user.id)

    @router.get("/status", response_model=TodayStatusResponse)
    async def get_status(store=Depends(store_dependency), settings=Depends(get_settings)):
        return await load_today_status(store, settings, load_context)

    @router.post("/decision", response_model=CheatDecisionResponse)
    async def choose_cheat(body: CheatDecisionRequest,
                           store=Depends(store_dependency), settings=Depends(get_settings)):
        status = await load_today_status(store, settings, load_context)
        if status["target_status"] != "available":
            raise HTTPException(409, detail={"code": "DIET_TARGET_UNAVAILABLE"})
        today = status["today"]
        if today["has_unknown_calories"]:
            raise HTTPException(409, detail={"code": "DIET_CALORIES_INCOMPLETE"})
        if today["decision"] == "adjusted":
            raise HTTPException(409, detail={"code": "DIET_REBALANCE_ALREADY_DECIDED"})
        if today["decision"] == "none" and today["overage_kcal"] <= 0:
            raise HTTPException(409, detail={"code": "DIET_NO_OVERAGE"})
        result = await store.request("POST", "rpc/choose_diet_rebalance_cheat", body={
            "p_user_id": store.user_id, "p_expected_date": today["date"].isoformat(),
            "p_snapshot": {**today, "date": today["date"].isoformat()},
        })
        if not isinstance(result, dict) or result.get("decision") != body.decision \
                or result.get("date") != today["date"].isoformat():
            fail("WEEKLY_DIET_STORAGE_ERROR")
        return {"ok": True, **result}

    return router
