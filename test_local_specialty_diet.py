import asyncio

from app.services.food_catalog_service import FoodCatalogService
from app.services.local_specialty_service import LocalSpecialtyService


async def main():

    food_service = (
        FoodCatalogService()
    )

    specialty_service = (
        LocalSpecialtyService()
    )

    # ==================================================
    # 지역 특산물 조회
    # ==================================================

    region_result = (
        await specialty_service
        .get_specialties_for_location(
            sido="경상북도",
            sigungu="영양군",
            nearby_regions=[],
            limit=50,
        )
    )

    specialties = (
        region_result[
            "specialties"
        ]
    )

    print()
    print(
        "지역 매칭:",
        region_result[
            "match_type"
        ],
    )

    print()
    print(
        "특산물:"
    )

    for specialty in specialties:

        print(
            specialty[
                "specialty_name"
            ],
            "=>",
            specialty[
                "match_terms"
            ],
        )

    # ==================================================
    # 기존에 오탐되었던 테스트 음식
    # ==================================================

    test_foods = [
        {
            "food_name": "톳나물_두부",
            "category": "",
            "subcategory": "",
        },

        {
            "food_name": "황태콩나물찜",
            "category": "",
            "subcategory": "",
        },

        {
            "food_name": "완자전_소고기",
            "category": "",
            "subcategory": "",
        },

        {
            "food_name": "혼합잡곡밥",
            "category": "",
            "subcategory": "",
        },

        {
            "food_name": "산나물비빔밥",
            "category": "",
            "subcategory": "",
        },

        {
            "food_name": "한우 불고기",
            "category": "",
            "subcategory": "",
        },

        {
            "food_name": "송이버섯구이",
            "category": "",
            "subcategory": "",
        },
    ]

    print()
    print(
        "=" * 80
    )

    print(
        "특산물 매칭 테스트"
    )

    for food in test_foods:

        matches = (
            specialty_service
            .get_specialty_matches_for_food(
                food=food,
                specialties=(
                    specialties
                ),
            )
        )

        print()
        print(
            "음식:",
            food[
                "food_name"
            ],
        )

        print(
            "매칭:",
            [
                {
                    "specialty": item[
                        "specialty_name"
                    ],

                    "matched_terms": item[
                        "matched_terms"
                    ],
                }
                for item in matches
            ],
        )

    # ==================================================
    # 실제 음식 데이터
    # ==================================================

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

    target = {
        "calories_kcal": 500,
        "protein_g": 30,
        "fat_g": 15,
        "carbohydrate_g": 60,
    }

    health_profile = {
        "blood_pressure": "high",
        "glucose": "high",
        "lipid": "high",
        "obesity": "high",
    }

    meals = (
        food_service
        .recommend_meal_combinations(
            groups=groups,
            target=target,
            local_specialties=(
                specialties
            ),
            health_profile=(
                health_profile
            ),
            candidate_limit_per_role=20,
            result_limit=10,
        )
    )

    print()
    print(
        "=" * 80
    )

    print(
        "최종 추천"
    )

    for index, meal in enumerate(
        meals,
        1,
    ):

        print()
        print(
            f"{index}위"
        )

        print(
            "Final:",
            meal[
                "final_score"
            ],
        )

        print(
            "Local Specialty:",
            meal[
                "local_specialty_score"
            ],
        )

        print(
            "음식:",
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
        )

        print(
            "매칭 특산물:",
            [
                {
                    "specialty": item[
                        "specialty_name"
                    ],

                    "matched_terms": item.get(
                        "matched_terms",
                        [],
                    ),
                }
                for item in meal[
                    "matched_specialties"
                ]
            ],
        )


if __name__ == "__main__":

    asyncio.run(
        main()
    )
