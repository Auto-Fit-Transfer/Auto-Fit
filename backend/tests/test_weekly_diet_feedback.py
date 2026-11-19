import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import httpx

from backend.app import weekly_diet_feedback as api, weekly_diet_store as storage


USER = "00000000-0000-4000-8000-000000000001"
PLAN = "00000000-0000-4000-8000-000000000003"
LOG = "00000000-0000-4000-8000-000000000004"
FEEDBACK = "00000000-0000-4000-8000-000000000005"
DAILY_FEEDBACK = "00000000-0000-4000-8000-000000000006"
DAILY_MEAL = "00000000-0000-4000-8000-000000000007"
SLOT = f"/api/diet/weekly-recommendations/{PLAN}/meals/monday/lunch/feedback"


def test_weekly_feedback_post_patch_and_list(monkeypatch):
    state = {"calls": []}

    class Store:
        def __init__(self, _settings, user_id):
            self.user_id = user_id

        async def get(self, *, plan_id):
            assert plan_id == UUID(PLAN)
            return {"version": 3, "weekly_diet_plan_id": PLAN,
                    "week_start_date": "2026-11-16",
                    "request_context": {"food_allergens": [], "goal_type": None}}

        async def request(self, method, path, *, params=None, body=None):
            state["calls"].append((method, path, deepcopy(params), deepcopy(body)))
            if path == "rpc/list_legacy_weekly_diet_feedback":
                assert body == {"p_user_id": USER, "p_plan_id": PLAN}
                return [{"user_id": USER, "weekly_diet_plan_id": PLAN,
                         "date": "2026-11-16", "plan_day": "monday",
                         "meal_type": "dinner", "diet_feedback_id": DAILY_FEEDBACK,
                         "diet_meal_id": DAILY_MEAL, "feedback_type": "eaten",
                         "meal_log_id": LOG,
                         "recorded_at": "2026-11-16T12:00:00+09:00"}]
            row = {
                "weekly_diet_feedback_id": FEEDBACK, "user_id": USER,
                "weekly_diet_plan_id": PLAN, "plan_day": "monday", "meal_type": "lunch",
                "weekly_plan_version": 3,
                "feedback_type": "skipped" if body and not body["p_create"] else "eaten",
                "meal_log_id": None if body and not body["p_create"] else LOG,
                "recorded_at": datetime(2026, 11, 19, tzinfo=UTC).isoformat(),
            }
            if method == "GET":
                return [row]
            return {"feedback": row, "meal_log": None if row["meal_log_id"] is None
                    else {"meal_log_id": LOG}}

    monkeypatch.setattr(api, "WeeklyDietStore", Store)

    async def user():
        return SimpleNamespace(id=USER)

    async def settings():
        return SimpleNamespace()

    async def context(_user_id, _settings):
        return {"food_allergens": [], "goal_type": None}

    app = FastAPI()
    app.include_router(api.create_weekly_feedback_router(user, settings, context))
    client = TestClient(app)

    response = client.post(SLOT, json={"expected_version": 3, "feedback_type": "eaten",
                                       "eaten_at": "2026-11-16T12:00:00+09:00"})
    assert response.status_code == 201
    assert response.json()["meal_log_id"] == LOG
    assert state["calls"][0][3]["p_create"] is True
    assert state["calls"][0][3]["p_actual_items"] == []
    assert state["calls"][0][3]["p_eaten_at"] == "2026-11-16T12:00:00+09:00"

    response = client.patch(SLOT, json={"expected_version": 3, "feedback_type": "skipped"})
    assert response.status_code == 200
    assert response.json()["meal_log_id"] is None
    assert state["calls"][1][3]["p_eaten_at"] is None

    response = client.get(f"/api/diet/weekly-recommendations/{PLAN}/feedback")
    assert response.status_code == 200
    assert response.json()["feedback"][0]["plan_day"] == "monday"
    assert response.json()["legacy_feedback"][0]["source"] == "daily"
    assert response.json()["legacy_feedback"][0]["diet_meal_id"] == DAILY_MEAL

    writes = len(state["calls"])
    response = client.post(SLOT, json={"expected_version": 3, "feedback_type": "eaten",
                                       "eaten_at": "2026-11-19T12:00:00+09:00"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "WEEKLY_FEEDBACK_DATE_MISMATCH"
    assert len(state["calls"]) == writes


def test_weekly_feedback_rejects_stale_version_and_invalid_items(monkeypatch):
    class Store:
        def __init__(self, _settings, user_id):
            self.user_id = user_id

        async def get(self, *, plan_id):
            return {"version": 4}

        async def request(self, *_args, **_kwargs):
            raise AssertionError("stale or invalid feedback must not write")

    monkeypatch.setattr(api, "WeeklyDietStore", Store)

    async def user():
        return SimpleNamespace(id=USER)

    async def settings():
        return SimpleNamespace()

    async def context(_user_id, _settings):
        raise AssertionError("stale version must fail first")

    app = FastAPI()
    app.include_router(api.create_weekly_feedback_router(user, settings, context))
    client = TestClient(app)
    response = client.post(SLOT, json={"expected_version": 3, "feedback_type": "eaten"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "WEEKLY_DIET_VERSION_CONFLICT"
    response = client.post(SLOT, json={"expected_version": 4, "feedback_type": "different_food"})
    assert response.status_code == 422
    response = client.post(SLOT, json={"expected_version": 4, "feedback_type": "eaten",
                                      "actual_items": [{"food_name": "밥", "quantity": 1, "unit": "g"}]})
    assert response.status_code == 422


def test_weekly_feedback_never_returns_another_users_row():
    row = {"weekly_diet_feedback_id": FEEDBACK,
           "user_id": "00000000-0000-4000-8000-000000000009",
           "weekly_diet_plan_id": PLAN, "plan_day": "monday", "meal_type": "lunch",
           "weekly_plan_version": 3, "feedback_type": "eaten", "meal_log_id": LOG,
           "recorded_at": datetime(2026, 11, 19, tzinfo=UTC).isoformat()}
    try:
        api.public_feedback(row, USER, UUID(PLAN))
    except HTTPException as error:
        assert error.status_code == 502
        assert error.detail["code"] == "WEEKLY_DIET_STORAGE_ERROR"
    else:
        raise AssertionError("cross-user row was accepted")

    legacy = {"user_id": row["user_id"], "weekly_diet_plan_id": PLAN,
              "date": "2026-11-16", "plan_day": "monday", "meal_type": "lunch",
              "diet_feedback_id": DAILY_FEEDBACK, "diet_meal_id": DAILY_MEAL,
              "feedback_type": "eaten", "meal_log_id": LOG,
              "recorded_at": "2026-11-16T12:00:00+09:00"}
    try:
        api.public_legacy_feedback(legacy, USER, UUID(PLAN))
    except HTTPException as error:
        assert error.status_code == 502
    else:
        raise AssertionError("cross-user legacy row was accepted")


def test_existing_daily_feedback_is_reported_as_weekly_409(monkeypatch):
    @asynccontextmanager
    async def db_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(409, json={
                "code": "23505", "message": "WEEKLY_FEEDBACK_LEGACY_EXISTS",
            })
        )) as client:
            yield client

    monkeypatch.setattr(storage, "client_scope", db_scope)
    store = storage.WeeklyDietStore(SimpleNamespace(
        supabase_url="https://example.invalid", supabase_service_role_key="test-key",
    ), USER)
    try:
        asyncio.run(store.request("POST", "rpc/write_weekly_diet_feedback", body={}))
    except HTTPException as error:
        assert error.status_code == 409
        assert error.detail["code"] == "WEEKLY_FEEDBACK_LEGACY_EXISTS"
    else:
        raise AssertionError("existing daily feedback was not reported as conflict")
