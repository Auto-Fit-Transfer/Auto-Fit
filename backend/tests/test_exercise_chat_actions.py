import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.ai_server import AIServerError
from backend.app.chat_storage import ChatStore
from backend.app.exercise_chat import (
    InvalidExerciseChatResponse,
    validate_exercise_response,
)
from backend.app.exercise_chat_service import ExerciseChatStore
from backend.app import exercise_chat_service
from backend.tests.test_main import TEST_SETTINGS


CHAT = str(uuid4())
MESSAGE = str(uuid4())
PENDING = str(uuid4())
DECISION = str(uuid4())
SESSION = str(uuid4())
PLAN = str(uuid4())
ITEM = str(uuid4())
REMAINING = str(uuid4())
VERSION = "2026-11-09T04:20:00+00:00"
SNAPSHOT = {
    "session_id": SESSION,
    "plan_session_id": PLAN,
    "status": "in_progress",
    "current_exercise_item_id": ITEM,
    "current_exercise_name": "스쿼트",
    "remaining_exercise_item_ids": [REMAINING],
    "version": VERSION,
}
PENDING_PAYLOAD = {
    "action": "exercise_session_adjust",
    "session_id": SESSION,
    "plan_session_id": PLAN,
    "exercise_item_id": ITEM,
    "session_version": VERSION,
    "symptom_type": "pain",
    "severity": 3,
    "body_areas": ["오른쪽 무릎"],
    "adjustment_strategy": "skip_current_and_reduce_remaining",
}


@pytest.fixture
def client():
    main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id=str(uuid4()))
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()


def proposal():
    return {
        "intent": "exercise_session_discomfort",
        "message": "현재 운동을 건너뛰고 남은 운동량을 줄일까요?",
        "action": "confirm_exercise_adjustment",
        "action_status": "awaiting_confirmation",
        "requires_backend_apply": False,
        "pending_action": dict(PENDING_PAYLOAD),
        "data": {"recommended_action": "adjust"},
    }


def stop_response(*, ready=True):
    return {
        "intent": "exercise_session_discomfort",
        "message": "운동을 중단해 주세요.",
        "action": "exercise_session_stop",
        "action_status": "ready_for_backend_apply" if ready else "unable_to_apply",
        "requires_backend_apply": ready,
        "pending_action": None,
        "data": {
            "session_id": SESSION if ready else None,
            "plan_session_id": PLAN if ready else None,
            "session_version": VERSION if ready else None,
            "discomfort_event": {
                "symptom_type": "pain", "severity": None,
                "body_areas": ["가슴"], "action_taken": "stop",
            },
            "event_recording": {
                "required": True, "mode": "append_only",
                "independent_of_session_apply": True,
            },
            "safety_guidance": {
                "level": "stop", "risk_level": "emergency",
                "title": "운동을 중단해 주세요",
                "allow_resume": False, "allow_replacement": False,
            },
        },
    }


def mock_exchange(monkeypatch):
    proposal_calls = []
    async def exchange(self, chat_id, client_id, content, answer=None):
        if answer is None:
            return None
        return {"is_replay": False, "chat": {}, "user_message": {},
                "assistant_message": answer}
    async def exchange_proposal(self, chat_id, client_id, content, answer, payload):
        proposal_calls.append((chat_id, client_id, content, answer, payload))
        return {"is_replay": False, "chat": {}, "user_message": {},
                "assistant_message": answer}
    monkeypatch.setattr(ChatStore, "exchange", exchange)
    monkeypatch.setattr(ChatStore, "exchange_proposal", exchange_proposal)
    monkeypatch.setattr(ChatStore, "messages", AsyncMock(return_value={"messages": []}))
    return proposal_calls


def test_active_snapshot_separates_current_and_later_items(monkeypatch):
    async def request(self, method, path, **kwargs):
        params = kwargs["params"]
        if path != "exercise_items":
            assert params["user_id"] == "eq.owner"
        if path == "exercise_sessions":
            return [{"exercise_session_id": SESSION, "plan_session_id": PLAN,
                     "exercise_recommendation_id": "recommendation", "status": "in_progress",
                     "updated_at": VERSION}]
        if path == "exercise_items":
            assert params["plan_session_id"] == f"eq.{PLAN}"
            return [{"exercise_item_id": ITEM, "exercise_name": "스쿼트"},
                    {"exercise_item_id": REMAINING, "exercise_name": "걷기"}]
        if path == "exercise_logs":
            return []
        raise AssertionError(path)
    monkeypatch.setattr(ExerciseChatStore, "request", request)
    snapshot = asyncio.run(ExerciseChatStore("https://db.example", {}, "owner").active_snapshot())
    assert snapshot["current_exercise_item_id"] == ITEM
    assert snapshot["remaining_exercise_item_ids"] == [REMAINING]


