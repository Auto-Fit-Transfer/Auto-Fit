import asyncio
from collections import Counter
from time import perf_counter

from app.services.food_catalog_service import FoodCatalogService
from app.services.local_specialty_service import LocalSpecialtyService


async def main():

    food_service = FoodCatalogService()
    specialty_service = LocalSpecialtyService()

    foods = await food_service.fetch_all_foods()

    recommended = (
        food_service
        .get_recommendable_foods(
            foods
        )
    )

    personalized = (
        food_service
        .filter_foods_for_user(
            foods=recommended,
            allergies=[],
            disliked_foods=[],
        )
    )

    groups = (
        food_service
        .group_foods_by_role(
            personalized
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

    start = perf_counter()

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
        )
    )

    elapsed = (
        perf_counter()
        - start
    )

    primary_counts = Counter()

    combination_keys = []

    for meal in meals:

        items = meal[
            "items"
        ]

        primary_counts[
            items[0][
                "food_name"
            ]
        ] += 1

        combination_keys.append(
            tuple(
                (
                    item[
                        "food_name"
                    ],
                    item[
                        "portion_g"
                    ],
                )
                for item
                in items
            )
        )

    duplicate_combinations = (
        len(combination_keys)
        - len(
            set(
                combination_keys
            )
        )
    )

    max_primary_count = (
        max(
            primary_counts.values()
        )
        if primary_counts
        else 0
    )

    print("=" * 80)
    print(
        "주간 일반 식사 후보:",
        len(meals),
    )
    print(
        "조합 생성 시간:",
        round(
            elapsed,
            3,
        ),
        "초",
    )
    print(
        "완전 동일 조합 중복:",
        duplicate_combinations,
    )
    print(
        "primary 최대 반복:",
        max_primary_count,
    )
    print(
        "primary별 반복:",
        dict(
            primary_counts
        ),
    )

    print()
    print("=" * 80)

    for index, meal in enumerate(
        meals[:15],
        1,
    ):

        print(
            index,
            [
                (
                    item[
                        "food_name"
                    ],
                    item[
                        "portion_g"
                    ],
                )
                for item
                in meal[
                    "items"
                ]
            ],
            "Final:",
            meal[
                "final_score"
            ],
        )

    if len(meals) < 21:
        raise RuntimeError(
            f"주간 일반 식사 21끼를 채우기에 후보가 부족합니다: {len(meals)}개"
        )

    if duplicate_combinations != 0:
        raise RuntimeError(
            "완전히 동일한 음식 조합이 중복되었습니다."
        )

    if max_primary_count > 2:
        raise RuntimeError(
            f"동일 primary 음식이 2회를 초과했습니다: {max_primary_count}"
        )

    print()
    print("=" * 80)
    print(
        "주간 식단 후보 다양성 테스트: OK"
    )


if __name__ == "__main__":
    asyncio.run(main())
