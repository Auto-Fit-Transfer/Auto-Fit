from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from app.schemas.recommendation import (
    DietDay,
    DietMealType,
    DietMealTarget,
    DietNearbyRegion,
    RecommendationSource,
)


ChatIntent = Literal[
    "health_question",
    "exercise_question",
    "exercise_replace_request",
    "diet_question",
    "diet_replace_request",
    "general_chat",
]


ChatAction = Literal[
    "health_rag",
    "exercise_context",
    "exercise_replace_unavailable",
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


# =========================================================
# Internal Chat Models
# =========================================================


class ChatHistoryItem(BaseModel):
    role: ChatRole

    content: str = Field(
        min_length=1,
        max_length=500,
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

    diet_summary: dict | None = None


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
