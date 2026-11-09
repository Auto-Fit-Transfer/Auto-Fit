"""A saved daily suggestion must be checked against today's allergies."""

from copy import deepcopy
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.diet_recipe import daily_recipe_request, daily_source_fingerprint
from backend.tests.test_main import TEST_SETTINGS
from backend.tests.test_diet_recipe_api import ai_recipe


MEAL_ID = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def authorized():
    async def user():
        return main.AuthenticatedUser(id="owner")

    main.app.dependency_overrides[main.get_current_user] = user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    yield
    main.app.dependency_overrides.clear()


def stored_result(food_name="달걀스크램블"):
    return {
        "recommendation": {"diet_recommendation_id": "rec", "recommendation_date": "2026-11-03",
                           "allergy_context": ["계란"]},
        "meals": [{"diet_meal_id": MEAL_ID, "status": "recommended",
                   "foods": [{"food_name": food_name}], "used_ingredients": []}],
    }


def select_egg(monkeypatch):
    async def catalog(_settings):
        return [{"allergy_type_id": "egg", "name": "계란"}]

    async def selection(_user_id, _settings):
        return [{"allergy_type_id": "egg", "custom_name": None}]

    monkeypatch.setattr(main, "fetch_allergy_catalog", catalog)
    monkeypatch.setattr(main, "fetch_user_allergies", selection)


def test_saved_daily_get_marks_known_conflict(authorized, monkeypatch):
    async def fetch(*_args, **_kwargs):
        return stored_result()

    select_egg(monkeypatch)
    monkeypatch.setattr(main, "fetch_diet_recommendation", fetch)
    response = TestClient(main.app).get("/api/diet/recommendations?date=2026-11-03")

    assert response.status_code == 200
    assert response.json()["result"]["meals"][0]["allergy_safety"] == {
        "status": "conflict", "matched_food_names": ["달걀스크램블"]
    }


def test_saved_daily_get_does_not_call_unknown_ingredients_safe(authorized, monkeypatch):
    async def fetch(*_args, **_kwargs):
        return stored_result("현미밥")

    select_egg(monkeypatch)
    monkeypatch.setattr(main, "fetch_diet_recommendation", fetch)
    response = TestClient(main.app).get("/api/diet/recommendations?date=2026-11-03")

    assert response.status_code == 200
    assert response.json()["result"]["meals"][0]["allergy_safety"] == {
        "status": "ingredients_unverified", "matched_food_names": []
    }


@pytest.mark.parametrize("saved_context,expected", [
    ([], "context_changed"),
    (None, "context_unverified"),
])
def test_saved_daily_get_rechecks_allergy_context(authorized, monkeypatch, saved_context, expected):
    async def fetch(*_args, **_kwargs):
        result = stored_result("현미밥")
        result["recommendation"]["allergy_context"] = saved_context
        return result

    select_egg(monkeypatch)
    monkeypatch.setattr(main, "fetch_diet_recommendation", fetch)
    response = TestClient(main.app).get("/api/diet/recommendations?date=2026-11-03")
    assert response.status_code == 200
    assert response.json()["result"]["meals"][0]["allergy_safety"]["status"] == expected


