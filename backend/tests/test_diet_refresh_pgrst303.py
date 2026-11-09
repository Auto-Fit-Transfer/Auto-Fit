import asyncio
from collections import Counter
from contextlib import asynccontextmanager

import httpx
import pytest

from backend.app import diet_refresh, main
from backend.app.http_client import retry_pgrst303_scope


def _settings() -> main.Settings:
    return main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_service_role_key="sb_secret_test",
        frontend_origin="http://localhost:3000",
    )


def _use_client(monkeypatch, client: httpx.AsyncClient) -> None:
    @asynccontextmanager
    async def scope():
        yield client

    monkeypatch.setattr(diet_refresh, "get_settings", _settings)
    monkeypatch.setattr(diet_refresh, "client_scope", scope)
    monkeypatch.setattr(main, "client_scope", scope)


def test_startup_reads_retry_without_repeating_paid_work(monkeypatch, caplog) -> None:
    counts: Counter[str] = Counter()
    work: Counter[str] = Counter()
    paths = {
        "/rest/v1/profiles",
        "/rest/v1/diet_recommendations",
        "/rest/v1/allergy_types",
        "/rest/v1/food_items",
    }

    def respond(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        assert path in paths
        assert request.headers["apikey"] == "sb_secret_test"
        assert "authorization" not in request.headers
        counts[path] += 1
        if counts[path] == 1:
            return httpx.Response(
                401,
                json={"code": "PGRST303", "message": "JWT issued at future"},
                request=request,
            )
        rows = [{"user_id": "one"}] if path == "/rest/v1/profiles" else []
        return httpx.Response(200, json=rows, request=request)

    async def empty(*args, **kwargs):
        return []

    async def build(*args, **kwargs):
        work["plan"] += 1
        return {"meals": [], "recommendation": {}}

    async def assign(*args, **kwargs):
        work["assign"] += 1

    async def generate(*args, **kwargs):
        work["generate"] += 1

    async def create(*args, **kwargs):
        work["create"] += 1

    monkeypatch.setattr(diet_refresh, "fetch_food_inventory", empty)
    monkeypatch.setattr(diet_refresh, "fetch_user_allergies", empty)
    monkeypatch.setattr(diet_refresh, "build_daily_diet_recommendation_plan", build)
    monkeypatch.setattr(diet_refresh, "assign_menu_images", assign)
    monkeypatch.setattr(diet_refresh, "generate_missing_menu_images", generate)
    monkeypatch.setattr(diet_refresh, "create_diet_recommendation", create)

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    _use_client(monkeypatch, client)
    try:
        assert asyncio.run(diet_refresh.refresh_daily_diets()) == (1, 0)
    finally:
        asyncio.run(client.aclose())
    assert counts == Counter({path: 2 for path in paths})
    assert work == Counter({"plan": 1, "assign": 1, "generate": 1, "create": 1})
    assert "reason=jwt_issued_at_future" in caplog.text
    assert "sb_secret_test" not in caplog.text


@pytest.mark.parametrize(
    ("error_code", "expected_calls"),
    [("PGRST303", 3), ("OTHER401", 1)],
)
def test_profile_auth_failure_stays_failed_after_bounded_retry(
    monkeypatch, error_code: str, expected_calls: int
) -> None:
    calls = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            401,
            json={"code": error_code, "message": "auth rejected"},
            request=request,
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    _use_client(monkeypatch, client)

    async def run():
        async with retry_pgrst303_scope():
            await diet_refresh.fetch_refresh_user_ids()

    try:
        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(run())
    finally:
        asyncio.run(client.aclose())
    assert calls == expected_calls


def test_profile_read_outside_startup_scope_does_not_retry(monkeypatch) -> None:
    calls = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            401,
            json={"code": "PGRST303", "message": "JWT issued at future"},
            request=request,
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    _use_client(monkeypatch, client)
    try:
        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(diet_refresh.fetch_refresh_user_ids())
    finally:
        asyncio.run(client.aclose())
    assert calls == 1
