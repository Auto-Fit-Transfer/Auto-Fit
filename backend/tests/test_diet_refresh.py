import asyncio
from contextlib import asynccontextmanager

from backend.app import diet_refresh, main


def test_refresh_user_ids_includes_profiles_without_completed_onboarding(
    monkeypatch,
) -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-test",
        supabase_service_role_key="service-role-test",
        frontend_origin="http://localhost:3000",
    )
    requested_params: list[dict[str, str]] = []

    class Response:
        def raise_for_status(self) -> None:
            pass

        def json(self) -> list[dict[str, str]]:
            return [{"user_id": "complete"}, {"user_id": "incomplete"}]

    class Client:
        async def get(self, _url, *, headers, params):
            requested_params.append(params)
            return Response()

    @asynccontextmanager
    async def fake_client_scope():
        yield Client()

    monkeypatch.setattr(diet_refresh, "get_settings", lambda: settings)
    monkeypatch.setattr(diet_refresh, "service_headers", lambda _settings: {})
    monkeypatch.setattr(diet_refresh, "client_scope", fake_client_scope)

    user_ids = asyncio.run(diet_refresh.fetch_refresh_user_ids())

    assert user_ids == ["complete", "incomplete"]
    assert requested_params == [
        {
            "select": "user_id",
            "order": "user_id.asc",
            "limit": "1000",
            "offset": "0",
        }
    ]


def test_all_ai_refresh_skips_food_catalog(monkeypatch) -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-test",
        supabase_service_role_key="service-role-test",
        frontend_origin="http://localhost:3000",
    )

    async def fake_user_ids():
        return ["user-1"]

    async def fake_allergy_catalog(_settings):
        return []

    async def forbidden_food_catalog(_settings):
        raise AssertionError("DB food catalog must not be queried in all-AI mode")

    async def fake_inventory(_user_id, _settings):
        return []

    async def fake_allergies(_user_id, _settings):
        return []

    async def fake_plan(
        _user_id,
        _inventory,
        _allergies,
        food_catalog,
        target_date=None,
        all_ai=False,
    ):
        assert food_catalog == []
        assert all_ai is True
        return {
            "recommendation": {},
            "meals": [
                {
                    "meal_type": meal_type,
                    "meal_order": index,
                    "source_type": "ai_generated",
                    "foods": [],
                }
                for index, meal_type in enumerate(
                    ("breakfast", "lunch", "dinner", "snack"), 1
                )
            ],
        }

    async def fake_assign(_meals, _settings):
        return None

    async def fake_create(_user_id, _plan, _settings):
        return {}

    monkeypatch.setattr(diet_refresh, "get_settings", lambda: settings)
    monkeypatch.setattr(diet_refresh, "fetch_refresh_user_ids", fake_user_ids)
    monkeypatch.setattr(diet_refresh, "fetch_allergy_catalog", fake_allergy_catalog)
    monkeypatch.setattr(diet_refresh, "fetch_food_catalog", forbidden_food_catalog)
    monkeypatch.setattr(diet_refresh, "fetch_food_inventory", fake_inventory)
    monkeypatch.setattr(diet_refresh, "fetch_user_allergies", fake_allergies)
    monkeypatch.setattr(
        diet_refresh, "build_daily_diet_recommendation_plan", fake_plan
    )
    monkeypatch.setattr(diet_refresh, "assign_menu_images", fake_assign)
    monkeypatch.setattr(diet_refresh, "create_diet_recommendation", fake_create)

    assert asyncio.run(diet_refresh.refresh_daily_diets(all_ai=True)) == (1, 0)


def test_refresh_isolates_allergies_and_skips_unresolved_user(monkeypatch) -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-test",
        supabase_service_role_key="service-role-test",
        frontend_origin="http://localhost:3000",
    )
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


def test_refresh_failure_log_omits_identity_and_allergen(monkeypatch, caplog) -> None:
    async def fake_user_ids():
        return ["private-user-marker"]

    async def fake_catalog(_settings):
        return []

    async def fake_inventory(_user_id, _settings):
        return []

    async def fake_allergies(_user_id, _settings):
        raise RuntimeError("private-user-marker has 우유 allergy")

    monkeypatch.setattr(diet_refresh, "get_settings", lambda: object())
    monkeypatch.setattr(diet_refresh, "fetch_refresh_user_ids", fake_user_ids)
    monkeypatch.setattr(diet_refresh, "fetch_allergy_catalog", fake_catalog)
    monkeypatch.setattr(diet_refresh, "fetch_food_catalog", fake_catalog)
    monkeypatch.setattr(diet_refresh, "fetch_food_inventory", fake_inventory)
    monkeypatch.setattr(diet_refresh, "fetch_user_allergies", fake_allergies)

    with caplog.at_level("WARNING", logger="uvicorn.error"):
        assert asyncio.run(diet_refresh.refresh_daily_diets()) == (0, 1)
    assert "exception_type=RuntimeError" in caplog.text
    assert "private-user-marker" not in caplog.text
    assert "우유" not in caplog.text
