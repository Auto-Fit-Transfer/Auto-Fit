import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from backend.app import diet_health_context


def test_latest_measurements_are_owner_scoped_and_exclude_source_documents(monkeypatch):
    requests = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"health_checkup_id": "c1", "height_cm": 171, "weight_kg": 70}]

    class Client:
        async def get(self, url, *, headers, params):
            requests.append((url, params))
            return Response()

    @asynccontextmanager
    async def fake_client_scope():
        yield Client()

    settings = SimpleNamespace(
        supabase_url="https://db.example.invalid", supabase_service_role_key="sb_secret_test",
    )
    monkeypatch.setattr(diet_health_context, "client_scope", fake_client_scope)
    checkup, body = asyncio.run(diet_health_context.fetch_latest_diet_measurements("owner-1", settings))
    assert checkup["height_cm"] == body["height_cm"] == 171
    assert {url.rsplit("/", 1)[-1] for url, _ in requests} == {
        "health_checkups", "body_compositions",
    }
    for _, params in requests:
        assert params["user_id"] == "eq.owner-1"
        assert "raw_data" not in params["select"]
        assert "uploaded_file" not in params["select"]


def test_metric_statuses_require_current_documents_and_verified_criteria():
    body = {"body_composition_id": "b1"}
    checkup = {"health_checkup_id": "c1"}
    popup = SimpleNamespace(
        body_composition_id="b1", health_checkup_id="c1",
        metrics=[
            SimpleNamespace(key="bmi", status="normal", criteria_id="kr-adult-bmi"),
            SimpleNamespace(key="fasting_glucose", status="review_required", criteria_id="kdca"),
            SimpleNamespace(key="weight_kg", status="high", criteria_id=None),
        ],
    )
    assert diet_health_context.verified_metric_statuses(popup, checkup, body) == {"bmi": "normal"}
    assert diet_health_context.verified_metric_statuses(
        popup, {"health_checkup_id": "newer"}, body,
    ) == {}


def test_missing_assessment_does_not_invent_metric_statuses(monkeypatch):
    async def missing(*args):
        raise diet_health_context.HTTPException(404, detail="No assessment")

    monkeypatch.setattr(diet_health_context, "fetch_popup_data", missing)
    result = asyncio.run(diet_health_context.fetch_diet_metric_statuses(
        "owner-1", None, {"health_checkup_id": "c1"}, {"body_composition_id": "b1"},
    ))
    assert result == {}


def test_health_context_query_failure_is_not_treated_as_missing(monkeypatch):
    class Response:
        def raise_for_status(self):
            raise diet_health_context.httpx.HTTPStatusError(
                "unavailable", request=diet_health_context.httpx.Request("GET", "https://db.example.invalid"),
                response=diet_health_context.httpx.Response(503),
            )

    class Client:
        async def get(self, url, *, headers, params):
            return Response()

    @asynccontextmanager
    async def fake_client_scope():
        yield Client()

    settings = SimpleNamespace(
        supabase_url="https://db.example.invalid", supabase_service_role_key="sb_secret_test",
    )
    monkeypatch.setattr(diet_health_context, "client_scope", fake_client_scope)
    with pytest.raises(diet_health_context.HTTPException) as caught:
        asyncio.run(diet_health_context.fetch_latest_diet_measurements("owner-1", settings))
    assert caught.value.status_code == 502
    assert caught.value.detail["code"] == "DIET_HEALTH_CONTEXT_UNAVAILABLE"
