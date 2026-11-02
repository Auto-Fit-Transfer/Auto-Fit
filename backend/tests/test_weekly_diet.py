import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import weekly_diet as api, weekly_diet_store as storage, chat_rate_limit
from backend.app.ai_server import AIEndpoint, AIServerError
from backend.app.weekly_diet_contract import DAYS, MEALS


OWNER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
PLAN = "00000000-0000-4000-8000-000000000003"
BASE = "/api/diet/weekly-recommendations"
SLOT = f"{BASE}/{PLAN}/meals/monday/lunch/regenerate"


def weekly_reply():
    return {"ok": True, "generator": "auto-fit-ai", "result": {
        "summary": "합성 테스트 식단", "strategy": "계약 검증",
        "weekly_plan": [{"day": day, "meals": {
            meal_type: {
                "menu_name": f"{day} {meal_type}", "menu_description": "합성 음식",
                "estimated_calories_kcal": 165.5,
                "nutrition": {"carbohydrate_g": 35.25, "protein_g": 3.5, "fat_g": 1.25},
                "items": [{"food_name": "현미밥", "portion_g": 100.25,
                           "calories_kcal": 165.5, "carbohydrate_g": 35.25,
                           "protein_g": 3.5, "fat_g": 1.25}],
                "image_prompt": None, "ingredients": None, "guidance": "합성 예시",
            } for meal_type in MEALS
        }} for day in DAYS],
        "cautions": [], "sources": [],
    }}


@pytest.fixture
def harness(monkeypatch):
    state = {"rows": [], "writes": [], "ai_calls": [], "context_calls": [],
             "reply": weekly_reply(), "context": {"food_allergens": ["땅콩"],
             "goal_type": "weight_loss", "metric_statuses": {}}}

    def get_user(authorization: str | None = Header(default=None)):
        if authorization != "Bearer test-owner":
            raise HTTPException(401)
        return SimpleNamespace(id=OWNER)

    def settings():
        return SimpleNamespace(supabase_url="https://db.example.invalid", supabase_service_role_key="sb_secret_test")

    async def load_context(user_id, settings):
        assert user_id == OWNER
        state["context_calls"].append(user_id)
        return deepcopy(state["context"])

    class FakeAI:
        async def post(self, endpoint, payload):
            state["ai_calls"].append((endpoint, deepcopy(payload)))
            if state.get("ai_error"):
                raise state["ai_error"]
            if state.get("change_context"):
                state["context"]["food_allergens"].append("현미")
            if endpoint == AIEndpoint.REPLACE_MEAL:
                replacement = deepcopy(state["reply"]["result"]["weekly_plan"][0]["meals"]["lunch"])
                replacement["menu_name"] = "새 메뉴"
                return state.get("replacement", {"ok": True, "generator": "auto-fit-ai", "meal": {
                    "day": "monday", "meal_type": "lunch", "meal": replacement,
                    "cautions": [], "sources": [],
                }})
            return deepcopy(state["reply"])

    def db_handler(request):
        assert request.headers["apikey"] == "sb_secret_test"
        assert request.url.host == "db.example.invalid"
        if request.method == "GET":
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            rows = [row for row in state["rows"] if row["user_id"] == OWNER]
            for param, key in [("weekly_diet_plan_id", "weekly_diet_plan_id"), ("week_start_date", "week_start_date")]:
                if param in request.url.params:
                    rows = [row for row in rows if "eq." + row[key] == request.url.params[param]]
            return httpx.Response(200, json=rows[:1])
        import json
        body = json.loads(request.content)
        if request.url.path.endswith("consume_chat_rate_limit"):
            assert body == {"p_user_id": OWNER, "p_bucket": "answers"}
            state["quota_calls"] = state.get("quota_calls", 0) + 1
            return httpx.Response(200, json={"allowed": not state.get("rate_limited", False), "retry_after": 30})
        state["writes"].append((request.url.path, body))
        if request.url.path.endswith("refresh_weekly_diet_plan"):
            assert body["p_user_id"] == OWNER
            row = state["rows"][0]
            if state.get("race") or body["p_expected_version"] != row["version"]:
                return httpx.Response(409, json={"message": "WEEKLY_DIET_VERSION_CONFLICT", "code": "40001"})
            row.update(result=body["p_reply"]["result"], request_context=body["p_request_context"],
                       generator=body["p_reply"]["generator"], last_replacement=None, version=row["version"] + 1)
            return httpx.Response(200, json=row)
        if request.url.path.endswith("replace_weekly_diet_meal"):
            assert body["p_user_id"] == OWNER
            row = state["rows"][0]
            if state.get("race") or body["p_expected_version"] != row["version"]:
                return httpx.Response(409, json={"message": "WEEKLY_DIET_VERSION_CONFLICT", "code": "40001"})
            replacement = body["p_replacement"]
            entry = next(d for d in row["result"]["weekly_plan"] if d["day"] == body["p_day"])
            entry["meals"][body["p_meal_type"]] = replacement["meal"]["meal"]
            row["last_replacement"] = replacement
            row["version"] += 1
            row["request_context"] = body["p_request_context"]
            return httpx.Response(200, json=row)
        row = {**body, "weekly_diet_plan_id": PLAN, "version": 1,
               "created_at": "2026-10-19T01:00:00Z", "updated_at": "2026-10-19T01:00:00Z"}
        state["rows"].append(row)
        return httpx.Response(201, json=[row])

    @asynccontextmanager
    async def db_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(db_handler)) as client:
            yield client

    monkeypatch.setattr(storage, "client_scope", db_scope)
    monkeypatch.setattr(chat_rate_limit, "client_scope", db_scope)
    app = FastAPI()
    app.include_router(api.create_weekly_diet_router(get_user, settings, load_context))
    app.dependency_overrides[api.get_weekly_ai_client] = FakeAI
    with TestClient(app, headers={"Authorization": "Bearer test-owner"}) as client:
        yield client, state


