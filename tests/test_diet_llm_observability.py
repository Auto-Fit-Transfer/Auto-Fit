from types import SimpleNamespace

import pytest

from app.services import diet_recommendation_service as service


@pytest.fixture(autouse=True)
def reset_diet_llm_metrics():
    service._reset_diet_llm_resilience_for_tests()
    yield
    service._reset_diet_llm_resilience_for_tests()


def _usage() -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=120,
        input_tokens_details=SimpleNamespace(
            cached_tokens=20,
        ),
        output_tokens=80,
        output_tokens_details=SimpleNamespace(
            reasoning_tokens=30,
        ),
        total_tokens=200,
    )


def test_records_completed_diet_openai_usage() -> None:
    response = SimpleNamespace(
        status="completed",
        incomplete_details=None,
        usage=_usage(),
    )

    service._record_diet_openai_response(
        response,
        operation="weekly_metadata",
    )

    stats = service.get_diet_llm_resilience_stats()
    assert stats["completed_responses"] == 1
    assert stats["incomplete_responses"] == 0
    assert stats["usage_missing"] == 0
    assert stats["input_tokens"] == 120
    assert stats["cached_input_tokens"] == 20
    assert stats["output_tokens"] == 80
    assert stats["reasoning_tokens"] == 30
    assert stats["total_tokens"] == 200


def test_records_incomplete_diet_openai_usage() -> None:
    response = SimpleNamespace(
        status="incomplete",
        incomplete_details=SimpleNamespace(
            reason="max_output_tokens"
        ),
        usage=_usage(),
    )

    with pytest.raises(
        RuntimeError,
        match="max_output_tokens",
    ):
        service._record_diet_openai_response(
            response,
            operation="weekly_narrative",
        )

    stats = service.get_diet_llm_resilience_stats()
    assert stats["completed_responses"] == 0
    assert stats["incomplete_responses"] == 1
    assert stats["input_tokens"] == 120
    assert stats["output_tokens"] == 80
    assert stats["reasoning_tokens"] == 30
    assert stats["total_tokens"] == 200


def test_records_missing_diet_openai_usage() -> None:
    response = SimpleNamespace(
        status="completed",
        incomplete_details=None,
        usage=None,
    )

    service._record_diet_openai_response(
        response,
        operation="replacement_narrative",
    )

    stats = service.get_diet_llm_resilience_stats()
    assert stats["completed_responses"] == 1
    assert stats["usage_missing"] == 1
    assert stats["total_tokens"] == 0
