import json
from pathlib import Path

import app.services.chat_orchestrator_service as orchestrator
from app.schemas.chat import (
    ChatContext,
    ChatRequest,
)
from app.schemas.health_analysis import (
    HealthMetricAdjustmentOutput,
    HealthScoreChangeReasonOutput,
    HealthScoreOutput,
    HealthScorePriorityActionOutput,
    HealthScoreSectionOutput,
    HealthScoreSectionTrendsOutput,
    HealthScoreTrendOutput,
)
from app.services.chat_answer_service import (
    answer_health_score_question,
)
from app.services.chat_intent_service import (
    classify_chat_intent,
)


EXAMPLES_PATH = (
    Path(__file__).resolve().parent
    / "docs"
    / "chat_api_contract_examples.json"
)


def _section(score: float) -> HealthScoreSectionOutput:
    return HealthScoreSectionOutput(
        status="available",
        score=score,
        message="test section",
    )


def _run_pure_coroutine(coroutine):
    """외부 I/O를 기다리지 않는 분기를 이벤트 루프 없이 검증한다."""

    try:
        coroutine.send(None)
    except StopIteration as exc:
        return exc.value

    coroutine.close()
    raise AssertionError(
        "The tested coroutine unexpectedly awaited external I/O."
    )


def _health_score(
    *,
    comparison_status: str = "available",
) -> HealthScoreOutput:
    section_trends = None
    previous_total_score = None
    score_delta = None
    trend = None
    change_reasons = []

    if comparison_status == "available":
        previous_total_score = 70.5
        score_delta = 6.7
        trend = "improved"
        section_trends = HealthScoreSectionTrendsOutput(
            diet=HealthScoreTrendOutput(
                previous_score=65,
                current_score=80,
                score_delta=15,
                trend="improved",
            ),
            exercise=HealthScoreTrendOutput(
                previous_score=70,
                current_score=72,
                score_delta=2,
                trend="improved",
            ),
            health_data=HealthScoreTrendOutput(
                previous_score=75,
                current_score=79,
                score_delta=4,
                trend="improved",
            ),
        )
        change_reasons = [
            HealthScoreChangeReasonOutput(
                section="diet",
                trend="improved",
                title="식단 관리 점수 상승",
                message="식단 관리 점수가 15점 상승했습니다.",
            ),
            HealthScoreChangeReasonOutput(
                section="exercise",
                trend="improved",
                title="운동 관리 점수 상승",
                message="운동 관리 점수가 2점 상승했습니다.",
            ),
            HealthScoreChangeReasonOutput(
                section="health_data",
                trend="improved",
                title="건강데이터 점수 상승",
                message="건강데이터 점수가 4점 상승했습니다.",
            ),
        ]

    return HealthScoreOutput(
        status="available",
        total_score=77.2,
        tier="FIT",
        tier_level=1,
        comparison_status=comparison_status,
        previous_total_score=previous_total_score,
        score_delta=score_delta,
        trend=trend,
        section_trends=section_trends,
        change_reasons=change_reasons,
        priority_actions=[
            HealthScorePriorityActionOutput(
                section="exercise",
                priority=1,
                title="주간 운동 시간 확보",
                message="남은 목표 시간을 운동일에 나누어 수행하세요.",
            ),
            HealthScorePriorityActionOutput(
                section="diet",
                priority=2,
                title="단백질 목표 준수 점검",
                message="단백질 섭취량을 목표 범위에 맞추세요.",
            ),
        ],
        diet=_section(80),
        exercise=_section(72),
        health_data=_section(79),
        health_metric_adjustments=[
            HealthMetricAdjustmentOutput(
                metric_key="fasting_glucose",
                baseline_value=110,
                current_value=100,
                unit="mg/dL",
                trend="improved",
                normalized_change=0.5,
            )
        ],
    )


def test_health_score_answer_uses_only_confirmed_score_snapshot() -> None:
    message, data = answer_health_score_question(
        health_score=_health_score(),
        query_type="summary",
        section="overall",
    )

    assert "77.2점" in message
    assert "FIT 1" in message
    assert "6.7점 상승" in message
    assert data["sections"]["exercise"]["score"] == 72
    assert "health_metric_adjustments" not in data
    assert "baseline_value" not in str(data)


