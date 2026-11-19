import asyncio
from contextlib import asynccontextmanager
from datetime import date
from types import SimpleNamespace

import httpx

from backend.app import weekly_exercise_score as score
from backend.app.weekly_exercise_score import (
    WeeklyExerciseTotals, aggregate_weekly_exercise, weekly_exercise_score_context,
)

MONDAY = date(2026, 11, 16)
SESSIONS = {
    "stopped": {"status": "stopped", "exercise_recommendation_id": "aligned"},
    "finished": {"status": "completed", "exercise_recommendation_id": "other"},
    "open": {"status": "in_progress", "exercise_recommendation_id": "aligned"},
}
ITEMS = {
    "sets": {"execution_type": "count_based", "exercise_recommendation_id": "aligned"},
    "timer": {"execution_type": "time_based", "exercise_recommendation_id": "aligned"},
    "other_timer": {"execution_type": "time_based", "exercise_recommendation_id": "other"},
}


def log(session: str, item: str, minutes: int, performed_at: str, **changes):
    return {
        "exercise_session_id": session, "exercise_item_id": item,
        "completed": True, "skipped": False, "duration_minutes": minutes,
        "completed_sets": 1, "performed_at": performed_at, **changes,
    }


def aggregate(logs, *, items=ITEMS):
    return aggregate_weekly_exercise(
        logs, SESSIONS, items, {"aligned": "muscle_gain", "other": "endurance"},
        goal_type="muscle_gain", week_start=MONDAY,
    )


def test_weekly_totals_use_finished_logs_and_korean_dates_once():
    first = log("stopped", "sets", 5, "2026-11-15T15:30:00Z")  # Monday 00:30 KST
    totals = aggregate([
        first, first.copy(),
        log("stopped", "timer", 12, "2026-11-16T10:00:00+09:00", completed_sets=0),
        log("finished", "other_timer", 8, "2026-11-18T09:00:00+09:00"),
        log("stopped", "sets", 0, "2026-11-19T09:00:00+09:00"),
        log("stopped", "sets", 9, "2026-11-20T09:00:00+09:00", completed_sets=0),
        log("open", "sets", 6, "2026-11-20T09:00:00+09:00"),
        log("finished", "other_timer", 7, "2026-11-22T15:10:00Z"),  # Next Monday
    ])
    assert totals == WeeklyExerciseTotals(
        completed_minutes=25, completed_days=2, goal_aligned_completed_days=1,
    )


def test_unknown_item_metadata_omits_the_entire_ai_weekly_object():
    totals = aggregate([log("stopped", "sets", 5, "2026-11-16T09:00:00+09:00")], items={})
    assert totals is None
    goal = {"weekly_duration_minutes": 90, "weekly_frequency": 3}
    assert weekly_exercise_score_context(goal, totals, "muscle_gain") == {}
    assert weekly_exercise_score_context(goal, WeeklyExerciseTotals(
        completed_minutes=0, completed_days=0, goal_aligned_completed_days=0,
    ), None) == {}
    assert weekly_exercise_score_context({"weekly_frequency": 3}, WeeklyExerciseTotals(
        completed_minutes=0, completed_days=0, goal_aligned_completed_days=0,
    ), "muscle_gain") == {}
    assert weekly_exercise_score_context(goal, WeeklyExerciseTotals(
        completed_minutes=0, completed_days=0, goal_aligned_completed_days=0,
    ), "weight_loss") == {}


def test_saved_routine_logs_count_minutes_without_recommendation_points():
    sessions = {
        **SESSIONS,
        "custom": {"status": "completed", "exercise_recommendation_id": None,
                   "user_workout_routine_id": "custom-routine",
                   "saved_routine_goal": None},
        "saved": {"status": "stopped", "exercise_recommendation_id": None,
                  "user_workout_routine_id": "saved-recommendation",
                  "saved_routine_goal": "muscle_gain"},
    }
    custom = log("custom", None, 6, "2026-11-17T08:00:00+09:00",
                 saved_routine_session_item_id="custom-item", completed_sets=1)
    saved = log("saved", None, 4, "2026-11-18T08:00:00+09:00",
                saved_routine_session_item_id="saved-item", completed_sets=0)
    totals = aggregate_weekly_exercise(
        [custom, saved], sessions, ITEMS, {"aligned": "muscle_gain"},
        goal_type="muscle_gain", week_start=MONDAY,
        routine_items={
            "custom-item": {"exercise_session_id": "custom",
                            "target_duration_seconds": None},
            "saved-item": {"exercise_session_id": "saved",
                           "target_duration_seconds": 120},
        },
    )
    assert totals == WeeklyExerciseTotals(
        completed_minutes=10, completed_days=2, goal_aligned_completed_days=1,
    )


