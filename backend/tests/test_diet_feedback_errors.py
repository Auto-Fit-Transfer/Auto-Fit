import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException

from backend.app import main


SETTINGS = main.Settings("https://example.invalid", "test", "test", "http://localhost")


def mock_rpc(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs:
                        original(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.parametrize("kind", ["eaten", "different_food", "skipped"])
@pytest.mark.parametrize("status_code,error", [
    (400, {"code": "P0001", "message": "meal feedback already recorded"}),
    (409, {"code": "23505", "message": 'duplicate key value violates unique constraint "uk_diet_feedback_user_meal"'}),
])
def test_repeat_post_updates_existing_feedback(monkeypatch, kind, status_code, error):
    requests = []
    items = [{"food_name": "사과", "quantity": 1, "unit": "개"}] if kind == "different_food" else []
    body = main.DietMealFeedbackRequest(feedback_type=kind, actual_items=items)

    def handler(request):
        requests.append(request)
        if request.url.path.endswith("/record_recommended_meal"):
            return httpx.Response(status_code, json=error)
        assert request.url.path.endswith("/update_recommended_meal")
        payload = json.loads(request.content)
        assert payload["p_user_id"] == "owner"
        assert payload["p_diet_meal_id"] == "meal"
        assert payload["p_feedback_type"] == kind
        # A POST default timestamp must not overwrite the original time on retry.
        assert payload["p_eaten_at"] is None
        assert len(payload["p_actual_items"]) == len(items)
        return httpx.Response(200, json={"feedback": {"feedback_type": kind}})

    mock_rpc(monkeypatch, handler)
    result = asyncio.run(main.record_recommended_meal("owner", "meal", body, SETTINGS))
    assert result["feedback"]["feedback_type"] == kind
    assert len(requests) == 2


def test_repeat_post_preserves_explicit_time(monkeypatch):
    def handler(request):
        if request.url.path.endswith("/record_recommended_meal"):
            return httpx.Response(400, json={"code": "P0001", "message": "meal feedback already recorded"})
        assert json.loads(request.content)["p_eaten_at"] == "2026-09-16T03:00:00+00:00"
        return httpx.Response(200, json={"feedback": {}})

    mock_rpc(monkeypatch, handler)
    body = main.DietMealFeedbackRequest(feedback_type="eaten", eaten_at="2026-09-16T03:00:00Z")
    asyncio.run(main.record_recommended_meal("owner", "meal", body, SETTINGS))


@pytest.mark.parametrize("status_code,error,expected", [
    (400, {"code": "P0001", "message": "diet meal not found for user"}, 404),
    (400, {"code": "P0001", "message": "actual food name and positive quantity are required"}, 422),
    (400, {"code": "P0001", "message": "internal database failure"}, 502),
    (409, {"code": "23505", "message": 'duplicate key violates unique constraint "other_constraint"'}, 502),
    (404, {"code": "PGRST202", "message": "function unavailable"}, 502),
    (403, {"code": "42501", "message": "permission denied"}, 502),
    (500, ["unexpected response"], 502),
])
def test_record_errors_do_not_masquerade_as_conflicts(monkeypatch, status_code, error, expected):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status_code, json=error)

    mock_rpc(monkeypatch, handler)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(main.record_recommended_meal("owner", "meal",
                    main.DietMealFeedbackRequest(feedback_type="skipped"), SETTINGS))
    assert caught.value.status_code == expected
    assert len(calls) == 1
    assert "internal database failure" not in str(caught.value.detail)


def test_record_non_json_error(monkeypatch):
    mock_rpc(monkeypatch, lambda request: httpx.Response(400, text="upstream failed"))
    with pytest.raises(HTTPException) as caught:
        asyncio.run(main.record_recommended_meal("owner", "meal",
                    main.DietMealFeedbackRequest(feedback_type="eaten"), SETTINGS))
    assert caught.value.status_code == 502


def test_duplicate_fallback_does_not_hide_update_failure(monkeypatch):
    def handler(request):
        if request.url.path.endswith("/record_recommended_meal"):
            return httpx.Response(400, json={"code": "P0001", "message": "meal feedback already recorded"})
        return httpx.Response(400, json={"code": "P0002"})

    mock_rpc(monkeypatch, handler)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(main.record_recommended_meal("owner", "meal",
                    main.DietMealFeedbackRequest(feedback_type="skipped"), SETTINGS))
    assert caught.value.status_code == 404
