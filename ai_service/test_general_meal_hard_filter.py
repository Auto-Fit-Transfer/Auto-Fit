import asyncio

from app.services.food_catalog_service import FoodCatalogService
from app.services.local_specialty_service import LocalSpecialtyService


async def main():

    food_service = FoodCatalogService()
    specialty_service = LocalSpecialtyService()

    # =====================================================
    # 1. 직접 Hard Filter 테스트
    # =====================================================

    test_foods = [
        {
            "food_name": "햄부침",
            "category": "",
            "subcategory": "",
        },
        {
            "food_name": "햄구이",
            "category": "",
            "subcategory": "",
        },
        {
            "food_name": "스팸구이",
            "category": "",
            "subcategory": "",
        },
        {
            "food_name": "소시지볶음",
            "category": "",
            "subcategory": "",
        },
        {
            "food_name": "팥빵_호두과자",
            "category": "",
            "subcategory": "",
        },
        {
            "food_name": "소보로빵",
            "category": "",
            "subcategory": "",
        },
        {
            "food_name": "모닝빵",
            "category": "",
            "subcategory": "",
        },
        {
            "food_name": "통밀 샌드위치",
            "category": "",
            "subcategory": "",
        },
        {
            "food_name": "황태구이",
            "category": "",
            "subcategory": "",
        },
    ]

    print("=" * 80)
    print("Hard Filter 직접 테스트")

    for food in test_foods:

        excluded = (
            food_service
            ._contains_excluded_keyword(
                food
            )
        )

        print(
            food["food_name"],
            "->",
            "제외" if excluded else "허용",
        )

    expected_excluded = {
        "햄부침",
        "햄구이",
        "스팸구이",
        "소시지볶음",
        "팥빵_호두과자",
        "소보로빵",
        "모닝빵",
    }

    for food in test_foods:

        name = food[
            "food_name"
        ]

        excluded = (
            food_service
            ._contains_excluded_keyword(
                food
            )
        )

        if (
            name in expected_excluded
            and not excluded
        ):
            raise RuntimeError(
                f"제외되어야 할 음식이 통과했습니다: {name}"
            )

    # =====================================================
    # 2. 실제 공식 음식 후보 생성
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

    print()
    print("=" * 80)
    print(
        "최종 일반 식사 후보:",
        len(meals),
    )

    forbidden_in_result = [
        "햄",
        "스팸",
        "런천미트",
        "소시지",
        "핫바",
        "너겟",
        "호두과자",
        "소보로",
        "모닝빵",
        "식빵",
        "크림빵",
        "단팥빵",
    ]

    violations = []

    for meal in meals:

        names = [
            item[
                "food_name"
            ]
            for item
            in meal[
                "items"
            ]
        ]

        joined = " ".join(
            names
        )

        if any(
            keyword in joined
            for keyword
            in forbidden_in_result
        ):
            violations.append(
                names
            )

    print(
        "Hard Filter 위반:",
        violations,
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
            f"Hard Filter 적용 후 일반 식사 후보가 부족합니다: {len(meals)}개"
        )

    if violations:
        raise RuntimeError(
            f"Hard Filter 위반 후보가 있습니다: {violations}"
        )

    print()
    print("=" * 80)
    print(
        "일반 식사 Hard Filter 테스트: OK"
    )


if __name__ == "__main__":
    asyncio.run(main())
