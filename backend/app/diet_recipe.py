"""Build and store validated recipe snapshots for saved daily meals."""

import hashlib
import json
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.weekly_diet_contract import DAYS
from backend.app.weekly_recipe_contract import RecipeRequest


def daily_source_fingerprint(recipe_request: dict) -> str:
    return hashlib.sha256(json.dumps(recipe_request, sort_keys=True,
                                     ensure_ascii=False).encode()).hexdigest()


def has_unavailable_recipe(reply: dict | None) -> bool:
    return isinstance(reply, dict) and any(
        item.get("recipe_source") == "unavailable"
        for item in reply.get("meal", {}).get("items", [])
    )


def daily_recipe_request(context: dict, allergens: list[str]) -> dict:
    try:
        meal = context["meal"]
        items = []
        for food in meal["foods"]:
            unit = str(food.get("unit") or "").strip().casefold()
            if unit not in {"g", "그램", "kg"}:
                raise HTTPException(422, detail="Recipe needs food portions measured in grams")
            portion = Decimal(str(food["quantity"])) * (1000 if unit == "kg" else 1)
            items.append({
                "food_name": food["food_name"], "portion_g": float(portion),
                "calories_kcal": float(food.get("calories") or 0),
                "carbohydrate_g": float(food.get("carbohydrates") or 0),
                "protein_g": float(food.get("protein") or 0),
                "fat_g": float(food.get("fat") or 0),
            })
        note = meal.get("recommendation_note") or ""
        payload = {
            "day": DAYS[date.fromisoformat(context["recommendation"]["recommendation_date"]).weekday()],
            "meal_type": meal["meal_type"],
            "menu_name": ", ".join(item["food_name"] for item in items)[:200],
            "menu_description": note, "guidance": note,
            "tags": [], "personalization_reasons": [], "servings": 1,
            "related_menus": [], "items": items,
            "food_allergens": allergens, "disliked_foods": [],
        }
        RecipeRequest.model_validate(payload)
    except HTTPException:
        raise
    except (ValidationError, ValueError, ArithmeticError, KeyError, TypeError):
        raise HTTPException(422, detail="Saved meal cannot be used as a recipe request") from None
    return payload


def snapshot_fields(reply: dict) -> dict:
    meal = reply["meal"]
    details = [(item["food_name"], item["recipe"])
               for item in meal["items"] if item["recipe"] is not None]
    if any(not recipe["steps"] for _, recipe in details):
        raise HTTPException(502, detail="AI recipe omitted cooking steps")
    ingredients = [
        {"name": ingredient["name"], "amount_g": ingredient.get("amount_g")}
        for _, recipe in details for ingredient in (recipe.get("ingredients") or [])
    ]
    steps = [
        f"{food_name}: {step}" for food_name, recipe in details for step in recipe["steps"]
    ]
    if len(ingredients) > 50 or len(steps) > 50:
        raise HTTPException(502, detail="Recipe exceeds snapshot limits")
    return {
        "title": meal["menu_name"][:120],
        "description": meal["menu_description"][:2000],
        "servings": meal["servings"],
        "prep_minutes": (round(meal["estimated_duration_minutes"])
                         if meal["estimated_duration_minutes"] is not None else None),
        "ingredients": ingredients,
        "steps": steps,
        "generator": reply["generator"][:80], "recipe_response": reply,
    }
