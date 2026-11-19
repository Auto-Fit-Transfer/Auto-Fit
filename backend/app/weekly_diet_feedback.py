"""Weekly-slot feedback without fabricating legacy diet_meal_id values."""

import asyncio
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.app.weekly_diet import require_current_context
from backend.app.weekly_diet_contract import DAYS, MEALS, Day, MealType
from backend.app.weekly_diet_store import WeeklyDietStore, fail


class ActualItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    food_name: str = Field(min_length=1, max_length=100)
    quantity: Decimal = Field(gt=0, le=100000)
    unit: str = Field(min_length=1, max_length=20)
    calories: Decimal | None = Field(default=None, ge=0, le=100000)
    carbohydrates: Decimal | None = Field(default=None, ge=0, le=10000)
    protein: Decimal | None = Field(default=None, ge=0, le=10000)
    fat: Decimal | None = Field(default=None, ge=0, le=10000)

    @field_validator("food_name", "unit", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class FeedbackInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1, strict=True)
    feedback_type: Literal["eaten", "different_food", "skipped"]
    actual_items: list[ActualItem] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def actual_food_matches_type(self):
        if (self.feedback_type == "different_food") != bool(self.actual_items):
            raise ValueError("actual_items are required only for different_food")
        return self


class FeedbackCreate(FeedbackInput):
    eaten_at: AwareDatetime = Field(default_factory=lambda: datetime.now(UTC))


class FeedbackUpdate(FeedbackInput):
    eaten_at: AwareDatetime | None = None


class FeedbackRecord(BaseModel):
    weekly_diet_feedback_id: UUID
    weekly_diet_plan_id: UUID
    plan_day: Day
    meal_type: MealType
    weekly_plan_version: int = Field(ge=1)
    feedback_type: Literal["eaten", "different_food", "skipped"]
    meal_log_id: UUID | None
    recorded_at: datetime


class FeedbackResponse(BaseModel):
    ok: Literal[True]
    feedback: FeedbackRecord
    meal_log_id: UUID | None


class LegacyFeedbackRecord(BaseModel):
    source: Literal["daily"]
    date: date
    plan_day: Day
    meal_type: MealType
    diet_feedback_id: UUID
    diet_meal_id: UUID
    feedback_type: Literal["eaten", "different_food", "skipped"]
    meal_log_id: UUID | None
    recorded_at: datetime


class FeedbackListResponse(BaseModel):
    ok: Literal[True]
    feedback: list[FeedbackRecord]
    legacy_feedback: list[LegacyFeedbackRecord]


def public_feedback(row: Any, user_id: str, plan_id: UUID) -> dict:
    if not isinstance(row, dict) or row.get("user_id") != user_id \
            or row.get("weekly_diet_plan_id") != str(plan_id):
        fail("WEEKLY_DIET_STORAGE_ERROR")
    try:
        parsed = FeedbackRecord.model_validate(row)
    except ValueError:
        fail("WEEKLY_DIET_STORAGE_ERROR")
    if (parsed.feedback_type == "skipped") != (parsed.meal_log_id is None):
        fail("WEEKLY_DIET_STORAGE_ERROR")
    return parsed.model_dump(mode="json")


def public_legacy_feedback(row: Any, user_id: str, plan_id: UUID) -> dict:
    if not isinstance(row, dict) or row.get("user_id") != user_id \
            or row.get("weekly_diet_plan_id") != str(plan_id):
        fail("WEEKLY_DIET_STORAGE_ERROR")
    try:
        parsed = LegacyFeedbackRecord.model_validate({**row, "source": "daily"})
    except ValueError:
        fail("WEEKLY_DIET_STORAGE_ERROR")
    return parsed.model_dump(mode="json")


