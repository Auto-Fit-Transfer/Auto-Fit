from typing import Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_serializer,
    model_validator,
)

from app.schemas.recommendation import (
    DietDay,
    DietMealType,
    DietMealTarget,
    DietNearbyRegion,
    RecommendationSource,
)
from app.schemas.health_analysis import (
    HealthScoreOutput,
)
from app.schemas.exercise_session_analysis import (
    BodyArea,
    ExerciseSymptomType,
)
from app.schemas.running import (
    RunningDistanceOption,
)


ChatIntent = Literal[
    "health_score_question",
    "health_question",
    "exercise_question",
    "exercise_replace_request",
    "exercise_session_discomfort",
    "running_question",
    "running_recommend_request",
    "running_generate_request",
    "diet_question",
    "diet_replace_request",
    "general_chat",
]


ChatAction = Literal[
    "health_score_context",
    "need_health_score_context",
    "health_rag",
    "exercise_context",
    "exercise_replace_unavailable",
    "need_exercise_session_context",
    "need_exercise_symptom_details",
    "confirm_exercise_adjustment",
    "exercise_adjustment_cancelled",
    "exercise_session_adjust",
    "exercise_session_stop",
    "running_context",
    "need_running_location",
    "need_running_distance",
    "running_courses_recommended",
    "running_generation_required",
    "running_loops_generated",
    "running_unavailable",
    "diet_context",
    "need_target_day",
    "need_target_meal",
    "need_diet_context",
    "meal_not_found",
    "confirm_diet_replace",
    "diet_replace_cancelled",
    "diet_replace",
    "general_chat",
]


ChatActionStatus = Literal[
    "completed",
    "needs_input",
    "awaiting_confirmation",
    "ready_for_backend_apply",
    "unable_to_apply",
]


ChatRole = Literal[
    "user",
    "assistant",
]


ChatHealthScoreQueryType = Literal[
    "summary",
    "comparison",
    "reason",
    "priority",
]


ChatHealthScoreSection = Literal[
    "overall",
    "diet",
    "exercise",
    "health_data",
]


ExerciseAdjustmentStrategy = Literal[
    "reduce_remaining_volume",
    "skip_current_and_reduce_remaining",
]


# =========================================================
# Internal Chat Models
# =========================================================


class ChatHistoryItem(BaseModel):
    role: ChatRole

    content: str = Field(
        min_length=1,
        max_length=500,
    )


class ChatRunningContext(BaseModel):
    """Backend가 보유한 러닝 조건과 현재 위치의 요청 범위 snapshot."""

    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
    )

    region: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
    )
    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
    )
    distance_option: RunningDistanceOption | None = None
    custom_distance_km: float | None = Field(
        default=None,
        ge=0.5,
        le=50,
    )
    pace_minutes_per_km: float | None = Field(
        default=None,
        ge=2,
        le=20,
    )
    desired_difficulty: Literal[
        "easy",
        "moderate",
        "hard",
    ] | None = None
    candidate_count: int = Field(
        default=3,
        ge=1,
        le=3,
    )
    seed: int | None = Field(
        default=None,
        ge=0,
        le=2_147_483_647,
    )
    selected_course: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_running_context(self) -> "ChatRunningContext":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError(
                "latitude and longitude must be provided together"
            )

        if (
            self.distance_option == "custom"
            and self.custom_distance_km is None
        ):
            raise ValueError(
                "custom_distance_km is required when "
                "distance_option is custom"
            )

        if (
            self.distance_option not in {None, "custom"}
            and self.custom_distance_km is not None
        ):
            raise ValueError(
                "custom_distance_km is only allowed when "
                "distance_option is custom"
            )

        if (
            self.distance_option is None
            and self.custom_distance_km is not None
        ):
            raise ValueError(
                "distance_option is required when "
                "custom_distance_km is provided"
            )

        return self


class ChatActiveExerciseSessionContext(BaseModel):
    """Backend가 보유한 현재 운동 세션의 변경 방지 snapshot."""

    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
    )

    session_id: UUID
    plan_session_id: UUID
    status: Literal["in_progress", "paused"]
    current_exercise_item_id: UUID | None = None
    current_exercise_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )
    remaining_exercise_item_ids: list[UUID] = Field(
        default_factory=list,
        max_length=30,
    )
    version: str = Field(
        min_length=1,
        max_length=100,
    )


class ChatContext(BaseModel):
    metric_statuses: dict[str, str] = Field(
        default_factory=dict
    )

    goal_type: str | None = None

    food_allergens: list[str] | None = None

    disliked_foods: list[str] | None = None

    additional_input: str | list[str] | None = None

    sido: str | None = Field(
        default=None,
        max_length=30,
    )

    sigungu: str | None = Field(
        default=None,
        max_length=30,
    )

    nearby_regions: list[DietNearbyRegion] | None = None

    meal_target: DietMealTarget | None = None

    exercise_summary: dict | None = None

    active_exercise_session: (
        ChatActiveExerciseSessionContext | None
    ) = None

    diet_summary: dict | None = None

    running: ChatRunningContext | None = None

    health_score: HealthScoreOutput | None = None


