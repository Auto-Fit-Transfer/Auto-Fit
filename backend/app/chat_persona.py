"""Presentation tone for the three user-selectable chat characters.

The factual answer and its evidence stay unchanged. This layer only adds a
short, safe introduction so a character never rewrites measurements, medical
guidance, or a missing-data explanation.
"""

from typing import Literal


ChatCharacterId = Literal["quni", "nabi", "coach"]

INTRO = {
    "quni": "좋아요, 같이 살펴볼게요.",
    "nabi": "천천히 확인해 볼게요.",
    "coach": "핵심부터 확인하겠습니다.",
}


def apply_chat_persona(answer: dict, character_id: ChatCharacterId | None) -> dict:
    if character_id is None:
        return answer
    return {**answer, "content": f"{INTRO[character_id]}\n{answer['content']}"}