def test_saved_routine_wrong_item_or_missing_metadata_omits_weekly_object():
    row = log("saved", None, 4, "2026-11-18T08:00:00+09:00",
              saved_routine_session_item_id="saved-item", completed_sets=1)
    sessions = {"saved": {"status": "completed", "exercise_recommendation_id": None,
                          "user_workout_routine_id": "owned-routine"}}
    assert aggregate_weekly_exercise(
        [row], sessions, ITEMS, {}, goal_type="muscle_gain", week_start=MONDAY,
        routine_items={"saved-item": {"exercise_session_id": "another-session",
                                      "target_duration_seconds": None}},
    ) is None


def test_complete_weekly_object_keeps_zero_activity_as_real_zero():
    totals = aggregate([])
    assert weekly_exercise_score_context(
        {"weekly_duration_minutes": 90, "weekly_frequency": 3}, totals, "muscle_gain",
    ) == {"weekly_exercise": {
        "goal_type": "muscle_gain", "target_minutes": 90, "completed_minutes": 0,
        "target_days": 3, "completed_days": 0, "goal_aligned_completed_days": 0,
    }}


def test_fetch_weekly_totals_uses_owner_scoped_original_logs(monkeypatch):
    session_id = "00000000-0000-4000-8000-000000000001"
    item_id = "00000000-0000-4000-8000-000000000002"
    recommendation_id = "00000000-0000-4000-8000-000000000003"
    requests = []

    def handler(request):
        requests.append(request)
        path = request.url.path
        if path.endswith("/exercise_logs"):
            assert request.url.params["user_id"] == "eq.owner"
            assert request.url.params["performed_at"] == "gte.2026-11-15T15:00:00+00:00"
            assert request.url.params["and"] == "(performed_at.lt.2026-11-22T15:00:00+00:00)"
            rows = [{"exercise_session_id": session_id, "exercise_item_id": item_id,
                     "completed": True, "skipped": False, "completed_sets": 1,
                     "duration_minutes": 5, "performed_at": "2026-11-16T09:00:00+09:00"}]
        elif path.endswith("/exercise_sessions"):
            assert request.url.params["user_id"] == "eq.owner"
            rows = [{"exercise_session_id": session_id, "status": "stopped",
                     "exercise_recommendation_id": recommendation_id}]
        elif path.endswith("/exercise_items"):
            assert "user_id" not in request.url.params
            rows = [{"exercise_item_id": item_id, "execution_type": "count_based",
                     "exercise_recommendation_id": recommendation_id}]
        elif path.endswith("/exercise_recommendations"):
            assert request.url.params["user_id"] == "eq.owner"
            rows = [{"exercise_recommendation_id": recommendation_id, "goal": "muscle_gain"}]
        else:
            raise AssertionError(path)
        return httpx.Response(200, json=rows)

    @asynccontextmanager
    async def fake_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(score, "client_scope", fake_scope)
    totals = asyncio.run(score.fetch_weekly_exercise_totals(
        "owner", goal_type="muscle_gain", week_start=MONDAY,
        settings=SimpleNamespace(supabase_url="https://test.supabase.co",
                                 supabase_service_role_key="server-only-test-key"),
    ))
    assert totals == WeeklyExerciseTotals(
        completed_minutes=5, completed_days=1, goal_aligned_completed_days=1,
    )
    assert len(requests) == 4


def test_fetch_weekly_totals_reads_owned_saved_routine_sources(monkeypatch):
    session_id = "00000000-0000-4000-8000-000000000011"
    routine_id = "00000000-0000-4000-8000-000000000012"
    item_id = "00000000-0000-4000-8000-000000000013"
    queried = []

    def handler(request):
        table = request.url.path.rsplit("/", 1)[-1]
        queried.append(table)
        if table == "exercise_logs":
            rows = [{"exercise_session_id": session_id, "exercise_item_id": None,
                     "saved_routine_session_item_id": item_id, "completed": True,
                     "skipped": False, "completed_sets": 1, "duration_minutes": 4,
                     "performed_at": "2026-11-16T09:00:00+09:00"}]
        elif table == "exercise_sessions":
            assert request.url.params["user_id"] == "eq.owner"
            rows = [{"exercise_session_id": session_id, "status": "completed",
                     "exercise_recommendation_id": None,
                     "user_workout_routine_id": routine_id,
                     "saved_routine_goal": None}]
        elif table == "saved_routine_session_items":
            assert request.url.params["user_id"] == "eq.owner"
            rows = [{"saved_routine_session_item_id": item_id,
                     "exercise_session_id": session_id,
                     "target_duration_seconds": None}]
        else:
            raise AssertionError(table)
        return httpx.Response(200, json=rows)

    @asynccontextmanager
    async def fake_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(score, "client_scope", fake_scope)
    totals = asyncio.run(score.fetch_weekly_exercise_totals(
        "owner", goal_type="muscle_gain", week_start=MONDAY,
        settings=SimpleNamespace(supabase_url="https://test.supabase.co",
                                 supabase_service_role_key="server-only-test-key"),
    ))
    assert totals == WeeklyExerciseTotals(
        completed_minutes=4, completed_days=1, goal_aligned_completed_days=0,
    )
    assert queried == ["exercise_logs", "exercise_sessions",
                       "saved_routine_session_items"]


