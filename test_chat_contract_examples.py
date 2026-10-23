import asyncio
import json
from pathlib import Path

import app.services.chat_orchestrator_service as orchestrator
from app.schemas.chat import (
    BackendChatRequest,
    BackendChatResponse,
    ChatRequest,
    ChatResponse,
)
from app.schemas.recommendation import ReplaceMealResponse
from app.schemas.running import (
    RunningCourseRecommendationResponse,
    RunningLoopGenerationResponse,
)


EXAMPLES_PATH = (
    Path(__file__).resolve().parent
    / "docs"
    / "chat_api_contract_examples.json"
)


async def _validate_runtime_behavior(examples: dict) -> None:
    health_score = examples["health_score_comparison"]
    proposal = examples["diet_replace_proposal"]
    confirmation = examples["diet_replace_confirmation"]
    cancellation = examples["diet_replace_cancellation"]
    exercise = examples["exercise_replace_unavailable"]
    running_recommendation = examples["running_gps_recommendation"]
    running_generation = examples["running_gps_loop_generation"]

    health_score_result = await orchestrator.process_chat(
        ChatRequest.model_validate(
            health_score["request"]
        )
    )
    assert health_score_result.model_dump(
        mode="json"
    ) == health_score["response"]

    proposal_result = await orchestrator.process_chat(
        ChatRequest.model_validate(
            proposal["request"]
        )
    )
    assert proposal_result.model_dump(
        mode="json"
    ) == proposal["response"]

    cancellation_result = await orchestrator.process_chat(
        ChatRequest.model_validate(
            cancellation["request"]
        )
    )
    assert cancellation_result.model_dump(
        mode="json"
    ) == cancellation["response"]

    exercise_result = await orchestrator.process_chat(
        ChatRequest.model_validate(
            exercise["request"]
        )
    )
    assert exercise_result.model_dump(
        mode="json"
    ) == exercise["response"]

    original_replacement = orchestrator.generate_replacement_meal
    original_running_recommendation = (
        orchestrator.recommend_running_courses
    )
    original_running_generation = (
        orchestrator.generate_running_loop_routes
    )

    async def fake_replacement(request):
        return ReplaceMealResponse.model_validate(
            confirmation["response"]["data"]
        )

    async def fake_running_recommendation(request):
        assert request.latitude == 37.3948
        assert request.longitude == 127.1112
        assert request.distance_option == "5km"
        return RunningCourseRecommendationResponse.model_validate(
            running_recommendation["response"]["data"]
        )

    async def fake_running_generation(request):
        assert request.start.latitude == 37.3948
        assert request.start.longitude == 127.1112
        assert request.distance_option == "5km"
        return RunningLoopGenerationResponse.model_validate(
            running_generation["response"]["data"]
        )

    orchestrator.generate_replacement_meal = fake_replacement
    orchestrator.recommend_running_courses = (
        fake_running_recommendation
    )
    orchestrator.generate_running_loop_routes = (
        fake_running_generation
    )
    try:
        confirmation_result = await orchestrator.process_chat(
            ChatRequest.model_validate(
                confirmation["request"]
            )
        )

        running_recommendation_result = await orchestrator.process_chat(
            ChatRequest.model_validate(
                running_recommendation["request"]
            )
        )
        running_generation_result = await orchestrator.process_chat(
            ChatRequest.model_validate(
                running_generation["request"]
            )
        )
    finally:
        orchestrator.generate_replacement_meal = original_replacement
        orchestrator.recommend_running_courses = (
            original_running_recommendation
        )
        orchestrator.generate_running_loop_routes = (
            original_running_generation
        )

    actual_confirmation = confirmation_result.model_dump(
        mode="json"
    )
    assert actual_confirmation == confirmation["response"], (
        json.dumps(
            {
                "actual": actual_confirmation,
                "expected": confirmation["response"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    assert running_recommendation_result.model_dump(
        mode="json"
    ) == running_recommendation["response"]
    assert running_generation_result.model_dump(
        mode="json"
    ) == running_generation["response"]


async def _run_all() -> None:
    examples = json.loads(
        EXAMPLES_PATH.read_text(
            encoding="utf-8"
        )
    )

    assert examples["contract_version"] == "1.2"

    legacy = examples["legacy_chat"]
    BackendChatRequest.model_validate(
        legacy["request"]
    )
    BackendChatResponse.model_validate(
        legacy["response"]
    )

    orchestrated_case_names = [
        "health_question",
        "health_score_comparison",
        "exercise_replace_unavailable",
        "diet_replace_proposal",
        "diet_replace_confirmation",
        "diet_replace_cancellation",
        "running_gps_recommendation",
        "running_gps_loop_generation",
    ]

    for case_name in orchestrated_case_names:
        case = examples[case_name]
        ChatRequest.model_validate(
            case["request"]
        )
        ChatResponse.model_validate(
            case["response"]
        )

    proposal = examples[
        "diet_replace_proposal"
    ]
    confirmation = examples[
        "diet_replace_confirmation"
    ]
    cancellation = examples[
        "diet_replace_cancellation"
    ]

    proposal_pending = proposal[
        "response"
    ]["pending_action"]
    assert proposal_pending == confirmation[
        "request"
    ]["pending_action"]
    assert proposal_pending == cancellation[
        "request"
    ]["pending_action"]

    proposal_response = ChatResponse.model_validate(
        proposal["response"]
    )
    assert proposal_response.action_status == (
        "awaiting_confirmation"
    )
    assert proposal_response.requires_backend_apply is False

    confirmation_response = ChatResponse.model_validate(
        confirmation["response"]
    )
    assert confirmation_response.action_status == (
        "ready_for_backend_apply"
    )
    assert confirmation_response.requires_backend_apply is True
    assert confirmation_response.data is not None

    replacement = ReplaceMealResponse.model_validate(
        confirmation_response.data
    )
    assert replacement.day == confirmation_response.target_day
    assert replacement.meal_type == (
        confirmation_response.target_meal
    )

    cancellation_response = ChatResponse.model_validate(
        cancellation["response"]
    )
    assert cancellation_response.action == (
        "diet_replace_cancelled"
    )
    assert cancellation_response.pending_action is None
    assert cancellation_response.requires_backend_apply is False

    health_score_response = ChatResponse.model_validate(
        examples["health_score_comparison"]["response"]
    )
    assert health_score_response.action == "health_score_context"
    assert health_score_response.requires_backend_apply is False
    assert health_score_response.data is not None
    assert "health_metric_adjustments" not in (
        health_score_response.data
    )

    running_recommendation = ChatResponse.model_validate(
        examples["running_gps_recommendation"]["response"]
    )
    assert running_recommendation.action == (
        "running_courses_recommended"
    )
    assert running_recommendation.requires_backend_apply is False
    RunningCourseRecommendationResponse.model_validate(
        running_recommendation.data
    )

    running_generation = ChatResponse.model_validate(
        examples["running_gps_loop_generation"]["response"]
    )
    assert running_generation.action == "running_loops_generated"
    assert running_generation.requires_backend_apply is False
    RunningLoopGenerationResponse.model_validate(
        running_generation.data
    )

    await _validate_runtime_behavior(examples)

    print("Chat API contract examples 테스트: OK")


def main() -> None:
    asyncio.run(_run_all())


if __name__ == "__main__":
    main()
