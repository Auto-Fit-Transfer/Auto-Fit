from typing import Literal



from pydantic import (

    BaseModel,

    ConfigDict,

    Field,

    model_validator,

)





class RecommendationSource(BaseModel):

    source_org: str

    title: str





# =========================================================

# Exercise

# =========================================================





ExerciseTrainingType = Literal[

    "weight_training",

    "home_training",

    "bodyweight",

    "cardio",

    "stretching",

    "functional_training",

]





class ExerciseRecommendationRequest(BaseModel):

    metric_statuses: dict[str, str] = Field(

        default_factory=dict

    )



    goal_type: str | None = None

    experience_level: str | None = None



    available_minutes: int | None = Field(

        default=None,

        ge=5,

        le=300,

    )



    location: str | None = None



    preferred_training_types: list[

        ExerciseTrainingType

    ] = Field(

        default_factory=list

    )





class ExerciseItem(BaseModel):

    name: str



    duration_minutes: int | None = Field(

        default=None,

        ge=1,

        le=300,

    )



    intensity: str | None = None



    instructions: list[str] = Field(

        default_factory=list,

        max_length=3,

    )





class ExerciseSession(BaseModel):

    name: str



    focus: str | None = None



    estimated_duration_minutes: int | None = Field(

        default=None,

        ge=1,

        le=300,

    )



    exercises: list[ExerciseItem] = Field(

        default_factory=list,

        max_length=4,

    )





class ExerciseRecommendationResponse(BaseModel):

    summary: str



    weekly_frequency: int = Field(

        ge=1,

        le=7,

    )



    intensity: str



    sessions: list[ExerciseSession] = Field(

        default_factory=list

    )



    cautions: list[str] = Field(

        default_factory=list,

        max_length=5,

    )



    sources: list[RecommendationSource] = Field(

        default_factory=list

    )





# =========================================================
# Diet Request
# =========================================================


class DietMealTarget(BaseModel):
    """
    한 끼 추천 후보 정렬에 사용할 영양 목표.

    값이 제공되지 않으면 Service 내부 기본값을 사용한다.
    """

    calories_kcal: float = Field(
        ge=1,
        le=5000,
    )

    protein_g: float = Field(
        ge=1,
        le=1000,
    )

    fat_g: float = Field(
        ge=1,
        le=1000,
    )

    carbohydrate_g: float = Field(
        ge=1,
        le=1000,
    )


class DietNearbyRegion(BaseModel):
    """
    현재 시군구에 특산물이 없을 때 사용할 근교 행정구역 정보.

    정확한 GPS 좌표는 AI 서버에 전달하지 않고,
    Backend에서 계산한 행정구역 + 거리만 전달한다.
    """

    sido: str = Field(
        min_length=1,
        max_length=30,
    )

    sigungu: str = Field(
        min_length=1,
        max_length=30,
    )

    distance_km: float | None = Field(
        default=None,
        ge=0,
        le=1000,
    )


class DietRecommendationRequest(BaseModel):
    """
    주간 식단 추천 요청.

    냉장고 재료 기능은 팀 결정에 따라 제거되었다.
    """

    metric_statuses: dict[str, str] = Field(
        default_factory=dict
    )

    food_allergens: list[str] = Field(
        default_factory=list
    )

    # 사용자가 먹지 않거나 선호하지 않는 음식
    disliked_foods: list[str] = Field(
        default_factory=list
    )

    goal_type: str | None = None

    additional_input: (
        str
        | list[str]
        | None
    ) = None

    # -----------------------------------------------------
    # 지역 특산물 개인화
    # -----------------------------------------------------

    sido: str | None = Field(
        default=None,
        max_length=30,
    )

    sigungu: str | None = Field(
        default=None,
        max_length=30,
    )

    nearby_regions: list[
        DietNearbyRegion
    ] = Field(
        default_factory=list,
        max_length=20,
    )

    # Backend/Rule Engine에서 준비된 한 끼 영양 목표
    meal_target: DietMealTarget | None = None


# =========================================================

# Diet Types

# =========================================================





DietDay = Literal[

    "monday",

    "tuesday",

    "wednesday",

    "thursday",

    "friday",

    "saturday",

    "sunday",

]





DietMealType = Literal[

    "breakfast",

    "lunch",

    "dinner",

    "snack",

]





# =========================================================

# Meal Nutrition

# =========================================================





class MealNutrition(BaseModel):

    model_config = ConfigDict(

        allow_inf_nan=False

    )

    carbohydrate_g: float = Field(

        ge=0,

        le=1000,

    )



    protein_g: float = Field(

        ge=0,

        le=1000,

    )



    fat_g: float = Field(

        ge=0,

        le=1000,

    )



