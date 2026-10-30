import asyncio

import pytest
from fastapi import HTTPException

from backend.app.chat_answers import answer_question, decide_answer
from backend.app.chat_health_scores import Assessment


async def forbidden(*args):
    pytest.fail("unexpected database lookup")


def summary(missing=False):
    return {"intent": "exercise_history", "content": "기록된 운동은 2회입니다.",
            "response_source": "need_more_data" if missing else "database",
            "needs_more_data": missing,
            "evidence": [] if missing else [{"metric": "exercise_sessions", "current_value": 2}],
            "required_data": ["exercise_record"] if missing else []}


@pytest.mark.parametrize("question,route", [
    ("이번 주 운동 몇 번 했어?", "database"),
    ("이번 주 운동 기록을 쉽게 설명해줘", "ai_required"),
    ("이번 주 운동 기록 해석해줘", "ai_required"),
])
def test_routes_after_loading_db(question, route):
    calls = []

    async def records(intent, period):
        calls.append((intent, period))
        return summary()

    decision = asyncio.run(decide_answer(question, forbidden, records))
    assert len(calls) == 1
    assert calls[0][0] == "exercise_history" and calls[0][1]
    assert decision.route == route
    assert decision.answer["response_source"] == "database"


def test_missing_records_take_priority_over_ai():
    async def records(*args):
        return summary(missing=True)

    decision = asyncio.run(decide_answer("이번 주 운동 기록 설명해줘", forbidden, records))
    assert decision.route == "need_more_data"
    assert decision.answer["required_data"] == ["exercise_record"]


@pytest.mark.parametrize("question", [
    "운동 기록 설명해줘", "그건 왜 그래?", "오늘 운동 추천해줘",
    "다른 사용자 운동 기록 설명해줘", "오늘 운동 기록 삭제해줘",
    "건강 점수와 운동 기록 설명해줘", "최근 혈압 설명해줘",
])
def test_unsupported_or_ambiguous_requests_never_reach_ai(question):
    decision = asyncio.run(decide_answer(question, forbidden, forbidden))
    assert decision.route == "clarification"
    assert decision.answer["evidence"] == []


def test_score_cause_without_evidence_does_not_reach_ai():
    async def scores():
        return [Assessment(overall_score=86, assessed_at="2026-09-08T00:00:00Z"),
                Assessment(overall_score=91, assessed_at="2026-09-01T00:00:00Z")]

    decision = asyncio.run(decide_answer("최근 건강 점수가 낮아진 이유는?", scores))
    assert decision.route == "need_more_data"
    assert "assessment_explanation_evidence" in decision.answer["required_data"]


def test_score_cause_with_owned_item_evidence_stays_database_only():
    current_id = "00000000-0000-0000-0000-000000000101"
    previous_id = "00000000-0000-0000-0000-000000000102"

    async def scores():
        return [
            Assessment(
                health_assessment_id=current_id,
                overall_score=86,
                assessed_at="2026-09-08T00:00:00Z",
            ),
            Assessment(
                health_assessment_id=previous_id,
                overall_score=91,
                assessed_at="2026-09-01T00:00:00Z",
            ),
        ]

    async def items(rows):
        return {
            rows[0].health_assessment_id: [{
                "health_assessment_id": current_id,
                "metric_type": "blood_pressure",
                "metric_name": "혈압",
                "metric_score": 70,
                "evaluation_status": "attention",
                "sequence_order": 1,
            }],
            rows[1].health_assessment_id: [{
                "health_assessment_id": previous_id,
                "metric_type": "blood_pressure",
                "metric_name": "혈압",
                "metric_score": 90,
                "evaluation_status": "normal",
                "sequence_order": 1,
            }],
        }

    from backend.app.chat_health_scores import AssessmentItem

    async def validated_items(rows):
        grouped = await items(rows)
        return {
            key: [AssessmentItem.model_validate(value) for value in values]
            for key, values in grouped.items()
        }

    decision = asyncio.run(decide_answer(
        "최근 건강 점수가 낮아진 이유는?", scores,
        load_score_items=validated_items,
    ))
    assert decision.route == "database"
    assert decision.answer["response_source"] == "database"
    assert not decision.answer["needs_more_data"]
    assert decision.answer["evidence"][1]["label"] == "혈압"


def test_no_model_returns_db_facts_with_explicit_notice():
    async def records(*args):
        return summary()

    result = asyncio.run(answer_question("이번 주 운동 기록 설명해줘", forbidden, records))
    assert result["response_source"] == "database"
    assert not result["needs_more_data"]
    assert result["evidence"] == summary()["evidence"]
    assert "AI 설명을 현재 제공할 수 없어" in result["content"]
    assert set(result) == set(summary())


def test_database_error_is_not_ai_fallback():
    async def unavailable(*args):
        raise HTTPException(502, detail={"code": "DATA_SOURCE_ERROR"})

    with pytest.raises(HTTPException) as error:
        asyncio.run(decide_answer("이번 주 운동 기록 설명해줘", forbidden, unavailable))
    assert error.value.status_code == 502


def test_routine_request_returns_generated_recommendation_action():
    async def generate_routine():
        return {
            "missing": [],
            "generated": True,
            "result": {
                "recommendation": {
                    "exercise_recommendation_id": "recommendation-1",
                }
            },
        }

    result = asyncio.run(answer_question(
        "오늘 맞춤 운동 루틴 만들어줘",
        forbidden,
        prepare_routine=generate_routine,
    ))

    assert result["intent"] == "exercise_routine_generation"
    assert result["response_source"] == "database"
    assert result["evidence"][0]["exercise_recommendation_id"] == "recommendation-1"
    assert result["evidence"][0]["next_endpoint"] == "/api/exercise/sessions/start"


def test_routine_request_reports_missing_profile_inputs():
    async def missing_preferences():
        return {
            "missing": ["exercise_preferences", "recommendation_context"],
            "generated": False,
            "result": None,
        }

    result = asyncio.run(answer_question(
        "운동 루틴 추천해줘",
        forbidden,
        prepare_routine=missing_preferences,
    ))

    assert result["response_source"] == "need_more_data"
    assert result["required_data"] == ["exercise_preferences", "recommendation_context"]
