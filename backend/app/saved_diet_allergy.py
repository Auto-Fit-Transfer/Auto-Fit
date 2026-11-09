"""Recheck persisted meal names against the user's current allergies.

A name without a known match is not proof that a prepared food contains no
allergen, because stored daily foods do not include complete ingredients.
"""

from typing import Any

from backend.app.diet_ai import conflicts_allergy


def matching_names(names: list[str], allergies: list[str]) -> list[str]:
    return list(dict.fromkeys(
        name for name in names if name and conflicts_allergy(name, allergies)
    ))


def meal_safety(
    meal: dict[str, Any], allergies: list[str], saved_allergies: list[str] | None = None
) -> dict[str, Any]:
    if not allergies:
        return {"status": "no_selected_allergies", "matched_food_names": []}

    names = [
        str(food.get("food_name") or "").strip()
        for food in meal.get("foods") or []
        if isinstance(food, dict)
    ]
    names.extend(
        str(item.get("name") or "").strip()
        for item in meal.get("used_ingredients") or []
        if isinstance(item, dict)
    )
    matches = matching_names(names, allergies)
    status = "conflict" if matches else (
        "context_unverified" if saved_allergies is None else (
            "context_changed" if not set(allergies).issubset(saved_allergies)
            else "ingredients_unverified"
        )
    )
    return {
        "status": status,
        "matched_food_names": matches,
    }


def recipe_conflicts(recipe: dict[str, Any], allergies: list[str]) -> bool:
    if not allergies:
        return False
    texts = [recipe.get(key) for key in ("title", "description", "menu_name", "ingredients_text", "cooking_tip")]
    texts.extend(
        item.get("name") for item in recipe.get("ingredients") or []
        if isinstance(item, dict)
    )
    texts.extend(recipe.get("steps") or [])
    for item in recipe.get("step_details") or []:
        if isinstance(item, dict):
            texts.extend((item.get("instruction"), item.get("tip")))
    reply = recipe.get("recipe_response")
    if isinstance(reply, dict):
        for item in (reply.get("meal") or {}).get("items") or []:
            if isinstance(item, dict) and isinstance(item.get("recipe"), dict):
                if recipe_conflicts(item["recipe"], allergies):
                    return True
    return bool(matching_names([str(value) for value in texts if isinstance(value, str)], allergies))


def recipe_ingredients_complete(recipe: dict[str, Any], allergies: list[str]) -> bool:
    if not allergies:
        return True
    def complete(items: Any) -> bool:
        return isinstance(items, list) and bool(items) and all(
            isinstance(item, dict) and isinstance(item.get("name"), str)
            and bool(item["name"].strip()) for item in items
        )
    reply = recipe.get("recipe_response")
    if isinstance(reply, dict):
        details = [
            item.get("recipe") for item in (reply.get("meal") or {}).get("items") or []
            if isinstance(item, dict) and item.get("recipe_available")
        ]
        return bool(details) and all(
            isinstance(detail, dict) and complete(detail.get("ingredients"))
            for detail in details
        )
    return complete(recipe.get("ingredients"))