@pytest.mark.parametrize("saved_context,code", [
    ([], "DIET_MEAL_ALLERGY_CONFLICT"),
    (None, "DIET_MEAL_ALLERGY_UNVERIFIED"),
])
def test_eaten_feedback_rejects_changed_or_unknown_context(
    authorized, monkeypatch, saved_context, code
):
    async def context(*_args):
        saved = stored_result("현미밥")
        saved["recommendation"]["allergy_context"] = saved_context
        return {"meal": saved["meals"][0], "recommendation": saved["recommendation"]}

    async def record(*_args):
        raise AssertionError("unsafe recommendation must not be marked eaten")

    select_egg(monkeypatch)
    monkeypatch.setattr(main, "fetch_diet_meal_context", context)
    monkeypatch.setattr(main, "record_recommended_meal", record)
    response = TestClient(main.app).post(
        f"/api/diet/meals/{MEAL_ID}/feedback", json={"feedback_type": "eaten"}
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == code


def test_eaten_feedback_cannot_use_conflicting_suggestion(authorized, monkeypatch):
    async def context(*_args):
        meal = stored_result()
        return {"meal": meal["meals"][0], "recommendation": meal["recommendation"]}

    async def record(*_args):
        raise AssertionError("unsafe recommendation must not be recorded as eaten")

    select_egg(monkeypatch)
    monkeypatch.setattr(main, "fetch_diet_meal_context", context)
    monkeypatch.setattr(main, "record_recommended_meal", record)
    response = TestClient(main.app).post(
        f"/api/diet/meals/{MEAL_ID}/feedback", json={"feedback_type": "eaten"}
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DIET_MEAL_ALLERGY_CONFLICT"


def test_eaten_feedback_update_cannot_use_conflicting_suggestion(authorized, monkeypatch):
    async def context(*_args):
        saved = stored_result()
        return {"meal": saved["meals"][0], "recommendation": saved["recommendation"]}

    async def update(*_args):
        raise AssertionError("unsafe recommendation must not become eaten")

    select_egg(monkeypatch)
    monkeypatch.setattr(main, "fetch_diet_meal_context", context)
    monkeypatch.setattr(main, "update_recommended_meal", update)
    response = TestClient(main.app).patch(
        f"/api/diet/meals/{MEAL_ID}/feedback", json={"feedback_type": "eaten"}
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DIET_MEAL_ALLERGY_CONFLICT"


def test_different_food_keeps_actual_meal_recording_available(authorized, monkeypatch):
    async def record(user_id, _meal_id, body, _settings):
        assert user_id == "owner"
        assert body.feedback_type == "different_food"
        return {"feedback": {"feedback_type": "different_food"}}

    monkeypatch.setattr(main, "record_recommended_meal", record)
    response = TestClient(main.app).post(
        f"/api/diet/meals/{MEAL_ID}/feedback",
        json={"feedback_type": "different_food", "actual_items": [
            {"food_name": "현미밥", "quantity": 100, "unit": "g"}
        ]},
    )

    assert response.status_code == 200
    assert response.json()["result"]["feedback"]["feedback_type"] == "different_food"


@pytest.mark.parametrize("operation", ["post", "patch"])
@pytest.mark.parametrize("code", [
    "DIET_MEAL_ALLERGY_CONFLICT", "DIET_MEAL_ALLERGY_UNVERIFIED",
])
def test_atomic_database_guard_returns_stable_api_conflict(monkeypatch, operation, code):
    original_client = httpx.AsyncClient

    def handler(request):
        assert request.url.path == f"/rest/v1/rpc/{'record' if operation == 'post' else 'update'}_recommended_meal"
        return httpx.Response(400, json={"code": "P0001", "message": code})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs:
                        original_client(transport=httpx.MockTransport(handler), **kwargs))
    with pytest.raises(HTTPException) as error:
        if operation == "post":
            main.asyncio.run(main.record_recommended_meal(
                "owner", MEAL_ID, main.DietMealFeedbackRequest(feedback_type="eaten"), TEST_SETTINGS
            ))
        else:
            main.asyncio.run(main.update_recommended_meal(
                "owner", MEAL_ID, main.DietMealFeedbackUpdateRequest(feedback_type="eaten"), TEST_SETTINGS
            ))
    assert error.value.status_code == 409
    assert error.value.detail["code"] == code


def recipe_context():
    return {
        "meal": {"diet_meal_id": MEAL_ID, "meal_type": "lunch",
                 "recommendation_note": "점심", "foods": [
                     {"food_name": "현미밥", "quantity": 100, "unit": "g"}
                 ]},
        "recommendation": {"recommendation_date": "2026-11-03",
                           "allergy_context": ["계란"]},
    }


def test_cached_recipe_with_allergen_is_rejected(monkeypatch):
    context = recipe_context()
    allergens = ["계란"]
    fingerprint = daily_source_fingerprint(daily_recipe_request(context, allergens))

    async def fake_context(*_args):
        return deepcopy(context)

    async def latest(*_args):
        return {"food_allergens": allergens}

    def handler(request):
        assert request.method == "GET"
        return httpx.Response(200, json=[{
            "source_fingerprint": fingerprint,
            "ingredients": [{"name": "달걀", "amount_g": 30}],
            "steps": ["조리"], "recipe_response": {},
        }])

    monkeypatch.setattr(main, "fetch_diet_meal_context", fake_context)
    monkeypatch.setattr(main, "load_weekly_diet_context", latest)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(supabase_http_client=client)))
            with pytest.raises(HTTPException) as error:
                await main.get_diet_meal_recipe(
                    main.UUID(MEAL_ID), main.AuthenticatedUser(id="owner"), TEST_SETTINGS, request
                )
        assert error.value.status_code == 409
        assert error.value.detail["code"] == "DIET_MEAL_ALLERGY_CONFLICT"

    main.asyncio.run(run())


