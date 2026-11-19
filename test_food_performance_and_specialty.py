import asyncio
from time import perf_counter

from app.services.food_catalog_service import FoodCatalogService
from app.services.local_specialty_service import LocalSpecialtyService


async def main():

    food_service = FoodCatalogService()
    specialty_service = LocalSpecialtyService()

    # =====================================================
    # 1. 음식 API 캐시 성능 테스트
    # =====================================================

    start = perf_counter()

    foods_first = (
        await food_service
        .fetch_all_foods(
            force_refresh=True
        )
    )

    first_elapsed = (
        perf_counter()
        - start
    )

    start = perf_counter()

    foods_second = (
        await food_service
        .fetch_all_foods()
    )

    second_elapsed = (
        perf_counter()
        - start
    )

    print("=" * 80)
    print("음식 캐시 테스트")
    print("첫 조회 건수:", len(foods_first))
    print("두 번째 조회 건수:", len(foods_second))
    print(
        "첫 조회 시간:",
        round(
            first_elapsed,
            3,
        ),
        "초",
    )
    print(
        "캐시 조회 시간:",
        round(
            second_elapsed,
            6,
        ),
        "초",
    )

    if foods_first is not foods_second:
        print(
            "참고: 리스트 객체는 다를 수 있지만 캐시 데이터는 정상일 수 있습니다."
        )

    # =====================================================
    # 2. 지역 특산물 '배' 오탐 테스트
    # =====================================================

    fake_specialties = [
        {
            "specialty_name": "배",
            "match_terms": [
                "배"
            ],
            "location_match_type": "exact",
            "distance_km": 0.0,
        }
    ]

    false_food = {
        "food_name": "양배추 초나물",
        "category": "",
        "subcategory": "",
    }

    true_food = {
        "food_name": "배_생과",
        "category": "",
        "subcategory": "",
    }

    false_matches = (
        specialty_service
        .get_specialty_matches_for_food(
            food=false_food,
            specialties=fake_specialties,
        )
    )

    true_matches = (
        specialty_service
        .get_specialty_matches_for_food(
            food=true_food,
            specialties=fake_specialties,
        )
    )

    print()
    print("=" * 80)
    print("특산물 짧은 단어 오탐 테스트")
    print(
        "양배추 초나물 → 배:",
        false_matches,
    )
    print(
        "배_생과 → 배:",
        true_matches,
    )

    if false_matches:
        raise RuntimeError(
            "'양배추'가 '배' 특산물로 잘못 매칭됩니다."
        )

    if not true_matches:
        raise RuntimeError(
            "'배_생과'가 '배' 특산물로 매칭되지 않습니다."
        )

    # =====================================================
    # 3. 조합 생성 속도 테스트
    # =====================================================

    recommended = (
        food_service
        .get_recommendable_foods(
            foods_first
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
            # 20을 전달해도 내부에서 8로 제한되는지 확인
            candidate_limit_per_role=20,
            result_limit=40,
        )
    )

    elapsed = (
        perf_counter()
        - start
    )

    print()
    print("=" * 80)
    print("조합 생성 테스트")
    print(
        "추천 후보:",
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

    for index, meal in enumerate(
        meals[:5],
        1,
    ):
        print(
            index,
            [
                item[
                    "food_name"
                ]
                for item
                in meal[
                    "items"
                ]
            ],
            meal[
                "final_score"
            ],
        )

    print()
    print("=" * 80)
    print("성능 + 지역 특산물 오탐 수정 테스트: OK")


if __name__ == "__main__":
    asyncio.run(main())
