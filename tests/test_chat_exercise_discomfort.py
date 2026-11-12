import asyncio
import sys
from uuid import UUID

import pytest
from pydantic import ValidationError

import app.services.chat_orchestrator_service as orchestrator
from app.schemas.chat import (
    ChatActiveExerciseSessionContext,
    ChatContext,
    ChatPendingAction,
    ChatRequest,
)
from app.services.chat_intent_service import classify_chat_intent
from app.services.exercise_context_service import (
    assess_active_exercise_discomfort,
)


if sys.platform == "win32":
    asyncio.set_event_loop_policy(
        asyncio.WindowsSelectorEventLoopPolicy()
    )


SESSION_ID = UUID("11111111-1111-1111-1111-111111111111")
PLAN_SESSION_ID = UUID("22222222-2222-2222-2222-222222222222")
CURRENT_ITEM_ID = UUID("33333333-3333-3333-3333-333333333333")
REMAINING_ITEM_ID = UUID("44444444-4444-4444-4444-444444444444")


def _context(
    *,
    version: str = "session-version-1",
) -> ChatContext:
    return ChatContext(
        active_exercise_session=ChatActiveExerciseSessionContext(
            session_id=SESSION_ID,
            plan_session_id=PLAN_SESSION_ID,
            status="in_progress",
            current_exercise_item_id=CURRENT_ITEM_ID,
            current_exercise_name="스쿼트",
            remaining_exercise_item_ids=[REMAINING_ITEM_ID],
            version=version,
        )
    )


def _process(request: ChatRequest):
    return asyncio.run(orchestrator.process_chat(request))


def test_active_session_detects_short_symptom_message() -> None:
    result = asyncio.run(
        classify_chat_intent(
            message="오른쪽 무릎이 아파",
            active_exercise_session_available=True,
        )
    )

    assert result.intent == "exercise_session_discomfort"


def test_explicit_in_exercise_symptom_detected_without_context() -> None:
    result = asyncio.run(
        classify_chat_intent(
            message="운동하다가 어지러워",
        )
    )

    assert result.intent == "exercise_session_discomfort"


def test_emergency_without_session_still_requires_local_stop() -> None:
    result = _process(
        ChatRequest(content="운동하다가 어지러워")
    )

    assert result.action == "exercise_session_stop"
    assert result.action_status == "unable_to_apply"
    assert result.requires_backend_apply is False
    assert result.data["recommended_action"] == "stop"
    assert result.data["session"] is None
    assert result.data["discomfort_event"]["action_taken"] == "stop"
    assert result.data["event_recording"] == {
        "required": True,
        "mode": "append_only",
        "independent_of_session_apply": True,
    }
    assert result.data["safety_guidance"]["allow_resume"] is False
    assert (
        result.data["safety_guidance"]["allow_replacement"]
        is False
    )


@pytest.mark.parametrize(
    "message, expected_symptom",
    [
        ("아파요", "pain"),
        ("아파요!", "pain"),
        ("어지러워요", "dizziness"),
        ("숨쉬기 힘들어요", "breathing"),
    ],
)
def test_direct_discomfort_choices_require_session_stop(
    message: str,
    expected_symptom: str,
) -> None:
    result = _process(
        ChatRequest(
            content=message,
            context=_context(),
        )
    )

    assert result.intent == "exercise_session_discomfort"
    assert result.action == "exercise_session_stop"
    assert result.action_status == "ready_for_backend_apply"
    assert result.requires_backend_apply is True
    assert result.pending_action is None
    assert result.data["symptom_type"] == expected_symptom
    assert result.data["discomfort_event"] == {
        "symptom_type": expected_symptom,
        "severity": None,
        "body_areas": [],
        "action_taken": "stop",
    }
    assert result.data["event_recording"]["mode"] == "append_only"
    assert result.data["safety_guidance"]["allow_resume"] is False
    assert (
        result.data["safety_guidance"]["allow_replacement"]
        is False
    )


def test_described_mild_pain_is_not_direct_stop_selection() -> None:
    result = _process(
        ChatRequest(
            content="조금 아파요",
            context=_context(),
        )
    )

    assert result.action == "need_exercise_symptom_details"
    assert result.data["recommended_action"] == "pause"


