from datetime import date
from decimal import Decimal
from types import SimpleNamespace
import asyncio

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import diet_rebalance as api


USER = "00000000-0000-4000-8000-000000000001"
PLAN = "00000000-0000-4000-8000-000000000003"
BASE = "/api/diet/tomorrow-rebalance"


def totals(**values):
    return api.TodayTotals.model_validate({
        "date": "2026-11-19", "consumed_kcal": 2300,
        "has_unknown_calories": False,
        "exercise_burned_kcal": 150, "running_burned_kcal": 50,
        "decision": "none", **values,
    })


def plan(target=2000):
    return {"weekly_diet_plan_id": PLAN, "version": 3,
            "result": {"daily_target": None if target is None else
                       {"calories_kcal": target}}}


def test_status_uses_saved_daily_target_not_menu_total():
    result = api.calculate_status(totals(), plan())
    assert result["target_status"] == "available"
    assert result["today"]["total_burned_kcal"] == 200
    assert result["today"]["target_kcal"] == 2000
    assert result["today"]["overage_kcal"] == 100
    assert api.calculate_status(totals(), plan(None))["today"]["overage_kcal"] is None
    assert api.calculate_status(totals(), None)["target_status"] == "weekly_plan_missing"


def test_status_and_cheat_use_server_kst_date_and_idempotent_write(monkeypatch):
    state = {"decision": "none", "calls": []}

    class Store:
        def __init__(self, _settings, user_id):
            self.user_id = user_id

        async def get(self, *, week_start):
            assert week_start == date(2026, 11, 16)
            return {**plan(), "request_context": {
                "food_allergens": [], "goal_type": None,
            }}

        async def request(self, method, path, *, body=None):
            state["calls"].append((method, path, body))
            if path == "rpc/diet_rebalance_today_totals":
                return {"date": "2026-11-19", "consumed_kcal": 2300,
                        "has_unknown_calories": False,
                        "exercise_burned_kcal": 150, "running_burned_kcal": 50,
                        "decision": state["decision"]}
            assert path == "rpc/choose_diet_rebalance_cheat"
            assert body["p_user_id"] == USER
            assert body["p_expected_date"] == "2026-11-19"
            assert body["p_snapshot"]["overage_kcal"] == 100
            assert body["p_snapshot"]["date"] == "2026-11-19"
            state["decision"] = "cheat"
            return {"date": "2026-11-19", "decision": "cheat"}

    monkeypatch.setattr(api, "WeeklyDietStore", Store)

    async def user():
        return SimpleNamespace(id=USER)

    async def settings():
        return SimpleNamespace()

    async def context(_user_id, _settings):
        return {"food_allergens": [], "goal_type": None}

    app = FastAPI()
    app.include_router(api.create_diet_rebalance_router(user, settings, context))
    client = TestClient(app)
    response = client.get(BASE + "/status")
    assert response.status_code == 200
    assert response.json()["today"]["overage_kcal"] == 100
    assert response.json()["today"]["decision"] == "none"

    response = client.post(BASE + "/decision", json={"decision": "cheat"})
    assert response.status_code == 200
    assert response.json()["decision"] == "cheat"
    assert client.get(BASE + "/status").json()["today"]["decision"] == "cheat"
    assert client.post(BASE + "/decision", json={"decision": "cheat"}).status_code == 200
    assert sum(path == "rpc/choose_diet_rebalance_cheat" for _, path, _ in state["calls"]) == 2


def test_status_never_claims_target_from_old_weekly_plan():
    result = api.calculate_status(totals(), plan(None))
    assert result["target_status"] == "target_pending"
    assert result["today"]["target_kcal"] is None
    assert result["today"]["overage_kcal"] is None


def test_unknown_meal_calories_withhold_overage():
    result = api.calculate_status(totals(has_unknown_calories=True), plan())
    assert result["today"]["has_unknown_calories"] is True
    assert result["today"]["target_kcal"] == 2000
    assert result["today"]["overage_kcal"] is None


def test_rebalance_budget_splits_overage_and_respects_daily_floor():
    weekly = {"result": {"daily_target": {"calories_kcal": 2000},
                         "slot_targets": {
                             "breakfast": {"calories_kcal": 600},
                             "lunch": {"calories_kcal": 600},
                             "dinner": {"calories_kcal": 600},
                             "snack": {"calories_kcal": 200},
                         }}}
    meals = {name: {"estimated_calories_kcal": value}
             for name, value in (("breakfast", 600), ("lunch", 600),
                                 ("dinner", 600), ("snack", 200))}
    before, goal, floor, requests = api.reduction_budget(
        weekly, meals, ["lunch", "dinner"], 500,
    )
    assert (before, goal, floor) == (Decimal(2000), Decimal(2000), Decimal(1700))
    assert requests == {"lunch": Decimal("90.00"), "dinner": Decimal("90.00")}

    meals["breakfast"]["estimated_calories_kcal"] = 460
    meals["snack"]["estimated_calories_kcal"] = 160
    _, _, _, requests = api.reduction_budget(weekly, meals, ["lunch", "dinner"], 500)
    assert requests == {"lunch": Decimal("60.00"), "dinner": Decimal("60.00")}

    meals["breakfast"]["estimated_calories_kcal"] = 300
    try:
        api.reduction_budget(weekly, meals, ["lunch"], 500)
    except HTTPException as error:
        assert error.status_code == 409
        assert error.detail["code"] == "DIET_DAILY_FLOOR_REACHED"
    else:
        raise AssertionError("a day below its floor may not be reduced")


def test_preview_selection_rejects_duplicate_meals():
    try:
        api.RebalancePreviewRequest(expected_version=1, meal_types=["lunch", "lunch"])
    except ValueError:
        pass
    else:
        raise AssertionError("duplicate selected meals were accepted")


def test_sunday_status_references_next_week_for_monday_preview():
    current_plan = {**plan(2000), "request_context": {"food_allergens": []},
                    "week_start_date": "2026-11-16"}
    next_plan = {**plan(1800),
                 "weekly_diet_plan_id": "00000000-0000-4000-8000-000000000007",
                 "version": 5, "week_start_date": "2026-11-23",
                 "request_context": {"food_allergens": []},
                 "result": {"daily_target": {"calories_kcal": 1800},
                            "weekly_plan": [{"day": "monday", "meals": {"lunch": {}}}]}}

    class Store:
        user_id = USER

        async def request(self, method, path, *, body):
            return {"date": "2026-11-22", "consumed_kcal": 2100,
                    "has_unknown_calories": False,
                    "exercise_burned_kcal": 0, "running_burned_kcal": 0,
                    "decision": "none"}

        async def get(self, *, week_start):
            return current_plan if week_start == date(2026, 11, 16) else next_plan

    async def context(_user_id, _settings):
        return {"food_allergens": []}

    result = asyncio.run(api.load_today_status(Store(), SimpleNamespace(), context))
    assert result["today"]["target_kcal"] == 2000
    assert result["today"]["overage_kcal"] == 100
    assert result["tomorrow_plan"] == {
        "date": date(2026, 11, 23),
        "target_status": "available",
        "weekly_diet_plan_id": "00000000-0000-4000-8000-000000000007",
        "version": 5,
    }
    assert api.tomorrow_entry(next_plan, date(2026, 11, 23))[0] == "monday"
