from contextlib import asynccontextmanager
from types import SimpleNamespace
import json

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import habit_tier


OWNER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"


def make_client(monkeypatch, handler):
    async def get_user(authorization: str | None = Header(default=None)):
        if authorization != "Bearer owner-session":
            raise HTTPException(401)
        return SimpleNamespace(id=OWNER)

    def get_settings():
        return SimpleNamespace(
            supabase_url="https://test.invalid",
            supabase_service_role_key="sb_secret_test",
        )

    @asynccontextmanager
    async def mock_client_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(habit_tier, "client_scope", mock_client_scope)
    app = FastAPI()
    app.include_router(habit_tier.create_habit_tier_router(get_user, get_settings))
    return TestClient(app, headers={"Authorization": "Bearer owner-session"})


def test_tier_progress_uses_verified_user_only(monkeypatch):
    def handler(request):
        assert request.url.path.endswith("/rpc/user_habit_tier_progress")
        assert request.headers["apikey"] == "sb_secret_test"
        assert "authorization" not in request.headers
        assert json.loads(request.content) == {"p_user_id": OWNER}
        return httpx.Response(200, json={
            "policy_version": 1, "points": 35, "tier_code": "CORE",
            "tier_name": "코어", "sublevel": 2,
            "level_start_points": 30, "next_level_points": 70,
        })

    with make_client(monkeypatch, handler) as client:
        response = client.get("/api/tier/progress", params={"user_id": OTHER})
        assert response.status_code == 200
        assert response.json()["progress"]["points"] == 35
        assert client.get("/api/tier/progress", headers={"Authorization": ""}).status_code == 401


def test_tier_progress_sanitizes_upstream_error(monkeypatch):
    def handler(request):
        return httpx.Response(500, json={"message": "private database detail"})

    with make_client(monkeypatch, handler) as client:
        response = client.get("/api/tier/progress")
        assert response.status_code == 502
        assert response.json() == {"detail": {"code": "HABIT_TIER_UNAVAILABLE"}}


def test_award_meal_uses_owned_record_and_ignores_client_identity(monkeypatch):
    source = "00000000-0000-4000-8000-000000000011"

    def handler(request):
        path = request.url.path
        if path.endswith("/meal_logs"):
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            assert request.url.params["meal_log_id"] == f"eq.{source}"
            return httpx.Response(200, json=[{
                "meal_log_id": source, "status": "recorded",
                "created_at": "2026-10-29T01:00:00Z",
            }])
        if path.endswith("/tier_habit_policy_versions"):
            return httpx.Response(200, json=[{
                "tier_habit_policy_version_id": "policy", "published_at": "2026-10-29T00:00:00Z",
            }])
        if path.endswith("/tier_habit_point_rules"):
            assert request.url.params["event_code"] == "eq.meal_log"
            return httpx.Response(200, json=[{"tier_habit_point_rule_id": "rule"}])
        assert path.endswith("/user_tier_points")
        assert request.url.params["on_conflict"] == "user_id,event_code,source_key"
        assert json.loads(request.content) == {
            "user_id": OWNER, "tier_habit_point_rule_id": "rule",
            "event_code": "meal_log", "source_key": f"meal_log:{source}",
            "occurred_at": "2026-10-29T01:00:00Z",
        }
        return httpx.Response(201, json=[{"user_tier_point_id": "point", "points": 2}])

    with make_client(monkeypatch, handler) as client:
        result = client.post(f"/api/tier/points/meal_log/{source}", json={"user_id": OTHER, "points": 999})
        assert result.status_code == 200
        assert result.json() == {"awarded": True, "reason": "awarded"}


def test_award_rejects_foreign_incomplete_and_unrecommended_source(monkeypatch):
    source = "00000000-0000-4000-8000-000000000011"

    def foreign(request):
        assert request.url.params["user_id"] == f"eq.{OWNER}"
        return httpx.Response(200, json=[])

    with make_client(monkeypatch, foreign) as client:
        assert client.post(f"/api/tier/points/meal_log/{source}").status_code == 404

    def incomplete(request):
        return httpx.Response(200, json=[{
            "exercise_session_id": source, "status": "completed",
            "completed_at": "2026-10-29T01:00:00Z", "exercise_recommendation_id": None,
        }])

    with make_client(monkeypatch, incomplete) as client:
        assert client.post(f"/api/tier/points/recommended_workout_completed/{source}").status_code == 409
        assert client.post(f"/api/tier/points/challenge_completed/{source}").status_code == 404


def test_award_duplicate_and_period_cap_are_nonfatal(monkeypatch):
    source = "00000000-0000-4000-8000-000000000011"

    def handler(request):
        if request.url.path.endswith("/meal_logs"):
            return httpx.Response(200, json=[{
                "meal_log_id": source, "status": "recorded",
                "created_at": "2026-10-29T01:00:00Z",
            }])
        if request.url.path.endswith("/tier_habit_policy_versions"):
            return httpx.Response(200, json=[{"tier_habit_policy_version_id": "policy"}])
        if request.url.path.endswith("/tier_habit_point_rules"):
            return httpx.Response(200, json=[{"tier_habit_point_rule_id": "rule"}])
        return httpx.Response(201, json=[])

    with make_client(monkeypatch, handler) as client:
        assert client.post(f"/api/tier/points/meal_log/{source}").json() == {
            "awarded": False, "reason": "already_awarded",
        }

    def capped(request):
        if request.url.path.endswith("/user_tier_points"):
            return httpx.Response(400, json={"code": "23514", "message": "Tier point period limit reached"})
        return handler(request)

    with make_client(monkeypatch, capped) as client:
        assert client.post(f"/api/tier/points/meal_log/{source}").json() == {
            "awarded": False, "reason": "period_limit",
        }


def test_health_data_award_requires_owned_confirmed_document(monkeypatch):
    source = "00000000-0000-4000-8000-000000000011"
    file_id = "00000000-0000-4000-8000-000000000012"

    def handler(request):
        path = request.url.path
        if path.endswith("/health_checkups"):
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            return httpx.Response(200, json=[])
        if path.endswith("/body_compositions"):
            return httpx.Response(200, json=[{
                "body_composition_id": source, "uploaded_file_id": file_id,
                "created_at": "2026-10-29T01:00:00Z",
            }])
        if path.endswith("/upload_files"):
            assert request.url.params["uploaded_file_id"] == f"eq.{file_id}"
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            return httpx.Response(200, json=[{"processing_status": "manually_confirmed"}])
        if path.endswith("/tier_habit_policy_versions"):
            return httpx.Response(200, json=[{"tier_habit_policy_version_id": "policy"}])
        if path.endswith("/tier_habit_point_rules"):
            return httpx.Response(200, json=[{"tier_habit_point_rule_id": "rule"}])
        assert path.endswith("/user_tier_points")
        assert json.loads(request.content)["source_key"] == f"health_data_uploaded:{source}"
        return httpx.Response(201, json=[{"points": 15}])

    with make_client(monkeypatch, handler) as client:
        assert client.post(f"/api/tier/points/health_data_uploaded/{source}").json()["awarded"] is True

    def unconfirmed(request):
        if request.url.path.endswith("/upload_files"):
            return httpx.Response(200, json=[{"processing_status": "awaiting_review"}])
        return handler(request)

    with make_client(monkeypatch, unconfirmed) as client:
        assert client.post(f"/api/tier/points/health_data_uploaded/{source}").status_code == 409
