import asyncio
from collections import Counter

from app.services.food_catalog_service import FoodCatalogService
from app.services.local_specialty_service import LocalSpecialtyService
from app.services.diet_recommendation_service import (
    _is_snack_candidate_food,
)


async def main():

    food_service = FoodCatalogService()
    specialty_service = LocalSpecialtyService()

    # =====================================================
    # 1. 간식 "배 → 양배추" 오탐 테스트
    # =====================================================

    cabbage = {
        "food_name": "양배추 초나물",
        "category": "",
        "subcategory": "",
        "sodium_mg": 100,
        "sugar_g": 5,
        "saturated_fat_g": 1,
    }

    pear = {
        "food_name": "배_생과",
        "category": "",
        "subcategory": "",
        "sodium_mg": 1,
        "sugar_g": 10,
        "saturated_fat_g": 0,
    }

    cabbage_allowed = (
        _is_snack_candidate_food(
            cabbage
        )
    )

    pear_allowed = (
        _is_snack_candidate_food(
            pear
        )
    )

    print("=" * 80)
    print("간식 한 글자 매칭 테스트")
    print(
        "양배추 초나물:",
        cabbage_allowed,
    )
    print(
        "배_생과:",
        pear_allowed,
    )

    if cabbage_allowed:
        raise RuntimeError(
            "양배추가 '배' 때문에 간식으로 허용되었습니다."
        )

    if not pear_allowed:
        raise RuntimeError(
            "배_생과가 건강 간식 후보에서 제외되었습니다."
        )

    # =====================================================
    # 2. 실제 일반 식사 후보 다양성 테스트
    # =====================================================

    foods = (
        await food_service
        .fetch_all_foods()
    )

    recommended = (
        food_service
        .get_recommendable_foods(
            foods
        )
    )

    groups = (
        food_service
        .group_foods_by_role(
            recommended
        )
    )

    region = (
        await specialty_service
        .get_specialties_for_location(
            sido="경상북도",
            sigungu="영양군",
            nearby_regions=[],
            limit=50,
        )
    )

    meals = (
        food_service
        .recommend_meal_combinations(
            groups=groups,
            target={
                "calories_kcal": 500,
                "protein_g": 30,
                "fat_g": 15,
                "carbohydrate_g": 60,
            },
            local_specialties=(
                region[
                    "specialties"
                ]
            ),
            health_profile={
                "blood_pressure": "high",
                "glucose": "high",
                "lipid": "high",
                "obesity": "high",
            },
            candidate_limit_per_role=20,
            result_limit=40,
            max_primary_repeat=2,
            max_carb_repeat=6,
            max_side_repeat=4,
        )
    )

    # =====================================================
    # 음식명 조합 중복 / 역할 반복 집계
    # =====================================================

    menu_keys = []
    primary_counts = Counter()
    carb_counts = Counter()
    side_counts = Counter()

    for meal in meals:

        items = meal[
            "items"
        ]

        menu_keys.append(
            tuple(
                item[
                    "food_name"
                ]
                for item in items
            )
        )

        primary_counts[
            items[0][
                "food_name"
            ]
        ] += 1

        for item in items:

            role = item.get(
                "role"
            )

            if role == "carb":

                carb_counts[
                    item[
                        "food_name"
                    ]
                ] += 1

            if role == "side":

                side_counts[
                    item[
                        "food_name"
                    ]
                ] += 1

    duplicate_menu_count = (
        len(menu_keys)
        - len(
            set(
                menu_keys
            )
        )
    )

    print()
    print("=" * 80)
    print(
        "최종 후보:",
        len(meals),
    )
    print(
        "음식명 조합 중복:",
        duplicate_menu_count,
    )
    print(
        "primary 최대:",
        max(
            primary_counts.values(),
            default=0,
        ),
    )
    print(
        "carb 최대:",
        max(
            carb_counts.values(),
            default=0,
        ),
    )
    print(
        "side 최대:",
        max(
            side_counts.values(),
            default=0,
        ),
    )

    print(
        "carb 반복:",
        dict(
            carb_counts
        ),
    )

    print(
        "side 반복:",
        dict(
            side_counts
        ),
    )

    if len(meals) < 21:
        raise RuntimeError(
            f"주간 일반 식사 후보가 부족합니다: {len(meals)}"
        )

    if duplicate_menu_count != 0:
        raise RuntimeError(
            "portion만 다른 동일 menu_name 조합이 남아 있습니다."
        )

    if max(
        primary_counts.values(),
        default=0,
    ) > 2:
        raise RuntimeError(
            "primary 반복 제한을 초과했습니다."
        )

    if max(
        carb_counts.values(),
        default=0,
    ) > 6:
        raise RuntimeError(
            "carb 반복 제한을 초과했습니다."
        )

    if max(
        side_counts.values(),
        default=0,
    ) > 4:
        raise RuntimeError(
            "side 반복 제한을 초과했습니다."
        )

    print()
    print("=" * 80)
    print(
        "주간 식단 품질 보정 테스트: OK"
    )


if __name__ == "__main__":
    asyncio.run(main())