# =========================================================
# Verified Food Item
# =========================================================


class DietFoodItem(BaseModel):
    """
    공식 Food DB에서 계산된 추천 메뉴 구성 음식 1개.

    주간 식단 응답과 Recipe API 요청이 같은 구조를 공유한다.
    영양정보는 재료별 값이 아니라 이 음식 item 전체 기준이다.
    """

    model_config = ConfigDict(
        allow_inf_nan=False
    )

    food_name: str = Field(
        min_length=1,
        max_length=200,
    )

    portion_g: float = Field(
        gt=0,
        le=5000,
    )

    calories_kcal: float = Field(
        ge=0,
        le=10000,
    )

    protein_g: float = Field(
        ge=0,
        le=1000,
    )

    fat_g: float = Field(
        ge=0,
        le=1000,
    )

    carbohydrate_g: float = Field(
        ge=0,
        le=1000,
    )





# =========================================================

# Refrigerator Ingredient

# =========================================================





class DietIngredient(BaseModel):

    name: str = Field(

        min_length=1,

        max_length=100,

    )



    recommended_amount: int = Field(

        ge=0,

        le=10000,

    )



    unit: str = Field(

        min_length=1,

        max_length=20,

    )



    carbohydrate_g: int = Field(

        ge=0,

        le=1000,

    )



    protein_g: int = Field(

        ge=0,

        le=1000,

    )



    fat_g: int = Field(

        ge=0,

        le=1000,

    )



    estimated_calories_kcal: int = Field(

        ge=0,

        le=5000,

    )





# =========================================================

# Diet Meal

# =========================================================





class DietMeal(BaseModel):

    model_config = ConfigDict(

        allow_inf_nan=False

    )

    menu_name: str = Field(

        min_length=1,

        max_length=100,

    )



    menu_description: str = Field(

        default="",

        max_length=150,

    )



    image_prompt: str | None = Field(

        default=None,

        max_length=700,

    )



    estimated_calories_kcal: float = Field(

        ge=0,

        le=3000,

    )



    nutrition: MealNutrition



    # 서버가 선택한 공식 Food DB 구성 item.
    # LLM은 설명만 생성하고, 최종 Meal은 검증된 item을 반드시 포함한다.
    items: list[DietFoodItem] = Field(
        min_length=1,
        max_length=10,
    )



    ingredients: (

        list[DietIngredient]

        | None

    ) = None



    guidance: str = Field(

        default="",

        max_length=150,

    )





# =========================================================

# Daily Diet

# =========================================================





class DailyMeals(BaseModel):

    breakfast: DietMeal

    lunch: DietMeal

    dinner: DietMeal

    snack: DietMeal





class DietDayPlan(BaseModel):

    day: DietDay

    meals: DailyMeals


class DietMealNarrative(BaseModel):
    """서버가 확정한 메뉴에 LLM이 덧붙이는 설명만 담는다."""

    menu_description: str = Field(
        default="",
        max_length=150,
    )
    guidance: str = Field(
        default="",
        max_length=150,
    )


class DailyMealNarratives(BaseModel):
    breakfast: DietMealNarrative
    lunch: DietMealNarrative
    dinner: DietMealNarrative
    snack: DietMealNarrative


class DietDayNarrative(BaseModel):
    day: DietDay
    meals: DailyMealNarratives


class DietWeeklyNarrativePartResponse(BaseModel):
    """주간 식단 생성용 경량 LLM Structured Output."""

    weekly_plan: list[DietDayNarrative] = Field(
        min_length=3,
        max_length=4,
    )

    @model_validator(mode="after")
    def validate_partial_week(self):
        days = [plan.day for plan in self.weekly_plan]
        if len(days) != len(set(days)):
            raise ValueError(
                "weekly_plan must not contain duplicate days."
            )
        return self





# =========================================================

# Nutrition Strategy

# =========================================================





class NutritionBalance(BaseModel):

    energy_strategy: str = ""

    carbohydrate_strategy: str = ""

    protein_strategy: str = ""

    fat_strategy: str = ""





# =========================================================

# Parallel Diet Internal Response

# =========================================================





class DietWeeklyPlanPartResponse(BaseModel):

    weekly_plan: list[

        DietDayPlan

    ] = Field(

        min_length=3,

        max_length=4,

    )



    @model_validator(

        mode="after"

    )

    def validate_partial_week(

        self,

    ):

        days = [

            plan.day

            for plan in self.weekly_plan

        ]



        if (

            len(days)

            != len(set(days))

        ):

            raise ValueError(

                "weekly_plan must not contain duplicate days."

            )



        return self





