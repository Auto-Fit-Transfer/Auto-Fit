from app.schemas.recommendation import (
    DietRecipeRequest,
    DietRecipeResponse,
)
from app.services.meal_recipe_service import MealRecipeService


def test_recipe_detail_contains_frontend_display_data() -> None:
    service = object.__new__(MealRecipeService)
    items = [
        {
            "food_name": "그릭요거트(무가당)",
            "portion_g": 200.0,
            "calories_kcal": 240.0,
            "carbohydrate_g": 20.0,
            "protein_g": 20.0,
            "fat_g": 9.0,
            "recipe_available": True,
            "recipe_source": "official_exact",
            "official_recipe": True,
            "matched_recipe_name": "그릭요거트",
            "match_score": 1.0,
            "safety_checked": True,
            "restriction_matches": [],
            "recipe": {
                "recipe_id": "official-1",
                "menu_name": "그릭요거트",
                "serving_weight": 200.0,
                "servings": 1,
                "estimated_duration_minutes": 3.0,
                "ingredients_text": "그릭요거트 200g, 블루베리 50g",
                "ingredients": [
                    {"name": "그릭요거트", "amount_g": 200.0},
                    {"name": "블루베리", "amount_g": 50.0},
                ],
                "steps": ["그릭요거트를 그릇에 담습니다."],
                "source": "공식 레시피",
            },
        },
        {
            "food_name": "그래놀라와 호두",
            "portion_g": 40.0,
            "calories_kcal": 210.0,
            "carbohydrate_g": 25.0,
            "protein_g": 5.0,
            "fat_g": 10.0,
            "recipe_available": True,
            "recipe_source": "llm_generated",
            "official_recipe": False,
            "matched_recipe_name": None,
            "match_score": None,
            "safety_checked": True,
            "restriction_matches": [],
            "recipe": {
                "recipe_id": None,
                "menu_name": "그래놀라와 호두",
                "serving_weight": 40.0,
                "servings": 1,
                "estimated_duration_minutes": 2.0,
                "ingredients": [
                    {"name": "그래놀라", "amount_g": 30.0},
                    {"name": "호두", "amount_g": 10.0},
                ],
                "steps": [
                    {
                        "order": 1,
                        "instruction": "그래놀라와 호두를 올립니다.",
                        "duration_minutes": 2.0,
                        "tip": "먹기 직전에 올립니다.",
                    }
                ],
                "step_details": [
                    {
                        "order": 1,
                        "instruction": "그래놀라와 호두를 올립니다.",
                        "duration_minutes": 2.0,
                        "tip": "먹기 직전에 올립니다.",
                    }
                ],
                "source": "Auto-Fit AI 생성 조리법",
            },
        },
    ]
    meal = service._build_meal_display_fields(
        meal={
            "day": "monday",
            "meal_type": "snack",
            "menu_name": "그릭요거트 볼",
            "menu_description": "블루베리와 호두를 올린 간식입니다.",
            "guidance": "공식 영양정보를 기준으로 구성했습니다.",
            "tags": ["가벼운 간식", "불 없이"],
            "personalization_reasons": [
                "저장된 사용자 식단 목표를 반영했습니다."
            ],
            "servings": 1,
            "daily_nutrition_target": {
                "calories_kcal": 1800.0,
                "carbohydrate_g": 200.0,
                "protein_g": 100.0,
                "fat_g": 70.0,
            },
            "related_menus": [
                {
                    "menu_name": "닭가슴살 구이",
                    "day": "tuesday",
                    "meal_type": "lunch",
                    "estimated_calories_kcal": 420.0,
                }
            ],
        },
        items=items,
    )

    response = DietRecipeResponse.model_validate(
        {
            "ok": True,
            "generator": "auto-fit-ai",
            "meal": meal,
        }
    )
    payload = response.model_dump()

    assert payload["meal"]["menu_name"] == "그릭요거트 볼"
    assert payload["meal"]["estimated_calories_kcal"] == 450.0
    assert payload["meal"]["nutrition"] == {
        "carbohydrate_g": 45.0,
        "protein_g": 25.0,
        "fat_g": 19.0,
    }
    assert payload["meal"]["daily_target_percentages"] == {
        "calories_percent": 25.0,
        "carbohydrate_percent": 22.5,
        "protein_percent": 25.0,
        "fat_percent": 27.1,
    }
    assert payload["meal"]["estimated_duration_minutes"] == 5.0
    assert payload["meal"]["tags"] == [
        "가벼운 간식",
        "불 없이",
        "간식",
        "고단백",
    ]
    assert payload["meal"]["allergen_notice"] == ["우유", "호두"]
    assert len(payload["meal"]["personalization_reasons"]) == 2
    assert payload["meal"]["items"][0]["recipe"]["steps"][0] == (
        "그릭요거트를 그릇에 담습니다."
    )
    assert payload["meal"]["items"][0]["recipe"]["step_details"][0] == {
        "order": 1,
        "instruction": "그릭요거트를 그릇에 담습니다.",
        "duration_minutes": None,
        "tip": None,
    }
    assert payload["meal"]["items"][1]["recipe"]["steps"] == [
        "그래놀라와 호두를 올립니다."
    ]
    assert payload["meal"]["items"][1]["recipe"]["step_details"][0][
        "duration_minutes"
    ] == 2.0
    assert payload["meal"]["related_menus"][0]["menu_name"] == (
        "닭가슴살 구이"
    )
    assert "shopping_list" not in payload["meal"]
    assert "add_to_shopping_list" not in payload["meal"]


