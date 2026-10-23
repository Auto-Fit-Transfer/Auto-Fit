import json
from pathlib import Path

from app.schemas.chat import ChatContext
from app.schemas.health_analysis import (
    HealthAnalysisRequest,
    HealthScoreOutput,
)
from app.services.health_score_service import (
    health_score_service,
)


EXAMPLES_PATH = (
    Path(__file__).resolve().parent
    / "docs"
    / "health_report_api_contract_examples.json"
)

CASE_NAMES = (
    "initial_baseline",
    "weekly_comparison",
    "version_mismatch",
    "missing_health_data",
)


def _assert_expected_score(
    score: HealthScoreOutput,
    expected: dict,
) -> None:
    assert score.status == expected["status"]
    assert score.total_score == expected["total_score"]
    assert score.tier == expected["tier"]
    assert score.tier_level == expected["tier_level"]
    assert score.comparison_status == (
        expected["comparison_status"]
    )
    assert score.previous_total_score == (
        expected["previous_total_score"]
    )
    assert score.score_delta == expected["score_delta"]
    assert score.trend == expected["trend"]

    actual_section_scores = {
        "diet": score.diet.score,
        "exercise": score.exercise.score,
        "health_data": score.health_data.score,
    }
    assert actual_section_scores == expected["section_scores"]

    actual_section_statuses = {
        "diet": score.diet.status,
        "exercise": score.exercise.status,
        "health_data": score.health_data.status,
    }
    assert actual_section_statuses == expected["section_statuses"]

    assert [
        item.section
        for item in score.priority_actions
    ] == expected["priority_sections"]

    assert [
        {
            "section": item.section,
            "trend": item.trend,
        }
        for item in score.change_reasons
    ] == expected["change_reason_trends"]


def test_health_report_contract_examples() -> None:
    examples = json.loads(
        EXAMPLES_PATH.read_text(
            encoding="utf-8"
        )
    )

    assert examples["contract_version"] == "1.0"
    assert examples["scoring_version"] == "health-score-v1"
    assert set(examples) == {
        "contract_version",
        "scoring_version",
        *CASE_NAMES,
    }

    calculated_scores: dict[str, HealthScoreOutput] = {}

    for case_name in CASE_NAMES:
        case = examples[case_name]
        request = HealthAnalysisRequest.model_validate(
            case["request"]
        )

        assert request.request_id.startswith(
            "health-contract-"
        )

        score = health_score_service.calculate(
            request
        )
        HealthScoreOutput.model_validate(
            score.model_dump(mode="json")
        )
        _assert_expected_score(
            score,
            case["expected"],
        )
        calculated_scores[case_name] = score

        # /health-analysis 결과를 /chat/orchestrate의
        # context.health_score로 변환 없이 전달할 수 있어야 한다.
        chat_context = ChatContext.model_validate(
            {
                "health_score": score.model_dump(
                    mode="json"
                )
            }
        )
        assert chat_context.health_score == score

    initial = calculated_scores["initial_baseline"]
    comparison_request = HealthAnalysisRequest.model_validate(
        examples["weekly_comparison"]["request"]
    )
    previous = (
        comparison_request
        .input
        .score_context
        .previous_health_score
    )

    assert previous is not None
    assert previous.scoring_version == initial.scoring_version
    assert previous.total_score == initial.total_score
    assert previous.diet_score == initial.diet.score
    assert previous.exercise_score == initial.exercise.score
    assert previous.health_data_score == (
        initial.health_data.score
    )


if __name__ == "__main__":
    test_health_report_contract_examples()
    print("Health report contract examples: OK")