def generate(client):
    return client.post(BASE + "/generate", json={"week_start_date": "2026-10-19", "disliked_foods": ["가지"]})


def test_generate_save_and_read_full_week_with_lossless_items(harness):
    client, state = harness
    response = generate(client)
    assert response.status_code == 201, response.text
    plan = response.json()
    assert [row["date"] for row in plan["result"]["weekly_plan"]] == [f"2026-10-{day}" for day in range(19, 26)]
    assert len(plan["result"]["weekly_plan"]) == 7
    assert sum(len(row["meals"]) for row in plan["result"]["weekly_plan"]) == 28
    assert state["rows"][0]["result"] == state["reply"]["result"]
    assert "user_id" not in plan and "request_context" not in plan
    endpoint, payload = state["ai_calls"][0]
    assert endpoint == AIEndpoint.DIET
    assert payload["food_allergens"] == ["땅콩"] and payload["disliked_foods"] == ["가지"]
    assert "user_id" not in payload and "week_start_date" not in payload
    assert client.get(BASE, params={"week_start_date": "2026-10-19"}).json() == plan
    assert client.get(f"{BASE}/{PLAN}").json() == plan
    recipe = api.recipe_request(state["rows"][0], "monday", "lunch", state["context"])
    assert recipe["items"] == state["reply"]["result"]["weekly_plan"][0]["meals"]["lunch"]["items"]
    assert recipe["items"][0]["portion_g"] == 100.25


def test_model_handoff_examples_match_actual_requests(harness):
    import json
    from pathlib import Path

    client, state = harness
    docs = Path(__file__).resolve().parents[2] / "docs" / "ai-integration"
    examples = json.loads((docs / "ai-request-examples.json").read_text())
    state["reply"] = json.loads((docs / "weekly-diet-example.json").read_text())
    creation, replacement, recipe = examples["requests"]
    response = client.post(BASE + "/generate", json=examples["backend_generate"]["body"])
    assert response.status_code == 201, response.text
    assert state["ai_calls"][0] == (AIEndpoint(creation["path"]), creation["body"])
    assert api.recipe_request(state["rows"][0], "monday", "lunch", state["context"]) == recipe["body"]
    response = client.post(SLOT, json={"expected_version": 1})
    assert response.status_code == 200, response.text
    assert state["ai_calls"][1] == (AIEndpoint(replacement["path"]), replacement["body"])


