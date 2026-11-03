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


def test_refresh_does_not_save_plan_with_unresolved_allergy(monkeypatch, caplog) -> None:
    async def users():
        return ["user-1"]

    async def existing(target_date):
        return set()

    async def catalog(settings):
        return []

    async def foods(settings):
        return []

    async def inventory(user_id, settings):
        return []

    async def allergies(user_id, settings):
        return [{"allergy_type_id": "missing", "custom_name": None}]

    async def forbidden(*args, **kwargs):
        raise AssertionError("unresolved allergy must not create a plan")

    monkeypatch.setattr(diet_refresh, "fetch_refresh_user_ids", users)
    monkeypatch.setattr(diet_refresh, "fetch_user_ids_with_active_diet", existing)
    monkeypatch.setattr(diet_refresh, "get_settings", lambda: object())
    monkeypatch.setattr(diet_refresh, "fetch_allergy_catalog", catalog)
    monkeypatch.setattr(diet_refresh, "fetch_food_catalog", foods)
    monkeypatch.setattr(diet_refresh, "fetch_food_inventory", inventory)
    monkeypatch.setattr(diet_refresh, "fetch_user_allergies", allergies)
    monkeypatch.setattr(diet_refresh, "build_daily_diet_recommendation_plan", forbidden)
    monkeypatch.setattr(diet_refresh, "create_diet_recommendation", forbidden)
    assert asyncio.run(diet_refresh.refresh_daily_diets()) == (0, 1)
    assert "reason=allergy_unresolved" in caplog.text
    assert "missing" not in caplog.text
