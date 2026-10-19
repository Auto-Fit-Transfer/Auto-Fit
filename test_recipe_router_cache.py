# -*- coding: utf-8 -*-

from __future__ import annotations

import asyncio

import httpx
from fastapi import FastAPI

from app.core.config import get_settings
from app.routers.health_router import router as health_router
from app.routers.recommendation_router import router
from app.services.meal_recipe_service import MealRecipeService


async def main() -> None:
    settings = get_settings()

    if not settings.ai_server_api_key:
        raise RuntimeError("AI_SERVER_API_KEY가 설정되지 않았습니다.")

    resolve_count = 0
    original_resolve = MealRecipeService._resolve_recipe

    async def fake_resolve(
        self: MealRecipeService,
        item: dict,
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> dict:
        nonlocal resolve_count
        del self, allergies, disliked_foods
        resolve_count += 1
        return {
            "recipe_available": True,
            "recipe_source": "llm_generated",
            "official_recipe": False,
            "matched_recipe_name": None,
            "match_score": None,
            "safety_checked": True,
            "restriction_matches": [],
            "recipe": {
                "menu_name": item["food_name"],
                "serving_weight": item.get("portion_g"),
                "ingredients": [
                    {
                        "name": "두부",
                        "amount_g": 70.0,
                    }
                ],
                "steps": ["두부를 굽는다."],
                "source": "Auto-Fit AI 생성 레시피",
            },
        }

    MealRecipeService._resolve_recipe = fake_resolve
    app = FastAPI()
    app.include_router(router)
    app.include_router(health_router)
    transport = httpx.ASGITransport(app=app)
    payload = {
        "items": [
            {
                "food_name": "라우터 캐시 두부구이",
                "portion_g": 70.0,
                "calories_kcal": 100.0,
                "protein_g": 10.0,
                "fat_g": 5.0,
                "carbohydrate_g": 2.0,
            }
        ],
        "food_allergens": [],
        "disliked_foods": [],
    }
    headers = {
        "Authorization": f"Bearer {settings.ai_server_api_key}",
    }

    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            first = await client.post(
                "/recommend/diet/recipe",
                json=payload,
                headers=headers,
            )
            second = await client.post(
                "/recommend/diet/recipe",
                json=payload,
                headers=headers,
            )
            health = await client.get("/health/recipe")
    finally:
        MealRecipeService._resolve_recipe = original_resolve

    if first.status_code != 200 or second.status_code != 200:
        raise RuntimeError(
            "Recipe Router 응답 실패: "
            f"{first.status_code}, {second.status_code}"
        )

    if resolve_count != 1:
        raise RuntimeError(
            f"HTTP 요청 간 cache 재사용 실패: {resolve_count}회 호출"
        )

    if health.status_code != 200:
        raise RuntimeError("Recipe health endpoint 호출에 실패했습니다.")

    health_payload = health.json()["recipe_pipeline"]

    if health_payload["cache"]["cache_entries"] < 1:
        raise RuntimeError("Recipe health에 cache 상태가 반영되지 않았습니다.")

    if "circuit_open" not in health_payload["official_recipe_api"]:
        raise RuntimeError("Recipe health에 circuit 상태가 없습니다.")

    first_item = first.json()["meal"]["items"][0]

    if first_item["recipe"]["ingredients"] != [
        {
            "name": "두부",
            "amount_g": 70.0,
        }
    ]:
        raise RuntimeError("Recipe Router Schema 결과가 손상되었습니다.")

    print("Recipe Router 요청 간 cache 테스트: OK")


if __name__ == "__main__":
    asyncio.run(main())