@pytest.mark.parametrize("ingredients,steps,expected_code", [
    ([], ["달걀을 넣고 조리합니다."], "DIET_MEAL_ALLERGY_CONFLICT"),
    ([], ["조리합니다."], "DIET_RECIPE_INGREDIENTS_UNVERIFIED"),
    ([{}], ["조리합니다."], "DIET_RECIPE_INGREDIENTS_UNVERIFIED"),
    ([{"amount_g": 30}], ["조리합니다."], "DIET_RECIPE_INGREDIENTS_UNVERIFIED"),
])
def test_cached_recipe_without_structured_ingredients_is_rejected(
    monkeypatch, ingredients, steps, expected_code
):
    context = recipe_context()
    allergens = ["계란"]
    fingerprint = daily_source_fingerprint(daily_recipe_request(context, allergens))

    async def fake_context(*_args):
        return deepcopy(context)

    async def latest(*_args):
        return {"food_allergens": allergens}

    def handler(request):
        return httpx.Response(200, json=[{
            "source_fingerprint": fingerprint, "ingredients": ingredients,
            "steps": steps, "recipe_response": {},
        }])

    monkeypatch.setattr(main, "fetch_diet_meal_context", fake_context)
    monkeypatch.setattr(main, "load_weekly_diet_context", latest)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(supabase_http_client=client)))
            with pytest.raises(HTTPException) as error:
                await main.get_diet_meal_recipe(
                    main.UUID(MEAL_ID), main.AuthenticatedUser(id="owner"), TEST_SETTINGS, request
                )
        assert error.value.status_code == 409
        assert error.value.detail["code"] == expected_code

    main.asyncio.run(run())


def test_generated_recipe_with_allergen_is_not_saved(monkeypatch):
    async def fake_context(*_args):
        return recipe_context()

    async def latest(*_args):
        return {"food_allergens": ["계란"]}

    async def call_ai(_ai, _endpoint, payload, _schema):
        reply = ai_recipe(payload)
        reply["meal"]["items"][0]["recipe"]["ingredients"] = [
            {"name": "달걀", "amount_g": 30}
        ]
        return reply

    def handler(request):
        assert request.method == "GET", "conflicting recipe must not be saved"
        return httpx.Response(200, json=[])

    monkeypatch.setattr(main, "fetch_diet_meal_context", fake_context)
    monkeypatch.setattr(main, "load_weekly_diet_context", latest)
    monkeypatch.setattr(main, "get_weekly_ai_client", lambda: object())
    monkeypatch.setattr(main, "call_ai", call_ai)
    monkeypatch.setattr(main, "ChatRateLimiter", lambda *_args: SimpleNamespace(
        check=lambda _bucket: main.asyncio.sleep(0)
    ))

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(supabase_http_client=client)))
            with pytest.raises(HTTPException) as error:
                await main.get_diet_meal_recipe(
                    main.UUID(MEAL_ID), main.AuthenticatedUser(id="owner"), TEST_SETTINGS, request
                )
        assert error.value.status_code == 409
        assert error.value.detail["code"] == "AI_ALLERGEN_CONFLICT"

    main.asyncio.run(run())
