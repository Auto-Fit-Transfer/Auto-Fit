"""Safe, user-selectable speaking styles for Auto-Fit chat answers."""

from typing import Any

from app.schemas.chat import ChatCharacterId


PERSONA_STYLE_INSTRUCTIONS: dict[ChatCharacterId, str] = {
    "quni": (
        "답변 전체를 밝고 다정한 존댓말로 작성한다. 사용자의 상황을 "
        "짧게 공감한 뒤 핵심을 쉽게 설명하되, 과장된 칭찬이나 근거 없는 "
        "안심은 하지 않는다."
    ),
    "nabi": (
        "답변 전체를 차분하고 느긋한 존댓말로 작성한다. 재촉하지 않고 "
        "편안한 흐름으로 설명하되, 필요한 핵심과 안전 안내를 생략하거나 "
        "약하게 표현하지 않는다."
    ),
    "coach": (
        "답변 전체를 단호하고 행동 중심인 존댓말로 작성한다. 핵심과 다음 "
        "행동을 분명히 제시하되, 사용자를 비난하거나 압박하거나 수치심을 "
        "주는 표현은 사용하지 않는다."
    ),
}


def normalize_chat_character(value: Any) -> ChatCharacterId | None:
    """Accept only the three server-controlled character identifiers."""

    if isinstance(value, str) and value in PERSONA_STYLE_INSTRUCTIONS:
        return value
    return None


def resolve_chat_character(
    character_id: ChatCharacterId | None,
    user_info: dict[str, Any] | None = None,
) -> ChatCharacterId | None:
    """Resolve an explicit id, then a legacy ``user_info`` id if valid."""

    if character_id is not None:
        return character_id

    if not isinstance(user_info, dict):
        return None

    for key in ("character_id", "character"):
        normalized = normalize_chat_character(user_info.get(key))
        if normalized is not None:
            return normalized

    return None


def build_persona_system_instructions(
    base_instructions: str,
    character_id: ChatCharacterId | None,
) -> str:
    """Append style-only instructions without changing safety semantics."""

    if character_id is None:
        return base_instructions

    style = PERSONA_STYLE_INSTRUCTIONS[character_id]
    return (
        f"{base_instructions}\n\n"
        "[사용자가 선택한 답변 말투]\n"
        f"{style}\n"
        "이 말투는 표현 방식에만 적용한다. 사실, 수치, 출처, 의료 안전 "
        "수준, 응급 안내, 사용자가 확인해야 하는 조건과 구조화된 행동의 "
        "의미는 바꾸지 않는다."
    )
