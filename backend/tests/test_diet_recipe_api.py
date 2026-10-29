import asyncio
from types import SimpleNamespace
from uuid import UUID

import httpx
from fastapi.testclient import TestClient

from backend.app import main
from backend.tests.test_main import TEST_SETTINGS


MEAL_ID = UUID("00000000-0000-4000-8000-000000000011")


def test_recipe_route_requires_login() -> None:
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).get(f"/api/diet/meals/{MEAL_ID}/recipe")
        assert response.status_code == 401
    finally:
        main.app.dependency_overrides.clear()


def test_recipe_read_is_scoped_to_authenticated_user_and_meal() -> None:
    recipe = {
        "diet_recipe_snapshot_id": "recipe-1",
        "diet_meal_id": str(MEAL_ID),
        "title": "테스트 레시피",
        "description": "",
        "servings": 1,
        "prep_minutes": 5,
        "ingredients": [{"name": "두부", "quantity": 100, "unit": "g"}],
        "steps": ["두부를 준비합니다."],
        "generator": "test",
        "created_at": "2026-10-29T00:00:00Z",
    }

    async def run() -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.method == "GET"
            assert request.url.path == "/rest/v1/diet_recipe_snapshots"
            assert request.url.params["user_id"] == "eq.owner-123"
            assert request.url.params["diet_meal_id"] == f"eq.{MEAL_ID}"
            assert request.headers["apikey"] == TEST_SETTINGS.supabase_service_role_key
            return httpx.Response(200, json=[recipe])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(supabase_http_client=client)))
            result = await main.get_diet_meal_recipe(
                MEAL_ID, main.AuthenticatedUser(id="owner-123"), TEST_SETTINGS, request
            )
        assert result == {"recipe": recipe}

    asyncio.run(run())


def test_recipe_read_returns_empty_state_when_no_snapshot() -> None:
    async def run() -> None:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[]))
        ) as client:
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(supabase_http_client=client)))
            result = await main.get_diet_meal_recipe(
                MEAL_ID, main.AuthenticatedUser(id="owner-123"), TEST_SETTINGS, request
            )
        assert result == {"recipe": None}

    asyncio.run(run())
