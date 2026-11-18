import asyncio
import json
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException

from backend.app import analysis_summary as summary
from backend.app import health_assessment_generation as generation
from backend.tests.test_analysis_summary import saved_analysis
from backend.tests.test_main import TEST_SETTINGS


CHECKUP_ID = "20260916-0000-4000-8000-000000000004"
BODY_ID = "20260916-0000-4000-8000-000000000003"
ASSESSMENT_ID = "20260916-0000-4000-8000-000000000006"


def analysis_input():
    checkup = summary.HealthCheckupAnalysisInput(
        health_checkup_id=CHECKUP_ID, checkup_date="2026-09-16", fasting_glucose="100",
    )
    body = summary.BodyCompositionAnalysisInput(
        body_composition_id=BODY_ID, measured_at="2026-09-16T09:00:00+09:00",
        body_fat_percentage="30",
    )
    return summary.AnalysisInputResponse(
        ready=True, missing=[], health_checkup=checkup, body_composition=body,
        diet_context=summary.DietContextAnalysisInput(captured_at="2026-11-18T12:00:00+09:00"),
        score_context={"baseline_health_checkup": checkup, "baseline_body_composition": body},
    )


def ai_reply(request_id, *, full=False):
    def section(status, score):
        return {"status": status, "score": score, "message": "점수 안내"}
    return {
        "schema_version": "1.0", "request_id": request_id,
        "analysis": {**saved_analysis(), "health_score": {
            "status": "available" if full else "unavailable",
            "total_score": 75 if full else None,
            "scoring_version": "health-score-v1",
            "diet": section("available", 70) if full else section("unavailable", None),
            "exercise": section("available", 75) if full else section("unavailable", None),
            "health_data": section("available", 80),
            "health_metric_adjustments": [{
                "metric_key": "body_fat_percentage", "baseline_value": 22.2,
                "current_value": 33.3, "unit": "%", "trend": "declined",
                "normalized_change": -0.1,
            }],
        }},
        "model": {"name": "auto-fit-health", "version": "1"},
    }


def test_weekly_diet_score_context_requires_complete_targets_and_preserves_unlogged_days():
    days = []
    for index in range(7):
        date = (generation.datetime.fromisoformat("2026-11-16") + generation.timedelta(days=index)).date()
        days.append({"date": date.isoformat(), "has_recommendation": True,
                     "has_unknown_items": False, "recorded_meal_count": 1 if index == 0 else 0,
                     **{key: {"target": 100, "consumed": 80}
                        for key in ("calories", "carbohydrates", "protein", "fat")}})
    context = generation.weekly_diet_score_context(days)
    assert len(context["days"]) == 7
    assert context["days"][0]["actual"]["calories_kcal"] == 80
    assert context["days"][1]["actual"] is None
    days[3]["protein"]["target"] = None
    assert generation.weekly_diet_score_context(days) is None
    days[3]["protein"]["target"] = 100
    days[3]["has_unknown_items"] = True
    assert generation.weekly_diet_score_context(days) is None


