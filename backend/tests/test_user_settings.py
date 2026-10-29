import json
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import user_settings


OWNER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
GOAL_ID = "00000000-0000-4000-8000-000000000011"


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

    monkeypatch.setattr(user_settings, "client_scope", mock_client_scope)
    app = FastAPI()
    app.include_router(user_settings.create_user_settings_router(get_user, get_settings))
    return TestClient(app, headers={"Authorization": "Bearer owner-session"})


def test_preferences_default_and_owner_upsert(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        assert request.headers["apikey"] == "sb_secret_test"
        assert "authorization" not in request.headers
        if request.method == "GET":
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            return httpx.Response(200, json=[])
        assert request.url.params["on_conflict"] == "user_id"
        assert "resolution=merge-duplicates" in request.headers["prefer"]
        body = json.loads(request.content)
        assert body == {
            "user_id": OWNER,
            "theme_mode": "light",
            "font_size_step": 4,
            "simple_mode_enabled": True,
        }
        return httpx.Response(201, json=[body])

    with make_client(monkeypatch, handler) as client:
        response = client.get("/api/app/preferences")
        assert response.json() == {"preferences": {
            "theme_mode": "system", "font_size_step": 3, "simple_mode_enabled": False,
        }}
        response = client.put("/api/app/preferences", json={
            "theme_mode": "light", "font_size_step": 4,
            "simple_mode_enabled": True,
        })
        assert response.status_code == 200
        assert response.json()["preferences"]["font_size_step"] == 4
        assert client.put("/api/app/preferences", json={"user_id": OTHER}).status_code == 422
    assert len(calls) == 2


def test_notification_preferences_are_owner_scoped_and_validate_quiet_hours(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        assert request.headers["apikey"] == "sb_secret_test"
        if request.method == "GET":
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            return httpx.Response(200, json=[])
        assert request.url.params["on_conflict"] == "user_id"
        assert "resolution=merge-duplicates" in request.headers["prefer"]
        body = json.loads(request.content)
        assert body["user_id"] == OWNER
        assert body["quiet_hours_start"] == "23:00"
        assert body["quiet_hours_end"] == "07:00"
        assert body["community_enabled"] is True
        return httpx.Response(201, json=[body])

    with make_client(monkeypatch, handler) as client:
        default = client.get("/api/notifications/preferences")
        assert default.status_code == 200
        assert default.json()["preferences"]["community_enabled"] is False
        saved = client.put("/api/notifications/preferences", json={
            "community_enabled": True,
            "quiet_hours_enabled": True,
            "quiet_hours_start": "23:00", "quiet_hours_end": "07:00",
        })
        assert saved.status_code == 200
        assert saved.json()["preferences"]["community_enabled"] is True
        assert client.put("/api/notifications/preferences", json={
            "quiet_hours_enabled": True, "quiet_hours_start": "23:00", "quiet_hours_end": "23:00",
        }).status_code == 422
        assert client.put("/api/notifications/preferences", json={"user_id": OTHER}).status_code == 422
    assert len(calls) == 2


def test_health_goal_owner_scope_and_other_validation(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        if request.method == "GET":
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            assert request.url.params["status"] == "eq.active"
            return httpx.Response(200, json=[])
        if request.method == "PATCH":
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            assert request.url.params["status"] == "eq.active"
            assert json.loads(request.content) == {
                "goal_type": "other", "goal_text": "등산 준비",
            }
            return httpx.Response(200, json=[])
        body = json.loads(request.content)
        assert body == {
            "user_id": OWNER, "status": "active",
            "goal_type": "other", "goal_text": "등산 준비",
        }
        return httpx.Response(201, json=[{
            "user_health_goal_id": GOAL_ID, "goal_type": "other",
            "goal_text": "등산 준비", "target_date": None,
            "updated_at": "2026-10-29T00:00:00Z",
        }])

    with make_client(monkeypatch, handler) as client:
        assert client.get("/api/health/goals/active").json() == {"goal": None}
        assert client.put("/api/health/goals/active", json={
            "goal_type": "other", "goal_text": "  등산 준비  ",
        }).json()["goal"]["goal_text"] == "등산 준비"
        assert client.put("/api/health/goals/active", json={
            "goal_type": "other", "goal_text": "  ",
        }).status_code == 422
        assert client.put("/api/health/goals/active", json={
            "user_id": OTHER, "goal_type": "fitness",
        }).status_code == 422
    assert len(calls) == 3


def test_settings_upstream_error_is_sanitized(monkeypatch):
    def handler(request):
        return httpx.Response(500, json={"message": "private database detail"})

    with make_client(monkeypatch, handler) as client:
        response = client.get("/api/app/preferences")
        assert response.status_code == 502
        assert response.json() == {"detail": {"code": "USER_SETTINGS_UNAVAILABLE"}}


def test_health_goal_updates_existing_active_row_without_creating_another(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request.method)
        assert request.method == "PATCH"
        assert request.url.params["user_id"] == f"eq.{OWNER}"
        assert request.url.params["status"] == "eq.active"
        assert json.loads(request.content) == {
            "goal_type": "fitness", "goal_text": None,
        }
        return httpx.Response(200, json=[{
            "user_health_goal_id": GOAL_ID, "goal_type": "fitness",
            "goal_text": None, "target_date": None,
            "updated_at": "2026-10-29T00:00:00Z",
        }])

    with make_client(monkeypatch, handler) as client:
        response = client.put("/api/health/goals/active", json={"goal_type": "fitness"})
        assert response.status_code == 200
        assert response.json()["goal"]["goal_type"] == "fitness"
    assert calls == ["PATCH"]