def test_legacy_ai_ingredients_without_items_never_save(harness):
    # The remote AI schema at 1ebb6a2 returns ingredients, not lossless food items.
    client, state = harness
    for day in state["reply"]["result"]["weekly_plan"]:
        for meal in day["meals"].values():
            del meal["items"]
            meal["ingredients"] = [{"name": "현미", "recommended_amount": 100, "unit": "g"}]
    response = generate(client)
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "AI_INVALID_RESPONSE"
    assert not state["writes"]


@pytest.mark.parametrize("mutation", ["missing_day", "duplicate_day", "reversed_days", "missing_meal", "empty_items", "blank_name", "bad_number", "allergen", "dislike", "false_ok"])
def test_invalid_ai_results_never_write(harness, mutation):
    client, state = harness
    days = state["reply"]["result"]["weekly_plan"]
    food = days[0]["meals"]["lunch"]["items"][0]
    if mutation == "missing_day": days.pop()
    elif mutation == "duplicate_day": days[-1]["day"] = "monday"
    elif mutation == "reversed_days": days.reverse()
    elif mutation == "missing_meal": del days[0]["meals"]["snack"]
    elif mutation == "empty_items": days[0]["meals"]["lunch"]["items"] = []
    elif mutation == "bad_number": food["portion_g"] = "100"
    elif mutation == "blank_name": food["food_name"] = "  "
    elif mutation == "allergen": food["food_name"] = "땅콩밥"
    elif mutation == "dislike": food["food_name"] = "가지무침"
    elif mutation == "false_ok": state["reply"]["ok"] = False
    assert generate(client).status_code == 502
    assert state["writes"] == []


def test_context_change_while_ai_runs_does_not_save(harness):
    client, state = harness
    state["change_context"] = True
    assert generate(client).status_code == 409
    assert not state["writes"]


def test_duplicate_week_rejected_before_ai_call(harness):
    client, state = harness
    assert generate(client).status_code == 201
    assert generate(client).status_code == 409
    assert len(state["ai_calls"]) == 1


@pytest.mark.parametrize("body", [{"week_start_date": "2026-10-20"}, {"week_start_date": "9999-12-27"}, {"user_id": OTHER}, {"food_allergens": []}])
def test_invalid_client_inputs_never_reach_model(harness, body):
    client, state = harness
    assert client.post(BASE + "/generate", json=body).status_code == 422
    assert not state["ai_calls"] and not state["writes"]


def test_read_and_replace_other_user_plan_are_not_found(harness):
    client, state = harness
    assert generate(client).status_code == 201
    state["rows"][0]["user_id"] = OTHER
    assert client.get(f"{BASE}/{PLAN}").status_code == 404
    assert client.post(SLOT, json={"expected_version": 1}).status_code == 404
    assert len(state["ai_calls"]) == 1


def test_replace_only_one_slot_and_pass_all_existing_menus(harness):
    client, state = harness
    assert generate(client).status_code == 201
    before = deepcopy(state["rows"][0]["result"])
    response = client.post(SLOT, json={"expected_version": 1})
    assert response.status_code == 200, response.text
    assert response.json()["version"] == 2
    before["weekly_plan"][0]["meals"]["lunch"]["menu_name"] = "새 메뉴"
    assert state["rows"][0]["result"] == before
    endpoint, payload = state["ai_calls"][-1]
    assert endpoint == AIEndpoint.REPLACE_MEAL
    assert len(payload["excluded_menu_names"]) == 28
    assert payload["target_day"] == "monday" and payload["target_meal"] == "lunch"
    assert client.post(SLOT, json={"expected_version": 1}).status_code == 409
    assert len(state["ai_calls"]) == 2


@pytest.mark.parametrize("failure", ["wrong_day", "repeated_menu", "race"])
def test_replace_rejects_wrong_target_duplicate_and_concurrent_change(harness, failure):
    client, state = harness
    assert generate(client).status_code == 201
    old = deepcopy(state["rows"][0]["result"])
    if failure == "race":
        state["race"] = True
    else:
        meal = deepcopy(old["weekly_plan"][0]["meals"]["lunch"])
        state["replacement"] = {"ok": True, "generator": "auto-fit-ai", "meal": {
            "day": "tuesday" if failure == "wrong_day" else "monday",
            "meal_type": "lunch", "meal": meal,
        }}
    response = client.post(SLOT, json={"expected_version": 1})
    assert response.status_code == (409 if failure == "race" else 502)
    assert state["rows"][0]["result"] == old