def test_source_query_failure_omits_weekly_exercise(monkeypatch):
    @asynccontextmanager
    async def fake_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda _: httpx.Response(503, json={"message": "unavailable"}),
        )) as client:
            yield client

    monkeypatch.setattr(score, "client_scope", fake_scope)
    totals = asyncio.run(score.fetch_weekly_exercise_totals(
        "owner", goal_type="muscle_gain", week_start=MONDAY,
        settings=SimpleNamespace(supabase_url="https://test.supabase.co",
                                 supabase_service_role_key="server-only-test-key"),
    ))
    assert totals is None
    assert weekly_exercise_score_context(
        {"weekly_duration_minutes": 90, "weekly_frequency": 3}, totals, "muscle_gain",
    ) == {}


def test_health_analysis_input_context_uses_mapped_goal_and_original_records(monkeypatch):
    session_id = "00000000-0000-4000-8000-000000000001"
    item_id = "00000000-0000-4000-8000-000000000002"
    recommendation_id = "00000000-0000-4000-8000-000000000003"
    queried = []

    def handler(request):
        path = request.url.path.rsplit("/", 1)[-1]
        queried.append(path)
        if path != "exercise_items":
            assert request.url.params["user_id"] == "eq.owner"
        if path == "exercise_goals":
            rows = [{"goal_type": "weight_loss", "weekly_frequency": 3,
                     "weekly_duration_minutes": 90, "starts_on": "2026-11-01",
                     "ends_on": None, "status": "active"}]
        elif path == "exercise_logs":
            rows = [{"exercise_session_id": session_id, "exercise_item_id": item_id,
                     "completed": True, "skipped": False, "completed_sets": 1,
                     "duration_minutes": 5, "performed_at": "2026-11-16T09:00:00+09:00"}]
        elif path == "exercise_sessions":
            rows = [{"exercise_session_id": session_id, "status": "stopped",
                     "exercise_recommendation_id": recommendation_id}]
        elif path == "exercise_items":
            rows = [{"exercise_item_id": item_id, "execution_type": "count_based",
                     "exercise_recommendation_id": recommendation_id}]
        elif path == "exercise_recommendations":
            rows = [{"exercise_recommendation_id": recommendation_id, "goal": "weight_loss"}]
        else:
            raise AssertionError(path)
        return httpx.Response(200, json=rows, request=request)

    @asynccontextmanager
    async def fake_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(score, "client_scope", fake_scope)
    context = asyncio.run(score.fetch_weekly_exercise_score_context(
        "owner", SimpleNamespace(supabase_url="https://test.supabase.co",
                                 supabase_service_role_key="server-only-test-key"),
        today=date(2026, 11, 18),
    ))
    assert context == {"weekly_exercise": {
        "goal_type": "body_fat_loss", "target_minutes": 90,
        "completed_minutes": 5, "target_days": 3, "completed_days": 1,
        "goal_aligned_completed_days": 1,
    }}
    assert queried == ["exercise_goals", "exercise_logs", "exercise_sessions",
                       "exercise_items", "exercise_recommendations"]


def test_unmapped_goal_omits_weekly_exercise_without_reading_logs(monkeypatch):
    def handler(request):
        assert request.url.path.endswith("/exercise_goals")
        return httpx.Response(200, json=[{
            "goal_type": "rehabilitation", "weekly_frequency": 3,
            "weekly_duration_minutes": 90, "starts_on": "2026-11-01",
            "ends_on": None, "status": "active",
        }], request=request)

    @asynccontextmanager
    async def fake_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(score, "client_scope", fake_scope)
    assert asyncio.run(score.fetch_weekly_exercise_score_context(
        "owner", SimpleNamespace(supabase_url="https://test.supabase.co",
                                 supabase_service_role_key="server-only-test-key"),
        today=date(2026, 11, 18),
    )) == {}