class ChatPendingAction(BaseModel):
    """Backend가 다음 대화 요청에 그대로 전달할 확인 대기 action."""

    model_config = ConfigDict(
        extra="forbid"
    )

    action: Literal[
        "diet_replace",
        "exercise_session_adjust",
    ]
    target_day: DietDay | None = None
    target_meal: DietMealType | None = None
    session_id: UUID | None = None
    plan_session_id: UUID | None = None
    exercise_item_id: UUID | None = None
    session_version: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    symptom_type: ExerciseSymptomType | None = None
    severity: int | None = Field(
        default=None,
        ge=0,
        le=10,
    )
    body_areas: list[BodyArea] = Field(
        default_factory=list,
        max_length=10,
    )
    adjustment_strategy: ExerciseAdjustmentStrategy | None = None

    @model_validator(mode="after")
    def validate_action_payload(self) -> "ChatPendingAction":
        exercise_values = (
            self.session_id,
            self.plan_session_id,
            self.exercise_item_id,
            self.session_version,
            self.symptom_type,
            self.severity,
            self.adjustment_strategy,
        )

        if self.action == "diet_replace":
            if self.target_day is None or self.target_meal is None:
                raise ValueError(
                    "diet_replace requires target_day and target_meal"
                )
            if any(value is not None for value in exercise_values):
                raise ValueError(
                    "diet_replace cannot include exercise fields"
                )
            if self.body_areas:
                raise ValueError(
                    "diet_replace cannot include body_areas"
                )
            return self

        if self.target_day is not None or self.target_meal is not None:
            raise ValueError(
                "exercise_session_adjust cannot include diet fields"
            )

        required_values = {
            "session_id": self.session_id,
            "plan_session_id": self.plan_session_id,
            "session_version": self.session_version,
            "symptom_type": self.symptom_type,
            "severity": self.severity,
            "adjustment_strategy": self.adjustment_strategy,
        }
        missing = [
            name
            for name, value in required_values.items()
            if value is None
        ]
        if missing:
            raise ValueError(
                "exercise_session_adjust is missing: "
                + ", ".join(missing)
            )

        return self

    @model_serializer(mode="wrap")
    def serialize_action_payload(self, handler):
        data = handler(self)
        if self.action == "diet_replace":
            return {
                "action": data["action"],
                "target_day": data["target_day"],
                "target_meal": data["target_meal"],
            }

        return {
            "action": data["action"],
            "session_id": data["session_id"],
            "plan_session_id": data["plan_session_id"],
            "exercise_item_id": data["exercise_item_id"],
            "session_version": data["session_version"],
            "symptom_type": data["symptom_type"],
            "severity": data["severity"],
            "body_areas": data["body_areas"],
            "adjustment_strategy": data[
                "adjustment_strategy"
            ],
        }


class ChatRequest(BaseModel):
    content: str = Field(
        min_length=1,
        max_length=500,
    )

    history: list[ChatHistoryItem] = Field(
        default_factory=list,
        max_length=6,
    )

    context: ChatContext | None = None

    pending_action: ChatPendingAction | None = None


class ChatIntentResult(BaseModel):
    intent: ChatIntent

    confidence: float = Field(
        ge=0.0,
        le=1.0,
    )

    target_day: DietDay | None = None

    target_meal: DietMealType | None = None

    running_distance_option: RunningDistanceOption | None = None

    running_custom_distance_km: float | None = Field(
        default=None,
        ge=0.5,
        le=50,
    )

    running_difficulty: Literal[
        "easy",
        "moderate",
        "hard",
    ] | None = None

    running_region: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    health_score_query_type: (
        ChatHealthScoreQueryType | None
    ) = None

    health_score_section: (
        ChatHealthScoreSection | None
    ) = None


class ChatResponse(BaseModel):
    intent: ChatIntent

    message: str

    action: ChatAction | None = None

    action_status: ChatActionStatus = "completed"

    requires_backend_apply: bool = False

    pending_action: ChatPendingAction | None = None

    target_day: DietDay | None = None

    target_meal: DietMealType | None = None

    data: dict[str, Any] | None = None

    sources: list[RecommendationSource] = Field(
        default_factory=list
    )


# =========================================================
# Backend Compatibility Models
# =========================================================


class BackendChatHistoryItem(BaseModel):
    role: ChatRole

    content: str = Field(
        min_length=1,
        max_length=2000,
    )


class BackendChatRequest(BaseModel):
    """
    기존 Backend -> AI Server /chat 계약.

    Backend 코드를 변경하지 않고
    AI Server에서 호환한다.
    """

    question: str = Field(
        min_length=1,
        max_length=8000,
    )

    user_info: dict[str, Any] = Field(
        default_factory=dict
    )

    chat_history: list[BackendChatHistoryItem] = Field(
        default_factory=list,
        max_length=20,
    )


class BackendChatTokenUsage(BaseModel):
    """OpenAI Responses API가 반환한 요청 단위 토큰 사용량."""

    input_tokens: int = Field(
        ge=0,
    )

    cached_input_tokens: int = Field(
        default=0,
        ge=0,
    )

    output_tokens: int = Field(
        ge=0,
    )

    reasoning_tokens: int = Field(
        default=0,
        ge=0,
    )

    total_tokens: int = Field(
        ge=0,
    )


class BackendChatResponse(BaseModel):
    """
    기존 Backend가 기대하는 응답 계약.
    """

    answer: str

    model: str

    # 기존 answer/model 계약을 유지하면서 관측 가능한 경우에만 제공한다.
    usage: BackendChatTokenUsage | None = None
