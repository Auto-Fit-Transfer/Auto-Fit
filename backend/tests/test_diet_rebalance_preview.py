from copy import deepcopy
from decimal import Decimal
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.app import diet_rebalance_preview as api
from backend.app.ai_server import AIServerError
from backend.app.diet_rebalance_preview import valid_candidate


USER = "00000000-0000-4000-8000-000000000001"
PLAN = "00000000-0000-4000-8000-000000000003"
PREVIEW = "00000000-0000-4000-8000-000000000006"
BASE = f"/api/diet/weekly-recommendations/{PLAN}/tomorrow-rebalance"


def candidate():
    return {"meal": {"day": "friday", "meal_type": "lunch",
                     "meal": {"estimated_calories_kcal": 540},
                     "adjustment": {"baseline_calories_kcal": 600,
                                    "requested_reduction_kcal": 60}}}


def test_candidate_must_reduce_actual_menu_without_breaking_daily_floor():
    result = valid_candidate(candidate(), "friday", "lunch",
                             {"estimated_calories_kcal": 600}, Decimal(60),
                             {"calories_kcal": 600}, Decimal(1700), Decimal(2000))
    assert result == Decimal(60)

    too_heavy = deepcopy(candidate())
    too_heavy["meal"]["meal"]["estimated_calories_kcal"] = 650
    too_low = deepcopy(candidate())
    too_low["meal"]["meal"]["estimated_calories_kcal"] = 400
    for reply in (too_heavy, too_low):
        try:
            valid_candidate(reply, "friday", "lunch", {"estimated_calories_kcal": 600},
                            Decimal(60), {"calories_kcal": 600}, Decimal(1700), Decimal(2000))
        except HTTPException as error:
            assert error.status_code == 502
        else:
            raise AssertionError("invalid AI candidate was accepted")

    try:
        valid_candidate(candidate(), "friday", "lunch", {"estimated_calories_kcal": 600},
                        Decimal(60), {"calories_kcal": 600}, Decimal(1950), Decimal(2000))
    except HTTPException as error:
        assert error.status_code == 502
    else:
        raise AssertionError("candidate crossed the daily floor")


def weekly_plan():
    names = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    types = ("breakfast", "lunch", "dinner", "snack")
    def meal(day, meal_type):
        return {"menu_name": f"{day} {meal_type}", "menu_description": "test",
                "estimated_calories_kcal": 500,
                "nutrition": {"carbohydrate_g": 60, "protein_g": 30, "fat_g": 15},
                "items": [{"food_name": "테스트", "portion_g": 100, "calories_kcal": 500,
                           "carbohydrate_g": 60, "protein_g": 30, "fat_g": 15}]}
    target = {"calories_kcal": 500, "carbohydrate_g": 60, "protein_g": 30, "fat_g": 15}
    return {"weekly_diet_plan_id": PLAN, "user_id": USER,
            "week_start_date": "2026-11-16", "version": 3,
            "request_context": {"food_allergens": [], "disliked_foods": [],
                                "goal_type": None, "meal_target": None},
            "result": {"daily_target": {"calories_kcal": 2000},
                       "slot_targets": {meal_type: target for meal_type in types},
                       "weekly_plan": [
                           {"day": day, "meals": {meal_type: meal(day, meal_type)
                                                  for meal_type in types}}
                           for day in names]}}


