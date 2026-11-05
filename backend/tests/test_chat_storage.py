import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.chat_storage import ChatStore, cursor_filter, encode_cursor
from backend.tests.test_main import TEST_SETTINGS

CHAT = str(uuid4())
REQUEST = str(uuid4())


@pytest.fixture
def client():
    main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()


def test_create_default_and_title(client, monkeypatch):
    async def create(self, title):
        assert self.user_id == "owner"
        return {"chat": {"title": title}}
    monkeypatch.setattr(ChatStore, "create", create)
    assert client.post("/api/chats").status_code == 201
    assert client.post("/api/chats", json={"title": " 질문 "}).json()["chat"]["title"] == "질문"
    assert client.post("/api/chats", json={"user_id": "victim"}).status_code == 422


@pytest.mark.parametrize("replay", [False, True])
def test_send_or_replay(client, monkeypatch, replay):
    calls = []
    async def exchange(self, chat_id, client_id, content, answer=None):
        assert self.user_id == "owner"
        assert str(chat_id) == CHAT and str(client_id) == REQUEST
        assert content == "안녕"
        calls.append(answer)
        if answer is None and not replay:
            return None
        return {"is_replay": replay, "assistant_message": {"content": "안내"}}
    async def no_score_query(*args):
        pytest.fail("Replay and unsupported questions should not query scores")
    monkeypatch.setattr(ChatStore, "exchange", exchange)
    monkeypatch.setattr(ChatStore, "has_general_ai_answer", AsyncMock(return_value=False))
    monkeypatch.setattr(main, "fetch_scores", no_score_query)
    result = client.post(f"/api/chats/{CHAT}/messages", json={"client_message_id": REQUEST, "content": " 안녕 "})
    assert result.status_code == (200 if replay else 201)
    assert len(calls) == (1 if replay else 2)


@pytest.mark.parametrize("character_id,introduction", [
    ("quni", "좋아요, 같이 살펴볼게요."),
    ("nabi", "천천히 확인해 볼게요."),
    ("coach", "핵심부터 확인하겠습니다."),
])
def test_selected_character_changes_answer_tone_without_changing_evidence(
    client, monkeypatch, character_id, introduction,
):
    async def exchange(self, chat_id, client_id, content, answer=None):
        if answer is None:
            return None
        return {"is_replay": False, "assistant_message": answer}

    monkeypatch.setattr(ChatStore, "exchange", exchange)
    monkeypatch.setattr(ChatStore, "has_general_ai_answer", AsyncMock(return_value=False))
    result = client.post(
        f"/api/chats/{CHAT}/messages",
        headers={"X-AutoFit-Character": character_id},
        json={"client_message_id": REQUEST, "content": "안녕"},
    )
    assert result.status_code == 201
    answer = result.json()["assistant_message"]
    assert answer["content"].startswith(introduction + "\n")
    assert answer["intent"] == "clarification"
    assert answer["needs_more_data"] is True
    assert answer["evidence"] == []


def test_unknown_character_is_rejected(client):
    result = client.post(
        f"/api/chats/{CHAT}/messages",
        headers={"X-AutoFit-Character": "user-supplied-prompt"},
        json={"client_message_id": REQUEST, "content": "안녕"},
    )
    assert result.status_code == 422


def test_persisted_routine_request_generates_and_stores_answer(client, monkeypatch):
    calls = []

    async def exchange(self, chat_id, client_id, content, answer=None):
        calls.append(answer)
        if answer is None:
            return None
        return {"is_replay": False, "assistant_message": answer}

    async def prepare(user_id, settings, *, generate):
        assert user_id == "owner"
        assert settings == TEST_SETTINGS
        assert generate is True
        return {
            "missing": [],
            "generated": True,
            "result": {
                "recommendation": {
                    "exercise_recommendation_id": "recommendation-1",
                }
            },
        }

    monkeypatch.setattr(ChatStore, "exchange", exchange)
    monkeypatch.setattr(main, "prepare_exercise_routine", prepare)

    response = client.post(
        f"/api/chats/{CHAT}/messages",
        json={"client_message_id": REQUEST, "content": "오늘 운동 루틴 만들어줘"},
    )

    assert response.status_code == 201
    assert len(calls) == 2
    assert calls[1]["intent"] == "exercise_routine_generation"
    assert calls[1]["evidence"][0]["exercise_recommendation_id"] == "recommendation-1"


@pytest.mark.parametrize("body", [{}, {"status": None}, {"status": "closed"}, {"title": " "}, {"user_id": "victim"}])
def test_patch_validation(client, body):
    assert client.patch(f"/api/chats/{CHAT}", json=body).status_code == 422


@pytest.mark.parametrize("body", [{"content": "hi"}, {"content": " ", "client_message_id": REQUEST}, {"content": "hi", "client_message_id": "bad"}])
def test_message_validation(client, body):
    assert client.post(f"/api/chats/{CHAT}/messages", json=body).status_code == 422


@pytest.mark.parametrize("cursor", ["bad", "W10=", "bnVsbA=="])
def test_bad_cursor(cursor):
    with pytest.raises(HTTPException) as exc:
        cursor_filter(cursor, "created_at", "message_id", "scope")
    assert exc.value.status_code == 422


def test_cursor_scope_and_tiebreak():
    row = {"created_at": "2026-09-08T00:00:00+00:00", "message_id": str(uuid4())}
    cursor = encode_cursor(row, "created_at", "message_id", "owner:chat")
    assert "message_id.lt." in cursor_filter(cursor, "created_at", "message_id", "owner:chat")["or"]
    with pytest.raises(HTTPException):
        cursor_filter(cursor, "created_at", "message_id", "other:chat")


def test_message_order_and_cursor(monkeypatch):
    rows = [{"message_id": str(uuid4()), "created_at": f"2026-09-08T00:00:0{i}+00:00"} for i in [3, 2, 1]]
    async def request(self, method, path, **kwargs):
        params = kwargs["params"]
        assert params["user_id"] == "eq.owner" and params["chat_id"] == f"eq.{CHAT}"
        if path == "chats":
            return [{"chat_id": CHAT}]
        assert params["limit"] == "3"
        return rows
    monkeypatch.setattr(ChatStore, "request", request)
    page = asyncio.run(ChatStore("url", {}, "owner").messages(CHAT, 2, None))
    assert page["messages"] == [rows[1], rows[0]]
    assert page["has_more"] and page["next_cursor"]


@pytest.mark.parametrize("code,status", [("CHAT_NOT_FOUND",404),("CHAT_ARCHIVED",409),("IDEMPOTENCY_CONFLICT",409),("internal secret",502)])
def test_rpc_errors(monkeypatch, code, status):
    original = httpx.AsyncClient
    def handler(req):
        return httpx.Response(400, json={"message": code})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(ChatStore("https://example.supabase.co", {}, "owner").exchange(CHAT, REQUEST, "hi"))
    assert exc.value.status_code == status
    assert "internal secret" not in str(exc.value.detail)


def test_chat_auth(client):
    del main.app.dependency_overrides[main.get_current_user]
    assert client.post("/api/chats", json={}).status_code == 401
