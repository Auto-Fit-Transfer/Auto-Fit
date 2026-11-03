import asyncio
import json
from copy import deepcopy
from types import SimpleNamespace
from uuid import UUID

import httpx
from fastapi.testclient import TestClient

from backend.app import main
from backend.tests.test_main import TEST_SETTINGS


MEAL_ID = UUID("00000000-0000-4000-8000-000000000011")


def meal_context():
    return {
        "meal": {"diet_meal_id": str(MEAL_ID), "meal_type": "lunch",
                 "recommendation_note": "한 끼", "foods": [{
                     "food_name": "현미밥", "quantity": 100, "unit": "g", "calories": 165.5,
                     "carbohydrates": 35.25, "protein": 3.5, "fat": 1.25,
                 }]},
        "recommendation": {"recommendation_date": "2026-11-02"},
    }


def ai_recipe(payload):
    item = payload["items"][0]
    return {"ok": True, "generator": "test-ai", "meal": {
        "day": payload["day"], "meal_type": payload["meal_type"],
        "menu_name": payload["menu_name"], "menu_description": payload["menu_description"],
        "tags": [], "servings": 1, "estimated_duration_minutes": 5,
        "estimated_calories_kcal": item["calories_kcal"],
        "nutrition": {"carbohydrate_g": item["carbohydrate_g"],
                      "protein_g": item["protein_g"], "fat_g": item["fat_g"]},
        "daily_target_percentages": None, "personalization_reasons": [],
        "allergen_notice": [], "related_menus": [],
        "items": [{**item, "recipe_available": True, "recipe_source": "llm_generated",
                   "official_recipe": False, "matched_recipe_name": None, "match_score": None,
                   "safety_checked": True, "restriction_matches": [], "recipe": {
                       "recipe_id": None, "menu_name": "현미밥", "cooking_method": None,
                       "dish_type": None, "serving_weight": 100, "servings": 1,
                       "estimated_duration_minutes": 5, "ingredients_text": "현미 100g",
                       "ingredients": [{"name": "현미", "amount_g": 100}],
                       "steps": ["현미를 씻습니다."], "step_details": [], "cooking_tip": None,
                       "image_small": None, "image_large": None, "source": None,
                   }}],
    }}


def test_recipe_route_requires_login() -> None:
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).get(f"/api/diet/meals/{MEAL_ID}/recipe")
        assert response.status_code == 401
    finally:
        main.app.dependency_overrides.clear()