class DietRecommendationMetadataResponse(

    BaseModel

):

    summary: str



    strategy: str



    nutrition_balance: (

        NutritionBalance

    )



    dietary_principles: list[str] = Field(

        default_factory=list,

        max_length=6,

    )



    foods_to_prioritize: list[str] = Field(

        default_factory=list,

        max_length=8,

    )



    foods_to_limit: list[str] = Field(

        default_factory=list,

        max_length=8,

    )



    cautions: list[str] = Field(

        default_factory=list,

        max_length=5,

    )



    sources: list[

        RecommendationSource

    ] = Field(

        default_factory=list

    )





# =========================================================

# Diet Response

# =========================================================





class DietRecommendationResponse(BaseModel):

    summary: str



    strategy: str



    nutrition_balance: (

        NutritionBalance

    )



    weekly_plan: list[

        DietDayPlan

    ] = Field(

        min_length=7,

        max_length=7,

    )



    dietary_principles: list[str] = Field(

        default_factory=list,

        max_length=6,

    )



    foods_to_prioritize: list[str] = Field(

        default_factory=list,

        max_length=8,

    )



    foods_to_limit: list[str] = Field(

        default_factory=list,

        max_length=8,

    )



    cautions: list[str] = Field(

        default_factory=list,

        max_length=5,

    )



    sources: list[

        RecommendationSource

    ] = Field(

        default_factory=list

    )



    @model_validator(

        mode="after"

    )

    def validate_week(

        self,

    ):

        expected_days = [

            "monday",

            "tuesday",

            "wednesday",

            "thursday",

            "friday",

            "saturday",

            "sunday",

        ]



        actual_days = [

            plan.day

            for plan in self.weekly_plan

        ]



        if (

            actual_days

            != expected_days

        ):

            raise ValueError(

                "weekly_plan must contain monday through sunday "

                "exactly once and in order."

            )



        return self





# =========================================================

# Replace Meal

# =========================================================





class ReplaceMealRequest(BaseModel):
    """
    한 끼 재추천 요청.

    current_ingredients는 냉장고 재료가 아니라
    현재 교체 대상 메뉴의 구성 재료이므로 유지한다.
    """

    metric_statuses: dict[str, str] = Field(
        default_factory=dict
    )

    target_day: DietDay

    target_meal: DietMealType

    current_menu_name: str

    # 현재 교체 대상뿐 아니라 주간 식단에 이미 포함된 메뉴를
    # 재추천 후보에서 제외할 때 사용한다.
    excluded_menu_names: list[str] = Field(
        default_factory=list,
        max_length=50,
    )

    current_ingredients: list[str] = Field(
        default_factory=list
    )

    food_allergens: list[str] = Field(
        default_factory=list
    )

    disliked_foods: list[str] = Field(
        default_factory=list
    )

    goal_type: str | None = None

    additional_input: (
        str
        | list[str]
        | None
    ) = None

    sido: str | None = Field(
        default=None,
        max_length=30,
    )

    sigungu: str | None = Field(
        default=None,
        max_length=30,
    )

    nearby_regions: list[
        DietNearbyRegion
    ] = Field(
        default_factory=list,
        max_length=20,
    )

    meal_target: DietMealTarget | None = None


class ReplaceMealLLMResponse(BaseModel):

    """
    재추천 LLM 내부 응답.
    day / meal_type / sources는
    서버에서 직접 조립한다.
    """
    menu_description: str = Field(
        default="",
        max_length=150,
    )

    guidance: str = Field(
        default="",
        max_length=150,
    )



    cautions: list[str] = Field(

        default_factory=list,

        max_length=3,

    )





class ReplaceMealResponse(BaseModel):

    day: DietDay



    meal_type: DietMealType



    meal: DietMeal



    cautions: list[str] = Field(

        default_factory=list,

        max_length=5,

    )



    sources: list[

        RecommendationSource

    ] = Field(

        default_factory=list

    )

# =========================================================
# Diet Recipe
# =========================================================


class DietRecipeItemRequest(DietFoodItem):
    """
    레시피 조회 대상 음식 1개.

    식단 후보 생성 시 계산된 제공량과 영양정보를 그대로 전달한다.
    """

    pass


class DietRecipeRequest(BaseModel):
    """
    특정 한 끼를 구성하는 음식들의 레시피 조회 요청.
    """

    items: list[
        DietRecipeItemRequest
    ] = Field(
        min_length=1,
        max_length=10,
    )

    food_allergens: list[str] = Field(
        default_factory=list,
        max_length=30,
    )

    disliked_foods: list[str] = Field(
        default_factory=list,
        max_length=50,
    )