def test_orchestrator_receives_only_session_context_and_server_pending(monkeypatch):
    payloads = []

    class FakeAIClient:
        def __init__(self, config):
            assert config == "configured"

        async def post(self, endpoint, payload):
            assert endpoint == exercise_chat_service.AIEndpoint.CHAT
            payloads.append(payload)
            return proposal()

    monkeypatch.setattr(exercise_chat_service, "AIServerClient", FakeAIClient)
    result = asyncio.run(exercise_chat_service.call_exercise_orchestrator(
        "configured", "네", SNAPSHOT, pending_action=PENDING_PAYLOAD,
        history=[{"role": "assistant", "content": "괜찮으신가요?"}],
    ))
    assert result["action"] == "confirm_exercise_adjustment"
    assert payloads == [{
        "content": "네",
        "history": [{"role": "assistant", "content": "괜찮으신가요?"}],
        "context": {"active_exercise_session": SNAPSHOT},
        "pending_action": PENDING_PAYLOAD,
    }]


def test_proposal_stays_pending_without_changing_exercise(client, monkeypatch):
    proposal_calls = mock_exchange(monkeypatch)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))
    stop = AsyncMock(side_effect=AssertionError("must not stop before confirmation"))
    monkeypatch.setattr(ExerciseChatStore, "stop_session", stop)

    async def orchestrate(config, content, snapshot, **kwargs):
        assert content == "오른쪽 무릎이 살짝 찌릿해"
        assert snapshot == SNAPSHOT
        assert kwargs["history"] == []
        return proposal()
    monkeypatch.setattr(main, "call_exercise_orchestrator", orchestrate)

    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": "오른쪽 무릎이 살짝 찌릿해",
    })
    assert result.status_code == 201
    answer = result.json()["assistant_message"]
    assert answer["action"] == "confirm_exercise_adjustment"
    assert str(main.UUID(answer["pending_action_id"])) == answer["pending_action_id"]
    assert answer["requires_backend_apply"] is False
    assert len(proposal_calls) == 1
    assert proposal_calls[0][4] == PENDING_PAYLOAD
    assert proposal_calls[0][3]["pending_action_id"] == answer["pending_action_id"]
    stop.assert_not_awaited()


def test_missing_session_context_returns_latest_session_without_apply(client, monkeypatch):
    mock_exchange(monkeypatch)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=None))
    latest = AsyncMock(return_value={"session": {"status": "stopped"}, "items": []})
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state", latest)
    stop = AsyncMock(side_effect=AssertionError("context request must not stop a session"))
    monkeypatch.setattr(ExerciseChatStore, "stop_session", stop)
    monkeypatch.setattr(main, "call_exercise_orchestrator", AsyncMock(return_value={
        "intent": "exercise_session_discomfort", "message": "운동 세션을 다시 확인해 주세요.",
        "action": "need_exercise_session_context", "action_status": "needs_input",
        "requires_backend_apply": False, "data": {},
    }))

    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": "무릎이 아파요",
    })
    assert result.status_code == 201
    assert result.json()["assistant_message"]["action"] == "need_exercise_session_context"
    assert result.json()["exercise_session"]["session"]["status"] == "stopped"
    latest.assert_awaited_once()
    stop.assert_not_awaited()


def test_stop_event_survives_session_apply_failure(client, monkeypatch):
    mock_exchange(monkeypatch)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))
    monkeypatch.setattr(ExerciseChatStore, "record_stop_event", AsyncMock(return_value={"id": "event"}))
    monkeypatch.setattr(ExerciseChatStore, "stop_session",
                        AsyncMock(side_effect=HTTPException(409, detail="SESSION_VERSION_CONFLICT")))
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state",
                        AsyncMock(return_value={"session": {"status": "in_progress"}, "items": []}))
    monkeypatch.setattr(main, "call_exercise_orchestrator",
                        AsyncMock(return_value=stop_response()))

    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": "운동 중 가슴 통증이 있어",
    })
    assert result.status_code == 201
    answer = result.json()["assistant_message"]
    assert answer["action"] == "exercise_session_stop"
    assert answer["action_status"] == "unable_to_apply"
    assert answer["requires_backend_apply"] is False
    assert answer["action_data"]["backend_event_recorded"] is True
    assert answer["action_data"]["safety_guidance"] == stop_response()["data"]["safety_guidance"]


