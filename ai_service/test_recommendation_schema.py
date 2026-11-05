from app.schemas.recommendation import (
    DietMeal,
    DietRecommendationRequest,
    ReplaceMealRequest,
)


def test_meal_nutrition_preserves_decimal_precision():
    meal = DietMeal(
        menu_name="precision fixture",
        estimated_calories_kcal=165.5,
        nutrition={
            "carbohydrate_g": 35.25,
            "protein_g": 3.5,
            "fat_g": 1.25,
        },
        items=[
            {
                "food_name": "fixture item",
                "portion_g": 100.25,
                "calories_kcal": 165.5,
                "carbohydrate_g": 35.25,
                "protein_g": 3.5,
                "fat_g": 1.25,
            }
        ],
    )

    assert meal.estimated_calories_kcal == 165.5
    assert meal.nutrition.carbohydrate_g == 35.25
    assert meal.nutrition.protein_g == 3.5
    assert meal.nutrition.fat_g == 1.25


def test_meal_requires_verified_food_items():
    payload = {
        "menu_name": "missing items fixture",
        "estimated_calories_kcal": 100.0,
        "nutrition": {
            "carbohydrate_g": 10.0,
            "protein_g": 5.0,
            "fat_g": 2.0,
        },
    }

    try:
        DietMeal.model_validate(payload)
    except ValueError:
        pass
    else:
        raise RuntimeError(
            "최종 Meal이 items 없이 검증되었습니다."
        )

    try:
        DietMeal.model_validate(
            {
                **payload,
                "items": [],
            }
        )
    except ValueError:
        pass
    else:
        raise RuntimeError(
            "최종 Meal이 빈 items로 검증되었습니다."
        )


def test_food_item_requires_complete_finite_nutrition():
    valid_item = {
        "food_name": "fixture item",
        "portion_g": 100.25,
        "calories_kcal": 165.5,
        "carbohydrate_g": 35.25,
        "protein_g": 3.5,
        "fat_g": 1.25,
    }

    invalid_items = [
        {
            key: value
            for key, value in valid_item.items()
            if key != "protein_g"
        },
        {
            **valid_item,
            "portion_g": 0,
        },
        {
            **valid_item,
            "calories_kcal": float("inf"),
        },
    ]

    for invalid_item in invalid_items:
        try:
            DietMeal.model_validate(
                {
                    "menu_name": "invalid item fixture",
                    "estimated_calories_kcal": 165.5,
                    "nutrition": {
                        "carbohydrate_g": 35.25,
                        "protein_g": 3.5,
                        "fat_g": 1.25,
                    },
                    "items": [invalid_item],
                }
            )
        except ValueError:
            continue

        raise RuntimeError(
            "불완전하거나 유한하지 않은 Food item이 검증되었습니다."
        )


def test_meal_target_requires_positive_values():
    for key in (
        "calories_kcal",
        "protein_g",
        "fat_g",
        "carbohydrate_g",
    ):
        target = {
            "calories_kcal": 500.0,
            "protein_g": 30.0,
            "fat_g": 15.0,
            "carbohydrate_g": 60.0,
        }
        target[key] = 0

        try:
            DietRecommendationRequest(
                meal_target=target
            )
        except ValueError:
            continue

        raise RuntimeError(
            f"meal_target.{key}=0이 검증되었습니다."
        )


def main():

    test_meal_nutrition_preserves_decimal_precision()
    test_meal_requires_verified_food_items()
    test_food_item_requires_complete_finite_nutrition()
    test_meal_target_requires_positive_values()

    request = DietRecommendationRequest(
        metric_statuses={
            "blood_pressure": "high",
            "glucose": "normal",
            "lipid": "caution",
            "obesity": "normal",
        },
        food_allergens=[
            "계란",
        ],
        disliked_foods=[
            "버섯",
        ],
        goal_type="general_health",
        additional_input=None,
        sido="경상북도",
        sigungu="영양군",
        nearby_regions=[
            {
                "sido": "경상북도",
                "sigungu": "청송군",
                "distance_km": 28.5,
            }
        ],
        meal_target={
            "calories_kcal": 500,
            "protein_g": 30,
            "fat_g": 15,
            "carbohydrate_g": 60,
        },
    )

    payload = request.model_dump()

    print("=" * 80)
    print("DietRecommendationRequest")
    print(payload)

    if "refrigerator_ingredients" in payload:
        raise RuntimeError(
            "주간 식단 요청에 냉장고 필드가 남아 있습니다."
        )

    if payload["disliked_foods"] != [
        "버섯"
    ]:
        raise RuntimeError(
            "기피 음식 필드가 정상 동작하지 않습니다."
        )

    replace = ReplaceMealRequest(
        metric_statuses={
            "blood_pressure": "high",
        },
        target_day="monday",
        target_meal="lunch",
        current_menu_name="황태구이 + 혼합잡곡밥",
        current_ingredients=[
            "황태",
            "혼합잡곡",
        ],
        food_allergens=[],
        disliked_foods=[],
        goal_type="general_health",
        sido="경상북도",
        sigungu="영양군",
        nearby_regions=[],
        meal_target={
            "calories_kcal": 500,
            "protein_g": 30,
            "fat_g": 15,
            "carbohydrate_g": 60,
        },
    )

    replace_payload = (
        replace.model_dump()
    )

    print()
    print("=" * 80)
    print("ReplaceMealRequest")
    print(
        replace_payload
    )

    if (
        "refrigerator_ingredients"
        in replace_payload
    ):
        raise RuntimeError(
            "재추천 요청에 냉장고 필드가 남아 있습니다."
        )

    if replace_payload[
        "current_ingredients"
    ] != [
        "황태",
        "혼합잡곡",
    ]:
        raise RuntimeError(
            "current_ingredients가 손상되었습니다."
        )

    print()
    print("=" * 80)
    print(
        "recommendation schema 테스트: OK"
    )


if __name__ == "__main__":
    main()
