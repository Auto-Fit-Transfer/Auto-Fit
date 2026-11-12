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


def _usage(
    *,
    input_tokens: int = 10,
    cached_tokens: int = 2,
    output_tokens: int = 5,
    reasoning_tokens: int = 1,
) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=input_tokens,
        input_tokens_details=SimpleNamespace(
            cached_tokens=cached_tokens,
        ),
        output_tokens=output_tokens,
        output_tokens_details=SimpleNamespace(
            reasoning_tokens=reasoning_tokens,
        ),
        total_tokens=(
            input_tokens
            + output_tokens
        ),
    )


def _zero_stats() -> dict[str, int]:
    return {
        "openai_requests": 0,
        "successes": 0,
        "fallbacks": 0,
        "timeouts": 0,
        "errors": 0,
        "incomplete_responses": 0,
        "usage_missing": 0,
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "total_tokens": 0,
    }


@pytest.mark.asyncio
async def test_generate_uses_router_contract(monkeypatch):
    captured = {}

    class Responses:
        async def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                status="completed",
                incomplete_details=None,
                output_text="  테스트 답변  ",
                usage=_usage(),
            )

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

    response = await module.generate_backend_chat_response(
        BackendChatRequest(question="질문")
    )

    assert response.answer == "테스트 답변"
    assert response.model == "test-model"
    assert response.usage is not None
    assert response.usage.input_tokens == 10
    assert response.usage.cached_input_tokens == 2
    assert response.usage.output_tokens == 5
    assert response.usage.reasoning_tokens == 1
    assert response.usage.total_tokens == 15
    assert captured["model"] == "test-model"
    assert "질문" in captured["input"]
    assert "recent_conversation" in captured["input"]
    assert "일반적인 교육 정보" in captured["instructions"]
    assert module.get_backend_chat_resilience_stats() == {
        **_zero_stats(),
        "openai_requests": 1,
        "successes": 1,
        "input_tokens": 10,
        "cached_input_tokens": 2,
        "output_tokens": 5,
        "reasoning_tokens": 1,
        "total_tokens": 15,
    }


@pytest.mark.asyncio
async def test_generate_uses_fallback_without_openai_key(monkeypatch):
    monkeypatch.setattr(
        module,
        "get_settings",
        lambda: _settings(api_key=None),
    )

    response = await module.generate_backend_chat_response(
        BackendChatRequest(question="질문")
    )

    assert "잠시 후" in response.answer
    assert response.usage is None
    assert module.get_backend_chat_resilience_stats() == {
        **_zero_stats(),
        "errors": 1,
        "fallbacks": 1,
    }


@pytest.mark.asyncio
async def test_generate_uses_fallback_for_empty_answer(monkeypatch):

    class Responses:
        async def create(self, **kwargs):
            return SimpleNamespace(
                status="completed",
                incomplete_details=None,
                output_text="   ",
                usage=_usage(),
            )

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

    response = await module.generate_backend_chat_response(
        BackendChatRequest(question="질문")
    )

    assert "잠시 후" in response.answer
    assert response.usage is not None
    assert module.get_backend_chat_resilience_stats() == {
        **_zero_stats(),
        "openai_requests": 1,
        "errors": 1,
        "fallbacks": 1,
        "input_tokens": 10,
        "cached_input_tokens": 2,
        "output_tokens": 5,
        "reasoning_tokens": 1,
        "total_tokens": 15,
    }


@pytest.mark.asyncio
async def test_generate_tracks_incomplete_response(monkeypatch):

    class Responses:
        async def create(self, **kwargs):
            return SimpleNamespace(
                status="incomplete",
                incomplete_details=SimpleNamespace(
                    reason="max_output_tokens"
                ),
                output_text="일부 답변",
                usage=_usage(
                    output_tokens=700,
                    reasoning_tokens=650,
                ),
            )

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

    response = await module.generate_backend_chat_response(
        BackendChatRequest(question="질문")
    )

    assert "잠시 후" in response.answer
    assert response.usage is not None
    assert response.usage.reasoning_tokens == 650
    assert module.get_backend_chat_resilience_stats() == {
        **_zero_stats(),
        "openai_requests": 1,
        "fallbacks": 1,
        "errors": 1,
        "incomplete_responses": 1,
        "input_tokens": 10,
        "cached_input_tokens": 2,
        "output_tokens": 700,
        "reasoning_tokens": 650,
        "total_tokens": 710,
    }
