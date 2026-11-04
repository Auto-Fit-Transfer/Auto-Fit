from types import SimpleNamespace
from copy import deepcopy

import pytest

from fastapi.testclient import TestClient

from backend.app import main
from backend.app import exercise_analysis_ai
from backend.app.exercise_analysis_ai import analysis_input_hash, build_analysis_input, build_public_analysis


SESSION_RESULT = {
    "session": {
        "status": "completed",
        "completion_rate": "75.00",
        "total_duration_seconds": 1800,
        "total_calories_burned": "0.00",
        "planned_item_count": 4,
        "completed_item_count": 3,
        "skipped_item_count": 1,
        "user_id": "private-user-id",
    },
    "logs": [{
        "exercise_name": "걷기", "completed": True, "skipped": False,
        "duration_minutes": 20, "note": "private log note",
    }],
    "discomfort_logs": [{
        "symptom_type": "pain", "severity": 4, "body_areas": ["무릎"],
        "action_taken": "adjust", "detail": "private discomfort detail",
    }],
    "feedback": {
        "perceived_difficulty": 4,
        "post_condition": "bad",
        "uncomfortable_areas": ["무릎"],
        "note": "무릎이 불편했어요",
    },
}


@pytest.fixture(autouse=True)
def fake_analysis_cache(monkeypatch):
    cache = {}

    async def fetch(_user_id, _session_id, input_hash, _settings):
        return cache.get(input_hash)

    async def save(_user_id, _session_id, input_hash, analysis, _settings):
        cache[input_hash] = analysis

    monkeypatch.setattr(main, "fetch_cached_exercise_analysis", fetch)
    monkeypatch.setattr(main, "save_cached_exercise_analysis", save)
    return cache


def test_analysis_input_uses_recorded_values_and_minimizes_data():
    payload, metrics, feedback = build_analysis_input(SESSION_RESULT)
    assert payload["calories_burned"] is None
    assert payload["feedback"]["note"] == "무릎이 불편했어요"
    assert "user_id" not in str(payload)
    assert "private log note" not in str(payload)
    assert "private discomfort detail" not in str(payload)
    assert payload["discomfort_events"][0]["symptom_type"] == "pain"
    assert metrics == {
        "completion_rate": 75.0, "duration_minutes": 30.0, "calories_burned": 0.0,
    }
    assert feedback["difficulty"] == "어려움"


def test_legacy_feedback_with_null_difficulty_is_rejected_cleanly():
    result = deepcopy(SESSION_RESULT)
    result["feedback"]["perceived_difficulty"] = None
    with pytest.raises(ValueError, match="feedback is invalid"):
        build_analysis_input(result)


def test_feedback_change_invalidates_analysis_cache_key():
    payload, _, _ = build_analysis_input(SESSION_RESULT)
    changed = deepcopy(payload)
    changed["feedback"]["note"] = "운동 후 상태가 좋아졌어요"
    assert analysis_input_hash(payload) != analysis_input_hash(changed)


def test_analysis_version_change_invalidates_cache_key(monkeypatch):
    payload, _, _ = build_analysis_input(SESSION_RESULT)
    original_hash = analysis_input_hash(payload)
    monkeypatch.setattr(exercise_analysis_ai, "ANALYSIS_CACHE_VERSION", "2")
    assert analysis_input_hash(payload) != original_hash


def test_analysis_uses_latest_thirty_discomfort_events():
    result = deepcopy(SESSION_RESULT)
    result["discomfort_logs"] = [
        {**result["discomfort_logs"][0], "body_areas": [f"부위 {index}"]}
        for index in range(31)
    ]
    payload, _, _ = build_analysis_input(result)
    assert len(payload["discomfort_events"]) == 30
    assert payload["discomfort_events"][0]["body_areas"] == ["부위 0"]
    assert payload["discomfort_events"][-1]["body_areas"] == ["부위 29"]


def test_analysis_api_uses_ai_and_preserves_recorded_metrics(monkeypatch):
    calls = []

    async def fake_user():
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_result(user_id, _session_id, _settings):
        assert user_id == "authenticated-user"
        return SESSION_RESULT

    class FakeClient:
        def __init__(self, _config):
            pass

        async def post(self, endpoint, payload):
            calls.append((endpoint, payload))
            return {
                "ok": True,
                "generator": "auto-fit-ai",
                "result": {
                    "summary": "오늘 운동을 마쳤습니다.",
                    "insights": ["무릎 불편이 기록됐습니다."],
                    "next_session_adjustments": ["다음 운동 전에 강도를 다시 확인하세요."],
                    "safety_notice": "불편이 계속되면 운동을 중단하고 전문가와 상담하세요.",
                },
            }

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: SimpleNamespace()
    monkeypatch.setattr(main, "fetch_exercise_session_result", fake_result)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: SimpleNamespace())
    monkeypatch.setattr(main, "AIServerClient", FakeClient)
    try:
        response = TestClient(main.app).get(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/analysis"
        )
        assert response.status_code == 200
        analysis = response.json()["analysis"]
        assert analysis["generator"] == "auto-fit-ai"
        assert analysis["metrics"]["duration_minutes"] == 30.0
        assert calls[0][0] is main.AIEndpoint.EXERCISE_ANALYSIS
        assert "user_id" not in str(calls[0][1])
        second = TestClient(main.app).get(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/analysis"
        )
        assert second.status_code == 200
        assert len(calls) == 1
    finally:
        main.app.dependency_overrides.clear()


def test_analysis_rejects_ai_response_without_safety_notice():
    _, metrics, feedback = build_analysis_input(SESSION_RESULT)
    response = {
        "ok": True, "generator": "auto-fit-ai",
        "result": {
            "summary": "완료했습니다.",
            "insights": ["운동을 완료했습니다."],
            "next_session_adjustments": ["다음 운동을 확인하세요."],
            "safety_notice": None,
        },
    }
    try:
        build_public_analysis(response, metrics, feedback, has_discomfort_event=True)
    except ValueError as exc:
        assert "safety notice" in str(exc)
    else:
        raise AssertionError("Unsafe AI response was accepted")


def test_analysis_api_does_not_fall_back_when_ai_is_disabled(monkeypatch):
    quota_checks = []

    class Quota:
        async def check(self, bucket):
            quota_checks.append(bucket)

    async def fake_user():
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_result(_user_id, _session_id, _settings):
        return SESSION_RESULT

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: SimpleNamespace()
    main.app.dependency_overrides[main.get_exercise_analysis_limiter] = lambda: Quota()
    monkeypatch.setattr(main, "fetch_exercise_session_result", fake_result)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: None)
    try:
        response = TestClient(main.app).get(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/analysis"
        )
        assert response.status_code == 503
        assert response.json()["detail"] == {"code": "AI_DISABLED"}
        assert quota_checks == []
    finally:
        main.app.dependency_overrides.clear()
