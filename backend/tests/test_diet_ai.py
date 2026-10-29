import asyncio
import json
from datetime import date

import pytest

from backend.app.diet_ai import (
    DietAIUnavailable,
    build_catalog_meals,
    daily_ai_meal_count,
    find_used_inventory_items,
    find_used_inventory_names,
    generate_ai_meals,
    generate_regenerated_meal,
    mix_meals,
    select_ai_slots,
)


BASE_MEALS = [
    {"meal_type": meal_type, "meal_order": index, "recommended_calories": 400, "foods": []}
    for index, meal_type in enumerate(("breakfast", "lunch", "dinner", "snack"), 1)
]


def test_daily_ai_slots_always_select_two_or_three_meals() -> None:
    target_date = date(2026, 9, 28)
    for user_number in range(20):
        user_id = f"user-{user_number}"
        count = daily_ai_meal_count(user_id, target_date)
        slots = select_ai_slots(BASE_MEALS, user_id, target_date)
        assert count in (2, 3)
        assert len(slots) == count
        assert len({slot["meal_order"] for slot in slots}) == count


def test_generate_ai_meals_accepts_only_requested_slots() -> None:
    slots = BASE_MEALS[:2]

    async def fake_model(prompt: str) -> str:
        assert "user_id" not in prompt
        assert "excluded_allergens" not in prompt
        assert '"available_ingredients": []' in prompt
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "AI 추천",
                        "foods": [
                            {
                                "food_name": "채소 비빔밥",
                                "quantity": 300,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 60,
                                "protein": 18,
                                "fat": 10,
                            }
                        ],
                    }
                    for slot in slots
                ]
            },
            ensure_ascii=False,
        )

    meals = asyncio.run(generate_ai_meals(slots, ["우유"], fake_model))

    assert len(meals) == 2
    assert {meal["source_type"] for meal in meals} == {"ai_generated"}
    assert all(meal["recommended_calories"] == 400 for meal in meals)


def test_generate_ai_meals_passes_deidentified_inventory_to_model() -> None:
    slots = BASE_MEALS[:2]

    async def fake_model(prompt: str) -> str:
        assert "브로콜리" in prompt
        assert "user_id" not in prompt
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "냉장고 활용",
                        "foods": [
                            {
                                "food_name": "브로콜리 비빔밥",
                                "quantity": 300,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 60,
                                "protein": 18,
                                "fat": 10,
                            }
                        ],
                    }
                    for slot in slots
                ]
            },
            ensure_ascii=False,
        )

    meals = asyncio.run(
        generate_ai_meals(slots, [], fake_model, ["브로콜리"])
    )

    assert find_used_inventory_names(meals, ["브로콜리"]) == ["브로콜리"]


def test_generate_regenerated_meal_uses_inventory_and_changes_representative() -> None:
    current = {
        "meal_type": "breakfast",
        "meal_order": 1,
        "recommended_calories": 400,
        "foods": [{"food_name": "기존 아침"}],
    }

    async def fake_model(prompt: str) -> str:
        assert '"available_ingredients": ["두부"]' in prompt
        assert '"excluded_representative_foods": ["기존 아침"]' in prompt
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": "breakfast",
                        "meal_order": 1,
                        "recommendation_note": "냉장고 두부를 활용한 AI 재추천",
                        "foods": [
                            {
                                "food_name": "두부구이",
                                "quantity": 200,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 20,
                                "protein": 30,
                                "fat": 20,
                            }
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        )

    meal = asyncio.run(
        generate_regenerated_meal(current, [], fake_model, ["두부"])
    )
    used = find_used_inventory_items(
        [meal],
        [
            {
                "user_food_inventory_id": "inventory-1",
                "custom_name": "두부",
                "quantity": 1,
                "unit": "모",
            }
        ],
    )

    assert meal["source_type"] == "ai_generated"
    assert used == [
        {
            "user_food_inventory_id": "inventory-1",
            "name": "두부",
            "matched_food_name": "두부구이",
            "quantity": 1,
            "unit": "모",
        }
    ]


def test_generate_regenerated_meal_rejects_same_representative() -> None:
    current = {
        "meal_type": "breakfast",
        "meal_order": 1,
        "recommended_calories": 400,
        "foods": [{"food_name": "현미밥"}],
    }

    async def fake_model(prompt: str) -> str:
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": "breakfast",
                        "meal_order": 1,
                        "recommendation_note": "동일 메뉴",
                        "foods": [
                            {
                                "food_name": "현미밥",
                                "quantity": 200,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 70,
                                "protein": 8,
                                "fat": 4,
                            }
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        )

    with pytest.raises(DietAIUnavailable, match="repeated"):
        asyncio.run(generate_regenerated_meal(current, [], fake_model))


def test_generate_ai_meals_rejects_changed_slots() -> None:
    async def fake_model(prompt: str) -> str:
        return '{"meals": []}'

    with pytest.raises(DietAIUnavailable):
        asyncio.run(generate_ai_meals(BASE_MEALS[:2], [], fake_model))


def test_mix_meals_keeps_db_catalog_remainder() -> None:
    ai_meals = [
        {
            **BASE_MEALS[index],
            "source_type": "ai_generated",
            "recommendation_note": "AI 추천",
            "foods": [{"food_name": "AI 메뉴", "calories": 400}],
        }
        for index in range(3)
    ]
    catalog = [
        {
            "food_item_id": "11111111-1111-4111-8111-111111111111",
            "name": "DB 현미밥",
            "serving_size": 100,
            "serving_unit": "g",
            "calories": 200,
            "carbohydrates": 40,
            "protein": 4,
            "fat": 1,
        }
    ]

    mixed = mix_meals(BASE_MEALS, ai_meals, catalog)

    assert [meal["source_type"] for meal in mixed].count("ai_generated") == 3
    assert [meal["source_type"] for meal in mixed].count("db_catalog") == 1
    assert mixed[-1]["foods"][0]["food_item_id"] == catalog[0]["food_item_id"]


def test_catalog_meals_require_usable_db_food() -> None:
    with pytest.raises(ValueError):
        build_catalog_meals(BASE_MEALS[-1:], [{"name": "열량없음", "calories": 0}])


def test_catalog_meals_exclude_dummy_source_and_name_marker() -> None:
    catalog = [
        {"name": "출처 더미 음식", "source_type": "dummy", "calories": 100},
        {"name": "[DUMMY 20260916] 현미밥", "source_type": "reference", "calories": 150},
        {"name": "정상 현미밥", "source_type": "reference", "calories": 200},
    ]

    meals = build_catalog_meals(BASE_MEALS[-1:], catalog)

    assert [food["food_name"] for food in meals[0]["foods"]] == ["정상 현미밥"]


def test_catalog_meals_prioritize_available_inventory() -> None:
    catalog = [
        {"food_item_id": "food-1", "name": "가나다 현미밥", "calories": 200},
        {"food_item_id": "food-2", "name": "브로콜리", "calories": 50},
    ]

    meals = build_catalog_meals(
        BASE_MEALS[-1:], catalog, inventory_names=["브로콜리"]
    )

    assert meals[0]["foods"][0]["food_name"] == "브로콜리"