def test_daily_recipe_is_generated_saved_reused_and_refreshed(monkeypatch) -> None:
    state = {"row": None, "ai_calls": 0, "writes": 0,
             "allergens": [], "unavailable": False}

    async def context(user_id, meal_id, settings):
        assert user_id == "owner-123" and meal_id == str(MEAL_ID)
        return deepcopy(meal_context())

    async def restrictions(user_id, settings):
        return {"food_allergens": state["allergens"]}

    async def call_ai(ai, endpoint, payload, schema):
        state["ai_calls"] += 1
        reply = ai_recipe(payload)
        if state["unavailable"]:
            item = reply["meal"]["items"][0]
            item.update(recipe_available=False, recipe_source="unavailable", recipe=None)
        schema.model_validate(reply)
        return reply

    monkeypatch.setattr(main, "fetch_diet_meal_context", context)
    monkeypatch.setattr(main, "load_weekly_diet_context", restrictions)
    monkeypatch.setattr(main, "get_weekly_ai_client", lambda: object())
    monkeypatch.setattr(main, "call_ai", call_ai)
    monkeypatch.setattr(main, "ChatRateLimiter", lambda *args: SimpleNamespace(
        check=lambda bucket: asyncio.sleep(0)))

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/diet_recipe_snapshots"
        assert request.headers["apikey"] == TEST_SETTINGS.supabase_service_role_key
        if request.method == "GET":
            assert request.url.params["user_id"] == "eq.owner-123"
            assert request.url.params["diet_meal_id"] == f"eq.{MEAL_ID}"
            return httpx.Response(200, json=[state["row"]] if state["row"] else [])
        assert request.method in {"POST", "PATCH"}
        state["writes"] += 1
        body = json.loads(request.content)
        if request.method == "POST":
            assert body["user_id"] == "owner-123"
            assert body["diet_meal_id"] == str(MEAL_ID)
            state["row"] = {**body, "diet_recipe_snapshot_id": "snapshot-1",
                            "created_at": "2026-11-02T00:00:00Z"}
            return httpx.Response(201, json=[state["row"]])
        assert request.url.params["user_id"] == "eq.owner-123"
        assert request.url.params["diet_recipe_snapshot_id"] == "eq.snapshot-1"
        assert request.url.params["source_fingerprint"] == f"eq.{state['row']['source_fingerprint']}"
        state["row"].update(body)
        return httpx.Response(200, json=[state["row"]])

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(supabase_http_client=client)))
            first = await main.get_diet_meal_recipe(
                MEAL_ID, main.AuthenticatedUser(id="owner-123"), TEST_SETTINGS, request)
            second = await main.get_diet_meal_recipe(
                MEAL_ID, main.AuthenticatedUser(id="owner-123"), TEST_SETTINGS, request)
            old_fingerprint = state["row"]["source_fingerprint"]
            state["allergens"] = ["땅콩"]
            third = await main.get_diet_meal_recipe(
                MEAL_ID, main.AuthenticatedUser(id="owner-123"), TEST_SETTINGS, request)
            state["allergens"] = ["땅콩", "우유"]
            state["unavailable"] = True
            fourth = await main.get_diet_meal_recipe(
                MEAL_ID, main.AuthenticatedUser(id="owner-123"), TEST_SETTINGS, request)
            fifth = await main.get_diet_meal_recipe(
                MEAL_ID, main.AuthenticatedUser(id="owner-123"), TEST_SETTINGS, request)
        assert first == second
        assert third["recipe"]["diet_recipe_snapshot_id"] == "snapshot-1"
        assert fourth == fifth == {"recipe": None}
        assert state["row"]["ingredients"] == state["row"]["steps"] == []
        assert first["recipe"]["steps"] == ["현미밥: 현미를 씻습니다."]
        assert first["recipe"]["ingredients"] == [{"name": "현미", "amount_g": 100}]
        assert state["row"]["source_fingerprint"] != old_fingerprint
        assert state["ai_calls"] == state["writes"] == 3

    asyncio.run(run())


def test_concurrent_daily_recipe_insert_returns_existing_snapshot(monkeypatch) -> None:
    state = {"row": None, "reads": 0}

    async def context(user_id, meal_id, settings):
        return deepcopy(meal_context())

    async def restrictions(user_id, settings):
        return {"food_allergens": []}

    async def call_ai(ai, endpoint, payload, schema):
        return ai_recipe(payload)

    monkeypatch.setattr(main, "fetch_diet_meal_context", context)
    monkeypatch.setattr(main, "load_weekly_diet_context", restrictions)
    monkeypatch.setattr(main, "get_weekly_ai_client", lambda: object())
    monkeypatch.setattr(main, "call_ai", call_ai)
    monkeypatch.setattr(main, "ChatRateLimiter", lambda *args: SimpleNamespace(
        check=lambda bucket: asyncio.sleep(0)))

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/rest/v1/diet_recipe_snapshots"
        if request.method == "GET":
            state["reads"] += 1
            return httpx.Response(200, json=[state["row"]] if state["row"] else [])
        assert request.method == "POST"
        body = json.loads(request.content)
        state["row"] = {**body, "diet_recipe_snapshot_id": "another-request",
                        "created_at": "2026-11-02T00:00:00Z"}
        return httpx.Response(409, json={"code": "23505"})

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(supabase_http_client=client)))
            result = await main.get_diet_meal_recipe(
                MEAL_ID, main.AuthenticatedUser(id="owner-123"), TEST_SETTINGS, request)
        assert result["recipe"]["diet_recipe_snapshot_id"] == "another-request"
        assert state["reads"] == 2

    asyncio.run(run())
