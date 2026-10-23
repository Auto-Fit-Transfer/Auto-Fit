from app.schemas.recommendation import (
    DietRecipeItemResult,
    DietRecipeRequest,
    DietRecipeResponse,
)


def main():

    request = DietRecipeRequest(
        items=[
            {
                "food_name": "톳나물_두부",
                "portion_g": 70,
                "calories_kcal": 55,
                "protein_g": 4,
                "fat_g": 2,
                "carbohydrate_g": 7,
            }
        ],
        food_allergens=[],
        disliked_foods=[],
    )

    print(
        request.model_dump()
    )

    response = DietRecipeResponse(
        ok=True,
        generator="auto-fit-ai",
        meal={
            "items": [
                {
                    "food_name": "톳나물_두부",
                    "portion_g": 70,
                    "calories_kcal": 55,
                    "protein_g": 4,
                    "fat_g": 2,
                    "carbohydrate_g": 7,
                    "recipe_available": True,
                    "recipe_source": "official_similar",
                    "official_recipe": True,
                    "matched_recipe_name": "톳나물 두부무침",
                    "match_score": 0.9157,
                    "safety_checked": True,
                    "restriction_matches": [],
                    "recipe": {
                        "recipe_id": "TEST",
                        "menu_name": "톳나물 두부무침",
                        "cooking_method": "기타",
                        "dish_type": "반찬",
                        "serving_weight": 70,
                        "ingredients_text": (
                            "톳나물 15g, 두부 40g, 천일염 0.1g"
                        ),
                        "ingredients": [
                            {
                                "name": "톳나물",
                                "amount_g": 21.0,
                            },
                            {
                                "name": "두부",
                                "amount_g": 56.0,
                            },
                            {
                                "name": "천일염",
                                "amount_g": 0.14,
                            },
                            {
                                "name": "대파",
                                "amount_g": None,
                            },
                        ],
                        "steps": [
                            "톳을 손질한다.",
                            "두부와 함께 무친다.",
                        ],
                        "cooking_tip": None,
                        "image_small": None,
                        "image_large": None,
                        "source": "식품의약품안전처 식품안전나라",
                    },
                }
            ]
        },
    )

    print(
        response.model_dump()
    )

    result = response.model_dump()
    item = result["meal"]["items"][0]
    ingredients = item["recipe"]["ingredients"]

    if item["recipe_source"] != "official_similar":
        raise RuntimeError(
            "official_similar 상태가 보존되지 않았습니다."
        )

    if item["match_score"] != 0.9157:
        raise RuntimeError(
            "공식 유사도 값이 보존되지 않았습니다."
        )

    if ingredients != [
        {
            "name": "톳나물",
            "amount_g": 21.0,
        },
        {
            "name": "두부",
            "amount_g": 56.0,
        },
        {
            "name": "천일염",
            "amount_g": 0.14,
        },
        {
            "name": "대파",
            "amount_g": None,
        },
    ]:
        raise RuntimeError(
            "Recipe 재료 name + amount_g 구조가 손상되었습니다."
        )

    unavailable = DietRecipeItemResult(
        food_name="제한 음식",
        portion_g=100,
        calories_kcal=100,
        protein_g=5,
        fat_g=3,
        carbohydrate_g=10,
        recipe_available=False,
        recipe_source="unavailable",
        official_recipe=False,
        matched_recipe_name=None,
        match_score=None,
        safety_checked=True,
        restriction_matches=["땅콩"],
        recipe=None,
    )

    if unavailable.recipe is not None:
        raise RuntimeError(
            "제한 음식 Recipe가 노출되었습니다."
        )

    invalid_available = {
        **unavailable.model_dump(),
        "recipe_available": True,
        "recipe_source": "llm_generated",
        "restriction_matches": [],
        "safety_checked": False,
        "recipe": {
            "menu_name": "검증되지 않은 조리법",
        },
    }

    try:
        DietRecipeItemResult.model_validate(
            invalid_available
        )
    except ValueError:
        pass
    else:
        raise RuntimeError(
            "안전검사를 통과하지 않은 Recipe가 노출되었습니다."
        )

    print(
        "Diet Recipe Schema 테스트: OK"
    )


if __name__ == "__main__":
    main()