def test_ai_unavailable_has_safe_error_and_no_write(harness):
    client, state = harness
    state["ai_error"] = AIServerError("AI_UNAVAILABLE", 503)
    assert generate(client).status_code == 503
    assert state["writes"] == []


def test_authentication_required(harness):
    client, state = harness
    client.headers.clear()
    assert client.get(BASE).status_code == 401
    assert client.post(BASE + "/generate", json={}).status_code == 401
    assert not state["ai_calls"]


def test_changed_restrictions_require_whole_week_regeneration(harness):
    client, state = harness
    assert generate(client).status_code == 201
    state["context"]["food_allergens"].append("우유")
    blocked = client.get(f"{BASE}/{PLAN}")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["version"] == 1
    assert client.get(BASE, params={"week_start_date": "2026-10-19"}).status_code == 409
    assert client.post(SLOT, json={"expected_version": 1}).status_code == 409
    assert len(state["ai_calls"]) == 1
    regenerated = client.post(BASE + "/generate", json={"week_start_date": "2026-10-19", "expected_version": 1})
    assert regenerated.status_code == 200, regenerated.text
    assert regenerated.json()["version"] == 2
    assert state["ai_calls"][-1][1]["food_allergens"] == ["땅콩", "우유"]
    assert state["ai_calls"][-1][1]["disliked_foods"] == ["가지"]
    assert client.get(f"{BASE}/{PLAN}").status_code == 200


def test_regeneration_rejects_stale_version_and_race(harness):
    client, state = harness
    assert generate(client).status_code == 201
    assert client.post(BASE + "/generate", json={"week_start_date": "2026-10-19", "expected_version": 2}).status_code == 409
    assert len(state["ai_calls"]) == 1
    before = deepcopy(state["rows"])
    state["race"] = True
    assert client.post(BASE + "/generate", json={"week_start_date": "2026-10-19", "expected_version": 1}).status_code == 409
    assert state["rows"] == before


def test_generation_quota_prevents_paid_calls_and_writes(harness):
    client, state = harness
    state["rate_limited"] = True
    response = generate(client)
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "30"
    assert not state["ai_calls"] and not state["writes"]


@pytest.mark.parametrize("whole_week", [True, False])
def test_regeneration_uses_same_quota(harness, whole_week):
    client, state = harness
    assert generate(client).status_code == 201
    state["rate_limited"] = True
    response = client.post(BASE + "/generate", json={"week_start_date": "2026-10-19", "expected_version": 1}) if whole_week else client.post(SLOT, json={"expected_version": 1})
    assert response.status_code == 429
    assert len(state["ai_calls"]) == 1
    assert len(state["writes"]) == 1


@pytest.mark.parametrize("unresolved", [False, True])
def test_real_context_loader_keeps_identity_internal_and_fails_on_unknown_allergy(monkeypatch, unresolved):
    from backend.app import main

    async def catalog(settings):
        return [{"allergy_type_id": "allergy-1", "name": "땅콩"}]

    async def selected(user_id, settings):
        assert user_id == OWNER
        return [{"allergy_type_id": "missing" if unresolved else "allergy-1", "user_id": OWNER}]

    async def preferences(user_id, settings):
        assert user_id == OWNER
        return {"goal_type": "weight_loss", "user_id": OWNER}

    monkeypatch.setattr(main, "fetch_allergy_catalog", catalog)
    monkeypatch.setattr(main, "fetch_user_allergies", selected)
    monkeypatch.setattr(main, "fetch_exercise_preferences", preferences)
    if unresolved:
        with pytest.raises(HTTPException) as error:
            asyncio.run(main.load_weekly_diet_context(OWNER, None))
        assert error.value.status_code == 502
    else:
        assert asyncio.run(main.load_weekly_diet_context(OWNER, None)) == {
            "food_allergens": ["땅콩"], "goal_type": "weight_loss", "metric_statuses": {},
        }
