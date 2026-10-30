"""Conservative DB-first routing. This module never executes SQL or calls AI."""

from dataclasses import dataclass


@dataclass(frozen=True)
class IntentPlan:
    intent: str
    tables: tuple[str, ...]
    requires_explanation: bool = False
    requires_clarification: bool = False


# Fixed allowlist, not table names supplied by a client or language model.
SOURCES = {
    "health_score": ("health_assessments", "health_assessment_items"),
    "body_composition": ("body_compositions",),
    "health_checkup": ("health_checkups",),
    "meal_history": ("meal_logs", "meal_log_items"),
    "exercise_history": ("exercise_sessions", "exercise_logs"),
    "allergies": ("user_allergies", "allergy_types"),
    "food_inventory": ("user_food_inventory", "food_items"),
}

KEYWORDS = {
    "health_score": ("건강점수", "건강점", "종합점수"),
    "body_composition": ("인바디", "체성분", "체중", "몸무게", "체지방", "골격근"),
    "health_checkup": ("건강검진", "혈압", "혈당", "콜레스테롤", "검진결과"),
    "meal_history": ("식사", "식단", "먹었", "먹은", "섭취"),
    "exercise_history": ("운동",),
    "allergies": ("알레르기", "알러지"),
    "food_inventory": ("냉장고", "보유재료"),
}


def matched_domains(content: str) -> list[str]:
    text = "".join(content.casefold().split())
    return [key for key, words in KEYWORDS.items() if any(w in text for w in words)]


def is_off_topic_question(content: str) -> bool:
    """True only when no Auto-Fit domain keyword is present."""
    return not matched_domains(content)


def classify_question(content: str) -> IntentPlan:
    """Route supported Korean questions; ambiguous requests need clarification.

    A plan is not evidence that data exists or is sufficient. The caller must
    scope every lookup to the authenticated user and validate dates and values.
    """
    content = content.strip()
    if not 1 <= len(content) <= 500:
        raise ValueError("content must contain 1 to 500 characters")
    text = "".join(content.casefold().split())
    matches = matched_domains(content)
    if len(matches) != 1:
        return IntentPlan("clarification", (), requires_clarification=True)
    domain = matches[0]
    # Suggestions, definitions and causes must not receive a record-only answer.
    explanation = any(word in text for word in (
        "왜", "이유", "원인", "추천", "어떻게", "괜찮", "뜻", "뭐야", "무엇", "개선", "설명", "해석",
    ))
    if domain == "health_score":
        change = any(word in text for word in ("변화", "변했", "비교", "낮아", "올랐", "떨어", "이전", "지난"))
        intent = "health_score_change" if change else "health_score_latest"
    else:
        intent = domain
    return IntentPlan(intent, SOURCES[domain], requires_explanation=explanation)