def test_stop_attempt_continues_if_event_insert_fails(client, monkeypatch):
    mock_exchange(monkeypatch)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))
    monkeypatch.setattr(ExerciseChatStore, "record_stop_event",
                        AsyncMock(side_effect=HTTPException(502, detail="EXERCISE_CHAT_DATA_ERROR")))
    stop = AsyncMock(return_value={"session": {"status": "stopped"}})
    monkeypatch.setattr(ExerciseChatStore, "stop_session", stop)
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state",
                        AsyncMock(return_value={"session": {"status": "stopped"}, "items": []}))
    monkeypatch.setattr(main, "call_exercise_orchestrator",
                        AsyncMock(return_value=stop_response()))

    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": "운동 중 가슴 통증이 있어",
    })
    assert result.status_code == 201
    answer = result.json()["assistant_message"]
    assert answer["action_status"] == "ready_for_backend_apply"
    assert answer["action_data"]["backend_event_recorded"] is False
    assert answer["action_data"]["backend_apply_status"] == "applied"
    stop.assert_awaited_once()


def test_stop_event_is_recorded_without_active_session(client, monkeypatch):
    mock_exchange(monkeypatch)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=None))
    record = AsyncMock(return_value={"id": "event"})
    monkeypatch.setattr(ExerciseChatStore, "record_stop_event", record)
    stop = AsyncMock()
    monkeypatch.setattr(ExerciseChatStore, "stop_session", stop)
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state", AsyncMock(return_value=None))
    monkeypatch.setattr(main, "call_exercise_orchestrator",
                        AsyncMock(return_value=stop_response(ready=False)))

    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": "아파요",
    })
    assert result.status_code == 201
    assert result.json()["assistant_message"]["action_data"]["backend_event_recorded"] is True
    assert record.await_args.args[2] is None
    stop.assert_not_awaited()


def test_unable_to_apply_stop_never_changes_an_active_session(client, monkeypatch):
    mock_exchange(monkeypatch)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))
    record = AsyncMock(return_value={"id": "event"})
    monkeypatch.setattr(ExerciseChatStore, "record_stop_event", record)
    stop = AsyncMock(side_effect=AssertionError("unapproved session stop"))
    monkeypatch.setattr(ExerciseChatStore, "stop_session", stop)
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state",
                        AsyncMock(return_value={"session": {"status": "in_progress"}, "items": []}))
    monkeypatch.setattr(main, "call_exercise_orchestrator",
                        AsyncMock(return_value=stop_response(ready=False)))

    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": "아파요",
    })
    assert result.status_code == 201
    assert result.json()["assistant_message"]["action_status"] == "unable_to_apply"
    assert result.json()["assistant_message"]["action_data"]["backend_event_recorded"] is True
    record.assert_awaited_once()
    stop.assert_not_awaited()


@pytest.mark.parametrize("choice,symptom", [
    ("아파요", "pain"), ("어지러워요", "dizziness"),
    ("숨쉬기 힘들어요", "breathing"), ("아파요!", "pain"),
])
def test_direct_stop_choice_records_event_and_stops_when_ai_is_unavailable(
    client, monkeypatch, choice, symptom,
):
    mock_exchange(monkeypatch)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))
    monkeypatch.setattr(main, "call_exercise_orchestrator",
                        AsyncMock(side_effect=AIServerError("AI_TIMEOUT")))
    event = AsyncMock(return_value={"id": "saved"})
    stop = AsyncMock(return_value={"session": {"status": "stopped"}})
    monkeypatch.setattr(ExerciseChatStore, "record_stop_event", event)
    monkeypatch.setattr(ExerciseChatStore, "stop_session", stop)
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state",
                        AsyncMock(return_value={"session": {"status": "stopped"}, "items": []}))

    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": choice,
    })
    assert result.status_code == 201
    answer = result.json()["assistant_message"]
    assert answer["action"] == "exercise_session_stop"
    assert answer["action_status"] == "ready_for_backend_apply"
    assert answer["action_data"]["discomfort_event"]["symptom_type"] == symptom
    assert answer["action_data"]["backend_event_recorded"] is True
    event.assert_awaited_once()
    stop.assert_awaited_once()


def test_direct_stop_choice_records_event_without_session_snapshot(client, monkeypatch):
    mock_exchange(monkeypatch)
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot",
                        AsyncMock(side_effect=HTTPException(502, detail="DB unavailable")))
    record = AsyncMock(return_value={"id": "saved"})
    stop = AsyncMock()
    ai = AsyncMock()
    monkeypatch.setattr(ExerciseChatStore, "record_stop_event", record)
    monkeypatch.setattr(ExerciseChatStore, "stop_session", stop)
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state", AsyncMock(return_value=None))
    monkeypatch.setattr(main, "call_exercise_orchestrator", ai)

    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": "아파요",
    })
    assert result.status_code == 201
    answer = result.json()["assistant_message"]
    assert answer["action"] == "exercise_session_stop"
    assert answer["action_status"] == "unable_to_apply"
    assert answer["action_data"]["backend_event_recorded"] is True
    assert record.await_args.args[2] is None
    stop.assert_not_awaited()
    ai.assert_not_awaited()


