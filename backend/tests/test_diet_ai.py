import asyncio
import json
import logging
from datetime import date

import pytest

from backend.app.diet_ai import (
    DietAIUnavailable,
    build_catalog_meals,
    conflicts_allergy,
    daily_ai_meal_count,
    find_used_inventory_items,
    find_used_inventory_names,
    food_matches_inventory,
    generate_ai_meals,
    generate_regenerated_meal,
    mix_meals,
    select_ai_slots,
)


BASE_MEALS = [
    {"meal_type": meal_type, "meal_order": index, "recommended_calories": 400, "foods": []}
    for index, meal_type in enumerate(("breakfast", "lunch", "dinner", "snack"), 1)
]


@pytest.mark.parametrize(
    ("food_name", "allergy_name"),
    [
        ("계란말이", "달걀"),
        ("새우볶음밥", "갑각류"),
        ("식빵", "밀"),
        ("크림 파스타", "wheat"),
    ],
)
def test_allergy_aliases_block_common_menu_synonyms(
    food_name: str, allergy_name: str
) -> None:
    assert conflicts_allergy(food_name, [allergy_name]) is True


@pytest.mark.parametrize(
    ("food_name", "inventory_name"),
    [
        ("계란말이", "달걀"),
        ("삶은 달걀", "계란"),
        ("그릭요거트", "요구르트"),
    ],
)
def test_inventory_matching_supports_common_food_synonyms(
    food_name: str, inventory_name: str
) -> None:
    assert food_matches_inventory(food_name, [inventory_name]) is True


def test_daily_ai_slots_always_select_two_meals() -> None:
    target_date = date(2026, 9, 28)
    for user_number in range(20):
        user_id = f"user-{user_number}"
        count = daily_ai_meal_count(user_id, target_date)
        slots = select_ai_slots(BASE_MEALS, user_id, target_date)
        assert count == 2
        assert len(slots) == count
        assert len({slot["meal_order"] for slot in slots}) == count


def test_generate_ai_meals_accepts_only_requested_slots() -> None:
    slots = BASE_MEALS[:2]

    async def fake_model(prompt: str) -> str:
        assert "user_id" not in prompt
        assert "두부" not in prompt
        assert "excluded_allergens" not in prompt
        slot = json.loads(prompt.rsplit("\n", 1)[-1])["slot"]
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "AI 추천",
                        "foods": [
                            {
                                "food_name": f"채소 비빔밥 {slot['meal_order']}",
                                "quantity": 300,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 60,
                                "protein": 18,
                                "fat": 10,
                            }
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        )

    meals = asyncio.run(generate_ai_meals(slots, ["우유"], fake_model))

    assert len(meals) == 2
    assert {meal["source_type"] for meal in meals} == {"ai_generated"}
    assert all(meal["recommended_calories"] == 400 for meal in meals)


def test_generate_ai_meals_retries_with_calorie_feedback() -> None:
    attempts = 0

    async def fake_model(prompt: str) -> str:
        nonlocal attempts
        attempts += 1
        payload = json.loads(prompt.rsplit("\n", 1)[-1])
        slot = payload["slot"]
        assert slot["minimum_calories"] == 340
        assert slot["maximum_calories"] == 460
        if attempts == 1:
            assert payload["retry_feedback"] is None
            calories = 500
        else:
            assert payload["retry_feedback"] == {
                "reason": "calorie_target_miss",
                "actual_total_calories": 500,
                "allowed_minimum_calories": 340,
                "allowed_maximum_calories": 460,
            }
            calories = 400
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "열량 조정 식단",
                        "foods": [
                            {
                                "food_name": "채소 덮밥",
                                "quantity": 300,
                                "unit": "g",
                                "calories": calories,
                                "carbohydrates": 60,
                                "protein": 20,
                                "fat": 10,
                            }
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        )

    meals = asyncio.run(generate_ai_meals(BASE_MEALS[:1], [], fake_model))

    assert attempts == 2
    assert meals[0]["recommended_calories"] == 400


def test_generate_ai_meals_rejects_changed_slots() -> None:
    async def fake_model(prompt: str) -> str:
        return '{"meals": []}'

    with pytest.raises(DietAIUnavailable):
        asyncio.run(generate_ai_meals(BASE_MEALS[:2], [], fake_model))


def test_generate_regenerated_meal_passes_deidentified_inventory() -> None:
    current = {
        "meal_type": "breakfast",
        "meal_order": 1,
        "recommended_calories": 400,
        "foods": [{"food_name": "기존 아침"}],
    }

    async def fake_model(prompt: str) -> str:
        payload = json.loads(prompt.rsplit("\n", 1)[-1])
        assert payload["available_ingredients"] == ["두부"]
        assert payload["avoid_food_names"] == ["기존아침"]
        assert "inventory-1" not in prompt
        assert '"quantity": 1' not in prompt
        slot = payload["slot"]
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "냉장고 두부 활용",
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
            "planned_quantity": 200,
            "planned_unit": "g",
            "inventory_covers_planned_quantity": None,
        }
    ]


def test_generate_regenerated_meal_rejects_inventory_free_results(caplog) -> None:
    current = {
        "meal_type": "breakfast",
        "meal_order": 1,
        "recommended_calories": 400,
        "foods": [{"food_name": "현미밥"}],
    }
    attempts = 0

    async def fake_model(prompt: str) -> str:
        nonlocal attempts
        attempts += 1
        slot = json.loads(prompt.rsplit("\n", 1)[-1])["slot"]
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "냉장고 미사용",
                        "foods": [
                            {
                                "food_name": "닭가슴살 샐러드",
                                "quantity": 300,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 20,
                                "protein": 40,
                                "fat": 15,
                            }
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        )

    caplog.set_level(logging.INFO, logger="uvicorn.error")
    with pytest.raises(DietAIUnavailable):
        asyncio.run(generate_regenerated_meal(current, [], fake_model, ["두부"]))
    assert attempts == 3
    assert caplog.text.count('"reason":"inventory_not_used"') == 3
    assert '"reason":"attempts_exhausted"' in caplog.text
    assert "두부" not in caplog.text
    assert "닭가슴살" not in caplog.text


