import asyncio

from app.services.recipe_service import RecipeService


async def main():

    service = RecipeService()

    test_names = [
        "황태구이",
        "잡곡밥",
        "두부",
        "비빔밥",
    ]

    for name in test_names:

        print()
        print("=" * 80)
        print("검색어:", name)

        try:

            recipes = (
                await service.search_recipes_by_name(
                    menu_name=name,
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

        for index, recipe in enumerate(
            recipes[:5],
            1,
        ):

            print()
            print(
                f"{index}."
            )

            print(
                "메뉴명:",
                recipe.get(
                    "menu_name"
                ),
            )

            print(
                "조리방법:",
                recipe.get(
                    "cooking_method"
                ),
            )

            print(
                "요리종류:",
                recipe.get(
                    "dish_type"
                ),
            )

            print(
                "재료:",
                recipe.get(
                    "ingredients_text"
                ),
            )

            print(
                "출처:",
                recipe.get(
                    "source"
                ),
            )


if __name__ == "__main__":

    asyncio.run(
        main()
    )