from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
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
from app.schemas.running import (
    RunningDistanceOption,
)


ChatIntent = Literal[
    "health_score_question",
    "health_question",
    "exercise_question",
    "exercise_replace_request",
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

    diet_summary: dict | None = None

    running: ChatRunningContext | None = None

    health_score: HealthScoreOutput | None = None


class ChatPendingAction(BaseModel):
    """Backend가 다음 대화 요청에 그대로 전달할 확인 대기 action."""

    model_config = ConfigDict(
        extra="forbid"
    )

    action: Literal["diet_replace"]
    target_day: DietDay
    target_meal: DietMealType


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


class BackendChatResponse(BaseModel):
    """
    기존 Backend가 기대하는 응답 계약.
    """

    answer: str

    model: str
