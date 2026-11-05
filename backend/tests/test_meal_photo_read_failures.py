"""Photo failures must not hide recorded meals or break nutrition totals."""
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.tests.test_main import TEST_SETTINGS


@pytest.mark.parametrize("failure", ["absent", 400, 403, 500, "timeout", "invalid_json", "missing_url"])
def test_photo_failure_isolated_from_meals_and_summary(monkeypatch, caplog, failure):
    original = httpx.AsyncClient
    signed = []
    private_path = "private-owner/private-photo.png"

    def handler(request):
        path = request.url.path
        if path.endswith("/meal_logs"):
            return httpx.Response(200, json=[
                {"meal_log_id": "first", "photo_storage_path": None if failure == "absent" else private_path},
                {"meal_log_id": "second", "photo_storage_path": "private-owner/valid.png"},
            ])
        if path.endswith("/meal_log_items"):
            return httpx.Response(200, json=[
                {"meal_log_id": "first", "calories": 150, "carbohydrates": 30, "protein": 3, "fat": 2},
                {"meal_log_id": "second", "calories": 100, "carbohydrates": 10, "protein": 5, "fat": 1},
            ])
        if path.endswith("/diet_recommendations"):
            return httpx.Response(200, json=[])
        if "/object/sign/" in path:
            signed.append(path)
            if path.endswith("valid.png"):
                return httpx.Response(200, json={"signedURL": "/object/sign/meal-photos/valid.png?token=private-token"})
            if failure == "timeout":
                raise httpx.ReadTimeout("private-transport-error", request=request)
            if failure == "invalid_json":
                return httpx.Response(200, text="private-invalid-response")
            if failure == "missing_url":
                return httpx.Response(200, json={})
            return httpx.Response(failure, json={"message": "private-upstream-error"})
        raise AssertionError(path)

    async def user():
        return main.AuthenticatedUser(id="private-owner")

    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    previous = dict(main.app.dependency_overrides)
    main.app.dependency_overrides[main.get_current_user] = user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    caplog.set_level(logging.WARNING, logger="uvicorn.error")
    try:
        with TestClient(main.app) as client:
            meals = client.get("/api/diet/meal-logs?from_date=2026-09-15&to_date=2026-09-15")
            assert meals.status_code == 200
            logs = meals.json()["logs"]
            assert meals.json()["count"] == 2
            assert logs[0]["items"][0]["calories"] == 150
            assert logs[0]["image_url"] is None
            assert logs[1]["image_url"] is not None
            assert len(signed) == (1 if failure == "absent" else 2)
            signed.clear()
            summary = client.get("/api/diet/nutrition-summary?date=2026-09-15")
            assert summary.status_code == 200
            assert summary.json()["summary"]["calories"]["consumed"] == 250
            assert signed == []
    finally:
        main.app.dependency_overrides.clear()
        main.app.dependency_overrides.update(previous)
    if isinstance(failure, int):
        assert f"upstream_status={failure}" in caplog.text
    for secret in (private_path, "private-token", "private-upstream-error", "private-transport-error", "private-invalid-response"):
        assert secret not in caplog.text
