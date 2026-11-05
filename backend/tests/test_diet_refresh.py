import asyncio
from contextlib import asynccontextmanager
from datetime import date

from backend.app import diet_refresh, main


def test_refresh_includes_profiles_without_completed_onboarding(monkeypatch) -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-test",
        supabase_service_role_key="service-role-test",
        frontend_origin="http://localhost:3000",
    )
    requested_params = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"user_id": "complete"}, {"user_id": "incomplete"}]

    class Client:
        async def get(self, url, *, headers, params):
            requested_params.append(params)
            return Response()

    @asynccontextmanager
    async def fake_client_scope():
        yield Client()

    monkeypatch.setattr(diet_refresh, "get_settings", lambda: settings)
    monkeypatch.setattr(diet_refresh, "client_scope", fake_client_scope)

    assert asyncio.run(diet_refresh.fetch_refresh_user_ids()) == ["complete", "incomplete"]
    assert requested_params == [{
        "select": "user_id", "order": "user_id.asc", "limit": "1000", "offset": "0",
    }]


def test_refresh_only_generates_for_users_without_todays_diet(monkeypatch) -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-test",
        supabase_service_role_key="service-role-test",
        frontend_origin="http://localhost:3000",
    )
    generated = []

    async def users():
        return ["has-diet", "missing", "fails"]

    async def existing(target_date):
        return {"has-diet"}

    async def empty(*args):
        return []

    async def build(user_id, inventory, allergies, catalog, target_date):
        generated.append((user_id, target_date))
        if user_id == "fails":
            raise ValueError("AI response rejected")
        return {"meals": [], "recommendation": {}}

    async def noop(*args):
        return None

    monkeypatch.setattr(diet_refresh, "get_settings", lambda: settings)
    monkeypatch.setattr(diet_refresh, "fetch_refresh_user_ids", users)
    monkeypatch.setattr(diet_refresh, "fetch_user_ids_with_active_diet", existing)
    monkeypatch.setattr(diet_refresh, "fetch_allergy_catalog", empty)
    monkeypatch.setattr(diet_refresh, "fetch_food_catalog", empty)
    monkeypatch.setattr(diet_refresh, "fetch_food_inventory", empty)
    monkeypatch.setattr(diet_refresh, "fetch_user_allergies", empty)
    monkeypatch.setattr(diet_refresh, "build_daily_diet_recommendation_plan", build)
    monkeypatch.setattr(diet_refresh, "assign_menu_images", noop)
    monkeypatch.setattr(diet_refresh, "generate_missing_menu_images", noop)
    monkeypatch.setattr(diet_refresh, "create_diet_recommendation", noop)

    assert asyncio.run(diet_refresh.refresh_daily_diets()) == (1, 1)
    assert [user_id for user_id, _ in generated] == ["missing", "fails"]
    assert generated[0][1] == generated[1][1]


def test_active_diet_lookup_is_limited_to_the_target_date(monkeypatch) -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-test",
        supabase_service_role_key="service-role-test",
        frontend_origin="http://localhost:3000",
    )
    requested_params = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"user_id": "has-diet"}]

    class Client:
        async def get(self, url, *, headers, params):
            requested_params.append((url, params))
            return Response()

    @asynccontextmanager
    async def fake_client_scope():
        yield Client()

    monkeypatch.setattr(diet_refresh, "get_settings", lambda: settings)
    monkeypatch.setattr(diet_refresh, "client_scope", fake_client_scope)

    found = asyncio.run(diet_refresh.fetch_user_ids_with_active_diet(date(2026, 11, 3)))
    assert found == {"has-diet"}
    url, params = requested_params[0]
    assert url.endswith("/rest/v1/diet_recommendations")
    assert params["recommendation_date"] == "eq.2026-11-03"
    assert params["status"] == "eq.active"


def test_refresh_isolates_allergies_and_skips_unresolved_user(monkeypatch, caplog) -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-test",
        supabase_service_role_key="service-role-test",
        frontend_origin="http://localhost:3000",
    )
    from unittest.mock import AsyncMock
    monkeypatch.setattr(diet_refresh, "fetch_user_ids_with_active_diet", AsyncMock(return_value=set()))
    expected = {"user-a": ["우유", "복숭아"], "user-b": ["대두"]}
    captured: dict[str, list[str]] = {}
    created: list[str] = []

    async def fake_user_ids():
        return [*expected, "user-unresolved"]

    async def fake_allergy_catalog(_settings):
        return [
            {"allergy_type_id": "milk", "name": "우유"},
            {"allergy_type_id": "soy", "name": "대두"},
        ]

    async def fake_food_catalog(_settings):
        return []

    async def fake_inventory(_user_id, _settings):
        return []

    async def fake_allergies(user_id, _settings):
        if user_id == "user-a":
            return [
                {"allergy_type_id": "milk"},
                {"allergy_type_id": None, "custom_name": "복숭아"},
            ]
        if user_id == "user-b":
            return [{"allergy_type_id": "soy"}]
        return [{"allergy_type_id": "missing"}]

    async def fake_plan(user_id, _inventory, allergy_names, _catalog, **_kwargs):
        captured[user_id] = allergy_names
        return {"meals": []}

    async def fake_images(_meals, _settings):
        return None

    async def fake_create(user_id, _plan, _settings):
        created.append(user_id)
        return {}

    monkeypatch.setattr(diet_refresh, "get_settings", lambda: settings)
    monkeypatch.setattr(diet_refresh, "fetch_refresh_user_ids", fake_user_ids)
    monkeypatch.setattr(diet_refresh, "fetch_allergy_catalog", fake_allergy_catalog)
    monkeypatch.setattr(diet_refresh, "fetch_food_catalog", fake_food_catalog)
    monkeypatch.setattr(diet_refresh, "fetch_food_inventory", fake_inventory)
    monkeypatch.setattr(diet_refresh, "fetch_user_allergies", fake_allergies)
    monkeypatch.setattr(diet_refresh, "build_daily_diet_recommendation_plan", fake_plan)
    monkeypatch.setattr(diet_refresh, "assign_menu_images", fake_images)
    monkeypatch.setattr(diet_refresh, "generate_missing_menu_images", fake_images)
    monkeypatch.setattr(diet_refresh, "create_diet_recommendation", fake_create)

    assert asyncio.run(diet_refresh.refresh_daily_diets()) == (2, 1)
    assert captured == expected
    assert set(created) == set(expected)
    assert "reason=allergy_unresolved" in caplog.text
    assert "user-unresolved" not in caplog.text
    assert "missing" not in caplog.text
