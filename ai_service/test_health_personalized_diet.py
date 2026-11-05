import asyncio

from app.services.food_catalog_service import FoodCatalogService
from app.services.local_specialty_service import LocalSpecialtyService


async def main():

    # ==================================================
    # 서비스 초기화
    # ==================================================

    food_service = (
        FoodCatalogService()
    )

    specialty_service = (
        LocalSpecialtyService()
    )

    # ==================================================
    # 1. 공식 음식 데이터
    # ==================================================

    foods = await food_service.fetch_all_foods()

    print(
        "전체 음식:",
        len(foods),
    )

    # ==================================================
    # 2. 건강식 기본 필터
    # ==================================================

    recommended = (
        food_service
        .get_recommendable_foods(
            foods
        )
    )

    print(
        "건강식 후보:",
        len(recommended),
    )

    # ==================================================
    # 3. 사용자 알레르기 / 기피 음식
    # ==================================================

    allergies = []

    disliked_foods = []

    personalized = (
        food_service
        .filter_foods_for_user(
            foods=recommended,
            allergies=allergies,
            disliked_foods=(
                disliked_foods
            ),
        )
    )

    # ==================================================
    # 4. 음식 역할 분류
    # ==================================================

    groups = (
        food_service
        .group_foods_by_role(
            personalized
        )
    )

    # ==================================================
    # 5. 지역 특산물
    #
    # 테스트:
    # 경상북도 영양군
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

    local_specialties = (
        region_result[
            "specialties"
        ]
    )

    print(
        "지역:",
        region_result[
            "match_type"
        ],
    )

    print(
        "특산물:",
        [
            item[
                "specialty_name"
            ]
            for item
            in local_specialties
        ],
    )

    # ==================================================
    # 6. 사용자 한 끼 목표
    # ==================================================

    target = {
        "calories_kcal": 500,
        "protein_g": 30,
        "fat_g": 15,
        "carbohydrate_g": 60,
    }

    # ==================================================
    # 7. 건강상태
    #
    # 정상 사용자는 normal
    #
    # 테스트에서는 모든 항목을 high로 설정해서
    # 개인화 패널티가 실제 작동하는지 확인
    # ==================================================

    health_profile = {
        "blood_pressure": "high",
        "glucose": "high",
        "lipid": "high",
        "obesity": "high",
    }

    # ==================================================
    # 8. 최종 개인화 식단
    # ==================================================

    meals = (
        food_service
        .recommend_meal_combinations(
            groups=groups,
            target=target,
            local_specialties=(
                local_specialties
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
        "추천 식단:",
        len(meals),
    )

    # ==================================================
    # 9. 결과 출력
    # ==================================================

    for index, meal in enumerate(
        meals,
        1,
    ):

        print()
        print(
            "=" * 80
        )

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
            "Base:",
            meal[
                "base_score"
            ],
        )

        print(
            "Nutrition:",
            meal[
                "nutrition_score"
            ],
        )

        print(
            "Health:",
            meal[
                "health_score"
            ],
        )

        print(
            "Local Specialty:",
            meal[
                "local_specialty_score"
            ],
        )

        print(
            "Processing Penalty:",
            meal[
                "processing_penalty"
            ],
        )

        print(
            "Health Status Penalty:",
            meal[
                "health_status_penalty"
            ],
        )

        print(
            "Health Reasons:",
            meal[
                "health_status_reasons"
            ],
        )

        print(
            "Health Profile:",
            meal[
                "health_profile"
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
            "영양:",
            meal[
                "totals"
            ],
        )

        print(
            "지역 특산물:",
            [
                item[
                    "specialty_name"
                ]
                for item
                in meal[
                    "matched_specialties"
                ]
            ],
        )


if __name__ == "__main__":

    asyncio.run(
        main()
    )