def test_health_score_priority_answer_preserves_server_priority() -> None:
    message, data = answer_health_score_question(
        health_score=_health_score(),
        query_type="priority",
        section="overall",
    )

    assert message.startswith("1순위 주간 운동 시간 확보")
    assert "2순위 단백질 목표 준수 점검" in message
    assert data["priority_actions"][0]["section"] == "exercise"
    assert (
        data["recommended_next_feature"]
        == "exercise_recommendation"
    )


def test_health_score_intent_precedes_diet_and_exercise() -> None:
    exercise_reason = _run_pure_coroutine(
        classify_chat_intent(
            "운동 점수가 낮은 이유가 뭐야?",
            health_score_available=True,
        )
    )
    assert exercise_reason.intent == "health_score_question"
    assert exercise_reason.health_score_query_type == "reason"
    assert exercise_reason.health_score_section == "exercise"

    comparison = _run_pure_coroutine(
        classify_chat_intent(
            "지난주보다 좋아졌어?",
            health_score_available=True,
        )
    )
    assert comparison.intent == "health_score_question"
    assert comparison.health_score_query_type == "comparison"
    assert comparison.health_score_section == "overall"

    regular_health = _run_pure_coroutine(
        classify_chat_intent(
            "혈압 관리는 어떻게 해?",
            health_score_available=True,
        )
    )
    assert regular_health.intent == "health_question"


def test_health_score_question_requires_backend_context() -> None:
    result = _run_pure_coroutine(
        orchestrator.process_chat(
            ChatRequest(
                content="내 건강 점수를 알려줘",
            )
        )
    )

    assert result.intent == "health_score_question"
    assert result.action == "need_health_score_context"
    assert result.action_status == "needs_input"
    assert result.data is None


def test_unavailable_health_score_requests_fresh_analysis() -> None:
    unavailable_section = HealthScoreSectionOutput(
        status="unavailable",
        score=None,
        message="필요한 데이터가 없습니다.",
    )
    unavailable_score = HealthScoreOutput(
        status="unavailable",
        total_score=None,
        comparison_status="current_score_unavailable",
        diet=unavailable_section,
        exercise=unavailable_section,
        health_data=unavailable_section,
    )

    result = _run_pure_coroutine(
        orchestrator.process_chat(
            ChatRequest(
                content="내 건강 점수를 알려줘",
                context=ChatContext(
                    health_score=unavailable_score,
                ),
            )
        )
    )

    assert result.action == "need_health_score_context"
    assert result.action_status == "needs_input"
    assert result.data is not None
    assert result.data["status"] == "unavailable"


def test_health_score_comparison_uses_context_without_llm() -> None:
    result = _run_pure_coroutine(
        orchestrator.process_chat(
            ChatRequest(
                content="지난주보다 좋아졌어?",
                context=ChatContext(
                    health_score=_health_score(),
                ),
            )
        )
    )

    assert result.intent == "health_score_question"
    assert result.action == "health_score_context"
    assert result.action_status == "completed"
    assert result.sources == []
    assert result.data is not None
    assert result.data["query_type"] == "comparison"
    assert result.data["score_delta"] == 6.7
    assert "지난주 70.5점" in result.message


def test_health_score_implicit_priority_uses_context() -> None:
    result = _run_pure_coroutine(
        orchestrator.process_chat(
            ChatRequest(
                content="무엇부터 개선해야 해?",
                context=ChatContext(
                    health_score=_health_score(),
                ),
            )
        )
    )

    assert result.intent == "health_score_question"
    assert result.action == "health_score_context"
    assert result.data is not None
    assert result.data["query_type"] == "priority"
    assert result.data["priority_actions"][0]["priority"] == 1


def test_health_score_contract_example_matches_runtime() -> None:
    examples = json.loads(
        EXAMPLES_PATH.read_text(encoding="utf-8")
    )
    case = examples["health_score_comparison"]
    request = ChatRequest.model_validate(
        case["request"]
    )
    expected = case["response"]

    result = _run_pure_coroutine(
        orchestrator.process_chat(request)
    )

    assert result.model_dump(mode="json") == expected
