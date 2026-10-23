import json
from pathlib import Path

import pytest

import app.services.chat_orchestrator_service as orchestrator
from app.schemas.chat import (
    ChatContext,
    ChatRequest,
    ChatRunningContext,
)
from app.schemas.running import (
    RunningCourseRecommendationResponse,
    RunningLoopGenerationResponse,
)
from app.services.chat_intent_service import (
    classify_chat_intent,
)


EXAMPLES_PATH = (
    Path(__file__).resolve().parent
    / "docs"
    / "running_api_contract_examples.json"
)


def _running_examples() -> dict:
    return json.loads(EXAMPLES_PATH.read_text(encoding="utf-8"))


@pytest.mark.asyncio
async def test_running_intent_extracts_course_conditions() -> None:
    recommendation = await classify_chat_intent(
        "성남시에서 쉬운 5km 러닝 코스를 추천해줘"
    )
    assert recommendation.intent == "running_recommend_request"
    assert recommendation.running_distance_option == "5km"
    assert recommendation.running_custom_distance_km is None
    assert recommendation.running_difficulty == "easy"
    assert recommendation.running_region == "성남시"

    generation = await classify_chat_intent(
        "현재 위치에서 7.5km 순환 코스를 만들어줘"
    )
    assert generation.intent == "running_generate_request"
    assert generation.running_distance_option == "custom"
    assert generation.running_custom_distance_km == 7.5

    question = await classify_chat_intent(
        "러닝 페이스를 어떻게 조절하면 좋아?"
    )
    assert question.intent == "running_question"

    diet_question = await classify_chat_intent(
        "러닝 전에 저녁으로 무엇을 먹으면 좋아?"
    )
    assert diet_question.intent == "diet_question"


@pytest.mark.asyncio
async def test_running_recommendation_requires_distance_and_location() -> None:
    missing_distance = await orchestrator.process_chat(
        ChatRequest(
            content="러닝 코스를 추천해줘",
            context=ChatContext(
                running=ChatRunningContext(region="성남시")
            ),
        )
    )
    assert missing_distance.action == "need_running_distance"
    assert missing_distance.action_status == "needs_input"

    missing_location = await orchestrator.process_chat(
        ChatRequest(content="5km 러닝 코스를 추천해줘")
    )
    assert missing_location.action == "need_running_location"
    assert missing_location.action_status == "needs_input"


@pytest.mark.asyncio
async def test_running_recommendation_reuses_running_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    examples = _running_examples()
    captured = {}

    async def fake_recommend(request):
        captured["request"] = request
        return RunningCourseRecommendationResponse.model_validate(
            examples["official_metadata_recommendation"]["response"]
        )

    monkeypatch.setattr(
        orchestrator,
        "recommend_running_courses",
        fake_recommend,
    )

    result = await orchestrator.process_chat(
        ChatRequest(
            content="현재 위치에서 쉬운 5km 러닝 코스 추천해줘",
            context=ChatContext(
                running=ChatRunningContext(
                    region="서울시",
                    latitude=37.3948,
                    longitude=127.1112,
                    pace_minutes_per_km=6.5,
                )
            ),
        )
    )

    request = captured["request"]
    assert request.distance_option == "5km"
    assert request.latitude == 37.3948
    assert request.longitude == 127.1112
    assert request.region is None
    assert request.pace_minutes_per_km == 6.5
    assert request.desired_difficulty == "easy"
    assert request.limit == 3

    assert result.intent == "running_recommend_request"
    assert result.action == "running_courses_recommended"
    assert result.action_status == "completed"
    assert result.requires_backend_apply is False
    assert result.data is not None
    assert result.data["status"] == "matched"
    assert len(result.data["courses"]) > 0


@pytest.mark.asyncio
async def test_running_recommendation_exposes_generation_transition(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    examples = _running_examples()

    async def fake_recommend(request):
        return RunningCourseRecommendationResponse.model_validate(
            examples["generation_required"]["response"]
        )

    monkeypatch.setattr(
        orchestrator,
        "recommend_running_courses",
        fake_recommend,
    )

    result = await orchestrator.process_chat(
        ChatRequest(content="성남시에서 10km 러닝 코스 추천해줘")
    )

    assert result.action == "running_generation_required"
    assert result.action_status == "completed"
    assert result.data is not None
    assert result.data["status"] == "generation_required"
    assert result.data["generation_recommended"] is True


@pytest.mark.asyncio
async def test_running_loop_generation_reuses_running_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    examples = _running_examples()
    captured = {}

    async def fake_generate(request):
        captured["request"] = request
        return RunningLoopGenerationResponse.model_validate(
            examples["loop_matched"]["response"]
        )

    monkeypatch.setattr(
        orchestrator,
        "generate_running_loop_routes",
        fake_generate,
    )

    result = await orchestrator.process_chat(
        ChatRequest(
            content="현재 위치에서 5km 순환 코스를 만들어줘",
            context=ChatContext(
                running=ChatRunningContext(
                    latitude=37.3948,
                    longitude=127.1112,
                    pace_minutes_per_km=6.5,
                    candidate_count=2,
                    seed=42,
                )
            ),
        )
    )

    request = captured["request"]
    assert request.start.latitude == 37.3948
    assert request.start.longitude == 127.1112
    assert request.distance_option == "5km"
    assert request.pace_minutes_per_km == 6.5
    assert request.candidate_count == 2
    assert request.seed == 42

    assert result.intent == "running_generate_request"
    assert result.action == "running_loops_generated"
    assert result.action_status == "completed"
    assert result.requires_backend_apply is False
    assert result.data is not None
    assert result.data["status"] == "matched"


@pytest.mark.asyncio
async def test_running_loop_generation_preserves_failure_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    examples = _running_examples()

    async def fake_generate(request):
        return RunningLoopGenerationResponse.model_validate(
            examples["loop_unavailable"]["response"]
        )

    monkeypatch.setattr(
        orchestrator,
        "generate_running_loop_routes",
        fake_generate,
    )

    result = await orchestrator.process_chat(
        ChatRequest(
            content="현재 위치에서 5km 순환 코스를 만들어줘",
            context=ChatContext(
                running=ChatRunningContext(
                    latitude=37.3948,
                    longitude=127.1112,
                )
            ),
        )
    )

    assert result.action == "running_unavailable"
    assert result.action_status == "unable_to_apply"
    assert result.data is not None
    assert result.data["status"] == "unavailable"
    assert result.data["candidates"] == []


@pytest.mark.asyncio
async def test_running_question_does_not_forward_gps_to_openai(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = {}

    async def fake_answer(
        message,
        metric_statuses,
        exercise_summary,
        history=None,
    ):
        captured["summary"] = exercise_summary
        return "저장된 러닝 조건을 기준으로 안내합니다."

    monkeypatch.setattr(
        orchestrator,
        "answer_exercise_question",
        fake_answer,
    )

    result = await orchestrator.process_chat(
        ChatRequest(
            content="러닝 페이스를 어떻게 조절하면 좋아?",
            context=ChatContext(
                running=ChatRunningContext(
                    region="성남시",
                    latitude=37.3948,
                    longitude=127.1112,
                    pace_minutes_per_km=6.5,
                )
            ),
        )
    )

    running_summary = captured["summary"]["running"]
    assert "latitude" not in running_summary
    assert "longitude" not in running_summary
    assert running_summary["region"] == "성남시"
    assert result.action == "running_context"
