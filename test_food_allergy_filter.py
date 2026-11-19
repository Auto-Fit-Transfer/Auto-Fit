import pytest

from app.schemas.health_analysis import (
    DietContextInput,
    InventoryItemInput,
)
from app.services.diet_personalization_service import (
    prepare_diet_context,
)
from app.services.food_catalog_service import FoodCatalogService
from app.services.meal_recipe_service import MealRecipeService


UI_ALLERGY_CASES = [
    ("우유", "그릭요거트"),
    ("계란", "달걀스크램블"),
    ("땅콩", "피넛버터"),
    ("견과류", "아몬드샐러드"),
    ("밀(글루텐)", "통밀빵"),
    ("콩(대두)", "두부조림"),
    ("메밀", "소바"),
    ("갑각류", "새우볶음밥"),
    ("조개", "바지락국"),
    ("생선", "연어구이"),
    ("복숭아", "황도샐러드"),
    ("참깨", "참기름나물"),
]


CATALOG_ALIAS_CASES = [
    ("milk", "그릭요거트"),
    ("egg", "달걀스크램블"),
    ("eggs", "마요네즈샐러드"),
    ("peanut", "피넛버터"),
    ("nuts", "호두샐러드"),
    ("tree nuts", "캐슈샐러드"),
    ("wheat", "통밀빵"),
    ("gluten", "라면"),
    ("soybean", "두부조림"),
    ("soy", "두유"),
    ("buckwheat", "소바"),
    ("crab", "새우볶음밥"),
    ("crustacean", "랍스터구이"),
    ("shellfish", "바지락국"),
    ("clam", "가리비구이"),
    ("조개류", "전복죽"),
    ("fish", "참치샐러드"),
    ("peach", "황도샐러드"),
    ("sesame", "참기름나물"),
]


@pytest.mark.parametrize(
    ("allergy", "unsafe_name"),
    UI_ALLERGY_CASES,
)
def test_all_ui_allergy_choices_are_blocked_in_every_ai_path(
    allergy: str,
    unsafe_name: str,
) -> None:
    food_service = object.__new__(FoodCatalogService)
    recipe_service = object.__new__(MealRecipeService)
    unsafe_food = {
        "food_name": unsafe_name,
        "category": "",
        "subcategory": "",
    }
    safe_food = {
        "food_name": "닭가슴살구이",
        "category": "",
        "subcategory": "",
    }

    assert food_service.contains_user_allergy(
        unsafe_food,
        [allergy],
    ) is True
    assert food_service.filter_foods_for_user(
        foods=[unsafe_food, safe_food],
        allergies=[allergy],
        disliked_foods=[],
    ) == [safe_food]

    assert recipe_service.find_restriction_matches(
        text=unsafe_name,
        allergies=[allergy],
        disliked_foods=[],
    )

    prepared = prepare_diet_context(
        DietContextInput(
            inventory=[
                InventoryItemInput(
                    inventory_item_id="unsafe-item",
                    name=unsafe_name,
                ),
                InventoryItemInput(
                    inventory_item_id="safe-item",
                    name="닭가슴살구이",
                ),
            ],
            allergies=[allergy],
        )
    )
    assert [
        item.inventory_item_id
        for item in prepared.allergy_excluded_items
    ] == ["unsafe-item"]
    assert [
        item.inventory_item_id
        for item in prepared.available_items
    ] == ["safe-item"]


@pytest.mark.parametrize(
    ("catalog_name", "unsafe_name"),
    CATALOG_ALIAS_CASES,
)
def test_frontend_supported_catalog_aliases_are_normalized(
    catalog_name: str,
    unsafe_name: str,
) -> None:
    service = object.__new__(FoodCatalogService)

    assert service.contains_user_allergy(
        {
            "food_name": unsafe_name,
            "category": "",
            "subcategory": "",
        },
        [catalog_name],
    ) is True


def test_custom_allergy_keeps_direct_name_matching() -> None:
    service = object.__new__(FoodCatalogService)

    assert service.contains_user_allergy(
        {
            "food_name": "골드키위샐러드",
            "category": "",
            "subcategory": "",
        },
        ["키위"],
    ) is True
    assert service.contains_user_allergy(
        {
            "food_name": "바나나샐러드",
            "category": "",
            "subcategory": "",
        },
        ["키위"],
    ) is False