def create_weekly_feedback_router(get_user, get_settings, load_context):
    router = APIRouter(prefix="/api/diet/weekly-recommendations", tags=["Diet"])

    def store_dependency(user=Depends(get_user), settings=Depends(get_settings)):
        return WeeklyDietStore(settings, user.id)

    async def write_feedback(plan_id: UUID, day: Day, meal_type: MealType,
                             body: FeedbackCreate | FeedbackUpdate, create: bool, store, settings):
        plan = await store.get(plan_id=plan_id)
        if plan is None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        if plan["version"] != body.expected_version:
            fail("WEEKLY_DIET_VERSION_CONFLICT", 409)
        if body.eaten_at is not None:
            expected_date = (date.fromisoformat(plan["week_start_date"])
                             + timedelta(days=DAYS.index(day)))
            if body.eaten_at.astimezone(ZoneInfo("Asia/Seoul")).date() != expected_date:
                fail("WEEKLY_FEEDBACK_DATE_MISMATCH", 422)
        require_current_context(plan, await load_context(store.user_id, settings))
        result = await store.request("POST", "rpc/write_weekly_diet_feedback", body={
            "p_user_id": store.user_id, "p_plan_id": str(plan_id),
            "p_expected_version": body.expected_version, "p_day": day,
            "p_meal_type": meal_type, "p_feedback_type": body.feedback_type,
            "p_eaten_at": body.eaten_at.isoformat() if body.eaten_at else None,
            "p_actual_items": [item.model_dump(mode="json") for item in body.actual_items],
            "p_create": create,
        })
        if not isinstance(result, dict):
            fail("WEEKLY_DIET_STORAGE_ERROR")
        feedback = public_feedback(result.get("feedback"), store.user_id, plan_id)
        return {"ok": True, "feedback": feedback, "meal_log_id": feedback["meal_log_id"]}

    @router.get("/{plan_id}/feedback", response_model=FeedbackListResponse)
    async def get_feedback(plan_id: UUID, store=Depends(store_dependency)):
        if await store.get(plan_id=plan_id) is None:
            fail("WEEKLY_DIET_NOT_FOUND", 404)
        rows, legacy_rows = await asyncio.gather(store.request("GET", "weekly_diet_feedback", params={
            "select": "weekly_diet_feedback_id,user_id,weekly_diet_plan_id,plan_day,meal_type,"
                      "weekly_plan_version,feedback_type,meal_log_id,recorded_at",
            "user_id": f"eq.{store.user_id}", "weekly_diet_plan_id": f"eq.{plan_id}",
        }), store.request("POST", "rpc/list_legacy_weekly_diet_feedback", body={
            "p_user_id": store.user_id, "p_plan_id": str(plan_id),
        }))
        if not isinstance(rows, list) or not isinstance(legacy_rows, list):
            fail("WEEKLY_DIET_STORAGE_ERROR")
        feedback = [public_feedback(row, store.user_id, plan_id) for row in rows]
        legacy_feedback = [public_legacy_feedback(row, store.user_id, plan_id)
                           for row in legacy_rows]
        feedback.sort(key=lambda item: (
            DAYS.index(item["plan_day"]), MEALS.index(item["meal_type"]),
        ))
        legacy_feedback.sort(key=lambda item: (
            item["date"], MEALS.index(item["meal_type"]),
        ))
        return {"ok": True, "feedback": feedback,
                "legacy_feedback": legacy_feedback}

    @router.post("/{plan_id}/meals/{day}/{meal_type}/feedback",
                 status_code=201, response_model=FeedbackResponse)
    async def post_feedback(plan_id: UUID, day: Day, meal_type: MealType,
                            body: FeedbackCreate, store=Depends(store_dependency),
                            settings=Depends(get_settings)):
        return await write_feedback(plan_id, day, meal_type, body, True, store, settings)

    @router.patch("/{plan_id}/meals/{day}/{meal_type}/feedback",
                  response_model=FeedbackResponse)
    async def patch_feedback(plan_id: UUID, day: Day, meal_type: MealType,
                             body: FeedbackUpdate, store=Depends(store_dependency),
                             settings=Depends(get_settings)):
        return await write_feedback(plan_id, day, meal_type, body, False, store, settings)

    return router
