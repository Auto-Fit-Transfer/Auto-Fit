from typing import Literal

from pydantic import BaseModel, Field


FreshnessStatus = Literal[
    "expiring_soon",
    "fresh",
    "unknown",
]

HealthScoreStatus = Literal[
    "available",
    "unavailable",
]

HealthTierName = Literal[
    "CORE",
    "BALANCE",
    "ACTIVE",
    "FIT",
    "PEAK",
]

ExerciseGoalType = Literal[
    "muscle_gain",
    "body_fat_loss",
    "weight_management",
    "regular_exercise",
]


class HealthCheckupInput(BaseModel):
    health_checkup_id: str | None = None
    checkup_date: str | None = None

    height_cm: float | str | None = None
    weight_kg: float | str | None = None
    bmi: float | str | None = None

    systolic_bp: int | None = None
    diastolic_bp: int | None = None

    fasting_glucose: float | str | None = None
    total_cholesterol: float | str | None = None
    hdl_cholesterol: float | str | None = None
    ldl_cholesterol: float | str | None = None
    triglycerides: float | str | None = None

    ast: float | str | None = None
    alt: float | str | None = None
    gamma_gtp: float | str | None = None
    hemoglobin: float | str | None = None
    creatinine: float | str | None = None

    institution_name: str | None = None
    checkup_type: str | None = None


class BodyCompositionInput(BaseModel):
    body_composition_id: str | None = None
    measured_at: str | None = None

    height_cm: float | str | None = None
    weight_kg: float | str | None = None

    skeletal_muscle_mass_kg: float | str | None = None
    body_fat_mass_kg: float | str | None = None
    body_fat_percentage: float | str | None = None
    bmi: float | str | None = None

    basal_metabolic_rate: float | str | None = None
    visceral_fat_level: float | str | None = None

    body_water_percentage: float | str | None = None
    body_water_liters: float | str | None = None
    protein_percentage: float | str | None = None

    device_name: str | None = None


class InventoryItemInput(BaseModel):
    inventory_item_id: str

    name: str = Field(
        min_length=1,
    )

    quantity: float | int | str | None = None
    unit: str | None = None

    expires_on: str | None = None

    freshness_status: FreshnessStatus | None = None


class DietContextInput(BaseModel):
    captured_at: str | None = None

    inventory: list[InventoryItemInput] = Field(
        default_factory=list,
    )

    allergies: list[str] = Field(
        default_factory=list,
    )


class GoalInput(BaseModel):
    text: str | None = None
    goal_type: str | None = None
    short_term: bool | None = None


# =========================================================
# Weekly Health Score Input
# =========================================================


class NutritionTargetInput(BaseModel):
    calories_kcal: float = Field(gt=0)
    carbohydrate_g: float = Field(gt=0)
    protein_g: float = Field(gt=0)
    fat_g: float = Field(gt=0)


class NutritionActualInput(BaseModel):
    calories_kcal: float = Field(ge=0)
    carbohydrate_g: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)


class DietAdherenceDayInput(BaseModel):
    date: str
    target: NutritionTargetInput
    actual: NutritionActualInput | None = None


class WeeklyDietScoreInput(BaseModel):
    """
    추천 메뉴 이름이 아니라 하루 전체 목표 영양량과
    실제 섭취 영양량의 준수 정도를 계산하기 위한 입력이다.

    기록되지 않은 날은 0점으로 계산한다.
    """

    expected_days: int = Field(
        default=7,
        ge=1,
        le=7,
    )

    days: list[DietAdherenceDayInput] = Field(
        default_factory=list,
        max_length=7,
    )


class WeeklyExerciseScoreInput(BaseModel):
    """
    운동 목표 설정과 실제 수행 기록을 비교하기 위한 입력이다.

    - 시간 달성도: 50%
    - 주간 횟수 달성도: 30%
    - 선택한 운동 목적에 맞는 추천 운동 수행도: 20%
    """

    goal_type: ExerciseGoalType

    target_minutes: int = Field(gt=0)
    completed_minutes: int = Field(default=0, ge=0)

    target_days: int = Field(ge=1, le=7)
    completed_days: int = Field(default=0, ge=0, le=7)

    goal_aligned_completed_days: int = Field(
        default=0,
        ge=0,
        le=7,
    )


class HealthScoreContextInput(BaseModel):
    """
    건강점수 계산에 필요한 기준 데이터와 주간 이행 정보.

    baseline_*은 사용자가 최초로 등록한 건강검진 및
    인바디 데이터이며 Backend가 보존해서 매 요청에 전달한다.
    """

    baseline_health_checkup: HealthCheckupInput | None = None
    baseline_body_composition: BodyCompositionInput | None = None

    weekly_diet: WeeklyDietScoreInput | None = None
    weekly_exercise: WeeklyExerciseScoreInput | None = None


