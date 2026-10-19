import asyncio
from types import SimpleNamespace

import app.services.chat_answer_service as service
from app.routers.health_router import chat_health_check
from app.schemas.chat import (
    ChatContext,
    ChatHistoryItem,
    ChatRequest,
)
from app.services.chat_orchestrator_service import process_chat


class ErrorResponses:
    async def create(self, **kwargs):
        raise RuntimeError("simulated OpenAI failure")


class SlowResponses:
    async def create(self, **kwargs):
        await asyncio.sleep(0.05)
        return SimpleNamespace(output_text="늦은 정상 응답")


class EmptyResponses:
    async def create(self, **kwargs):
        return SimpleNamespace(output_text="  ")


class SuccessResponses:
    last_kwargs = None

    async def create(self, **kwargs):
        type(self).last_kwargs = kwargs
        return SimpleNamespace(output_text="  정상 챗봇 응답  ")


class FakeOpenAI:
    responses_factory = ErrorResponses

    def __init__(self, *, api_key):
        self.responses = self.responses_factory()


async def _run_all() -> None:
    original_settings = service.get_settings
    original_openai = service.AsyncOpenAI
    original_rag = service.rag_node

    settings = SimpleNamespace(
        openai_api_key="test-key",
        openai_model="test-model",
        chat_openai_timeout_seconds=1.0,
    )
    service.get_settings = lambda: settings
    service.AsyncOpenAI = FakeOpenAI

    captured = {}

    async def fake_rag(state):
        captured["rag_state"] = state
        return {
            "rag_context": [
                {
                    "content": "검증된 건강 관리 자료",
                    "source_org": "검증 기관",
                    "title": "검증 문서",
                    "topic": "blood_pressure",
                },
                {
                    "content": "같은 문서의 다른 청크",
                    "source_org": "검증 기관",
                    "title": "검증 문서",
                    "topic": "blood_pressure",
                },
                {
                    "content": "출처명이 없는 자료",
                    "source_org": "검증 기관",
                    "title": None,
                    "topic": "blood_pressure",
                },
            ],
            "warnings": [],
        }

    service.rag_node = fake_rag
    service._reset_chat_answer_resilience_for_tests()

    try:
        FakeOpenAI.responses_factory = ErrorResponses
        health_response = await process_chat(
            ChatRequest(
                content="혈압 관리는 어떻게 해?",
                context=ChatContext(
                    metric_statuses={"blood_pressure": "high"}
                ),
            )
        )
        assert health_response.action == "health_rag"
        assert "의료진" in health_response.message
        assert health_response.sources == []
        assert captured["rag_state"]["merged_analysis"][
            "metric_statuses"
        ] == {"blood_pressure": "high"}

        FakeOpenAI.responses_factory = SuccessResponses
        health_with_sources = await process_chat(
            ChatRequest(
                content="혈압 관리 근거를 알려줘",
                context=ChatContext(
                    metric_statuses={"blood_pressure": "high"}
                ),
            )
        )
        assert health_with_sources.message == "정상 챗봇 응답"
        assert [
            source.model_dump()
            for source in health_with_sources.sources
        ] == [
            {
                "source_org": "검증 기관",
                "title": "검증 문서",
            }
        ]

        settings.chat_openai_timeout_seconds = 0.01
        FakeOpenAI.responses_factory = SlowResponses
        exercise = await service.answer_exercise_question(
            message="오늘 운동은 어떻게 해?",
            metric_statuses={},
            exercise_summary={"plan": "저장된 운동"},
        )
        assert "저장된 운동 계획" in exercise

        settings.chat_openai_timeout_seconds = 1.0
        FakeOpenAI.responses_factory = EmptyResponses
        diet = await service.answer_diet_question(
            message="월요일 점심은 뭐야?",
            metric_statuses={},
            diet_summary={"weekly_plan": []},
        )
        assert "공식 영양정보" in diet

        FakeOpenAI.responses_factory = SuccessResponses
        general = await service.answer_general_chat(
            "안녕하세요",
            history=[
                ChatHistoryItem(
                    role="user",
                    content=(
                        "이전 질문의 이메일은 user@example.com이고 "
                        "전화번호는 010-1234-5678이야."
                    ),
                ),
                ChatHistoryItem(
                    role="assistant",
                    content=(
                        "확인한 식별번호는 900101-1234567입니다."
                    ),
                ),
            ],
        )
        assert general == "정상 챗봇 응답"
        general_input = SuccessResponses.last_kwargs["input"]
        assert "이전 질문" in general_input
        assert "user@example.com" not in general_input
        assert "010-1234-5678" not in general_input
        assert "900101-1234567" not in general_input
        assert "[EMAIL_REMOVED]" in general_input
        assert "[PHONE_REMOVED]" in general_input
        assert "[RESIDENT_NUMBER_REMOVED]" in general_input

        async def failing_rag(state):
            raise RuntimeError("simulated RAG failure")

        service.rag_node = failing_rag
        health_without_rag = await service.answer_health_question(
            message="건강 관리는 어떻게 해?",
            metric_statuses={"blood_pressure": "high"},
        )
        assert health_without_rag == "정상 챗봇 응답"

        health_state = await chat_health_check()
        stats = health_state["chat_answer_resilience"]
        assert stats["health_fallbacks"] == 1
        assert stats["exercise_fallbacks"] == 1
        assert stats["diet_fallbacks"] == 1
        assert stats["general_fallbacks"] == 0
        assert stats["timeouts"] == 1
        assert stats["errors"] == 2
        assert stats["rag_errors"] == 1
    finally:
        service.get_settings = original_settings
        service.AsyncOpenAI = original_openai
        service.rag_node = original_rag
        service._reset_chat_answer_resilience_for_tests()


def main() -> None:
    asyncio.run(_run_all())
    print("Chat answer resilience 테스트: OK")


if __name__ == "__main__":
    main()
