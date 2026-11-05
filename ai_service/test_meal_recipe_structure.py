# -*- coding: utf-8 -*-

import asyncio
from types import SimpleNamespace

from pydantic import ValidationError

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
        self.queries: list[str] = []

    async def search_recipes_by_name(
        self,
        menu_name: str,
        start_idx: int = 1,
        end_idx: int = 100,
    ) -> list[dict]:
        del start_idx, end_idx
        self.queries.append(menu_name)
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
        self.inputs: list[dict] = []

    async def parse(
        self,
        **kwargs,
    ) -> SimpleNamespace:
        self.inputs.append(kwargs)
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
                "대파 1개, 간장 1큰술, 후추 약간, 빈 중량 0g"
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
        {
            "name": "빈 중량",
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

    if service.recipe_service.queries != [
        "톳나물 두부"
    ]:
        raise RuntimeError(
            "검증된 공식 유사 Recipe 이후에도 "
            "불필요한 API 검색이 계속됐습니다: "
            f"{service.recipe_service.queries}"
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


async def test_official_exact_pipeline() -> None:
    service = make_service()
    service.recipe_service = FakeRecipeService(
        [
            {
                "recipe_id": "exact-brown-rice",
                "menu_name": "현미밥",
                "ingredients_text": "현미 100g, 물 120g",
                "steps": ["현미밥을 짓는다."],
            },
            {
                "recipe_id": "unsafe-radish-brown-rice",
                "menu_name": "무 현미밥",
                "ingredients_text": "현미 100g, 무 30g",
                "steps": ["무 현미밥을 짓는다."],
            },
        ]
    )

    official = await service.find_official_recipe(
        food_name="현미밥",
        allergies=[],
        disliked_foods=[],
    )

    if official is None:
        raise RuntimeError("공식 exact Recipe를 찾지 못했습니다.")

    if official["match_type"] != "official_exact":
        raise RuntimeError(
            f"공식 exact 판정이 손상됐습니다: {official}"
        )

    if official["recipe"]["menu_name"] != "현미밥":
        raise RuntimeError(
            "접두 재료가 추가된 후보가 exact보다 우선됐습니다."
        )

    if service.recipe_service.queries != ["현미밥"]:
        raise RuntimeError(
            "공식 exact 이후 불필요한 검색이 계속됐습니다: "
            f"{service.recipe_service.queries}"
        )


async def test_unsafe_containment_matches_are_rejected() -> None:
    cases = [
        (
            "그릭요거트",
            "당근&그릭요거트 케이크",
            "당근 50g, 그릭요거트 100g",
        ),
        (
            "현미밥",
            "무 현미밥",
            "현미 100g, 무 30g",
        ),
        (
            "비빔밥",
            "채소비빔밥",
            "쌀 100g, 채소 50g, 바지락 20g",
        ),
        (
            "김치찌개",
            "완자김치찌개",
            "김치 100g, 완자 50g",
        ),
        (
            "된장찌개",
            "부대된장찌개",
            "된장 20g, 햄 50g",
        ),
        (
            "닭가슴살 샐러드",
            "퀴노아닭가슴살샐러드",
            "닭가슴살 100g, 퀴노아 30g",
        ),
        (
            "닭가슴살 샐러드",
            "닭가슴살샐러드무침",
            "닭가슴살 100g, 채소 50g",
        ),
    ]

    for source_name, recipe_name, ingredients_text in cases:
        service = make_service()
        service.recipe_service = FakeRecipeService(
            [
                {
                    "recipe_id": recipe_name,
                    "menu_name": recipe_name,
                    "ingredients_text": ingredients_text,
                    "steps": ["조리한다."],
                }
            ]
        )

        official = await service.find_official_recipe(
            food_name=source_name,
            allergies=[],
            disliked_foods=[],
        )

        if official is not None:
            raise RuntimeError(
                "다른 음식이 공식 유사 Recipe로 연결됐습니다: "
                f"{source_name} -> {recipe_name}"
            )

        if len(service.recipe_service.queries) > (
            service.OFFICIAL_SEARCH_QUERY_LIMIT
        ):
            raise RuntimeError(
                "공식 Recipe 검색 횟수 제한을 초과했습니다: "
                f"{service.recipe_service.queries}"
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


def test_llm_ingredient_rejects_zero_grams() -> None:
    try:
        GeneratedRecipeIngredient(
            name="면보",
            amount_g=0,
        )
    except ValidationError:
        return

    raise RuntimeError(
        "LLM recipe 재료의 0g 값이 허용되었습니다."
    )


async def test_ready_to_serve_recipe_retries_manufacturing_result() -> None:
    service = make_service()
    fake_responses = FakeResponses(
        [
            GeneratedRecipeResponse(
                ingredients=[
                    GeneratedRecipeIngredient(
                        name="우유",
                        amount_g=200.0,
                    ),
                    GeneratedRecipeIngredient(
                        name="체 또는 면보",
                        amount_g=1.0,
                    ),
                ],
                steps=[
                    "우유를 데운다.",
                    "유산균을 넣는다.",
                    "발효한다.",
                    "면보에 붓는다.",
                    "유청을 뺀다.",
                ],
            ),
            GeneratedRecipeResponse(
                ingredients=[
                    GeneratedRecipeIngredient(
                        name="그릭요거트",
                        amount_g=150.0,
                    ),
                ],
                steps=[
                    "그릭요거트를 그릇에 담아 제공한다.",
                ],
                estimated_duration_minutes=1.0,
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
            "food_name": "그릭요거트",
            "portion_g": 150.0,
            "calories_kcal": 120.0,
            "protein_g": 10.0,
            "fat_g": 4.0,
            "carbohydrate_g": 8.0,
        },
        allergies=[],
        disliked_foods=[],
    )

    if fake_responses.call_count != 2:
        raise RuntimeError(
            "완제품 제조형 레시피가 재생성되지 않았습니다."
        )

    if "이미 완성된 상태" not in fake_responses.inputs[0]["input"]:
        raise RuntimeError(
            "완제품 식품 전용 prompt가 적용되지 않았습니다."
        )

    if "조리 도구가 재료 목록에 포함됨" not in fake_responses.inputs[1]["input"]:
        raise RuntimeError(
            "레시피 품질 거부 사유가 재시도에 반영되지 않았습니다."
        )

    if result["recipe_source"] != "llm_generated":
        raise RuntimeError(
            "완제품 레시피 재시도 결과가 반환되지 않았습니다."
        )

    if result["recipe"]["ingredients"] != [
        {
            "name": "그릭요거트",
            "amount_g": 150.0,
        }
    ]:
        raise RuntimeError(
            "완제품 레시피 재료 구조가 올바르지 않습니다."
        )


async def main() -> None:
    test_similarity_and_official_ingredients()
    test_llm_ingredient_rejects_zero_grams()
    await test_official_similar_pipeline()
    await test_official_exact_pipeline()
    await test_unsafe_containment_matches_are_rejected()
    await test_cache_separates_portions()
    await test_llm_safety_retry_and_structure()
    await test_ready_to_serve_recipe_retries_manufacturing_result()
    print(
        "Meal Recipe 구조 및 안전성 테스트: OK"
    )


if __name__ == "__main__":
    asyncio.run(
        main()
    )
