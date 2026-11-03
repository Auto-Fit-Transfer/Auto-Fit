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
RECIPE = f"{BASE}/{PLAN}/meals/monday/lunch/recipe"


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


def recipe_reply(payload):
    return {"ok": True, "generator": "auto-fit-ai", "meal": {
        "day": payload["day"], "meal_type": payload["meal_type"],
        "menu_name": payload["menu_name"], "menu_description": payload["menu_description"],
        "tags": payload["tags"], "servings": payload["servings"],
        "estimated_duration_minutes": None,
        "estimated_calories_kcal": sum(item["calories_kcal"] for item in payload["items"]),
        "nutrition": {key: sum(item[key] for item in payload["items"])
                      for key in ("carbohydrate_g", "protein_g", "fat_g")},
        "daily_target_percentages": None,
        "personalization_reasons": [], "allergen_notice": [],
        "items": [{**item, "recipe_available": True, "recipe_source": "llm_generated",
                   "official_recipe": False, "matched_recipe_name": None, "match_score": None,
                   "safety_checked": True, "restriction_matches": [], "recipe": {
                       "recipe_id": None, "menu_name": item["food_name"],
                       "cooking_method": None, "dish_type": None,
                       "serving_weight": item["portion_g"], "servings": payload["servings"],
                       "estimated_duration_minutes": None,
                       "ingredients_text": "현미", "ingredients": [{"name": "현미", "amount_g": None}],
                       "steps": ["씻습니다."], "step_details": [], "cooking_tip": None,
                       "image_small": None, "image_large": None, "source": None,
                   }}
                  for item in payload["items"]],
        "related_menus": payload["related_menus"],
    }}


def unavailable_recipe_reply(payload):
    reply = recipe_reply(payload)
    for item in reply["meal"]["items"]:
        item.update(recipe_available=False, recipe_source="unavailable", recipe=None)
    return reply