def pending_row(*, consumed=False, version=VERSION):
    return {
        "pending_action_id": PENDING, "chat_id": CHAT,
        "session_id": SESSION, "plan_session_id": PLAN,
        "session_version": version,
        "payload": dict(PENDING_PAYLOAD),
        "expires_at": (datetime.now(UTC) + timedelta(minutes=5)).isoformat(),
        "consumed_at": datetime.now(UTC).isoformat() if consumed else None,
        "idempotency_key": DECISION if consumed else None,
        "decision": "confirmed" if consumed else None,
        "result": {
            "is_replay": False, "chat": {"chat_id": CHAT},
            "user_message": {"content": "네"},
            "assistant_message": {"content": "적용됨", "action": "exercise_session_adjust"},
            "session": {"status": "in_progress"}, "items": [], "adjusted_items": [],
        } if consumed else None,
    }


def confirmation_response():
    return {
        "intent": "exercise_session_discomfort", "message": "현재 계획을 조정합니다.",
        "action": "exercise_session_adjust",
        "action_status": "ready_for_backend_apply",
        "requires_backend_apply": True,
        "data": {
            "session_id": SESSION, "plan_session_id": PLAN,
            "exercise_item_id": ITEM, "session_version": VERSION,
            "adjustment_strategy": "skip_current_and_reduce_remaining",
            "discomfort_event": {"symptom_type": "pain", "severity": 3,
                                 "body_areas": ["오른쪽 무릎"], "action_taken": "adjust"},
        },
    }


def cancellation_response():
    return {
        "intent": "exercise_session_discomfort", "message": "조정을 취소했습니다.",
        "action": "exercise_adjustment_cancelled", "action_status": "completed",
        "requires_backend_apply": False, "data": {"session_id": SESSION},
    }


def test_confirm_uses_server_pending_payload_and_returns_current_session(client, monkeypatch):
    monkeypatch.setattr(ChatStore, "get", AsyncMock(return_value={"chat_id": CHAT}))
    monkeypatch.setattr(ExerciseChatStore, "pending", AsyncMock(return_value=pending_row()))
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state",
                        AsyncMock(return_value={"session": {"status": "in_progress"}, "items": []}))
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())

    async def orchestrate(config, content, snapshot, **kwargs):
        assert content == "네"
        assert snapshot == SNAPSHOT
        assert kwargs["pending_action"] == PENDING_PAYLOAD
        return confirmation_response()
    monkeypatch.setattr(main, "call_exercise_orchestrator", orchestrate)
    resolve = AsyncMock(return_value={
        "is_replay": False, "chat": {"chat_id": CHAT},
        "user_message": {"content": "네"},
        "assistant_message": {"content": "현재 계획을 조정합니다.",
                              "action": "exercise_session_adjust"},
        "session": {"status": "in_progress"}, "items": [],
        "adjusted_items": [{"exercise_item_id": REMAINING}],
    })
    monkeypatch.setattr(ExerciseChatStore, "resolve_pending", resolve)

    result = client.post(f"/api/chats/{CHAT}/pending-actions/{PENDING}/confirm", json={
        "idempotency_key": DECISION,
    })
    assert result.status_code == 200
    assert result.json()["adjusted_items"] == [{"exercise_item_id": REMAINING}]
    assert result.json()["exercise_session"]["session"]["status"] == "in_progress"
    assert resolve.await_args.args[3] == "confirm"
    assert resolve.await_args.args[5]["action_data"]["backend_apply_status"] == "applied"


