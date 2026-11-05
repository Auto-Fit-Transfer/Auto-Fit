"""AI recipe response for one selected weekly diet slot."""

from typing import Literal

from pydantic import ConfigDict, Field, model_validator

from backend.app.weekly_diet_contract import AIData, Day, FoodItem, MealType, Nutrition, Nonnegative, Text


RecipeSource = Literal["official_exact", "official_similar", "llm_generated", "unavailable"]


def has_unavailable_recipe(reply: dict) -> bool:
    return any(
        item.get("recipe_source") == "unavailable"
        for item in reply.get("meal", {}).get("items", [])
    )


class RecipeData(AIData):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)


class RecipeRequestItem(FoodItem):
    model_config = RecipeData.model_config
    portion_g: float = Field(gt=0, le=5000, allow_inf_nan=False)
    calories_kcal: float = Field(ge=0, le=10000, allow_inf_nan=False)
    carbohydrate_g: float = Field(ge=0, le=1000, allow_inf_nan=False)
    protein_g: float = Field(ge=0, le=1000, allow_inf_nan=False)
    fat_g: float = Field(ge=0, le=1000, allow_inf_nan=False)


class RecipeRequest(RecipeData):
    day: Day
    meal_type: MealType
    menu_name: Text
    menu_description: str
    guidance: str
    tags: list[str] = Field(max_length=6)
    personalization_reasons: list[str] = Field(max_length=5)
    servings: int = Field(ge=1, le=20)
    related_menus: list["RelatedMenu"] = Field(max_length=10)
    items: list[RecipeRequestItem] = Field(min_length=1, max_length=10)
    food_allergens: list[str] = Field(max_length=30)
    disliked_foods: list[str] = Field(max_length=50)


class RecipeIngredient(RecipeData):
    name: Text
    amount_g: Nonnegative | None


class RecipeStep(RecipeData):
    order: int = Field(ge=1)
    instruction: str = Field(min_length=1)
    duration_minutes: Nonnegative | None
    tip: str | None


class RecipeDetail(RecipeData):
    recipe_id: str | None
    menu_name: str | None
    cooking_method: str | None
    dish_type: str | None
    serving_weight: Nonnegative | None
    servings: int = Field(ge=1)
    estimated_duration_minutes: Nonnegative | None
    ingredients_text: str | None
    ingredients: list[RecipeIngredient] | None
    steps: list[str]
    step_details: list[RecipeStep]
    cooking_tip: str | None
    image_small: str | None
    image_large: str | None
    source: str | None


class RecipeItem(FoodItem):
    model_config = RecipeData.model_config
    recipe_available: bool
    recipe_source: RecipeSource
    official_recipe: bool
    matched_recipe_name: str | None
    match_score: float | None = Field(ge=0, le=1, allow_inf_nan=False)
    safety_checked: bool
    restriction_matches: list[str]
    recipe: RecipeDetail | None

    @model_validator(mode="after")
    def consistent_status(self):
        available = self.recipe_source != "unavailable"
        official = self.recipe_source in {"official_exact", "official_similar"}
        if self.recipe_available != available or self.official_recipe != official:
            raise ValueError("Inconsistent recipe status")
        if (self.recipe is not None) != available:
            raise ValueError("Inconsistent recipe detail")
        if available and (not self.safety_checked or self.restriction_matches):
            raise ValueError("Unsafe recipe detail")
        if self.restriction_matches and self.recipe is not None:
            raise ValueError("Restricted recipe detail")
        if self.recipe_source == "official_similar" and (
            not self.matched_recipe_name or self.match_score is None
        ):
            raise ValueError("Similar recipe needs match details")
        return self


class DailyTargetPercentages(RecipeData):
    calories_percent: Nonnegative
    carbohydrate_percent: Nonnegative
    protein_percent: Nonnegative
    fat_percent: Nonnegative


class RelatedMenu(RecipeData):
    menu_name: Text
    day: Day | None = None
    meal_type: MealType | None = None
    estimated_calories_kcal: Nonnegative | None = None


class RecipeNutrition(Nutrition):
    model_config = RecipeData.model_config


class RecipeMeal(RecipeData):
    day: Day | None
    meal_type: MealType | None
    menu_name: str | None
    menu_description: str
    tags: list[str]
    servings: int = Field(ge=1, le=20)
    estimated_duration_minutes: Nonnegative | None
    estimated_calories_kcal: Nonnegative
    nutrition: RecipeNutrition
    daily_target_percentages: DailyTargetPercentages | None
    personalization_reasons: list[str]
    allergen_notice: list[str]
    items: list[RecipeItem] = Field(min_length=1, max_length=10)
    related_menus: list[RelatedMenu] = Field(max_length=10)


class RecipeReply(RecipeData):
    ok: Literal[True]
    generator: Text
    meal: RecipeMeal
