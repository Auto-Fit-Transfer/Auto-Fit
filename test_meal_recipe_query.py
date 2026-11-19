import asyncio

from app.services.meal_recipe_service import (
    MealRecipeService,
)


# =========================================================
# MealRecipeService 검색어 확장 + 공식 매칭 테스트
# =========================================================


async def main():

    service = (
        MealRecipeService()
    )

    test_foods = [

        "황태구이_양념",

        "혼합잡곡밥",

        "톳나물 두부무침",

        "톳나물_두부",

    ]

    for food_name in test_foods:

        print()
        print(
            "=" * 80
        )

        print(
            "원본 음식:",
            food_name,
        )

        # =================================================
        # 생성되는 검색어 확인
        # =================================================

        queries = (
            service.build_recipe_queries(
                food_name
            )
        )

        print()
        print(
            "생성된 검색어:"
        )

        for index, query in enumerate(
            queries,
            start=1,
        ):

            print(
                f"{index}. {query}"
            )

        # =================================================
        # 공식 레시피 검색 결과 확인
        # =================================================

        print()
        print(
            "공식 레시피 최종 매칭:"
        )

        try:

            result = (
                await service.find_official_recipe(
                    food_name=food_name,
                    allergies=[],
                    disliked_foods=[],
                )
            )

        except Exception as exc:

            print(
                "검색 실패:",
                type(exc).__name__,
                str(exc),
            )

            if food_name == "톳나물_두부":
                raise

            continue

        if result is None:

            print(
                "공식 레시피 없음"
            )

            print(
                "→ LLM fallback 대상"
            )

            if food_name == "톳나물_두부":
                raise RuntimeError(
                    "톳나물_두부 공식 유사 레시피 regression"
                )

            if food_name == "톳나물 두부무침":
                raise RuntimeError(
                    "톳나물 두부무침 official_exact regression"
                )

            continue

        recipe = (
            result.get(
                "recipe",
                {}
            )
        )

        print(
            "match_type:",
            result.get(
                "match_type"
            ),
        )

        print(
            "similarity:",
            result.get(
                "similarity"
            ),
        )

        print(
            "matched menu:",
            recipe.get(
                "menu_name"
            ),
        )

        print(
            "source:",
            recipe.get(
                "source"
            ),
        )

        if food_name == "톳나물_두부":

            if result.get(
                "match_type"
            ) != "official_similar":
                raise RuntimeError(
                    "톳나물_두부가 official_similar로 판정되지 않았습니다."
                )

            if result.get(
                "similarity"
            ) != 0.9157:
                raise RuntimeError(
                    "톳나물_두부 유사도 0.9157 regression"
                )

            if recipe.get(
                "menu_name"
            ) != "톳나물 두부무침":
                raise RuntimeError(
                    "톳나물_두부가 예상 공식 메뉴와 연결되지 않았습니다."
                )

        if food_name == "톳나물 두부무침":

            if result.get(
                "match_type"
            ) != "official_exact":
                raise RuntimeError(
                    "정확한 공식 메뉴명이 official_exact로 판정되지 않았습니다."
                )

            if result.get(
                "similarity"
            ) != 1.0:
                raise RuntimeError(
                    "official_exact 유사도 1.0 regression"
                )

    print()
    print(
        "Meal Recipe 공식 검색 회귀 테스트: OK"
    )


if __name__ == "__main__":

    asyncio.run(
        main()
    )
