import asyncio
from types import SimpleNamespace

from app.services.diet_recommendation_service import (
    _prepare_verified_food_candidates,
)


async def main():

    request = SimpleNamespace(
        disliked_foods=[],
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

    metric_statuses = {
        "blood_pressure": "high",
        "glucose": "high",
        "lipid": "high",
        "obesity": "high",
    }

    (
        meal_candidates,
        snack_candidates,
        metadata,
    ) = await _prepare_verified_food_candidates(
        request=request,
        metric_statuses=metric_statuses,
        food_allergens=[],
    )

    print("=" * 80)
    print("후보 생성 Metadata")
    print(metadata)

    print()
    print("=" * 80)
    print("일반 식사 후보:", len(meal_candidates))

    for index, item in enumerate(
        meal_candidates[:10],
        1,
    ):
        print()
        print(
            f"{index}위 {item['menu_name']}"
        )
        print(
            "영양:",
            item["nutrition"],
        )
        print(
            "특산물:",
            item["local_specialties"],
        )
        print(
            "Final:",
            item["final_score"],
        )

    print()
    print("=" * 80)
    print("간식 후보:", len(snack_candidates))

    for index, item in enumerate(
        snack_candidates[:20],
        1,
    ):
        print()
        print(
            f"{index}위 {item['menu_name']}"
        )
        print(
            "영양:",
            item["nutrition"],
        )
        print(
            "특산물:",
            item["local_specialties"],
        )
        print(
            "Final:",
            item["final_score"],
        )

    invalid_keywords = [
        "만두",
        "죽",
        "전",
        "빈대떡",
        "부침개",
        "브리또",
        "또띠아",
        "빵",
        "브레드",
        "무침",
        "샐러드",
        "면",
        "샌드위치",
        "버거",
        "피자",
    ]

    invalid = [
        item["menu_name"]
        for item in snack_candidates
        if any(
            keyword in item["menu_name"]
            for keyword in invalid_keywords
        )
    ]

    print()
    print(
        "간식 부적합 메뉴:",
        invalid,
    )

    if not meal_candidates:
        raise RuntimeError(
            "일반 식사 후보가 없습니다."
        )

    if not snack_candidates:
        raise RuntimeError(
            "간식 후보가 없습니다."
        )

    if invalid:
        raise RuntimeError(
            f"부적합 간식 후보가 있습니다: {invalid}"
        )

    print()
    print("=" * 80)
    print("건강 간식 후보 정제 테스트: OK")


if __name__ == "__main__":
    asyncio.run(main())
