# -*- coding: utf-8 -*-

import asyncio
from types import SimpleNamespace

from app.services.meal_recipe_service import (
    GeneratedRecipeIngredient,
    GeneratedRecipeResponse,
    MealRecipeService,
)


def make_service() -> MealRecipeService:
    """외부 API client를 만들지 않는 deterministic test service."""

    service = object.__new__(
        MealRecipeService
    )
    service._recipe_cache = {}
    service._inflight_tasks = {}
    return service


class FakeRecipeService:
    def __init__(
        self,
        recipes: list[dict],
    ) -> None:
        self.recipes = recipes

    async def search_recipes_by_name(
        self,
        menu_name: str,
        start_idx: int = 1,
        end_idx: int = 100,
    ) -> list[dict]:
        del menu_name, start_idx, end_idx
        return self.recipes


class FakeResponses:
    def __init__(
        self,
        generated: list[GeneratedRecipeResponse],
    ) -> None:
        self.generated = list(
            generated
        )
        self.call_count = 0

    async def parse(
        self,
        **kwargs,
    ) -> SimpleNamespace:
        del kwargs
        result = self.generated[
            self.call_count
        ]
        self.call_count += 1
        return SimpleNamespace(
            output_parsed=result
        )


def test_similarity_and_official_ingredients() -> None:
    service = make_service()

    similarity = (
        service.calculate_name_similarity(
            "톳나물_두부",
            "톳나물 두부무침",
        )
    )

    if round(
        similarity,
        4,
    ) != 0.9157:
        raise RuntimeError(
            f"official_similar 유사도 regression: {similarity}"
        )

    ingredients = (
        service.parse_ingredients_text(
            (
                "톳나물 15g, 두부 40 g, 천일염 100mg, "
                "대파 1개, 간장 1큰술, 후추 약간"
            ),
            scale_ratio=1.4,
        )
    )

    expected = [
        {
            "name": "톳나물",
            "amount_g": 21.0,
        },
        {
            "name": "두부",
            "amount_g": 56.0,
        },
        {
            "name": "천일염",
            "amount_g": 0.14,
        },
        {
            "name": "대파",
            "amount_g": None,
        },
        {
            "name": "간장",
            "amount_g": None,
        },
        {
            "name": "후추",
            "amount_g": None,
        },
    ]

    if ingredients != expected:
        raise RuntimeError(
            f"공식 재료 parsing/scaling regression: {ingredients}"
        )


async def test_official_similar_pipeline() -> None:
    service = make_service()
    service.recipe_service = FakeRecipeService(
        [
            {
                "recipe_id": "2975",
                "menu_name": "톳나물 두부무침",
                "serving_weight": 50.0,
                "ingredients_text": (
                    "톳나물 15g, 두부 40g, 천일염 0.1g"
                ),
                "steps": [
                    "톳나물을 손질한다.",
                    "두부와 함께 무친다.",
                ],
                "source": "식품의약품안전처 식품안전나라",
            }
        ]
    )

    official = await service.find_official_recipe(
        food_name="톳나물_두부",
        allergies=[],
        disliked_foods=[],
    )

    if official is None:
        raise RuntimeError(
            "톳나물_두부 공식 유사 레시피를 선택하지 못했습니다."
        )

    if official["match_type"] != "official_similar":
        raise RuntimeError(
            f"잘못된 공식 match type: {official['match_type']}"
        )

    if official["similarity"] != 0.9157:
        raise RuntimeError(
            f"잘못된 공식 match score: {official['similarity']}"
        )

    result = service.build_official_recipe_result(
        official,
        target_portion_g=70.0,
    )

    if result["recipe"]["ingredients"][:3] != [
        {
            "name": "톳나물",
            "amount_g": 21.0,
        },
        {
            "name": "두부",
            "amount_g": 56.0,
        },
        {
            "name": "천일염",
            "amount_g": 0.14,
        },
    ]:
        raise RuntimeError(
            "공식 recipe portion scaling이 잘못되었습니다."
        )


async def test_cache_separates_portions() -> None:
    service = make_service()
    resolve_count = 0

    async def fake_resolve_recipe(
        item: dict,
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> dict:
        nonlocal resolve_count
        del allergies, disliked_foods
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
                "serving_weight": item.get(
                    "portion_g"
                ),
            },
        }

    service._resolve_recipe = fake_resolve_recipe

    base_item = {
        "food_name": "두부구이",
        "calories_kcal": 100.0,
        "protein_g": 10.0,
        "fat_g": 5.0,
        "carbohydrate_g": 2.0,
    }

    first = await service.enrich_meal_item(
        item={
            **base_item,
            "portion_g": 70.0,
        }
    )
    cached = await service.enrich_meal_item(
        item={
            **base_item,
            "portion_g": 70,
        }
    )
    second_portion = await service.enrich_meal_item(
        item={
            **base_item,
            "portion_g": 100.0,
        }
    )

    if resolve_count != 2:
        raise RuntimeError(
            f"portion cache 분리 실패: resolve_count={resolve_count}"
        )

    if first["recipe"]["serving_weight"] != 70.0:
        raise RuntimeError(
            "70g recipe 결과가 손상되었습니다."
        )

    if cached["recipe"]["serving_weight"] != 70.0:
        raise RuntimeError(
            "동일 portion cache 재사용에 실패했습니다."
        )

    if second_portion["recipe"]["serving_weight"] != 100.0:
        raise RuntimeError(
            "상이한 portion이 이전 cache 결과를 재사용했습니다."
        )


async def test_llm_safety_retry_and_structure() -> None:
    service = make_service()

    fake_responses = FakeResponses(
        [
            GeneratedRecipeResponse(
                ingredients=[
                    GeneratedRecipeIngredient(
                        name="우유",
                        amount_g=30.0,
                    )
                ],
                steps=[
                    "우유를 넣는다."
                ],
            ),
            GeneratedRecipeResponse(
                ingredients=[
                    GeneratedRecipeIngredient(
                        name="두부",
                        amount_g=70.0,
                    ),
                    GeneratedRecipeIngredient(
                        name="소금",
                        amount_g=None,
                    ),
                ],
                steps=[
                    "두부를 굽는다."
                ],
            ),
        ]
    )

    service.settings = SimpleNamespace(
        openai_model="test-model"
    )
    service.openai_client = SimpleNamespace(
        responses=fake_responses
    )

    result = await service.generate_llm_recipe(
        item={
            "food_name": "두부구이",
            "portion_g": 70.0,
            "calories_kcal": 100.0,
            "protein_g": 10.0,
            "fat_g": 5.0,
            "carbohydrate_g": 2.0,
        },
        allergies=[
            "우유"
        ],
        disliked_foods=[],
    )

    if fake_responses.call_count != 2:
        raise RuntimeError(
            "LLM 안전성 실패 후 재생성이 수행되지 않았습니다."
        )

    if result["recipe_source"] != "llm_generated":
        raise RuntimeError(
            f"잘못된 LLM recipe source: {result['recipe_source']}"
        )

    if result["recipe"]["ingredients"] != [
        {
            "name": "두부",
            "amount_g": 70.0,
        },
        {
            "name": "소금",
            "amount_g": None,
        },
    ]:
        raise RuntimeError(
            "LLM recipe 재료 구조가 손상되었습니다."
        )


async def main() -> None:
    test_similarity_and_official_ingredients()
    await test_official_similar_pipeline()
    await test_cache_separates_portions()
    await test_llm_safety_retry_and_structure()
    print(
        "Meal Recipe 구조 및 안전성 테스트: OK"
    )


if __name__ == "__main__":
    asyncio.run(
        main()
    )
