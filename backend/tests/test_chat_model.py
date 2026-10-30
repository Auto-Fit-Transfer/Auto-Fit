import asyncio
import json

import httpx
import pytest

from backend.app import chat_model, chat_answers, main
from backend.app.chat_storage import ChatStore
from fastapi.testclient import TestClient


def summary():
    return {"intent": "exercise_history", "content": "운동 2회",
            "response_source": "database", "needs_more_data": False,
            "evidence": [{"metric": "exercise_sessions", "current_value": 2}],
            "required_data": []}


@pytest.fixture(autouse=True)
def disabled(monkeypatch):
    monkeypatch.setenv("CHAT_AI_ENABLED", "false")


def enable(monkeypatch, handler):
    monkeypatch.setenv("CHAT_AI_ENABLED", "true")
    monkeypatch.setenv("CHAT_AI_URL", "https://ai.example/chat")
    monkeypatch.setenv("CHAT_AI_API_KEY", "test-only-" + "x" * 32)
    original = httpx.AsyncClient
    monkeypatch.setattr(chat_model.httpx, "AsyncClient", lambda **kw:
                        original(transport=httpx.MockTransport(handler), **kw))


def test_disabled_never_opens_client(monkeypatch):
    def forbidden(**kw):
        pytest.fail("disabled integration accessed network")
    monkeypatch.setattr(chat_model.httpx, "AsyncClient", forbidden)
    assert asyncio.run(chat_model.explain_records("질문", summary())) is None


@pytest.mark.parametrize("url", ["http://ai.example/chat", "https://ai.example/ai/chat",
    "https://user:pass@ai.example/chat", "https://ai.example/chat?token=x",
    "https://ai.example/chat#fragment", "https:///chat"])
def test_invalid_url(monkeypatch, url):
    monkeypatch.setenv("CHAT_AI_ENABLED", "true")
    monkeypatch.setenv("CHAT_AI_URL", url)
    monkeypatch.setenv("CHAT_AI_API_KEY", "x" * 32)
    with pytest.raises(ValueError):
        chat_model.get_model_config()


def test_config_checked_at_startup(monkeypatch):
    monkeypatch.setenv("CHAT_AI_ENABLED", "true")
    monkeypatch.setenv("CHAT_AI_API_KEY", "")
    with pytest.raises(ValueError):
        with TestClient(main.app):
            pass


def test_wire_contract_and_data_minimization(monkeypatch):
    def handler(req):
        assert str(req.url) == "https://ai.example/chat"
        assert req.headers["authorization"] == "Bearer test-only-" + "x" * 32
        body = json.loads(req.content)
        assert set(body) == {"question", "user_info", "chat_history"}
        assert body["user_info"] == {} and body["chat_history"] == []
        assert "exercise_sessions" in body["question"]
        assert "private-name" not in body["question"]
        return httpx.Response(200, json={"answer": "운동 2회가 기록되어 있어요.", "model": "test-model"})
    enable(monkeypatch, handler)
    answer = summary()
    answer["content"] = "private-name"
    answer["evidence"].append({"metric": "email", "current_value": "private-name"})
    assert asyncio.run(chat_model.explain_records("이번 주 운동 기록 설명해줘", answer))


@pytest.mark.parametrize("response", [
    httpx.Response(500), httpx.Response(401),
    httpx.Response(307, headers={"Location": "https://other.example/chat"}),
    httpx.Response(200, text="not json"),
    httpx.Response(200, json={"answer": " ", "model": "test"}),
    httpx.Response(200, json={"answer": 123, "model": "test"}),
    httpx.Response(200, json={"answer": "x" * 4001, "model": "test"}),
    httpx.Response(200, json={"answer": "ok"}),
    httpx.Response(200, content=b"x" * 65537),
])
def test_bad_responses_fall_back(monkeypatch, response):
    enable(monkeypatch, lambda req: response)
    assert asyncio.run(chat_model.explain_records("질문", summary())) is None


def test_timeout_falls_back(monkeypatch):
    def handler(req):
        raise httpx.ReadTimeout("private upstream detail")
    enable(monkeypatch, handler)
    assert asyncio.run(chat_model.explain_records("질문", summary())) is None


def test_timeout_budgets_allow_slow_model_response():
    assert chat_model.MODEL_HTTP_TIMEOUT_SECONDS >= 60
    assert chat_model.MODEL_WALL_TIMEOUT_SECONDS > chat_model.MODEL_HTTP_TIMEOUT_SECONDS
    assert main.CHAT_REQUEST_TIMEOUT_SECONDS > chat_model.MODEL_WALL_TIMEOUT_SECONDS


def test_db_error_never_calls_model(monkeypatch):
    async def unavailable(*args):
        raise RuntimeError("DB unavailable")
    async def forbidden(*args):
        pytest.fail("DB failure reached model")
    monkeypatch.setattr(chat_answers, "explain_records", forbidden)
    with pytest.raises(RuntimeError, match="DB unavailable"):
        asyncio.run(chat_answers.answer_question("이번 주 운동 기록 설명해줘", forbidden, unavailable))


def test_model_failure_preserves_database_answer(monkeypatch):
    enable(monkeypatch, lambda req: httpx.Response(503))
    async def records(*args):
        return summary()
    answer = asyncio.run(chat_answers.answer_question("이번 주 운동 기록 설명해줘", None, records))
    assert answer["response_source"] == "database"
    assert answer["evidence"] == summary()["evidence"]
    assert "AI 설명을 현재 제공할 수 없어" in answer["content"]


@pytest.mark.parametrize("question,missing", [
    ("이번 주 운동 몇 번 했어?", False), ("이번 주 운동 기록 설명해줘", True),
    ("오늘 운동 추천해줘", False),
])
def test_non_ai_routes_never_call_model(monkeypatch, question, missing):
    async def forbidden(*args):
        pytest.fail("unexpected model/score call")
    async def records(*args):
        return {**summary(), "needs_more_data": missing}
    monkeypatch.setattr(chat_answers, "explain_records", forbidden)
    asyncio.run(chat_answers.answer_question(question, forbidden, records))


@pytest.mark.parametrize("saved", [False, True])
def test_http_routes_use_adapter(monkeypatch, saved):
    enable(monkeypatch, lambda req: httpx.Response(200, json={"answer": "운동 기록 설명", "model": "mock"}))
    async def records(*args):
        return summary()
    async def exchange(self, chat_id, client_id, content, answer=None):
        return None if answer is None else {"is_replay": False, "assistant_message": answer}
    monkeypatch.setattr(main, "answer_records", records)
    monkeypatch.setattr(ChatStore, "exchange", exchange)
    main.app.dependency_overrides[main.get_settings] = lambda: main.Settings("https://db.example", "pk", "sk", "http://localhost:3000")
    main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
    try:
        with TestClient(main.app) as client:
            body = {"content": "이번 주 운동 기록 설명해줘"}
            path = "/api/chats/answer-preview"
            if saved:
                path = "/api/chats/11111111-1111-4111-8111-111111111111/messages"
                body["client_message_id"] = "22222222-2222-4222-8222-222222222222"
            result = client.post(path, json=body)
        assert result.status_code == (201 if saved else 200)
        answer = result.json()["assistant_message" if saved else "answer"]
        assert answer["response_source"] == "database_ai"
        assert answer["evidence"] == summary()["evidence"]
        assert "model" not in answer
    finally:
        main.app.dependency_overrides.pop(main.get_settings, None)
        main.app.dependency_overrides.pop(main.get_current_user, None)
