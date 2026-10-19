import re

from app.schemas.chat import (
    ChatHistoryItem,
    ChatIntentResult,
)


# =========================================================
# Keywords
# =========================================================

HEALTH_KEYWORDS = {
    "건강",
    "혈압",
    "혈당",
    "공복혈당",
    "당화혈색소",
    "콜레스테롤",
    "ldl",
    "hdl",
    "중성지방",
    "bmi",
    "체지방",
    "근육량",
    "골격근량",
    "검사",
    "건강검진",
}


EXERCISE_KEYWORDS = {
    "운동",
    "웨이트",
    "헬스",
    "홈트",
    "홈트레이닝",
    "근력운동",
    "유산소",
    "스트레칭",
    "스쿼트",
    "런닝",
    "러닝",
    "걷기",
}


DIET_KEYWORDS = {
    "식단",
    "음식",
    "식사",
    "메뉴",
    "아침",
    "점심",
    "저녁",
    "간식",
    "먹어",
    "먹을",
    "먹는",
    "먹고",
    "뭐 먹",
}


REPLACE_REQUEST_PHRASES = {
    "바꿔줘",
    "바꾸어줘",
    "바꿔 주세요",
    "바꿔주세요",
    "바꿔 줘",
    "바꿔",
    "바꿀래",
    "바꾸고 싶어",
    "변경해줘",
    "변경해 주세요",
    "변경해주세요",
    "변경해",
    "교체해줘",
    "교체해 주세요",
    "교체해주세요",
    "교체해",
    "다시 추천해줘",
    "다시 추천해 주세요",
    "다시 추천해주세요",
    "다시 추천",
    "다른 메뉴로 추천해줘",
    "다른 메뉴 추천해줘",
    "새 메뉴로 추천해줘",
    "다른 걸로",
    "다른거로",
    "다른 것으로",
    "새로운 걸로",
}


REPLACE_NEGATION_PHRASES = {
    "바꾸지 마",
    "바꾸지마",
    "변경하지 마",
    "변경하지마",
    "교체하지 마",
    "교체하지마",
    "추천하지 마",
    "추천하지마",
}


REPLACE_QUESTION_PHRASES = {
    "바꿔도 돼",
    "바꿔도 괜찮",
    "바꾸면 어때",
    "바꾸는 게 좋",
    "바꿀 수 있어",
    "바꿔야 해",
    "바꿔야 하나",
    "왜 바꿔",
    "어떻게 바꿔",
    "변경할 수 있어",
    "변경해야 해",
    "어떻게 변경",
    "교체할 수 있어",
    "변경 방법",
}


# =========================================================
# Day Mapping
# =========================================================

DAY_MAP = {
    "월요일": "monday",
    "월욜": "monday",
    "월": "monday",

    "화요일": "tuesday",
    "화욜": "tuesday",
    "화": "tuesday",

    "수요일": "wednesday",
    "수욜": "wednesday",
    "수": "wednesday",

    "목요일": "thursday",
    "목욜": "thursday",
    "목": "thursday",

    "금요일": "friday",
    "금욜": "friday",
    "금": "friday",

    "토요일": "saturday",
    "토욜": "saturday",
    "토": "saturday",

    "일요일": "sunday",
    "일욜": "sunday",
    "일": "sunday",
}


# =========================================================
# Meal Mapping
# =========================================================

MEAL_MAP = {
    "아침": "breakfast",
    "조식": "breakfast",

    "점심": "lunch",
    "중식": "lunch",

    "저녁": "dinner",
    "석식": "dinner",

    "간식": "snack",
}


# =========================================================
# Utility
# =========================================================

def _normalize_message(
    message: str,
) -> str:
    """
    의도 분류 전에 기본 문자열 정리.
    """

    return (
        message
        .strip()
        .lower()
    )


def _contains_any(
    message: str,
    keywords: set[str],
) -> bool:
    """
    keyword 중 하나라도 message에 존재하는지 확인한다.
    """

    lowered = _normalize_message(
        message
    )

    return any(
        keyword.lower() in lowered
        for keyword in keywords
    )


def _is_replace_request(
    message: str,
) -> bool:
    """실행 의도가 명확한 변경 표현만 허용한다."""

    if _contains_any(
        message,
        REPLACE_NEGATION_PHRASES,
    ):
        return False

    if _contains_any(
        message,
        REPLACE_QUESTION_PHRASES,
    ):
        return False

    return _contains_any(
        message,
        REPLACE_REQUEST_PHRASES,
    )


def _extract_day(
    message: str,
) -> str | None:
    """
    사용자 메시지에서 요일을 추출한다.

    긴 표현을 먼저 확인하기 위해
    key 길이 기준 내림차순으로 검사한다.
    """

    lowered = _normalize_message(
        message
    )

    sorted_days = sorted(
        (
            item
            for item in DAY_MAP.items()
            if len(item[0]) > 1
        ),
        key=lambda item: len(item[0]),
        reverse=True,
    )

    for korean_day, day_code in sorted_days:
        if korean_day in lowered:
            return day_code

    # 한 글자 요일은 일반 단어 내부의 글자와 혼동하지 않도록
    # 독립 토큰일 때만 인식한다. 예: "월 점심"은 허용하지만
    # "일반 건강식"의 "일"은 일요일로 해석하지 않는다.
    short_day_match = re.search(
        r"(?<![가-힣A-Za-z0-9])([월화수목금토일])"
        r"(?![가-힣A-Za-z0-9])",
        lowered,
    )
    if short_day_match is not None:
        return DAY_MAP[short_day_match.group(1)]

    return None


