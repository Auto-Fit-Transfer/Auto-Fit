# -*- coding: utf-8 -*-

import asyncio

from app.services.meal_recipe_service import MealRecipeService


async def main():
    service = MealRecipeService()

    test_items = [
        {
            "food_name": "톳나물_두부",
            "portion_g": 70.0,
            "calories_kcal": 55.0,
            "protein_g": 4.0,
            "fat_g": 2.0,
            "carbohydrate_g": 7.0,
        },
        {
            "food_name": "혼합잡곡밥",
            "portion_g": 210.0,
            "calories_kcal": 320.0,
            "protein_g": 6.0,
            "fat_g": 2.0,
            "carbohydrate_g": 69.0,
        },
        {
            "food_name": "황태구이_양념",
            "portion_g": 100.0,
            "calories_kcal": 150.0,
            "protein_g": 20.0,
            "fat_g": 4.0,
            "carbohydrate_g": 8.0,
        },
    ]

    for item in test_items:
        print()
        print("=" * 80)
        print("음식:", item["food_name"])

        result = await service.enrich_meal_item(
            item=item,
            allergies=[],
            disliked_foods=[],
        )

        print(
            "recipe_available:",
            result.get("recipe_available"),
        )

        print(
            "recipe_source:",
            result.get("recipe_source"),
        )

        print(
            "official_recipe:",
            result.get("official_recipe"),
        )

        print(
            "matched_recipe_name:",
            result.get("matched_recipe_name"),
        )

        print(
            "match_score:",
            result.get("match_score"),
        )

        print(
            "safety_checked:",
            result.get("safety_checked"),
        )

        print(
            "restriction_matches:",
            result.get("restriction_matches"),
        )

        recipe = result.get("recipe")

        if recipe:
            print(
                "recipe.menu_name:",
                recipe.get("menu_name"),
            )

            print(
                "recipe.ingredients_text:",
                recipe.get("ingredients_text"),
            )

            print(
                "recipe.ingredients:",
                recipe.get("ingredients"),
            )

            print(
                "recipe.steps:",
                recipe.get("steps"),
            )

            print(
                "recipe.source:",
                recipe.get("source"),
            )

        else:
            print("recipe: None")


if __name__ == "__main__":
    asyncio.run(main())