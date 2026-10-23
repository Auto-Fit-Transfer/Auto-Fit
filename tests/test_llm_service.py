from types import SimpleNamespace

import pytest

from app.schemas.chat import BackendChatRequest
from app.services import llm_service as module


@pytest.fixture(autouse=True)
def reset_resilience_metrics():
    module._reset_backend_chat_resilience_for_tests()
    yield
    module._reset_backend_chat_resilience_for_tests()


def _settings(*, api_key: str | None = "test-key") -> SimpleNamespace:
    return SimpleNamespace(
        openai_api_key=api_key,
        openai_model="test-model",
        chat_openai_timeout_seconds=1.0,
    )


@pytest.mark.asyncio
async def test_generate_uses_router_contract(monkeypatch):
    captured = {}

    class Responses:
        async def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text="  테스트 답변  ")

    monkeypatch.setattr(
        module,
        "AsyncOpenAI",
        lambda **kwargs: SimpleNamespace(responses=Responses()),
    )
    monkeypatch.setattr(
        module,
        "get_settings",
        lambda: _settings(),
    )

    answer = await module.generate_backend_chat_response(
        BackendChatRequest(question="질문")
    )

    assert answer == "테스트 답변"
    assert captured["model"] == "test-model"
    assert "질문" in captured["input"]
    assert "recent_conversation" in captured["input"]
    assert "일반적인 교육 정보" in captured["instructions"]


@pytest.mark.asyncio
async def test_generate_uses_fallback_without_openai_key(monkeypatch):
    monkeypatch.setattr(
        module,
        "get_settings",
        lambda: _settings(api_key=None),
    )

    answer = await module.generate_backend_chat_response(
        BackendChatRequest(question="질문")
    )

    assert "잠시 후" in answer
    assert module.get_backend_chat_resilience_stats() == {
        "fallbacks": 1,
        "timeouts": 0,
        "errors": 1,
    }


@pytest.mark.asyncio
async def test_generate_uses_fallback_for_empty_answer(monkeypatch):

    class Responses:
        async def create(self, **kwargs):
            return SimpleNamespace(output_text="   ")

    monkeypatch.setattr(
        module,
        "AsyncOpenAI",
        lambda **kwargs: SimpleNamespace(responses=Responses()),
    )
    monkeypatch.setattr(
        module,
        "get_settings",
        lambda: _settings(),
    )

    answer = await module.generate_backend_chat_response(
        BackendChatRequest(question="질문")
    )

    assert "잠시 후" in answer
    assert module.get_backend_chat_resilience_stats() == {
        "fallbacks": 1,
        "timeouts": 0,
        "errors": 1,
    }