def _extract_meal(
    message: str,
) -> str | None:
    """
    아침 / 점심 / 저녁 / 간식 정보를 추출한다.
    """

    lowered = _normalize_message(
        message
    )

    for korean_meal, meal_code in MEAL_MAP.items():
        if korean_meal in lowered:
            return meal_code

    return None


# =========================================================
# History Context
# =========================================================

def _find_context_from_history(
    history: list[ChatHistoryItem] | None,
) -> tuple[
    str | None,
    str | None,
]:
    """
    최근 대화에서 마지막으로 언급된
    요일 / 식사 정보를 찾는다.

    최신 history부터 역순으로 확인한다.

    Assistant 메시지보다는 User 메시지를 우선한다.
    """

    if not history:
        return (
            None,
            None,
        )

    target_day: str | None = None
    target_meal: str | None = None

    # -----------------------------------------------------
    # User history 우선
    # -----------------------------------------------------

    for item in reversed(history):

        if item.role != "user":
            continue

        if target_day is None:
            target_day = _extract_day(
                item.content
            )

        if target_meal is None:
            target_meal = _extract_meal(
                item.content
            )

        if (
            target_day is not None
            and target_meal is not None
        ):
            return (
                target_day,
                target_meal,
            )

    # -----------------------------------------------------
    # User history에서 못 찾은 경우
    # Assistant history 보조 확인
    # -----------------------------------------------------

    for item in reversed(history):

        if item.role != "assistant":
            continue

        if target_day is None:
            target_day = _extract_day(
                item.content
            )

        if target_meal is None:
            target_meal = _extract_meal(
                item.content
            )

        if (
            target_day is not None
            and target_meal is not None
        ):
            break

    return (
        target_day,
        target_meal,
    )


# =========================================================
# Intent Classification
# =========================================================

async def classify_chat_intent(
    message: str,
    history: list[ChatHistoryItem] | None = None,
) -> ChatIntentResult:
    """
    사용자 메시지를 외부 LLM으로 보내지 않고
    AI Server 내부 규칙으로 의도를 분류한다.

    history가 존재하면 이전 대화에서
    요일 / 식사 context를 보완한다.
    """

    cleaned_message = (
        message.strip()
    )

    # =====================================================
    # 1. 현재 메시지 Context 추출
    # =====================================================

    target_day = _extract_day(
        cleaned_message
    )

    target_meal = _extract_meal(
        cleaned_message
    )

    # =====================================================
    # 2. 이전 대화 Context 추출
    # =====================================================

    history_day, history_meal = (
        _find_context_from_history(
            history
        )
    )

    # 현재 메시지 값이 항상 우선
    if target_day is None:
        target_day = history_day

    if target_meal is None:
        target_meal = history_meal

    # =====================================================
    # 3. Keyword 검사
    # =====================================================

    has_replace_request = _is_replace_request(
        cleaned_message,
    )

    has_diet = _contains_any(
        cleaned_message,
        DIET_KEYWORDS,
    )

    has_exercise = _contains_any(
        cleaned_message,
        EXERCISE_KEYWORDS,
    )

    has_health = _contains_any(
        cleaned_message,
        HEALTH_KEYWORDS,
    )

    # 현재 메시지에서 운동 변경이 명시되면 이전 식단 history보다
    # 현재 의도를 우선한다.
    if (
        has_exercise
        and has_replace_request
        and not has_diet
    ):
        return ChatIntentResult(
            intent="exercise_replace_request",
            confidence=0.95,
            target_day=None,
            target_meal=None,
        )

    # =====================================================
    # 4. Diet Replace
    #
    # 우선순위가 가장 높다.
    #
    # 예:
    # "화요일 저녁 다른 메뉴로 바꿔줘"
    # "간식도 바꿔줘"
    # "다른 걸로 해줘"
    # =====================================================

    if has_replace_request and (
        has_diet
        or target_meal is not None
        or history_meal is not None
    ):
        return ChatIntentResult(
            intent="diet_replace_request",
            confidence=0.95,
            target_day=target_day,
            target_meal=target_meal,
        )

    # =====================================================
    # 5. Diet Question
    #
    # 식사 관련 단어가 있으면 건강 단어보다 식단 의도를 우선.
    #
    # 예:
    # "혈당 관리할 때 뭘 먹어야 해?"
    # → diet_question
    # =====================================================

    if has_diet:
        return ChatIntentResult(
            intent="diet_question",
            confidence=0.90,
            target_day=target_day,
            target_meal=target_meal,
        )

    # =====================================================
    # 6. Exercise Question
    # =====================================================

    if has_exercise:
        return ChatIntentResult(
            intent="exercise_question",
            confidence=0.90,
            target_day=None,
            target_meal=None,
        )

    # =====================================================
    # 7. Health Question
    # =====================================================

    if has_health:
        return ChatIntentResult(
            intent="health_question",
            confidence=0.90,
            target_day=None,
            target_meal=None,
        )

    # =====================================================
    # 8. History 기반 후속 식단 요청
    #
    # 예:
    #
    # User:
    # "화요일 저녁 메뉴 알려줘"
    #
    # User:
    # "그거 괜찮아?"
    #
    # 단순 일반 질문과 구분하기 어렵기 때문에
    # 여기서는 식사 관련 표현이 없으면 강제로
    # diet_question으로 만들지 않는다.
    # =====================================================

    # =====================================================
    # 9. General Chat
    # =====================================================

    return ChatIntentResult(
        intent="general_chat",
        confidence=0.80,
        target_day=None,
        target_meal=None,
    )