@pytest.fixture
def harness(monkeypatch):
    state = {"rows": [], "recipes": [], "writes": [], "ai_calls": [], "context_calls": [],
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
            if endpoint == AIEndpoint.RECIPE:
                if state.get("change_version"):
                    state["rows"][0]["version"] += 1
                return deepcopy(state.get("recipe_reply") or recipe_reply(payload))
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
            if request.url.path.endswith("diet_recipe_snapshots"):
                rows = [row for row in state["recipes"] if all(
                    request.url.params[key] == f"eq.{row[key]}"
                    for key in ("user_id", "weekly_diet_plan_id", "weekly_plan_version",
                                "plan_day", "meal_type", "servings")
                )]
                return httpx.Response(200, json=rows[:1])
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
        if request.url.path.endswith("diet_recipe_snapshots"):
            if request.method == "PATCH":
                rows = [row for row in state["recipes"] if all(
                    request.url.params[key] == f"eq.{row[key]}"
                    for key in ("user_id", "weekly_diet_plan_id", "weekly_plan_version",
                                "plan_day", "meal_type", "servings")
                )]
                for row in rows:
                    row.update(body)
                return httpx.Response(200, json=rows)
            if any(all(row[key] == body[key] for key in (
                "weekly_diet_plan_id", "weekly_plan_version", "plan_day", "meal_type", "servings"
            )) for row in state["recipes"]):
                return httpx.Response(409, json={"code": "23505"})
            state["recipes"].append(body)
            return httpx.Response(201, json=[body])
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
    monkeypatch.setattr(api, "get_weekly_ai_client", FakeAI)
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


def test_recipe_uses_selected_saved_slot_and_returns_validated_detail(harness):
    client, state = harness
    assert generate(client).status_code == 201
    response = client.get(RECIPE, params={"servings": 2})
    assert response.status_code == 200, response.text
    endpoint, payload = state["ai_calls"][-1]
    assert endpoint == AIEndpoint.RECIPE
    assert payload["day"] == "monday" and payload["meal_type"] == "lunch"
    assert payload["menu_name"] == "monday lunch"
    assert payload["guidance"] == "합성 예시" and payload["servings"] == 2
    assert payload["items"][0]["portion_g"] == 100.25
    assert len(payload["related_menus"]) == 10
    assert all(menu["menu_name"] != "monday lunch" for menu in payload["related_menus"])
    assert "daily_nutrition_target" not in payload
    assert response.json()["meal"]["daily_target_percentages"] is None
    assert state["recipes"][0]["recipe_response"] == response.json()
    assert client.get(RECIPE, params={"servings": 2}).json() == response.json()
    assert len(state["ai_calls"]) == 2
    assert len(state["writes"]) == 2


def test_recipe_cache_is_separate_for_servings_and_plan_versions(harness):
    client, state = harness
    assert generate(client).status_code == 201
    first = client.get(RECIPE)
    second = client.get(RECIPE, params={"servings": 2})
    assert first.status_code == second.status_code == 200
    assert len(state["recipes"]) == 2
    assert {row["servings"] for row in state["recipes"]} == {1, 2}
    assert client.get(RECIPE).json() == first.json()
    assert len(state["ai_calls"]) == 3  # one plan and two recipe generations
    state["rows"][0]["version"] += 1
    assert client.get(RECIPE).status_code == 200
    assert len(state["recipes"]) == 3
    assert state["recipes"][-1]["weekly_plan_version"] == 2
    assert len(state["ai_calls"]) == 4


def test_cached_recipe_does_not_require_live_ai(monkeypatch, harness):
    client, state = harness
    assert generate(client).status_code == 201
    first = client.get(RECIPE)
    assert first.status_code == 200
    monkeypatch.setattr(api, "get_weekly_ai_client", lambda: (_ for _ in ()).throw(AssertionError("AI called")))
    assert client.get(RECIPE).json() == first.json()
    assert state["recipes"][0]["ingredients"] == [{"name": "현미", "amount_g": None}]
    assert state["recipes"][0]["steps"] == ["현미밥: 씻습니다."]
    assert len(state["ai_calls"]) == 2


def test_unavailable_recipe_is_not_cached_and_recovers(harness):
    client, state = harness
    assert generate(client).status_code == 201
    payload = api.recipe_request(state["rows"][0], "monday", "lunch", state["context"])
    state["recipe_reply"] = unavailable_recipe_reply(payload)
    first = client.get(RECIPE)
    second = client.get(RECIPE)
    assert first.status_code == second.status_code == 200
    assert first.json()["meal"]["items"][0]["recipe_source"] == "unavailable"
    assert state["recipes"] == []
    assert len(state["ai_calls"]) == 3
    state["recipe_reply"] = recipe_reply(payload)
    recovered = client.get(RECIPE)
    assert recovered.status_code == 200
    assert state["recipes"][0]["recipe_response"] == recovered.json()
    assert len(state["ai_calls"]) == 4


def test_cached_unavailable_recipe_is_regenerated_and_replaced(harness):
    client, state = harness
    assert generate(client).status_code == 201
    assert client.get(RECIPE).status_code == 200
    payload = api.recipe_request(state["rows"][0], "monday", "lunch", state["context"])
    state["recipes"][0]["recipe_response"] = unavailable_recipe_reply(payload)
    recovered = client.get(RECIPE)
    assert recovered.status_code == 200
    assert recovered.json()["meal"]["items"][0]["recipe_source"] == "llm_generated"
    assert state["recipes"][0]["recipe_response"] == recovered.json()
    assert len(state["ai_calls"]) == 3
    assert len(state["recipes"]) == 1
    assert client.get(RECIPE).json() == recovered.json()
    assert len(state["ai_calls"]) == 3


def test_recipe_accepts_official_and_generated_sources_and_nulls(harness):
    client, state = harness
    assert generate(client).status_code == 201
    payload = api.recipe_request(state["rows"][0], "monday", "lunch", state["context"])
    reply = recipe_reply(payload)
    item = reply["meal"]["items"][0]
    item.update(recipe_available=True, recipe_source="official_similar", official_recipe=True,
                matched_recipe_name="현미밥", match_score=0.92,
                recipe={"recipe_id": "official-1", "menu_name": "현미밥",
                        "cooking_method": None, "dish_type": None, "serving_weight": 100.25,
                        "servings": 1, "estimated_duration_minutes": None,
                        "ingredients_text": "현미", "ingredients": [{"name": "현미", "amount_g": None}],
                        "steps": ["씻습니다."], "step_details": [{"order": 1,
                        "instruction": "씻습니다.", "duration_minutes": None, "tip": None}],
                        "cooking_tip": None, "image_small": None, "image_large": None,
                        "source": "식품의약품안전처 식품안전나라"})
    state["recipe_reply"] = reply
    assert client.get(RECIPE).status_code == 200
    state["recipes"].clear()
    item.update(recipe_source="official_exact", match_score=1.0)
    assert client.get(RECIPE).status_code == 200
    state["recipes"].clear()
    item.update(recipe_source="llm_generated", official_recipe=False,
                matched_recipe_name=None, match_score=None)
    item["recipe"]["recipe_id"] = None
    assert client.get(RECIPE).status_code == 200


@pytest.mark.parametrize("mutation", ["unsafe_detail", "wrong_slot", "changed_food", "missing_field", "wrong_total", "invented_target", "invalid_similar", "extra_field"])
def test_recipe_rejects_invalid_ai_response(harness, mutation):
    client, state = harness
    assert generate(client).status_code == 201
    payload = api.recipe_request(state["rows"][0], "monday", "lunch", state["context"])
    reply = recipe_reply(payload)
    if mutation == "unsafe_detail":
        reply["meal"]["items"][0]["recipe"] = {"menu_name": "위험한 레시피"}
    elif mutation == "wrong_slot":
        reply["meal"]["day"] = "tuesday"
    elif mutation == "changed_food":
        reply["meal"]["items"][0]["portion_g"] = 99.0
    elif mutation == "wrong_total":
        reply["meal"]["estimated_calories_kcal"] = 999.0
    elif mutation == "invented_target":
        reply["meal"]["daily_target_percentages"] = {key: 25.0 for key in (
            "calories_percent", "carbohydrate_percent", "protein_percent", "fat_percent")}
    elif mutation == "invalid_similar":
        reply["meal"]["items"][0].update(recipe_available=True,
            recipe_source="official_similar", official_recipe=True)
    elif mutation == "extra_field":
        reply["meal"]["items"][0]["unvalidated_secret"] = "unexpected"
    else:
        del reply["meal"]["items"][0]["recipe_source"]
    state["recipe_reply"] = reply
    response = client.get(RECIPE)
    assert response.status_code == 502
    assert response.json()["detail"]["code"] in {"AI_INVALID_RESPONSE", "AI_SLOT_MISMATCH"}


@pytest.mark.parametrize("change", ["version", "context"])
def test_recipe_rejects_changes_during_ai_call(harness, change):
    client, state = harness
    assert generate(client).status_code == 201
    state["change_version" if change == "version" else "change_context"] = True
    assert client.get(RECIPE).status_code == 409


def test_recipe_requires_owner_and_valid_servings(harness):
    client, state = harness
    assert generate(client).status_code == 201
    assert client.get(RECIPE, params={"servings": 21}).status_code == 422
    state["rows"][0]["user_id"] = OTHER
    assert client.get(RECIPE).status_code == 404
    assert len(state["ai_calls"]) == 1


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