def test_negated_chest_pain_does_not_create_emergency() -> None:
    assessment = assess_active_exercise_discomfort(
        "가슴 통증은 없고 조금 피곤해"
    )

    assert assessment.symptom_type == "fatigue"
    assert assessment.severity == 3
    assert assessment.risk_level == "mild"
    assert assessment.red_flag_codes == ()
    assert assessment.recommended_action == "adjust"


def test_body_area_alias_does_not_duplicate_parent_token() -> None:
    assessment = assess_active_exercise_discomfort(
        "오른쪽 팔꿈치가 살짝 아파"
    )

    assert assessment.body_areas == ("오른쪽 팔꿈치",)


@pytest.mark.parametrize(
    "message, expected_code",
    [
        ("운동 중 가슴 통증이 있어", "chest_discomfort"),
        ("운동하다가 어지러워", "fainting_or_severe_dizziness"),
        ("운동 중 숨을 못 쉬겠어", "severe_breathing_difficulty"),
        ("심장이 이상하게 뛰어", "abnormal_palpitations"),
        ("무릎 통증이 8/10이야", "severe_pain"),
    ],
)
def test_red_flags_require_immediate_session_stop(
    message: str,
    expected_code: str,
) -> None:
    result = _process(
        ChatRequest(
            content=message,
            context=_context(),
        )
    )

    assert result.intent == "exercise_session_discomfort"
    assert result.action == "exercise_session_stop"
    assert result.action_status == "ready_for_backend_apply"
    assert result.requires_backend_apply is True
    assert expected_code in result.data["red_flag_codes"]
    assert result.data["discomfort_event"]["action_taken"] == "stop"
    assert result.data["event_recording"] == {
        "required": True,
        "mode": "append_only",
        "independent_of_session_apply": True,
    }
    assert result.data["safety_guidance"]["emergency_number"] == "119"
    assert result.pending_action is None


def test_missing_severity_pauses_and_requests_details() -> None:
    result = _process(
        ChatRequest(
            content="오른쪽 무릎이 찌릿하고 아파",
            context=_context(),
        )
    )

    assert result.action == "need_exercise_symptom_details"
    assert result.action_status == "needs_input"
    assert result.requires_backend_apply is False
    assert result.data["body_areas"] == ["오른쪽 무릎"]
    assert result.data["missing_fields"] == ["severity"]
    assert result.data["recommended_action"] == "pause"


def test_mild_local_pain_requires_confirmation_before_adjustment() -> None:
    result = _process(
        ChatRequest(
            content="오른쪽 무릎이 살짝 찌릿해",
            context=_context(),
        )
    )

    assert result.action == "confirm_exercise_adjustment"
    assert result.action_status == "awaiting_confirmation"
    assert result.requires_backend_apply is False
    assert result.pending_action is not None
    assert result.pending_action.action == "exercise_session_adjust"
    assert result.pending_action.session_id == SESSION_ID
    assert result.pending_action.plan_session_id == PLAN_SESSION_ID
    assert result.pending_action.exercise_item_id == CURRENT_ITEM_ID
    assert result.pending_action.session_version == "session-version-1"
    assert result.pending_action.adjustment_strategy == (
        "skip_current_and_reduce_remaining"
    )


def test_confirmed_adjustment_is_ready_for_backend_apply() -> None:
    proposal = _process(
        ChatRequest(
            content="오른쪽 무릎이 살짝 찌릿해",
            context=_context(),
        )
    )

    result = _process(
        ChatRequest(
            content="네, 조정해줘",
            context=_context(),
            pending_action=proposal.pending_action,
        )
    )

    assert result.action == "exercise_session_adjust"
    assert result.action_status == "ready_for_backend_apply"
    assert result.requires_backend_apply is True
    assert result.pending_action is None
    assert result.data["session_id"] == str(SESSION_ID)
    assert result.data["plan_session_id"] == str(PLAN_SESSION_ID)
    assert result.data["session_version"] == "session-version-1"
    assert result.data["discomfort_event"] == {
        "symptom_type": "pain",
        "severity": 3,
        "body_areas": ["오른쪽 무릎"],
        "action_taken": "adjust",
    }