def test_used_inventory_reports_quantity_coverage_for_comparable_units() -> None:
    used = find_used_inventory_items(
        [
            {
                "foods": [
                    {"food_name": "현미밥", "quantity": 150, "unit": "g"}
                ]
            }
        ],
        [
            {
                "user_food_inventory_id": "inventory-2",
                "custom_name": "현미밥",
                "quantity": 100,
                "unit": "그램",
            }
        ],
    )

    assert used[0]["inventory_covers_planned_quantity"] is False


def test_generate_ai_meals_selects_safe_candidate_per_slot() -> None:
    slots = BASE_MEALS[:2]
    attempts: dict[int, int] = {}

    async def fake_model(prompt: str) -> str:
        slot = json.loads(prompt.rsplit("\n", 1)[-1])["slot"]
        order = slot["meal_order"]
        attempts[order] = attempts.get(order, 0) + 1
        food_name = (
            "우유 오트밀"
            if attempts[order] == 1
            else f"채소 비빔밥 {order}"
        )
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": order,
                        "recommendation_note": "AI 추천",
                        "foods": [
                            {
                                "food_name": food_name,
                                "quantity": 300,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 60,
                                "protein": 18,
                                "fat": 10,
                            }
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        )

    meals = asyncio.run(generate_ai_meals(slots, ["우유"], fake_model))

    assert len(meals) == 2
    assert [meal["foods"][0]["food_name"] for meal in meals] == [
        "채소 비빔밥 1",
        "채소 비빔밥 2",
    ]
    assert attempts == {1: 2, 2: 2}


def test_generate_ai_meals_retries_repeated_representative_food() -> None:
    slots = BASE_MEALS[:2]
    attempts: dict[int, int] = {}

    async def fake_model(prompt: str) -> str:
        payload = json.loads(prompt.rsplit("\n", 1)[-1])
        slot = payload["slot"]
        order = slot["meal_order"]
        attempts[order] = attempts.get(order, 0) + 1
        food_name = (
            "채소 비빔밥"
            if order == 1 or attempts[order] == 1
            else "닭가슴살 포케"
        )
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": order,
                        "recommendation_note": "AI 추천",
                        "foods": [
                            {
                                "food_name": food_name,
                                "quantity": 300,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 60,
                                "protein": 18,
                                "fat": 10,
                            }
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        )

    meals = asyncio.run(generate_ai_meals(slots, [], fake_model))

    assert [meal["foods"][0]["food_name"] for meal in meals] == [
        "채소 비빔밥",
        "닭가슴살 포케",
    ]
    assert attempts == {1: 1, 2: 2}


def test_generate_ai_meals_avoids_previous_representative_food() -> None:
    attempts = 0

    async def fake_model(prompt: str) -> str:
        nonlocal attempts
        payload = json.loads(prompt.rsplit("\n", 1)[-1])
        attempts += 1
        assert "이전식단" in payload["avoid_food_names"]
        food_name = "이전 식단" if attempts == 1 else "새로운 포케"
        slot = payload["slot"]
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "AI 추천",
                        "foods": [
                            {
                                "food_name": food_name,
                                "quantity": 300,
                                "unit": "g",
                                "calories": 400,
                                "carbohydrates": 60,
                                "protein": 18,
                                "fat": 10,
                            }
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        )

    meals = asyncio.run(
        generate_ai_meals(
            BASE_MEALS[:1],
            [],
            fake_model,
            avoid_food_names=["이전 식단"],
        )
    )

    assert meals[0]["foods"][0]["food_name"] == "새로운 포케"
    assert attempts == 2


def test_generate_ai_meals_retries_reordered_previous_composition() -> None:
    attempts = 0

    async def fake_model(prompt: str) -> str:
        nonlocal attempts
        attempts += 1
        slot = json.loads(prompt.rsplit("\n", 1)[-1])["slot"]
        names = ["브로콜리", "현미밥"] if attempts == 1 else ["고구마", "닭가슴살"]
        return json.dumps(
            {"meals": [{
                "meal_type": slot["meal_type"],
                "meal_order": slot["meal_order"],
                "recommendation_note": "AI 추천",
                "foods": [{
                    "food_name": name, "quantity": 150, "unit": "g",
                    "calories": 200, "carbohydrates": 25, "protein": 15, "fat": 5,
                } for name in names],
            }]},
            ensure_ascii=False,
        )

    meals = asyncio.run(generate_ai_meals(
        BASE_MEALS[:1], [], fake_model,
        avoid_meal_food_names=[["현미밥", "브로콜리"]],
    ))

    assert [food["food_name"] for food in meals[0]["foods"]] == ["고구마", "닭가슴살"]
    assert attempts == 2


def test_mix_meals_keeps_db_catalog_remainder() -> None:
    ai_meals = [
        {
            **BASE_MEALS[index],
            "source_type": "ai_generated",
            "recommendation_note": "AI 추천",
            "foods": [{"food_name": "AI 메뉴", "calories": 400}],
        }
        for index in range(2)
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

    assert [meal["source_type"] for meal in mixed].count("ai_generated") == 2
    assert [meal["source_type"] for meal in mixed].count("db_catalog") == 2
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
    assert find_used_inventory_names(meals, ["브로콜리"]) == ["브로콜리"]
