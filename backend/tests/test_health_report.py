from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import health_report


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

    monkeypatch.setattr(health_report, "client_scope", mock_client_scope)
    app = FastAPI()
    app.include_router(health_report.create_health_report_router(get_user, get_settings))
    return TestClient(app, headers={"Authorization": "Bearer owner-session"})


def test_health_report_reads_only_verified_users_recent_measurements(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        assert request.headers["apikey"] == "sb_secret_test"
        assert request.url.params["user_id"] == f"eq.{OWNER}"
        if request.url.path.endswith("/profiles"):
            assert request.url.params["select"] == "target_weight"
            return httpx.Response(200, json=[{"target_weight": "68.0"}])
        assert request.url.params["limit"] == "1000"
        assert "raw_data" not in request.url.params["select"]
        if request.url.path.endswith("/body_compositions"):
            assert request.url.params["measured_at"].startswith("gte.")
            return httpx.Response(200, json=[{
                "body_composition_id": "record-1", "measured_at": "2026-10-20T09:00:00Z",
                "weight_kg": "70.5", "skeletal_muscle_mass_kg": "20.7",
                "body_fat_percentage": "25.0", "bmi": "23.0",
            }])
        assert request.url.params["checkup_date"].startswith("gte.")
        return httpx.Response(200, json=[])

    with make_client(monkeypatch, handler) as client:
        result = client.get("/api/health-report", params={"user_id": OTHER})
        assert result.status_code == 200
        assert result.json()["body_compositions"][0]["weight_kg"] == "70.5"
        assert result.json()["health_checkups"] == []
        assert result.json()["target_weight_kg"] == "68.0"
        assert client.get("/api/health-report", headers={"Authorization": ""}).status_code == 401
    assert len(calls) == 3


def test_health_report_upstream_failure_is_sanitized(monkeypatch):
    def handler(request):
        return httpx.Response(500, json={"message": "private SQL details"})

    with make_client(monkeypatch, handler) as client:
        response = client.get("/api/health-report")
        assert response.status_code == 502
        assert response.json() == {"detail": {"code": "HEALTH_REPORT_UNAVAILABLE"}}


def test_months_before_clamps_month_end():
    assert health_report.months_before(health_report.date(2026, 10, 31), 1) == health_report.date(2026, 9, 30)