def test_recipe_detail_legacy_request_defaults_remain_valid() -> None:
    response = DietRecipeResponse.model_validate(
        {
            "ok": True,
            "generator": "auto-fit-ai",
            "meal": {
                "items": [
                    {
                        "food_name": "두부",
                        "portion_g": 100.0,
                        "calories_kcal": 90.0,
                        "carbohydrate_g": 3.0,
                        "protein_g": 9.0,
                        "fat_g": 5.0,
                        "recipe_available": False,
                        "recipe_source": "unavailable",
                        "official_recipe": False,
                        "matched_recipe_name": None,
                        "match_score": None,
                        "safety_checked": True,
                        "restriction_matches": [],
                        "recipe": None,
                    }
                ]
            },
        }
    )

    assert response.meal.servings == 1
    assert response.meal.tags == []
    assert response.meal.related_menus == []


def test_recipe_detail_request_accepts_saved_weekly_meal_context() -> None:
    request = DietRecipeRequest.model_validate(
        {
            "day": "sunday",
            "meal_type": "dinner",
            "menu_name": "연어 현미밥",
            "menu_description": "연어와 현미밥으로 구성한 저녁입니다.",
            "guidance": "저장된 단백질 목표를 반영했습니다.",
            "tags": ["저녁", "고단백"],
            "personalization_reasons": [
                "저장된 사용자 목표를 반영했습니다."
            ],
            "servings": 1,
            "daily_nutrition_target": {
                "calories_kcal": 2000.0,
                "protein_g": 110.0,
                "fat_g": 65.0,
                "carbohydrate_g": 250.0,
            },
            "related_menus": [
                {
                    "menu_name": "두부 현미밥",
                    "day": "monday",
                    "meal_type": "dinner",
                    "estimated_calories_kcal": 510.0,
                }
            ],
            "items": [
                {
                    "food_name": "연어구이",
                    "portion_g": 120.0,
                    "calories_kcal": 250.0,
                    "protein_g": 27.0,
                    "fat_g": 15.0,
                    "carbohydrate_g": 0.0,
                }
            ],
            "food_allergens": [],
            "disliked_foods": [],
        }
    )

    payload = request.model_dump()
    assert payload["day"] == "sunday"
    assert payload["meal_type"] == "dinner"
    assert payload["daily_nutrition_target"]["protein_g"] == 110.0
    assert payload["related_menus"][0]["day"] == "monday"
    assert "shopping_list" not in payload
    assert "add_to_shopping_list" not in payload
