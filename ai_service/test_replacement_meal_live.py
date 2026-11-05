import asyncio

from app.schemas.recommendation import ReplaceMealRequest
from app.services.diet_recommendation_service import (
    generate_replacement_meal,
)


async def main() -> None:
    request = ReplaceMealRequest(
        metric_statuses={
            "blood_pressure": "high",
            "glucose": "normal",
            "lipid": "caution",
            "obesity": "normal",
        },
        target_day="monday",
        target_meal="lunch",
        current_menu_name="톳나물 두부무침 + 혼합잡곡밥",
        excluded_menu_names=[
            "톳나물 두부무침 + 혼합잡곡밥",
        ],
        current_ingredients=[
            "톳나물",
            "두부",
            "혼합잡곡밥",
        ],
        food_allergens=["계란"],
        disliked_foods=["버섯"],
        goal_type="general_health",
        additional_input="짜지 않게",
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

    result = await generate_replacement_meal(
        request
    )

    if (
        result.meal.menu_name
        == request.current_menu_name
    ):
        raise RuntimeError(
            "현재 메뉴가 재추천 결과로 다시 선택되었습니다."
        )

    if not result.meal.items:
        raise RuntimeError(
            "공식 Food DB item이 응답에 없습니다."
        )

    if result.meal.ingredients is not None:
        raise RuntimeError(
            "Recipe Service 영역인 ingredients가 식단 응답에 포함되었습니다."
        )

    print(
        {
            "day": result.day,
            "meal_type": result.meal_type,
            "menu_name": result.meal.menu_name,
            "estimated_calories_kcal": (
                result.meal.estimated_calories_kcal
            ),
            "nutrition": (
                result.meal.nutrition.model_dump()
            ),
            "items": [
                item.model_dump()
                for item in result.meal.items
            ],
        }
    )
    print("재추천 실제 연동 테스트: OK")


if __name__ == "__main__":
    asyncio.run(main())