def preview_client(monkeypatch, failed=(), unknown_calories=False):
    state = {"writes": [], "ai_calls": [], "quota": 0}

    class Store:
        def __init__(self, _settings, user_id):
            self.user_id = user_id

        async def get(self, *, plan_id=None, week_start=None):
            return deepcopy(weekly_plan())

        async def consume_generation_quota(self):
            state["quota"] += 1

        async def request(self, method, path, *, body=None):
            if path == "rpc/diet_rebalance_today_totals":
                return {"date": "2026-11-19", "consumed_kcal": 2100,
                        "has_unknown_calories": unknown_calories,
                        "exercise_burned_kcal": 0, "running_burned_kcal": 0,
                        "decision": "none"}
            state["writes"].append((path, deepcopy(body)))
            if path == "rpc/save_diet_rebalance_preview":
                return {"preview_id": PREVIEW, "expires_at": "2026-11-19T12:10:00Z"}
            if path == "rpc/confirm_diet_rebalance_preview":
                return {"weekly_diet_plan_id": PLAN, "version": 4,
                        "tomorrow_date": "2026-11-20",
                        "applied_meal_types": [item["meal_type"] for item in
                                               state["writes"][0][1]["p_successes"]],
                        "failed_meals": state["writes"][0][1]["p_failures"],
                        "decision": "adjusted"}
            raise AssertionError(path)

    class AI:
        async def post(self, endpoint, payload):
            state["ai_calls"].append(deepcopy(payload))
            meal_type = payload["target_meal"]
            if meal_type in failed:
                raise AIServerError("AI_UNAVAILABLE", 503)
            reduction = payload["requested_calorie_reduction_kcal"]
            selected = 500 - reduction
            replacement = deepcopy(weekly_plan()["result"]["weekly_plan"][4]["meals"][meal_type])
            replacement["menu_name"] = f"새 {meal_type}"
            replacement["estimated_calories_kcal"] = selected
            replacement["items"][0]["calories_kcal"] = selected
            return {"ok": True, "generator": "fake-ai", "meal": {
                "day": "friday", "meal_type": meal_type, "meal": replacement,
                "adjustment": {
                    "adjustment_policy": "gentle_rebalance_v1",
                    "baseline_calories_kcal": 500,
                    "requested_reduction_kcal": reduction,
                    "maximum_allowed_reduction_kcal": 75,
                    "target_calories_kcal": selected,
                    "selected_calories_kcal": selected,
                    "estimated_reduction_kcal": reduction,
                    "remaining_reduction_kcal": 0,
                    "selected_calorie_ratio": selected / 500,
                    "limited_by_policy": False,
                },
            }}

    monkeypatch.setattr(api, "WeeklyDietStore", Store)
    monkeypatch.setattr(api, "get_weekly_ai_client", AI)

    async def user():
        return SimpleNamespace(id=USER)

    async def settings():
        return SimpleNamespace()

    async def context(_user_id, _settings):
        return {"food_allergens": [], "goal_type": None}

    async def adult(_user_id, _settings):
        return None

    app = FastAPI()
    app.include_router(api.create_weekly_rebalance_router(user, settings, context,
                                                           context, adult))
    return TestClient(app), state


def test_preview_then_confirm_is_atomic_and_uses_server_calories(monkeypatch):
    client, state = preview_client(monkeypatch)
    response = client.post(BASE + "/preview", json={
        "expected_version": 3, "meal_types": ["lunch", "dinner"],
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["preview_id"] == PREVIEW
    assert result["today"]["target_kcal"] == 2000
    assert result["tomorrow"]["floor_kcal"] == 1700
    assert result["tomorrow"]["total_after_kcal"] == 1900
    assert [meal["status"] for meal in result["tomorrow"]["meals"]] == [
        "unchanged", "ready", "ready", "unchanged",
    ]
    assert len(state["writes"][0][1]["p_successes"]) == 2
    assert state["quota"] == 2
    assert all(call["requested_calorie_reduction_kcal"] == 50 for call in state["ai_calls"])

    response = client.post(BASE + "/confirm", json={"preview_id": PREVIEW})
    assert response.status_code == 200, response.text
    assert response.json()["version"] == 4
    assert response.json()["applied_meal_types"] == ["lunch", "dinner"]


def test_one_ai_503_leaves_that_meal_unchanged_and_saves_only_success(monkeypatch):
    client, state = preview_client(monkeypatch, failed={"dinner"})
    response = client.post(BASE + "/preview", json={
        "expected_version": 3, "meal_types": ["lunch", "dinner"],
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["failed_meal_types"] == ["dinner"]
    assert result["tomorrow"]["total_after_kcal"] == 1950
    assert result["tomorrow"]["meals"][2]["status"] == "unavailable"
    assert len(state["writes"][0][1]["p_successes"]) == 1
    assert state["writes"][0][1]["p_failures"] == [
        {"meal_type": "dinner", "code": "AI_UNAVAILABLE"},
    ]


def test_unknown_calories_block_preview_before_ai_or_storage(monkeypatch):
    client, state = preview_client(monkeypatch, unknown_calories=True)
    response = client.post(BASE + "/preview", json={
        "expected_version": 3, "meal_types": ["lunch"],
    })
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DIET_CALORIES_INCOMPLETE"
    assert state["ai_calls"] == []
    assert state["writes"] == []