@pytest.mark.parametrize("full", [False, True])
def test_generation_saves_partial_or_total_without_copying_ocr(monkeypatch, full):
    calls = []
    real = httpx.AsyncClient

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("/health_assessments"):
            assert request.url.params["user_id"] == "eq.owner"
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/save_generated_health_assessment"):
            body = json.loads(request.content)
            assert body["p_score_status"] == ("available" if full else "partial")
            assert body["p_overall_score"] == (75 if full else None)
            assert body["p_health_data_score"] == 80
            assert body["p_health_data_status"] == "available"
            assert body["p_needs_score_refresh"] is (not full)
            assert "raw_data" not in json.dumps(body)
            assert "ocr" not in json.dumps(body).lower()
            assert "health_metric_adjustments" not in body["p_raw_result"]["health_score"]
            assert body["p_input_snapshot"]["health_checkup_id"] == CHECKUP_ID
            assert len(body["p_items"]) == 3
            return httpx.Response(200, json={"health_assessment_id": ASSESSMENT_ID, "created": True})
        raise AssertionError(request.url.path)

    async def fetch_input(user_id, settings):
        assert user_id == "owner"
        return analysis_input()

    class AIClient:
        def __init__(self, config): pass
        async def post(self, endpoint, payload):
            assert endpoint.value == "/health-analysis"
            assert payload["input"]["score_context"]["baseline_health_checkup"]["fasting_glucose"] == "100"
            assert payload["input"]["score_context"]["baseline_body_composition"]["body_fat_percentage"] == "30"
            return ai_reply(payload["request_id"], full=full)

    monkeypatch.setattr(generation, "fetch_analysis_input", fetch_input)
    monkeypatch.setattr(generation, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(generation, "AIServerClient", AIClient)
    monkeypatch.setattr(generation.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    result = asyncio.run(generation.generate_confirmed_health_assessment("owner", TEST_SETTINGS))
    assert result == {"status": "saved", "assessment_id": ASSESSMENT_ID}
    assert len([call for call in calls if call.method == "POST"]) == 1


def test_generation_reuses_identical_assessment_without_another_ai_call(monkeypatch):
    real = httpx.AsyncClient
    async def fetch_input(user_id, settings):
        return analysis_input()
    def handler(request):
        assert request.url.path.endswith("/health_assessments")
        return httpx.Response(200, json=[{"health_assessment_id": ASSESSMENT_ID}])
    class AIClient:
        def __init__(self, config):
            pytest.fail("AI must not be constructed for an already saved assessment")
    monkeypatch.setattr(generation, "fetch_analysis_input", fetch_input)
    monkeypatch.setattr(generation, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(generation, "AIServerClient", AIClient)
    monkeypatch.setattr(generation.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    result = asyncio.run(generation.generate_confirmed_health_assessment("owner", TEST_SETTINGS))
    assert result == {"status": "saved", "assessment_id": ASSESSMENT_ID}


def test_generation_rejects_mismatched_ai_reply_without_saving(monkeypatch):
    real = httpx.AsyncClient
    async def fetch_input(user_id, settings):
        return analysis_input()
    def handler(request):
        assert request.url.path.endswith("/health_assessments")
        return httpx.Response(200, json=[])
    class AIClient:
        def __init__(self, config): pass
        async def post(self, endpoint, payload):
            return ai_reply("wrong-request-id")
    monkeypatch.setattr(generation, "fetch_analysis_input", fetch_input)
    monkeypatch.setattr(generation, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(generation, "AIServerClient", AIClient)
    monkeypatch.setattr(generation.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(generation.generate_confirmed_health_assessment("owner", TEST_SETTINGS))
    assert getattr(exc.value, "status_code", None) == 502


def test_generation_waits_for_both_documents_without_calling_ai(monkeypatch):
    async def fetch_input(user_id, settings):
        return summary.AnalysisInputResponse(
            ready=False, missing=["body_composition"],
            health_checkup=analysis_input().health_checkup,
            diet_context=summary.DietContextAnalysisInput(captured_at="2026-11-18T12:00:00+09:00"),
        )
    class AIClient:
        def __init__(self, config): pytest.fail("AI must wait for both documents")
    monkeypatch.setattr(generation, "fetch_analysis_input", fetch_input)
    monkeypatch.setattr(generation, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(generation, "AIServerClient", AIClient)
    assert asyncio.run(generation.generate_confirmed_health_assessment("owner", TEST_SETTINGS)) == {
        "status": "waiting_for_documents", "assessment_id": None,
    }


@pytest.mark.parametrize("weekly_exercise_ready,weekly_diet_ready,expected_calls", [
    (False, True, []), (True, False, []), (True, True, ["generated"]),
])
def test_deferred_score_refresh_waits_for_complete_goals_and_retries(monkeypatch,
                                                                      weekly_exercise_ready,
                                                                      weekly_diet_ready,
                                                                      expected_calls):
    user_id = "20260916-0000-4000-8000-000000000001"
    calls = []
    real = httpx.AsyncClient
    def handler(request):
        assert request.url.path.endswith("/list_pending_health_score_users")
        assert json.loads(request.content) == {"p_after_user_id": None, "p_limit": 25}
        return httpx.Response(200, json=[{"user_id": user_id}])
    async def fetch_input(owner, settings):
        assert owner == user_id
        result = analysis_input()
        if weekly_exercise_ready:
            result.score_context["weekly_exercise"] = {
                "goal_type": "body_fat_loss", "target_minutes": 90,
                "completed_minutes": 0, "target_days": 3,
                "completed_days": 0, "goal_aligned_completed_days": 0,
            }
        return result
    async def diet_loader(owner, settings):
        return {"expected_days": 7, "days": []} if weekly_diet_ready else None
    async def generate(owner, settings, *, weekly_diet_loader):
        assert owner == user_id
        assert await weekly_diet_loader(owner, settings) == {"expected_days": 7, "days": []}
        calls.append("generated")
        return {"status": "saved", "assessment_id": ASSESSMENT_ID}
    monkeypatch.setattr(generation, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(generation, "fetch_analysis_input", fetch_input)
    monkeypatch.setattr(generation, "generate_confirmed_health_assessment", generate)
    monkeypatch.setattr(generation.httpx, "AsyncClient", lambda **kwargs: real(
        transport=httpx.MockTransport(handler), **kwargs,
    ))
    result = asyncio.run(generation.refresh_deferred_health_assessments(
        TEST_SETTINGS, weekly_diet_loader=diet_loader,
    ))
    assert calls == expected_calls
    assert result == {"next_after": None, "checked": 1,
                      "saved": len(expected_calls), "failed": 0}


def test_health_assessment_migration_keeps_partial_separate_and_is_service_only():
    sql = Path("supabase/migrations/20261118060000_health_assessment_generation.sql").read_text()
    assert "alter column overall_score drop not null" in sql
    assert "score_status = 'partial' and overall_score is null" in sql
    assert "health_data_score numeric(5,2)" in sql
    assert "needs_score_refresh boolean not null default false" in sql
    assert "on conflict (analysis_key) do nothing" in sql
    assert "health_checkup_id = p_health_checkup_id and user_id = p_user_id" in sql
    assert "body_composition_id = p_body_composition_id and user_id = p_user_id" in sql
    assert "to service_role" in sql
    assert "from public, anon, authenticated" in sql
    assert "list_pending_health_score_users" in sql
    assert "newest.score_status = 'partial' and newest.needs_score_refresh" in sql
