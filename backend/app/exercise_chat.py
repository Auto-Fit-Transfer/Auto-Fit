"""Validation and routing for deterministic exercise discomfort chat actions."""

from __future__ import annotations

import re
from typing import Any


STOP_BUTTONS = {"아파요", "어지러워요", "숨쉬기 힘들어요"}
DIRECT_STOP_SYMPTOMS = {
    "아파": "pain", "아파요": "pain",
    "어지러워": "dizziness", "어지러워요": "dizziness",
    "숨쉬기힘들어": "breathing", "숨쉬기힘들어요": "breathing",
}
SYMPTOM_WORDS = re.compile(
    r"아파|아프|통증|찌릿|쑤시|저려|저림|어지러|현기증|실신|"
    r"호흡|숨쉬|숨이\s*차|가슴\s*(?:통증|압박|답답)|심계항진|"
    r"심장이\s*(?:두근|빨리)|피로|기운이\s*없|운동\s*중\s*힘들",
    re.IGNORECASE,
)
FOLLOWUP_ACTIONS = {"need_exercise_symptom_details", "need_exercise_session_context"}
ACTION_STATUS = {
    "need_exercise_session_context": "needs_input",
    "need_exercise_symptom_details": "needs_input",
    "confirm_exercise_adjustment": "awaiting_confirmation",
    "exercise_adjustment_cancelled": "completed",
    "exercise_session_adjust": "ready_for_backend_apply",
}
ADJUSTMENT_STRATEGIES = {"reduce_remaining_volume", "skip_current_and_reduce_remaining"}
SYMPTOM_TYPES = {"pain", "fatigue", "dizziness", "breathing", "other"}


class InvalidExerciseChatResponse(ValueError):
    pass


def should_route_exercise_message(content: str, previous_action: str | None = None) -> bool:
    return (
        content.strip() in STOP_BUTTONS
        or previous_action in FOLLOWUP_ACTIONS
        or bool(SYMPTOM_WORDS.search(content))
    )


