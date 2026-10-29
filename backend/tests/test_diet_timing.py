import asyncio
import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import diet_timing, main


SETTINGS = main.Settings("https://example.supabase.co", "publishable-private", "service-private", "http://localhost:3000")


@pytest.fixture
def diet_client(monkeypatch):
    original = httpx.AsyncClient
    created = []

    def handler(request):
        path = request.url.path
        rows = {
            "/auth/v1/user": {"id": "private-user", "email": "private@example.com"},
            "/rest/v1/diet_recommendations": [{"diet_recommendation_id": "private-rec"}],
            "/rest/v1/diet_meals": [{"diet_meal_id": "private-meal", "menu_image_key": "private-key"}],
            "/rest/v1/diet_meal_foods": [],
            "/rest/v1/diet_feedback": [],
            "/rest/v1/user_food_inventory": [],
            "/rest/v1/menu_images": [],
            "/rest/v1/meal_logs": [{"meal_log_id": "private-log", "photo_storage_path": "private-user/photo.png"}],
            "/rest/v1/meal_log_items": [],
            "/storage/v1/object/sign/meal-photos/private-user/photo.png": {"signedURL": "/signed/private?token=private"},
        }
        assert path in rows
        return httpx.Response(200, json=rows[path])

    def create_client(**kwargs):
        client = original(transport=httpx.MockTransport(handler), **kwargs)
        created.append(client)
        return client
    monkeypatch.setattr(main.httpx, "AsyncClient", create_client)
    monkeypatch.setenv("DIET_TIMING_ENABLED", "true")
    main.app.dependency_overrides[main.get_settings] = lambda: SETTINGS
    try:
        with TestClient(main.app) as client:
            client.created_http_clients = created
            yield client
    finally:
        main.app.dependency_overrides.pop(main.get_settings, None)


def timing_records(caplog):
    return [json.loads(record.message.removeprefix("[diet-timing] "))
            for record in caplog.records if record.message.startswith("[diet-timing] ")]


@pytest.mark.parametrize("route,expected", [
    ("/api/diet/recommendations?date=2026-09-16", {"auth", "recommendation", "meals", "foods", "menu_images", "feedback", "inventory_usage"}),
    ("/api/diet/meal-logs?from_date=2026-09-16&to_date=2026-09-16", {"auth", "meal_logs", "meal_log_items", "meal_photos"}),
    ("/api/diet/nutrition-summary?date=2026-09-16", {"auth", "recommendation", "meal_logs", "meal_log_items"}),
])
def test_real_diet_routes_log_stages_without_sensitive_data(diet_client, caplog, route, expected):
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    response = diet_client.get(route + "&private=secret-query", headers={"Authorization": "Bearer secret-token", "X-Request-ID": "untrusted-private"})
    assert response.status_code == 200
    assert len(diet_client.created_http_clients) == 1
    assert not diet_client.created_http_clients[0].is_closed
    records = timing_records(caplog)
    assert len(records) == 1
    record = records[0]
    assert record["trace_id"] == response.headers["x-diet-trace-id"]
    assert len(record["trace_id"]) == 32
    assert record["route"] == route.split("?")[0]
    assert record["status"] == 200
    assert set(record["stages"]) == expected
    assert all(stage["calls"] == 1 and stage["ms"] >= 0 for stage in record["stages"].values())
    assert record["total_ms"] >= max(stage["ms"] for stage in record["stages"].values()) - 0.1
    assert all(secret not in json.dumps(record) for secret in ("private", "secret", "2026-09-16", "Bearer", "example.com"))
    assert diet_timing._stages.get() is None


def test_unauthorized_request_is_logged_without_token(diet_client, caplog):
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    response = diet_client.get("/api/diet/recommendations?date=2026-09-16")
    assert response.status_code == 401
    record = timing_records(caplog)[0]
    assert record["status"] == 401
    assert record["stages"] == {}


def test_disabled_and_non_diet_requests_are_not_traced(diet_client, caplog, monkeypatch):
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    assert "x-diet-trace-id" not in diet_client.get("/health").headers
    monkeypatch.setenv("DIET_TIMING_ENABLED", "false")
    response = diet_client.get("/api/diet/recommendations?date=2026-09-16", headers={"Authorization": "Bearer secret-token"})
    assert response.status_code == 200
    assert "x-diet-trace-id" not in response.headers
    assert timing_records(caplog) == []


def test_concurrent_requests_keep_stages_separate(caplog, monkeypatch):
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    monkeypatch.setenv("DIET_TIMING_ENABLED", "true")

    async def app(scope, receive, send):
        async with diet_timing.timed_http_client(scope["stage"], client=object()):
            await asyncio.sleep(0)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    async def run():
        middleware = diet_timing.DietTimingMiddleware(app)
        async def send(message):
            pass
        await asyncio.gather(*(middleware({"type": "http", "method": "GET", "path": "/api/diet/recommendations", "stage": stage}, None, send) for stage in ("first", "second")))
        assert diet_timing._stages.get() is None

    asyncio.run(run())
    records = timing_records(caplog)
    assert {tuple(record["stages"]) for record in records} == {("first",), ("second",)}
    assert len({record["trace_id"] for record in records}) == 2


def test_failed_scope_records_elapsed_time_and_preserves_exception(monkeypatch):
    stages = {}
    token = diet_timing._stages.set(stages)
    try:
        ticks = iter([1.0, 1.125])
        monkeypatch.setattr(diet_timing, "perf_counter", lambda: next(ticks))
        async def run():
            async with diet_timing.timed_http_client("auth", client=object()):
                raise httpx.ReadTimeout("private-token")
        with pytest.raises(httpx.ReadTimeout):
            asyncio.run(run())
        assert stages == {"auth": {"calls": 1, "ms": 125.0}}
    finally:
        diet_timing._stages.reset(token)
