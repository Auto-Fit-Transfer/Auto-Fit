import asyncio
from types import SimpleNamespace

import app.services.llm_service as service
from app.routers.health_router import chat_health_check
from app.schemas.chat import BackendChatRequest


class SuccessResponses:
    async def create(self, **kwargs):
        return SimpleNamespace(output_text="  정상 레거시 응답  ")


class ErrorResponses:
    async def create(self, **kwargs):
        raise RuntimeError("simulated legacy OpenAI failure")


class SlowResponses:
    async def create(self, **kwargs):
        await asyncio.sleep(0.05)
        return SimpleNamespace(output_text="늦은 응답")


class EmptyResponses:
    async def create(self, **kwargs):
        return SimpleNamespace(output_text="  ")


class FakeOpenAI:
    responses_factory = SuccessResponses

    def __init__(self, *, api_key):
        self.responses = self.responses_factory()


async def _run_all() -> None:
    original_settings = service.get_settings
    original_openai = service.AsyncOpenAI

    settings = SimpleNamespace(
        openai_api_key="test-key",
        openai_model="test-model",
        chat_openai_timeout_seconds=1.0,
    )
    service.get_settings = lambda: settings
    service.AsyncOpenAI = FakeOpenAI
    service._reset_backend_chat_resilience_for_tests()

    request = BackendChatRequest(
        question="운동 방법을 알려줘",
        chat_history=[],
    )

    try:
        FakeOpenAI.responses_factory = SuccessResponses
        success = await service.generate_backend_chat_response(request)
        assert success == "정상 레거시 응답"

        FakeOpenAI.responses_factory = ErrorResponses
        error_fallback = await service.generate_backend_chat_response(request)
        assert "잠시 후" in error_fallback

        settings.chat_openai_timeout_seconds = 0.01
        FakeOpenAI.responses_factory = SlowResponses
        timeout_fallback = await service.generate_backend_chat_response(request)
        assert "잠시 후" in timeout_fallback

        settings.chat_openai_timeout_seconds = 1.0
        FakeOpenAI.responses_factory = EmptyResponses
        empty_fallback = await service.generate_backend_chat_response(request)
        assert "잠시 후" in empty_fallback

        health = await chat_health_check()
        stats = health["backend_chat_resilience"]
        assert stats == {
            "fallbacks": 3,
            "timeouts": 1,
            "errors": 2,
        }
    finally:
        service.get_settings = original_settings
        service.AsyncOpenAI = original_openai
        service._reset_backend_chat_resilience_for_tests()


def main() -> None:
    asyncio.run(_run_all())
    print("Backend-compatible chat resilience 테스트: OK")


if __name__ == "__main__":
    main()
