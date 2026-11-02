import base64
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import community_mileage


OWNER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
ENTRY_IDS = [f"00000000-0000-4000-8000-{n:012d}" for n in range(1, 4)]
TIMES = [f"2026-10-28T10:00:0{n}+09:00" for n in range(3, 0, -1)]


def make_client(monkeypatch, handler):
    async def get_user(authorization: str | None = Header(default=None)):
        if authorization != "Bearer owner-session":
            raise HTTPException(401)
        return SimpleNamespace(id=OWNER)

    def get_settings():
        return SimpleNamespace(supabase_url="https://test.invalid", supabase_service_role_key="sb_secret_test")

    @asynccontextmanager
    async def mock_client_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(community_mileage, "client_scope", mock_client_scope)
    app = FastAPI()
    app.include_router(community_mileage.create_community_mileage_router(get_user, get_settings))
    return TestClient(app, headers={"Authorization": "Bearer owner-session"})


def test_my_mileage_uses_verified_user_and_paginates(monkeypatch):
    calls = []
    history = [
        {"entry_id": entry_id, "amount": 10, "reason": "workout", "created_at": timestamp}
        for entry_id, timestamp in zip(ENTRY_IDS, TIMES)
    ]

    def handler(request):
        assert request.headers["apikey"] == "sb_secret_test"
        assert "authorization" not in request.headers
        body = json.loads(request.content)
        calls.append((request.url.path, body))
        assert body["p_user_id"] == OWNER
        if request.url.path.endswith("community_sync_mileage"):
            return httpx.Response(200, json={"balance": 30, "earned_today": 30, "rules": []})
        assert body["p_limit"] == 3
        return httpx.Response(200, json=history)

    with make_client(monkeypatch, handler) as client:
        response = client.get(f"/api/community/mileage?user_id={OTHER}")
        assert response.status_code == 200, response.text
        assert response.json()["balance"] == 30
        response = client.get("/api/community/mileage/history?limit=2")
        assert response.status_code == 200, response.text
        result = response.json()
        assert len(result["items"]) == 2
        assert community_mileage.decode_cursor(result["next_cursor"]) == (
            community_mileage.datetime.fromisoformat(TIMES[1]), community_mileage.UUID(ENTRY_IDS[1]),
        )
        assert calls[1][1]["p_before_created_at"] is None
        assert calls[1][1]["p_before_id"] is None

        response = client.get("/api/community/mileage/history", params={"limit": 2, "cursor": result["next_cursor"]})
        assert response.status_code == 200, response.text
        assert calls[2][1]["p_before_created_at"] == TIMES[1]
        assert calls[2][1]["p_before_id"] == ENTRY_IDS[1]


def test_mileage_requires_auth_and_valid_cursor(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"balance": 0, "earned_today": 0, "rules": []})

    with make_client(monkeypatch, handler) as client:
        assert client.get("/api/community/mileage", headers={"Authorization": ""}).status_code == 401
        assert client.get("/api/community/mileage/history?cursor=bad").status_code == 422
        assert client.get("/api/community/mileage/history?limit=51").status_code == 422
        wrong_scope = base64.urlsafe_b64encode(json.dumps(['feed', TIMES[0], ENTRY_IDS[0]]).encode()).decode()
        assert client.get("/api/community/mileage/history", params={"cursor": wrong_scope}).status_code == 422
    assert calls == []


def test_mileage_upstream_failure_is_not_exposed(monkeypatch):
    def handler(request):
        return httpx.Response(500, json={"message": "internal database details"})

    with make_client(monkeypatch, handler) as client:
        response = client.get("/api/community/mileage")
        assert response.status_code == 502
        assert response.json() == {"detail": {"code": "COMMUNITY_MILEAGE_UNAVAILABLE"}}
