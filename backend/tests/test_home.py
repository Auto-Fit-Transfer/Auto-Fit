import asyncio
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.chat_health_scores import Assessment
from backend.app.home import build_home_response


SETTINGS = main.Settings(
    supabase_url="https://example.supabase.co",
    supabase_publishable_key="sb_publishable_test",
    supabase_service_role_key="sb_secret_test",
    frontend_origin="http://localhost:3000",
)


@pytest.fixture
def settings_override():
    main.app.dependency_overrides[main.get_settings] = lambda: SETTINGS
    yield
    main.app.dependency_overrides.pop(main.get_settings, None)


@pytest.mark.parametrize("scores,expected", [([], None), ([86], None), ([86, 81], 5), ([81, 86], -5), ([86, 86], 0)])
def test_missing_and_previous_assessment_values(scores, expected):
    rows = [Assessment(overall_score=score, assessed_at=datetime(2026, 9, 17 - i, tzinfo=UTC))
            for i, score in enumerate(scores)]
    result = build_home_response({"name": "  "}, rows)
    assert result.user_name == "회원"
    assert result.health_score.score == (scores[0] if scores else None)
    assert result.score_change.change == expected
    assert result.score_change.comparison == "previous_assessment"
    assert result.score_change.previous_score == (scores[1] if len(scores) > 1 else None)


def test_home_authenticates_once_and_parallel_reads_share_client(monkeypatch, settings_override):
    original = httpx.AsyncClient
    clients, calls = [], []
    reads_started = asyncio.Event()
    read_count = 0

    async def handler(request):
        nonlocal read_count
        calls.append(request)
        if request.url.path == "/auth/v1/user":
            assert request.headers["apikey"] == SETTINGS.supabase_publishable_key
            return httpx.Response(200, json={"id": request.headers["authorization"].split()[-1]})
        assert request.method == "GET"  # No chat quota RPC or writes.
        assert request.headers["apikey"] == SETTINGS.supabase_service_role_key
        assert "authorization" not in request.headers
        owner = request.url.params["user_id"]
        assert owner in {"eq.owner-a", "eq.owner-b"}
        read_count += 1
        if read_count % 2 == 0:
            reads_started.set()
        await asyncio.wait_for(reads_started.wait(), timeout=1)
        if request.url.path == "/rest/v1/profiles":
            return httpx.Response(200, json=[{"name": owner}])
        assert request.url.path == "/rest/v1/health_assessments"
        assert request.url.params["limit"] == "2"
        return httpx.Response(200, json=[
            {"overall_score": 86, "assessed_at": "2026-09-17T00:00:00Z"},
            {"overall_score": 81, "assessed_at": "2026-09-10T00:00:00Z"},
        ])

    def create_client(**kwargs):
        assert kwargs["trust_env"] is False
        client = original(transport=httpx.MockTransport(handler), **kwargs)
        clients.append(client)
        return client

    monkeypatch.setattr(main.httpx, "AsyncClient", create_client)
    with TestClient(main.app) as client:
        for owner in ("owner-a", "owner-b"):
            reads_started.clear()
            response = client.get("/api/home", headers={"Authorization": f"Bearer {owner}"})
            assert response.status_code == 200
            assert response.headers["cache-control"] == "no-store"
            assert response.json()["user_name"] == f"eq.{owner}"
            assert response.json()["health_score"]["score"] == 86
            assert response.json()["score_change"]["change"] == 5
        assert len(clients) == 1
        assert not clients[0].is_closed
    assert clients[0].is_closed
    assert len(calls) == 6
    assert sum(r.url.path == "/auth/v1/user" for r in calls) == 2


@pytest.mark.parametrize("authorization", [None, "Bearer expired"])
def test_home_rejects_missing_or_expired_token(monkeypatch, settings_override, authorization):
    original = httpx.AsyncClient
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url.path == "/auth/v1/user"
        return httpx.Response(401, json={"message": "expired"})

    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    with TestClient(main.app) as client:
        response = client.get("/api/home", headers={"Authorization": authorization} if authorization else {})
    assert response.status_code == 401
    assert len(calls) == (1 if authorization else 0)


def test_home_does_not_mask_upstream_failure_as_missing_data(monkeypatch, settings_override):
    original = httpx.AsyncClient

    def handler(request):
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": "owner"})
        if request.url.path == "/rest/v1/profiles":
            return httpx.Response(200, json=[{"name": "회원"}])
        return httpx.Response(503, json={"message": "unavailable"})

    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    with TestClient(main.app) as client:
        response = client.get("/api/home", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 502