class DietRecipeIngredient(BaseModel):
    """
    레시피에 사용되는 재료 1개.

    재료별 영양성분은 관리하지 않고,
    화면 표시용 재료명과 중량(g)만 제공한다.

    공식 레시피 원문에서 g 단위를 확인할 수 없는 경우
    amount_g는 None일 수 있다.
    """

    name: str = Field(
        min_length=1,
        max_length=200,
    )

    amount_g: float | None = Field(
        default=None,
        ge=0,
        le=100000,
    )


class DietRecipeDetail(BaseModel):
    """
    공식 레시피 또는 Auto-Fit AI 생성 레시피의 상세 정보.
    """

    recipe_id: str | None = None

    menu_name: str | None = None

    cooking_method: str | None = None

    dish_type: str | None = None

    serving_weight: float | None = Field(
        default=None,
        ge=0,
        le=10000,
    )

    ingredients_text: str | None = None

    # 공식/AI 레시피 모두 최종 응답에서는
    # 재료명 + 중량(g) 구조로 통일한다.
    # ingredients_text는 공식 원문 보존용이다.
    ingredients: list[DietRecipeIngredient] | None = None

    steps: list[str] = Field(
        default_factory=list,
        max_length=20,
    )

    cooking_tip: str | None = None

    image_small: str | None = None

    image_large: str | None = None

    source: str | None = None


class DietRecipeItemResult(
    DietRecipeItemRequest
):
    """
    음식 1개에 대한 레시피 해결 결과.
    """

    recipe_available: bool = False

    recipe_source: Literal[
        "official_exact",
        "official_similar",
        "llm_generated",
        "unavailable",
    ]

    official_recipe: bool = False

    matched_recipe_name: (
        str
        | None
    ) = None

    match_score: float | None = Field(
        default=None,
        ge=0,
        le=1,
    )

    safety_checked: bool = False

    restriction_matches: list[str] = Field(
        default_factory=list,
    )

    recipe: (
        DietRecipeDetail
        | None
    ) = None

    @model_validator(mode="after")
    def validate_recipe_state(self):
        if not self.safety_checked:
            raise ValueError(
                "recipe result must complete the safety check."
            )

        if self.recipe_available:
            if self.recipe_source == "unavailable":
                raise ValueError(
                    "available recipe cannot use unavailable source."
                )
            if self.recipe is None:
                raise ValueError(
                    "available recipe must include recipe details."
                )
            if self.restriction_matches:
                raise ValueError(
                    "restricted recipe must not be exposed."
                )
        else:
            if self.recipe_source != "unavailable":
                raise ValueError(
                    "unavailable recipe must use unavailable source."
                )
            if self.recipe is not None:
                raise ValueError(
                    "unavailable recipe must not include recipe details."
                )
            if self.official_recipe:
                raise ValueError(
                    "unavailable recipe cannot be official."
                )
            if (
                self.matched_recipe_name is not None
                or self.match_score is not None
            ):
                raise ValueError(
                    "unavailable recipe cannot include official match data."
                )

        if self.recipe_source in {
            "official_exact",
            "official_similar",
        }:
            if not self.official_recipe:
                raise ValueError(
                    "official source must set official_recipe=true."
                )
            if self.matched_recipe_name is None:
                raise ValueError(
                    "official source must include matched_recipe_name."
                )
        elif self.recipe_source == "llm_generated":
            if self.official_recipe:
                raise ValueError(
                    "LLM recipe cannot be marked as official."
                )
            if (
                self.matched_recipe_name is not None
                or self.match_score is not None
            ):
                raise ValueError(
                    "LLM recipe cannot include official match data."
                )

        return self


class DietRecipeMealResult(BaseModel):
    """
    한 끼 전체의 레시피 조회 결과.
    """

    items: list[
        DietRecipeItemResult
    ] = Field(
        min_length=1,
        max_length=10,
    )


class DietRecipeResponse(BaseModel):
    """
    Backend 호환 레시피 API 응답 Wrapper.
    """

    ok: bool = True

    generator: str

    meal: DietRecipeMealResult



# =========================================================

# Backend-compatible Response Wrapper

# =========================================================





class ExerciseGenerateResponse(BaseModel):

    ok: bool = True



    generator: str



    result: (

        ExerciseRecommendationResponse

    )





class DietGenerateResponse(BaseModel):

    ok: bool = True



    generator: str



    result: (

        DietRecommendationResponse

    )





class DietMealRegenerateResponse(BaseModel):

    ok: bool = True



    generator: str



    meal: ReplaceMealResponse
