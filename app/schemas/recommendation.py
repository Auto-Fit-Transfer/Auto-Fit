from typing import Literal



from pydantic import (

    BaseModel,

    ConfigDict,

    Field,

    field_validator,

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


ExerciseMode = Literal[

    "gym",

    "home_training",

]


ExerciseDailyCondition = Literal[

    "good",

    "normal",

    "tired",

    "poor",

]


ExerciseIntensity = Literal[

    "low",

    "moderate",

    "high",

]


ExerciseBackendConditionLevel = Literal[

    "좋음",

    "보통",

    "피곤해요",

    "안 좋아요",

]


ExerciseAvailableEquipment = Literal[

    "machine",

    "band",

    "dumbbell",

    "mat",

    "other",

]


BACKEND_CONDITION_LEVEL_MAP: dict[
    ExerciseBackendConditionLevel,
    ExerciseDailyCondition,
] = {
    "좋음": "good",
    "보통": "normal",
    "피곤해요": "tired",
    "안 좋아요": "poor",
}


GymTrainingStyle = Literal[

    "machine",

    "free_weight",

    "any",

    "other",

]


ExerciseFocusArea = Literal[

    "upper_body",

    "lower_body",

    "full_body",

    "other",

]


HomeTrainingEquipment = Literal[

    "none",

    "band",

    "dumbbell",

    "other",

]


HomeTrainingStyle = Literal[

    "quiet",

    "sweaty",

    "other",

]


class GymExercisePreferences(BaseModel):

    training_style: GymTrainingStyle

    other_training_style: str | None = Field(

        default=None,

        min_length=1,

        max_length=100,

    )

    focus_area: ExerciseFocusArea

    other_focus_area: str | None = Field(

        default=None,

        min_length=1,

        max_length=100,

    )

    @model_validator(mode="after")

    def validate_other_values(self):

        if (self.training_style == "other") != (

            self.other_training_style is not None

        ):

            raise ValueError(

                "other_training_style is required only when "

                "training_style is other"

            )

        if (self.focus_area == "other") != (

            self.other_focus_area is not None

        ):

            raise ValueError(

                "other_focus_area is required only when focus_area is other"

            )

        return self


class HomeTrainingPreferences(BaseModel):

    equipment: HomeTrainingEquipment

    other_equipment: str | None = Field(

        default=None,

        min_length=1,

        max_length=100,

    )

    workout_style: HomeTrainingStyle

    other_workout_style: str | None = Field(

        default=None,

        min_length=1,

        max_length=100,

    )

    @model_validator(mode="after")

    def validate_other_values(self):

        if (self.equipment == "other") != (

            self.other_equipment is not None

        ):

            raise ValueError(

                "other_equipment is required only when equipment is other"

            )

        if (self.workout_style == "other") != (

            self.other_workout_style is not None

        ):

            raise ValueError(

                "other_workout_style is required only when "

                "workout_style is other"

            )

        return self





class ExerciseRecommendationRequest(BaseModel):

    model_config = ConfigDict(

        extra="forbid",

        str_strip_whitespace=True,

    )

    metric_statuses: dict[str, str] = Field(

        default_factory=dict

    )



    goal_type: str | None = None

    custom_goal: str | None = Field(default=None, max_length=200)

    experience_level: str | None = None



    available_minutes: int | None = Field(

        default=None,

        ge=5,

        le=200,

    )



    location: str | None = None



    # Backend의 오늘 운동 설정에서 전달하는 복수 선택 장비다.
    # mat는 현재 화면에서 "맨몸"을 의미하며 catalog 단계에서
    # 무장비 운동으로 정규화한다.
    available_equipment: list[

        ExerciseAvailableEquipment

    ] = Field(

        default_factory=list,

        max_length=5,

    )



    preferred_training_types: list[

        ExerciseTrainingType

    ] = Field(

        default_factory=list

    )



    # Frontend의 "오늘의 운동 설정" 화면에서 전달하는 값이다.
    # 기존 호출자는 이 필드들을 생략할 수 있어 하위 호환성을 유지한다.
    exercise_mode: ExerciseMode | None = None



    daily_condition: ExerciseDailyCondition | None = None



    # Backend가 저장하는 한글 화면 값이다. 내부 추천 로직에서는
    # daily_condition으로 정규화하여 기존 안전 정책을 재사용한다.
    condition_level: ExerciseBackendConditionLevel | None = None



    condition_note: str | None = Field(

        default=None,

        max_length=500,

    )



    has_discomfort: bool = False



    discomfort_areas: list[str] = Field(

        default_factory=list,

        max_length=10,

    )



    gym_preferences: GymExercisePreferences | None = None



    home_training_preferences: (

        HomeTrainingPreferences

        | None

    ) = None



    @field_validator(

        "available_equipment"

    )

    @classmethod

    def deduplicate_available_equipment(

        cls,

        value: list[ExerciseAvailableEquipment],

    ) -> list[ExerciseAvailableEquipment]:

        return list(dict.fromkeys(value))



    @model_validator(mode="after")

    def validate_frontend_preferences(self):

        if self.condition_level is not None:

            normalized_condition = (

                BACKEND_CONDITION_LEVEL_MAP[

                    self.condition_level

                ]

            )

            if (

                self.daily_condition is not None

                and self.daily_condition

                != normalized_condition

            ):

                raise ValueError(

                    "condition_level and daily_condition conflict"

                )

            self.daily_condition = normalized_condition

        if self.exercise_mode is not None:

            if self.daily_condition is None:

                raise ValueError(

                    "daily_condition is required when exercise_mode is set"

                )

            if self.available_minutes is None:

                raise ValueError(

                    "available_minutes is required when exercise_mode is set"

                )



        if self.discomfort_areas:

            # 신규 Backend 계약은 has_discomfort를 보내지 않고
            # discomfort_areas의 존재 여부로 상태를 표현한다.
            # 기존 호출자가 명시적으로 false와 목록을 함께 보내는
            # 모순된 요청은 계속 거부한다.
            if (

                "has_discomfort" in self.model_fields_set

                and not self.has_discomfort

            ):

                raise ValueError(

                    "discomfort_areas conflicts with "

                    "has_discomfort=false"

                )

            self.has_discomfort = True



        if self.exercise_mode == "gym":

            if self.gym_preferences is None:

                raise ValueError(

                    "gym_preferences is required for gym mode"

                )

            if self.home_training_preferences is not None:

                raise ValueError(

                    "home_training_preferences is not allowed for gym mode"

                )



        if self.exercise_mode == "home_training":

            if self.home_training_preferences is None:

                raise ValueError(

                    "home_training_preferences is required for "

                    "home_training mode"

                )

            if self.gym_preferences is not None:

                raise ValueError(

                    "gym_preferences is not allowed for "

                    "home_training mode"

                )



        if self.exercise_mode is None and (

            self.gym_preferences is not None

            or self.home_training_preferences is not None

        ):

            raise ValueError(

                "exercise_mode is required when mode preferences are provided"

            )



        return self





class ExerciseItem(BaseModel):

    exercise_key: str = Field(

        min_length=1,

        max_length=100,

    )



    name: str = Field(

        min_length=1,

        max_length=200,

    )



    catalog_name_en: str = Field(

        min_length=1,

        max_length=300,

    )



    exercise_modes: list[

        ExerciseMode

    ] = Field(

        min_length=1,

        max_length=2,

    )



    duration_minutes: int = Field(

        ge=1,

        le=200,

    )



    intensity: ExerciseIntensity | None = None



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

        le=200,

    )



    exercises: list[ExerciseItem] = Field(

        min_length=1,

        max_length=4,

    )