class HealthAnalysisPayload(BaseModel):
    health_checkup: HealthCheckupInput | None = None
    body_composition: BodyCompositionInput | None = None
    diet_context: DietContextInput | None = None
    score_context: HealthScoreContextInput | None = None


class HealthAnalysisRequest(BaseModel):
    schema_version: str = "1.0"
    request_id: str

    goal: GoalInput | None = None

    input: HealthAnalysisPayload

class AnalysisHeadline(BaseModel):
    title: str


class AnalysisSummary(BaseModel):
    title: str
    description: str


class AnalysisGoal(BaseModel):
    text: str


class AnalysisStrategy(BaseModel):
    title: str

    tags: list[str] = Field(
        default_factory=list
    )

    message: str


class RecommendationReason(BaseModel):
    title: str
    description: str

    evidence_metric_keys: list[str] = Field(
        default_factory=list
    )


class FinalDirection(BaseModel):
    from_: str = Field(
        alias="from"
    )

    to: str

    model_config = {
        "populate_by_name": True
    }


class DietSuggestionOutput(BaseModel):
    title: str
    message: str

    action_items: list[str] = Field(
        default_factory=list
    )

    evidence_metric_keys: list[str] = Field(
        default_factory=list
    )

    used_inventory_item_ids: list[str] = Field(
        default_factory=list
    )


class RefrigeratorContextOutput(BaseModel):
    captured_at: str | None = None

    available_count: int = 0
    expiring_soon_count: int = 0
    allergy_excluded_count: int = 0

    used_items: list[str] = Field(
        default_factory=list
    )

    expiring_soon_items: list[str] = Field(
        default_factory=list
    )


# =========================================================
# Weekly Health Score Output
# =========================================================


class HealthScoreSectionOutput(BaseModel):
    status: HealthScoreStatus
    score: float | None = Field(default=None, ge=0, le=100)
    maximum: int = 100
    message: str

    breakdown: dict[str, float] = Field(
        default_factory=dict
    )


class HealthMetricAdjustmentOutput(BaseModel):
    metric_key: str
    baseline_value: float
    current_value: float
    unit: str
    trend: Literal[
        "improved",
        "unchanged",
        "declined",
    ]
    normalized_change: float = Field(ge=-1, le=1)


class HealthScoreOutput(BaseModel):
    status: HealthScoreStatus

    total_score: float | None = Field(
        default=None,
        ge=0,
        le=100,
    )

    maximum: int = 100
    scoring_version: str = "health-score-v1"

    tier: HealthTierName | None = None
    tier_level: int | None = Field(
        default=None,
        ge=1,
        le=2,
    )

    diet: HealthScoreSectionOutput
    exercise: HealthScoreSectionOutput
    health_data: HealthScoreSectionOutput

    health_metric_adjustments: list[
        HealthMetricAdjustmentOutput
    ] = Field(default_factory=list)


class HealthAnalysisOutput(BaseModel):
    health_score: HealthScoreOutput

    headline: AnalysisHeadline
    summary: AnalysisSummary
    goal: AnalysisGoal
    strategy: AnalysisStrategy

    key_metric_keys: list[str] = Field(
        default_factory=list
    )

    recommendation_reasons: list[RecommendationReason] = Field(
        default_factory=list
    )

    final_direction: FinalDirection

    diet_suggestion: DietSuggestionOutput
    refrigerator_context: RefrigeratorContextOutput


class HealthAnalysisModelInfo(BaseModel):
    name: str
    version: str


class HealthAnalysisResponse(BaseModel):
    schema_version: str
    request_id: str

    analysis: HealthAnalysisOutput

    model: HealthAnalysisModelInfo

class HealthAnalysisErrorDetail(BaseModel):
    code: str
    message: str

    fields: list[str] = Field(
        default_factory=list
    )


class HealthAnalysisErrorResponse(BaseModel):
    error: HealthAnalysisErrorDetail

# =========================================================
# Diet Personalization Refresh
# =========================================================


class DietRefreshRequest(BaseModel):
    """
    냉장고 정보 변경 후
    식단 개인화 부분만 다시 생성하기 위한 요청.

    건강 상태 재분류를 위해 health_checkup /
    body_composition은 기존 형식을 그대로 사용한다.

    전체 health analysis는 다시 생성하지 않는다.
    """

    schema_version: str = "1.0"

    request_id: str

    goal: GoalInput | None = None

    health_checkup: HealthCheckupInput

    body_composition: BodyCompositionInput

    diet_context: DietContextInput


class DietRefreshResponse(BaseModel):
    """
    Backend가 기존 분석 결과에서
    교체해야 할 두 영역만 반환한다.
    """

    schema_version: str

    request_id: str

    diet_suggestion: DietSuggestionOutput

    refrigerator_context: RefrigeratorContextOutput

    model: HealthAnalysisModelInfo

