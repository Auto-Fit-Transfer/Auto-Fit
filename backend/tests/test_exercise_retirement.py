"""Retiring rules must never expand paid AI access or hide historical workouts."""

import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.tests.test_exercise_ai import CONTEXT, PREFERENCES


USER = "10000000-0000-4000-8000-000000000001"
OTHER = "10000000-0000-4000-8000-000000000002"
SESSION = "00000000-0000-0000-0000-000000000003"


@pytest.fixture
def client(monkeypatch):
    async def fake_user():
        return main.AuthenticatedUser(id=USER)

    async def profile(user_id, _settings):
        assert user_id == USER
        return {}

    async def preferences(user_id, _settings):
        assert user_id == USER
        return PREFERENCES

    async def context(user_id, _settings):
        assert user_id == USER
        return {"exercise_recommendation_context_id": "context-123", **CONTEXT}

    async def forbidden_write(*_args):
        pytest.fail("A blocked/failed request must not store any recommendation")

    async def session_result(user_id, session_id, _settings):
        assert user_id == USER and session_id == SESSION
        return {"session": {"status": "completed"}, "feedback": None}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: main.Settings(
        supabase_url="https://example.supabase.co", supabase_publishable_key="test",
        supabase_service_role_key="test", frontend_origin="http://localhost:3000",
    )
    monkeypatch.setattr(main, "fetch_profile", profile)
    monkeypatch.setattr(main, "fetch_exercise_preferences", preferences)
    monkeypatch.setattr(main, "fetch_latest_unlinked_exercise_context", context)
    monkeypatch.setattr(main, "create_exercise_recommendation", forbidden_write)
    monkeypatch.setattr(main, "fetch_exercise_session_result", session_result)
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


@pytest.mark.parametrize("enabled,allowlist", [
    ("false", None), ("true", ""), ("true", "invalid-uuid"),
    ("false", OTHER), ("true", OTHER),
])
@pytest.mark.parametrize("path,method", [
    ("/api/exercise/recommendations/generate", "post"),
    (f"/api/exercise/sessions/{SESSION}/analysis", "get"),
])
def test_outside_pilot_gets_no_rules_or_ai(client, monkeypatch, enabled, allowlist, path, method):
    monkeypatch.setenv("EXERCISE_AI_ENABLED", enabled)
    if allowlist is None:
        monkeypatch.delenv("EXERCISE_AI_TEST_USER_IDS", raising=False)
    else:
        monkeypatch.setenv("EXERCISE_AI_TEST_USER_IDS", allowlist)

    def forbidden_ai():
        pytest.fail("A blocked account must not contact or configure the AI service")

    monkeypatch.setattr(main, "get_ai_server_config", forbidden_ai)
    response = client.post(path, json={}) if method == "post" else client.get(path)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "EXERCISE_AI_NOT_ENABLED"
    assert "테스트 계정" in response.json()["detail"]["message"]


@pytest.mark.parametrize("error_code,expected_status", [
    ("AI_TIMEOUT", 503), ("AI_UNAVAILABLE", 503), ("AI_INVALID_RESPONSE", 502),
])
def test_ai_failure_does_not_fall_back_to_rules(client, monkeypatch, error_code, expected_status):
    monkeypatch.setenv("EXERCISE_AI_ENABLED", "false")
    monkeypatch.setenv("EXERCISE_AI_TEST_USER_IDS", USER)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: object())

    class FailingAI:
        async def post(self, *_args):
            raise main.AIServerError(error_code)

    monkeypatch.setattr(main, "AIServerClient", lambda _config: FailingAI())
    response = client.post("/api/exercise/recommendations/generate", json={})
    assert response.status_code == expected_status
    assert response.json()["detail"]["code"] == error_code


def test_disabled_ai_does_not_fall_back_to_rules(client, monkeypatch):
    monkeypatch.setenv("EXERCISE_AI_ENABLED", "false")
    monkeypatch.setenv("EXERCISE_AI_TEST_USER_IDS", USER)
    monkeypatch.setattr(main, "get_ai_server_config", lambda: None)
    response = client.post("/api/exercise/recommendations/generate", json={})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "AI_DISABLED"


def test_unsupported_recommendation_cannot_start(client, monkeypatch):
    async def latest(user_id, _settings):
        assert user_id == USER
        return {"recommendation": {"exercise_recommendation_id": SESSION,
                "generator": "rules_v1", "status": "active"}, "items": []}

    async def forbidden_start(*_args):
        pytest.fail("Unsupported recommendation must never start a session")

    monkeypatch.setattr(main, "fetch_latest_exercise_recommendation", latest)
    monkeypatch.setattr(main, "call_exercise_session_rpc", forbidden_start)
    response = client.post("/api/exercise/sessions/start", json={})
    assert response.status_code == 409


def test_historical_sessions_remain_readable_outside_pilot(client, monkeypatch):
    monkeypatch.setenv("EXERCISE_AI_ENABLED", "false")
    monkeypatch.setenv("EXERCISE_AI_TEST_USER_IDS", "")

    async def latest(user_id, _settings):
        assert user_id == USER
        return {"session": {"exercise_session_id": SESSION, "status": "completed",
                "plan_session_id": None}, "logs": [{"exercise_name": "과거 운동"}]}

    monkeypatch.setattr(main, "fetch_latest_exercise_session", latest)
    response = client.get("/api/exercise/sessions/latest")
    assert response.status_code == 200
    assert response.json()["result"]["session"]["status"] == "completed"
    assert response.json()["result"]["logs"][0]["exercise_name"] == "과거 운동"