class ExerciseRecommendationResponse(BaseModel):

    catalog_version: str = Field(

        min_length=1,

        max_length=100,

    )



    summary: str



    weekly_frequency: int = Field(

        ge=1,

        le=7,

    )



    intensity: ExerciseIntensity



    sessions: list[ExerciseSession] = Field(

        min_length=1,

        max_length=3,

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


DietHealthGoalType = Literal[
    "fat_loss",
    "muscle_gain",
    "fitness",
    "maintenance",
    "other",
]


class DietHealthGoal(BaseModel):
    """Backend가 확정한 활성 건강목표의 최소 전달 형태."""

    goal_type: DietHealthGoalType

    goal_text: str | None = Field(
        default=None,
        max_length=200,
    )


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

    # 신규 Backend 건강목표 계약이다. 제공되면 기존 goal_type보다
    # 우선하며, goal_text는 사용자 데이터로만 취급한다.
    health_goal: DietHealthGoal | None = None

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

    health_goal: DietHealthGoal | None = None

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


class DietRecipeRelatedMenu(BaseModel):
    """같은 주간 식단에서 함께 노출할 다른 추천 메뉴."""

    menu_name: str = Field(
        min_length=1,
        max_length=100,
    )

    day: DietDay | None = None

    meal_type: DietMealType | None = None

    estimated_calories_kcal: float | None = Field(
        default=None,
        ge=0,
        le=3000,
    )


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

    day: DietDay | None = None

    meal_type: DietMealType | None = None

    menu_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    menu_description: str = Field(
        default="",
        max_length=300,
    )

    guidance: str = Field(
        default="",
        max_length=300,
    )

    tags: list[str] = Field(
        default_factory=list,
        max_length=6,
    )

    personalization_reasons: list[str] = Field(
        default_factory=list,
        max_length=5,
    )

    servings: int = Field(
        default=1,
        ge=1,
        le=20,
    )

    daily_nutrition_target: DietMealTarget | None = None

    related_menus: list[DietRecipeRelatedMenu] = Field(
        default_factory=list,
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
    amount_g는 None일 수 있다. 확인된 중량은 0보다 커야 한다.
    """

    name: str = Field(
        min_length=1,
        max_length=200,
    )

    amount_g: float | None = Field(
        default=None,
        gt=0,
        le=100000,
    )


class DietRecipeStep(BaseModel):
    """Frontend가 순서·시간·팁을 각각 표시할 수 있는 조리 단계."""

    order: int = Field(
        ge=1,
        le=20,
    )

    instruction: str = Field(
        min_length=1,
        max_length=1000,
    )

    duration_minutes: float | None = Field(
        default=None,
        gt=0,
        le=1440,
    )

    tip: str | None = Field(
        default=None,
        max_length=500,
    )


class DietRecipeDailyTargetPercentages(BaseModel):
    """저장된 일일 영양 목표 대비 선택 메뉴의 비율."""

    calories_percent: float | None = Field(
        default=None,
        ge=0,
        le=10000,
    )

    carbohydrate_percent: float | None = Field(
        default=None,
        ge=0,
        le=10000,
    )

    protein_percent: float | None = Field(
        default=None,
        ge=0,
        le=10000,
    )

    fat_percent: float | None = Field(
        default=None,
        ge=0,
        le=10000,
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

    servings: int = Field(
        default=1,
        ge=1,
        le=20,
    )

    estimated_duration_minutes: float | None = Field(
        default=None,
        gt=0,
        le=1440,
    )

    ingredients_text: str | None = None

    # 공식/AI 레시피 모두 최종 응답에서는
    # 재료명 + 중량(g) 구조로 통일한다.
    # ingredients_text는 공식 원문 보존용이다.
    ingredients: list[DietRecipeIngredient] | None = None

    # 기존 Backend 호환 필드다. 문자열 배열 형식을 유지한다.
    steps: list[str] = Field(
        default_factory=list,
        max_length=20,
    )

    @field_validator("steps", mode="before")
    @classmethod
    def normalize_legacy_steps(cls, value):
        if value is None:
            return []

        return [
            str(step.get("instruction") or "").strip()
            if isinstance(step, dict)
            else str(step).strip()
            for step in value
            if (
                str(step.get("instruction") or "").strip()
                if isinstance(step, dict)
                else str(step).strip()
            )
        ]

    step_details: list[DietRecipeStep] = Field(
        default_factory=list,
        max_length=20,
    )

    @model_validator(mode="after")
    def fill_step_details(self):
        if not self.step_details and self.steps:
            self.step_details = [
                DietRecipeStep(
                    order=index,
                    instruction=instruction,
                )
                for index, instruction in enumerate(
                    self.steps,
                    1,
                )
            ]
        return self

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

    day: DietDay | None = None

    meal_type: DietMealType | None = None

    menu_name: str | None = Field(
        default=None,
        max_length=100,
    )

    menu_description: str = Field(
        default="",
        max_length=300,
    )

    tags: list[str] = Field(
        default_factory=list,
        max_length=6,
    )

    servings: int = Field(
        default=1,
        ge=1,
        le=20,
    )

    estimated_duration_minutes: float | None = Field(
        default=None,
        gt=0,
        le=1440,
    )

    estimated_calories_kcal: float = Field(
        default=0,
        ge=0,
        le=3000,
    )

    nutrition: MealNutrition = Field(
        default_factory=lambda: MealNutrition(
            carbohydrate_g=0,
            protein_g=0,
            fat_g=0,
        )
    )

    daily_target_percentages: (
        DietRecipeDailyTargetPercentages
        | None
    ) = None

    personalization_reasons: list[str] = Field(
        default_factory=list,
        max_length=5,
    )

    allergen_notice: list[str] = Field(
        default_factory=list,
        max_length=30,
    )

    items: list[
        DietRecipeItemResult
    ] = Field(
        min_length=1,
        max_length=10,
    )

    related_menus: list[DietRecipeRelatedMenu] = Field(
        default_factory=list,
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