def test_changed_session_rejects_pending_adjustment() -> None:
    proposal = _process(
        ChatRequest(
            content="오른쪽 무릎이 살짝 찌릿해",
            context=_context(),
        )
    )

    result = _process(
        ChatRequest(
            content="네",
            context=_context(version="session-version-2"),
            pending_action=proposal.pending_action,
        )
    )

    assert result.action == "need_exercise_session_context"
    assert result.action_status == "needs_input"
    assert result.requires_backend_apply is False
    assert result.data["reason"] == "exercise_session_context_changed"


def test_changed_current_item_rejects_pending_adjustment() -> None:
    proposal = _process(
        ChatRequest(
            content="오른쪽 무릎이 살짝 찌릿해",
            context=_context(),
        )
    )
    changed_context = _context()
    changed_context.active_exercise_session.current_exercise_item_id = (
        REMAINING_ITEM_ID
    )

    result = _process(
        ChatRequest(
            content="네",
            context=changed_context,
            pending_action=proposal.pending_action,
        )
    )

    assert result.action == "need_exercise_session_context"
    assert result.requires_backend_apply is False


def test_cancelled_adjustment_does_not_resume_exercise() -> None:
    proposal = _process(
        ChatRequest(
            content="조금 피곤해. 3점 정도야",
            context=_context(),
        )
    )

    result = _process(
        ChatRequest(
            content="아니요, 취소해줘",
            context=_context(),
            pending_action=proposal.pending_action,
        )
    )

    assert result.action == "exercise_adjustment_cancelled"
    assert result.action_status == "completed"
    assert result.requires_backend_apply is False
    assert result.data["recommended_action"] == "remain_paused"


def test_new_red_flag_preempts_existing_pending_action() -> None:
    proposal = _process(
        ChatRequest(
            content="조금 피곤해. 3점 정도야",
            context=_context(),
        )
    )

    result = _process(
        ChatRequest(
            content="그런데 지금 가슴 통증이 있어",
            context=_context(),
            pending_action=proposal.pending_action,
        )
    )

    assert result.action == "exercise_session_stop"
    assert result.requires_backend_apply is True
    assert result.pending_action is None


def test_discomfort_flow_does_not_call_openai_answer_paths(
    monkeypatch,
) -> None:
    async def fail_answer(*args, **kwargs):
        raise AssertionError(
            "운동 중 증상 판정에서 OpenAI 답변 경로가 호출됐습니다."
        )

    monkeypatch.setattr(
        orchestrator,
        "answer_exercise_question",
        fail_answer,
    )
    monkeypatch.setattr(
        orchestrator,
        "answer_general_chat",
        fail_answer,
    )
    monkeypatch.setattr(
        orchestrator,
        "answer_health_question_with_sources",
        fail_answer,
    )

    result = _process(
        ChatRequest(
            content="운동 중 가슴 통증이 있어",
            context=_context(),
        )
    )

    assert result.action == "exercise_session_stop"


def test_exercise_pending_schema_rejects_diet_fields() -> None:
    with pytest.raises(ValidationError):
        ChatPendingAction(
            action="exercise_session_adjust",
            target_day="monday",
            target_meal="lunch",
            session_id=SESSION_ID,
            plan_session_id=PLAN_SESSION_ID,
            session_version="session-version-1",
            symptom_type="fatigue",
            severity=3,
            adjustment_strategy="reduce_remaining_volume",
        )


def test_diet_pending_action_contract_remains_valid() -> None:
    pending = ChatPendingAction(
        action="diet_replace",
        target_day="monday",
        target_meal="lunch",
    )

    assert pending.action == "diet_replace"
    assert pending.session_id is None


def test_general_exercise_and_running_intents_do_not_regress() -> None:
    exercise = asyncio.run(
        classify_chat_intent("운동 세트 사이 휴식은 몇 초가 좋아?")
    )
    running = asyncio.run(
        classify_chat_intent("현재 위치에서 5km 러닝 코스 추천해줘")
    )

    assert exercise.intent == "exercise_question"
    assert running.intent == "running_recommend_request"