def test_cancel_consumes_pending_without_applying_exercise(client, monkeypatch):
    monkeypatch.setattr(ChatStore, "get", AsyncMock(return_value={"chat_id": CHAT}))
    monkeypatch.setattr(ExerciseChatStore, "pending", AsyncMock(return_value=pending_row()))
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())

    async def orchestrate(config, content, snapshot, **kwargs):
        assert content == "취소"
        assert kwargs["pending_action"] == PENDING_PAYLOAD
        return cancellation_response()
    monkeypatch.setattr(main, "call_exercise_orchestrator", orchestrate)
    resolve = AsyncMock(return_value={
        "is_replay": False, "chat": {"chat_id": CHAT},
        "user_message": {"content": "취소"},
        "assistant_message": {"content": "조정을 취소했습니다.",
                              "action": "exercise_adjustment_cancelled"},
        "session": {"status": "in_progress"}, "items": [], "adjusted_items": [],
    })
    monkeypatch.setattr(ExerciseChatStore, "resolve_pending", resolve)

    result = client.post(f"/api/chats/{CHAT}/pending-actions/{PENDING}/cancel", json={
        "idempotency_key": DECISION,
    })
    assert result.status_code == 200
    assert result.json()["adjusted_items"] == []
    assert result.json()["exercise_session"]["session"]["status"] == "in_progress"
    assert resolve.await_args.args[3] == "cancel"


def test_stale_confirmation_returns_409_before_ai_call(client, monkeypatch):
    monkeypatch.setattr(ChatStore, "get", AsyncMock(return_value={"chat_id": CHAT}))
    monkeypatch.setattr(ExerciseChatStore, "pending",
                        AsyncMock(return_value=pending_row(version="2026-11-09T04:00:00+00:00")))
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state",
                        AsyncMock(return_value={"session": {"status": "in_progress"}, "items": []}))
    ai = AsyncMock(side_effect=AssertionError("stale proposal must not reach AI"))
    monkeypatch.setattr(main, "call_exercise_orchestrator", ai)

    result = client.post(f"/api/chats/{CHAT}/pending-actions/{PENDING}/confirm", json={
        "idempotency_key": DECISION,
    })
    assert result.status_code == 409
    assert result.json()["detail"]["code"] == "SESSION_VERSION_CONFLICT"
    ai.assert_not_awaited()


def test_duplicate_confirmation_returns_saved_result_without_ai(client, monkeypatch):
    monkeypatch.setattr(ChatStore, "get", AsyncMock(return_value={"chat_id": CHAT}))
    monkeypatch.setattr(ExerciseChatStore, "pending", AsyncMock(return_value=pending_row(consumed=True)))
    latest = AsyncMock(side_effect=AssertionError("replay must use saved session state"))
    monkeypatch.setattr(ExerciseChatStore, "latest_session_state", latest)
    ai = AsyncMock(side_effect=AssertionError("replay must not reach AI"))
    monkeypatch.setattr(main, "call_exercise_orchestrator", ai)

    result = client.post(f"/api/chats/{CHAT}/pending-actions/{PENDING}/confirm", json={
        "idempotency_key": DECISION,
    })
    assert result.status_code == 200
    assert result.json()["assistant_message"]["action"] == "exercise_session_adjust"
    ai.assert_not_awaited()
    latest.assert_not_awaited()


def test_response_rejects_cross_session_pending_and_unsafe_guidance():
    other = proposal()
    other["pending_action"]["session_id"] = str(uuid4())
    with pytest.raises(InvalidExerciseChatResponse):
        validate_exercise_response(other, SNAPSHOT)
    unsafe = stop_response()
    unsafe["data"]["safety_guidance"]["allow_resume"] = True
    with pytest.raises(InvalidExerciseChatResponse):
        validate_exercise_response(unsafe, SNAPSHOT)
    missing_recording = stop_response()
    del missing_recording["data"]["event_recording"]
    with pytest.raises(InvalidExerciseChatResponse):
        validate_exercise_response(missing_recording, SNAPSHOT)
    missing_guidance = stop_response()
    del missing_guidance["data"]["safety_guidance"]
    with pytest.raises(InvalidExerciseChatResponse):
        validate_exercise_response(missing_guidance, SNAPSHOT)


def test_bare_severity_answer_keeps_exercise_followup_context(client, monkeypatch):
    mock_exchange(monkeypatch)
    monkeypatch.setattr(ChatStore, "messages", AsyncMock(return_value={"messages": [
        {"sender_type": "user", "content": "무릎이 아파요"},
        {"sender_type": "assistant", "content": "통증이 어느 정도인가요?",
         "action": "need_exercise_symptom_details"},
    ]}))
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(ExerciseChatStore, "active_snapshot", AsyncMock(return_value=SNAPSHOT))

    async def orchestrate(config, content, snapshot, **kwargs):
        assert content == "3"
        assert kwargs["history"][-1]["content"] == "통증이 어느 정도인가요?"
        return proposal()
    monkeypatch.setattr(main, "call_exercise_orchestrator", orchestrate)
    result = client.post(f"/api/chats/{CHAT}/messages", json={
        "client_message_id": MESSAGE, "content": "3",
    })
    assert result.status_code == 201
    assert result.json()["assistant_message"]["action"] == "confirm_exercise_adjustment"