def fallback_stop_response(
    content: str, snapshot: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Keep direct stop choices safe when the AI service cannot answer."""
    choice = re.sub(r"[\s.!?…~]+", "", content)
    symptom = DIRECT_STOP_SYMPTOMS.get(choice)
    if symptom is None:
        return None
    ready = snapshot is not None
    event = {
        "symptom_type": symptom,
        "severity": None,
        "body_areas": [],
        "action_taken": "stop",
    }
    guidance = {
        "level": "stop",
        "risk_level": "caution",
        "title": "운동을 중단해 주세요",
        "immediate_action": "즉시 운동을 멈추고 넘어지지 않도록 앉거나 편한 자세를 취해 주세요.",
        "medical_advice": "증상이 심하거나 계속되면 의료진과 상담해 주세요.",
        "emergency_signs": [
            "가슴 통증 또는 압박", "실신할 것 같은 느낌 또는 의식 변화",
            "말하기 힘들 정도의 호흡곤란",
        ],
        "emergency_action": "응급 신호가 있으면 주변에 도움을 요청하고 119에 연락해 주세요.",
        "emergency_number": "119",
        "allow_resume": False,
        "allow_replacement": False,
    }
    return {
        "intent": "exercise_session_discomfort",
        "message": "즉시 운동을 멈추고 앉거나 편한 자세를 취해 주세요. 증상이 심하거나 계속되면 의료진과 상담해 주세요.",
        "action": "exercise_session_stop",
        "action_status": "ready_for_backend_apply" if ready else "unable_to_apply",
        "requires_backend_apply": ready,
        "data": {
            "session_id": snapshot["session_id"] if ready else None,
            "plan_session_id": snapshot["plan_session_id"] if ready else None,
            "session_version": snapshot["version"] if ready else None,
            "discomfort_event": event,
            "event_recording": {
                "required": True, "mode": "append_only",
                "independent_of_session_apply": True,
            },
            "safety_guidance": guidance,
        },
    }


def _uuid_matches(value: Any, expected: Any) -> bool:
    return value is None and expected is None or isinstance(value, str) and value == expected


def _valid_body_areas(value: Any) -> bool:
    return isinstance(value, list) and all(
        isinstance(area, str) and bool(area.strip()) for area in value
    )


def validate_exercise_response(
    response: Any,
    snapshot: dict[str, Any] | None,
    *,
    decision: str | None = None,
) -> dict[str, Any]:
    if not isinstance(response, dict) or response.get("intent") != "exercise_session_discomfort":
        raise InvalidExerciseChatResponse("Unexpected exercise chat intent")
    action = response.get("action")
    status = response.get("action_status")
    requires = response.get("requires_backend_apply")
    if not isinstance(response.get("message"), str) or not response["message"].strip():
        raise InvalidExerciseChatResponse("Missing exercise chat message")
    if not isinstance(requires, bool):
        raise InvalidExerciseChatResponse("Invalid apply flag")
    if action == "exercise_session_stop":
        if decision is not None:
            raise InvalidExerciseChatResponse("Unexpected stop confirmation response")
        if status not in {"ready_for_backend_apply", "unable_to_apply"}:
            raise InvalidExerciseChatResponse("Invalid stop status")
        if requires != (status == "ready_for_backend_apply"):
            raise InvalidExerciseChatResponse("Invalid stop apply flag")
        data = response.get("data")
        event = data.get("discomfort_event") if isinstance(data, dict) else None
        if not isinstance(event, dict) or event.get("action_taken") != "stop":
            raise InvalidExerciseChatResponse("Missing stop event")
        if event.get("symptom_type") not in SYMPTOM_TYPES:
            raise InvalidExerciseChatResponse("Invalid stop symptom")
        if not _valid_body_areas(event.get("body_areas")):
            raise InvalidExerciseChatResponse("Invalid stop body areas")
        severity = event.get("severity")
        if severity is not None and (not isinstance(severity, int) or isinstance(severity, bool)
                                     or not 0 <= severity <= 10):
            raise InvalidExerciseChatResponse("Invalid stop severity")
        guidance = data.get("safety_guidance")
        if (
            not isinstance(guidance, dict)
            or guidance.get("level") != "stop"
            or guidance.get("risk_level") not in {"caution", "emergency"}
            or not isinstance(guidance.get("title"), str)
            or not guidance["title"].strip()
            or guidance.get("allow_resume") is not False
            or guidance.get("allow_replacement") is not False
        ):
            raise InvalidExerciseChatResponse("Invalid safety guidance")
        recording = data.get("event_recording")
        if recording != {
            "required": True, "mode": "append_only", "independent_of_session_apply": True,
        }:
            raise InvalidExerciseChatResponse("Invalid event recording policy")
        if requires and (
            snapshot is None
            or any(not _uuid_matches(data.get(key), snapshot.get(key))
                   for key in ("session_id", "plan_session_id"))
            or data.get("session_version") != snapshot.get("version")
        ):
            raise InvalidExerciseChatResponse("Stale stop session")
        return response

    if action not in ACTION_STATUS or status != ACTION_STATUS[action]:
        raise InvalidExerciseChatResponse("Unknown exercise chat action")
    if requires != (action == "exercise_session_adjust"):
        raise InvalidExerciseChatResponse("Invalid exercise action apply flag")
    if decision is None and action in {"exercise_session_adjust", "exercise_adjustment_cancelled"}:
        raise InvalidExerciseChatResponse("Unexpected confirmed action")
    if decision == "confirm" and action != "exercise_session_adjust":
        raise InvalidExerciseChatResponse("Unexpected confirmation response")
    if decision == "cancel" and action != "exercise_adjustment_cancelled":
        raise InvalidExerciseChatResponse("Unexpected cancellation response")

    if action == "confirm_exercise_adjustment":
        pending = response.get("pending_action")
        if snapshot is None or not isinstance(pending, dict):
            raise InvalidExerciseChatResponse("Missing pending exercise action")
        if pending.get("action") != "exercise_session_adjust":
            raise InvalidExerciseChatResponse("Invalid pending action")
        if any(not _uuid_matches(pending.get(key), snapshot.get(key))
               for key in ("session_id", "plan_session_id")):
            raise InvalidExerciseChatResponse("Pending session mismatch")
        if pending.get("session_version") != snapshot.get("version"):
            raise InvalidExerciseChatResponse("Pending session version mismatch")
        if not _uuid_matches(pending.get("exercise_item_id"),
                             snapshot.get("current_exercise_item_id")):
            raise InvalidExerciseChatResponse("Pending item mismatch")
        if pending.get("adjustment_strategy") not in ADJUSTMENT_STRATEGIES:
            raise InvalidExerciseChatResponse("Unknown adjustment strategy")
        if pending["adjustment_strategy"] == "skip_current_and_reduce_remaining" \
                and pending.get("exercise_item_id") is None:
            raise InvalidExerciseChatResponse("Missing item to skip")
        if pending.get("symptom_type") not in SYMPTOM_TYPES:
            raise InvalidExerciseChatResponse("Invalid pending symptom")
        if not _valid_body_areas(pending.get("body_areas")):
            raise InvalidExerciseChatResponse("Invalid pending body areas")
        severity = pending.get("severity")
        if severity is not None and (not isinstance(severity, int) or isinstance(severity, bool)
                                     or not 0 <= severity <= 10):
            raise InvalidExerciseChatResponse("Invalid pending severity")
    return response


def answer_from_exercise_response(
    response: dict[str, Any], pending_action_id: str | None = None,
) -> dict[str, Any]:
    action = response["action"]
    required = {
        "need_exercise_session_context": ["active_exercise_session"],
        "need_exercise_symptom_details": ["exercise_symptom_details"],
    }.get(action, [])
    return {
        "intent": response["intent"],
        "content": response["message"],
        "response_source": "database_ai",
        "needs_more_data": bool(required),
        "evidence": [],
        "required_data": required,
        "action": action,
        "action_status": response["action_status"],
        "requires_backend_apply": response["requires_backend_apply"],
        "action_data": response.get("data"),
        "pending_action_id": pending_action_id,
    }


def unavailable_exercise_answer() -> dict[str, Any]:
    return {
        "intent": "exercise_session_discomfort",
        "content": "현재 운동 조정을 처리하지 못했습니다. 운동을 멈춘 상태로 두고 다시 확인해 주세요.",
        "response_source": "need_more_data",
        "needs_more_data": True,
        "evidence": [],
        "required_data": ["active_exercise_session"],
        "action": "need_exercise_session_context",
        "action_status": "needs_input",
        "requires_backend_apply": False,
        "action_data": None,
        "pending_action_id": None,
    }
