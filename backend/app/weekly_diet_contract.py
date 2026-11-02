"""Validated seven-day diet boundary; source item precision is preserved."""

from datetime import date, datetime, timedelta
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator


Day = Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MealType = Literal["breakfast", "lunch", "dinner", "snack"]
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
MEALS = ("breakfast", "lunch", "dinner", "snack")
Nonnegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Text = Annotated[str, Field(min_length=1, max_length=200, pattern=r"\S")]


def current_week_start() -> date:
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    return today - timedelta(days=today.weekday())


class AIData(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow", allow_inf_nan=False)


class Nutrition(AIData):
    carbohydrate_g: Nonnegative
    protein_g: Nonnegative
    fat_g: Nonnegative


class FoodItem(Nutrition):
    food_name: Text
    portion_g: float = Field(gt=0, allow_inf_nan=False)
    calories_kcal: Nonnegative


class Meal(AIData):
    menu_name: Text
    menu_description: str
    estimated_calories_kcal: Nonnegative
    nutrition: Nutrition
    items: list[FoodItem] = Field(min_length=1, max_length=100)
    guidance: str | None = None


class DailyMeals(AIData):
    day: Day
    meals: dict[MealType, Meal]

    @field_validator("meals")
    @classmethod
    def all_meals(cls, value):
        if set(value) != set(MEALS):
            raise ValueError("Every day must contain all four meals")
        return value


class WeeklyResult(AIData):
    summary: str
    strategy: str
    weekly_plan: list[DailyMeals] = Field(min_length=7, max_length=7)

    @field_validator("weekly_plan")
    @classmethod
    def all_days(cls, value):
        if tuple(entry.day for entry in value) != DAYS:
            raise ValueError("Weekdays must appear exactly once, Monday through Sunday")
        return value


class WeeklyReply(AIData):
    ok: Literal[True]
    generator: Text
    result: WeeklyResult


class Replacement(AIData):
    day: Day
    meal_type: MealType
    meal: Meal


class ReplacementReply(AIData):
    ok: Literal[True]
    generator: Text
    meal: Replacement


class DatedDailyMeals(DailyMeals):
    date: Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]


class DatedWeeklyResult(WeeklyResult):
    weekly_plan: list[DatedDailyMeals] = Field(min_length=7, max_length=7)


class WeeklyPlanResponse(BaseModel):
    ok: Literal[True]
    weekly_diet_plan_id: str
    week_start_date: date
    timezone: Literal["Asia/Seoul"]
    version: int = Field(ge=1)
    generator: Text
    result: DatedWeeklyResult
    last_replacement: ReplacementReply | None = None


class MealTarget(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    calories_kcal: float = Field(gt=0)
    protein_g: Nonnegative
    fat_g: Nonnegative
    carbohydrate_g: Nonnegative


class DietRequestContext(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    metric_statuses: dict[str, str]
    food_allergens: list[Text]
    disliked_foods: list[Text]
    goal_type: str | None
    additional_input: str | None
    sido: None
    sigungu: None
    nearby_regions: list = Field(max_length=0)
    meal_target: MealTarget | None


class WeeklyGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    week_start_date: date = Field(default_factory=current_week_start)
    disliked_foods: list[Text] = Field(default_factory=list, max_length=100)
    additional_input: str | None = Field(default=None, max_length=1000)
    meal_target: MealTarget | None = None
    expected_version: int | None = Field(default=None, ge=1, strict=True)

    @field_validator("week_start_date")
    @classmethod
    def monday_only(cls, value):
        if value.weekday() != 0 or value > date.max - timedelta(days=6):
            raise ValueError("week_start_date must be a Monday in Asia/Seoul")
        return value


class ReplaceWeeklyMealRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1, strict=True)


def dated_result(result: dict[str, Any], week_start: date) -> dict[str, Any]:
    return {
        **result,
        "weekly_plan": [
            {**entry, "date": (week_start + timedelta(days=DAYS.index(entry["day"]))).isoformat()}
            for entry in result["weekly_plan"]
        ],
    }
