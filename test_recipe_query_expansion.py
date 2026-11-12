import asyncio

from app.services.recipe_service import (
    RecipeService,
)


# =========================================================
# 공식 레시피 검색어 확장 테스트
#
# 목적:
# Auto-Fit 음식명과 식품안전나라 메뉴명의
# 표현 차이를 확인한다.
# =========================================================


SEARCH_GROUPS = {
    "황태구이_양념": [
        "황태구이",
        "황태",
        "북어구이",
        "북어",
    ],

    "혼합잡곡밥": [
        "혼합잡곡밥",
        "잡곡밥",
        "잡곡",
        "현미밥",
    ],

    "톳나물_두부": [
        "톳나물 두부",
        "톳두부",
        "톳",
        "두부무침",
        "두부",
    ],
}


async def main():

    service = RecipeService()

    for (
        original_food_name,
        queries,
    ) in SEARCH_GROUPS.items():

        print()
        print("=" * 80)

        print(
            "원본 음식:",
            original_food_name,
        )

        for query in queries:

            print()
            print("-" * 80)

            print(
                "검색어:",
                query,
            )

            try:

                recipes = (
                    await service.search_recipes_by_name(
                        menu_name=query,
                        start_idx=1,
                        end_idx=100,
                    )
                )

            except Exception as exc:

                print(
                    "API 호출 실패:",
                    type(exc).__name__,
                    str(exc),
                )

                continue

            print(
                "검색 결과 수:",
                len(recipes),
            )

            if not recipes:

                continue

            for (
                index,
                recipe,
            ) in enumerate(
                recipes[:10],
                start=1,
            ):

                print(
                    f"{index}.",
                    recipe.get(
                        "menu_name"
                    ),
                )


if __name__ == "__main__":

    asyncio.run(
        main()
    )