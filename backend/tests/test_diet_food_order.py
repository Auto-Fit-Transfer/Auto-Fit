import asyncio
from datetime import date

import httpx

from backend.app import main
from backend.tests.test_main import TEST_SETTINGS


def test_diet_food_query_uses_persisted_order() -> None:
    async def run() -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            path = request.url.path.rsplit("/", 1)[-1]
            if path == "diet_recommendations":
                return httpx.Response(200, json=[{"diet_recommendation_id": "rec"}])
            if path == "diet_meals":
                return httpx.Response(
                    200, json=[{"diet_meal_id": "meal", "menu_image_key": None}]
                )
            if path == "diet_meal_foods":
                assert request.url.params["order"] == (
                    "food_order.asc,diet_meal_food_id.asc"
                )
            return httpx.Response(200, json=[])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await main.fetch_diet_recommendation(
                "owner", TEST_SETTINGS, date(2026, 9, 16), client=client
            )

    asyncio.run(run())


def test_regenerated_foods_follow_persisted_food_order(monkeypatch) -> None:
    async def run() -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path.endswith("/rpc/replace_diet_meal")
            return httpx.Response(200, json={
                "diet_meal_id": "meal",
                "foods": [
                    {"food_name": "당근", "food_order": 2},
                    {"food_name": "소고기", "food_order": 1},
                ],
            })

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: client)
        result = await main.regenerate_diet_meal(
            "owner", "meal", {"foods": []}, TEST_SETTINGS
        )

        assert [food["food_name"] for food in result["foods"]] == [
            "소고기", "당근",
        ]
        assert all("food_order" not in food for food in result["foods"])

    asyncio.run(run())
