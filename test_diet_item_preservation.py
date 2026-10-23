# -*- coding: utf-8 -*-

from app.schemas.recommendation import (
    DietRecipeRequest,
    DietRecommendationResponse,
    ReplaceMealLLMResponse,
)
from app.services.diet_recommendation_service import (
    _apply_verified_candidate_to_meal,
    _apply_verified_nutrition_to_response,
    _build_candidate_map,
    _compact_verified_candidate,
)


DAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def make_meal(
    menu_name: str,
    items: list[dict],
) -> dict:
    return {
        "menu_name": menu_name,
        "menu_description": "검증 메뉴 설명",
        "image_prompt": None,
        "estimated_calories_kcal": 1,
        "nutrition": {
            "carbohydrate_g": 1,
            "protein_g": 1,
            "fat_g": 1,
        },
        "items": items,
        "ingredients": None,
        "guidance": "검증 메뉴 안내",
    }


def main() -> None:
    raw_candidate = {
        "items": [
            {
                "food_name": "톳나물_두부",
                "portion_g": 70.0,
                "calories_kcal": 55.0,
                "protein_g": 4.0,
                "fat_g": 2.0,
                "carbohydrate_g": 7.0,
            },
            {
                "food_name": "현미밥",
                "portion_g": 150.0,
                "calories_kcal": 225.0,
                "protein_g": 4.5,
                "fat_g": 1.5,
                "carbohydrate_g": 48.0,
            },
        ],
        "totals": {
            "calories_kcal": 280.0,
            "protein_g": 8.5,
            "fat_g": 3.5,
            "carbohydrate_g": 55.0,
        },
        "final_score": 92.5,
        "matched_specialties": [],
    }

    candidate = _compact_verified_candidate(
        raw_candidate
    )

    expected_items = raw_candidate[
        "items"
    ]

    if candidate["items"] != expected_items:
        raise RuntimeError(
            "compact candidate에서 Food item 영양정보가 손실되었습니다."
        )

    replacement_meal = _apply_verified_candidate_to_meal(
        narrative=ReplaceMealLLMResponse(
            menu_description="검증 메뉴 설명",
            guidance="검증 메뉴 안내",
        ),
        candidate=candidate,
    )

    if replacement_meal.nutrition.model_dump() != {
        "carbohydrate_g": 55.0,
        "protein_g": 8.5,
        "fat_g": 3.5,
    }:
        raise RuntimeError(
            "재추천 Meal 조립 중 소수 영양값이 손실되었습니다."
        )

    menu_name = candidate[
        "menu_name"
    ]

    response = DietRecommendationResponse(
        summary="주간 식단",
        strategy="검증된 후보 사용",
        nutrition_balance={},
        weekly_plan=[
            {
                "day": day,
                "meals": {
                    "breakfast": make_meal(
                        menu_name,
                        expected_items,
                    ),
                    "lunch": make_meal(
                        menu_name,
                        expected_items,
                    ),
                    "dinner": make_meal(
                        menu_name,
                        expected_items,
                    ),
                    "snack": make_meal(
                        menu_name,
                        expected_items,
                    ),
                },
            }
            for day in DAYS
        ],
    )

    candidate_map = _build_candidate_map(
        [
            candidate
        ],
        [],
    )

    result = _apply_verified_nutrition_to_response(
        response=response,
        candidate_map=candidate_map,
    )

    reversed_payload = result.model_dump()
    reversed_payload["weekly_plan"] = list(
        reversed(
            reversed_payload["weekly_plan"]
        )
    )

    try:
        DietRecommendationResponse.model_validate(
            reversed_payload
        )
    except ValueError:
        pass
    else:
        raise RuntimeError(
            "역순 주간 식단이 최종 Schema 검증을 통과했습니다."
        )

    for day in result.weekly_plan:
        for meal_type in (
            "breakfast",
            "lunch",
            "dinner",
            "snack",
        ):
            meal = getattr(
                day.meals,
                meal_type,
            )

            dumped_items = [
                item.model_dump()
                for item in (
                    meal.items
                    or []
                )
            ]

            if dumped_items != expected_items:
                raise RuntimeError(
                    f"{day.day} {meal_type}: Food item이 보존되지 않았습니다."
                )

            if meal.estimated_calories_kcal != 280:
                raise RuntimeError(
                    f"{day.day} {meal_type}: 공식 calories가 적용되지 않았습니다."
                )

            if meal.nutrition.model_dump() != {
                "carbohydrate_g": 55.0,
                "protein_g": 8.5,
                "fat_g": 3.5,
            }:
                raise RuntimeError(
                    f"{day.day} {meal_type}: 공식 탄단지가 적용되지 않았습니다."
                )

    first_meal = (
        result.weekly_plan[0]
        .meals.breakfast
    )

    recipe_request = DietRecipeRequest(
        items=[
            item.model_dump()
            for item in (
                first_meal.items
                or []
            )
        ],
        food_allergens=[],
        disliked_foods=[],
    )

    if recipe_request.model_dump()[
        "items"
    ] != expected_items:
        raise RuntimeError(
            "주간 식단 item을 Recipe Request로 재사용할 수 없습니다."
        )

    print(
        "주간 식단 Food item 보존 테스트: OK"
    )


if __name__ == "__main__":
    main()
