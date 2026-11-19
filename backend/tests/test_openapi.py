import json
from pathlib import Path

from backend.app.main import app


def test_all_diet_operations_are_grouped_in_openapi() -> None:
    paths = app.openapi()["paths"]
    diet_operations = [
        operation
        for path, methods in paths.items()
        if path.startswith("/api/diet/")
        for method, operation in methods.items()
        if method in {"get", "post", "put", "patch", "delete"}
    ]

    assert len(diet_operations) == 32
    assert {"get", "put"} <= set(paths["/api/diet/preferences"])
    assert "get" in paths["/api/diet/summary/weekly"]
    assert "post" in paths["/api/diet/food-shots/analyze"]
    assert "post" in paths["/api/diet/food-shots/recalculate"]
    assert "get" in paths["/api/diet/weekly-recommendations/{plan_id}/meals/{day}/{meal_type}/recipe"]
    assert "post" in paths["/api/diet/meal-logs/{meal_log_id}/photo"]
    assert "get" in paths["/api/diet/meals/{diet_meal_id}/recipe"]
    assert "patch" in paths["/api/diet/meals/{diet_meal_id}/feedback"]
    assert "get" in paths["/api/diet/tomorrow-rebalance/status"]
    assert "post" in paths["/api/diet/weekly-recommendations/{plan_id}/tomorrow-rebalance/preview"]
    assert "post" in paths["/api/diet/weekly-recommendations/{plan_id}/tomorrow-rebalance/confirm"]
    assert all(operation["tags"] == ["Diet"] for operation in diet_operations)


def test_onboarding_status_has_boolean_response_schema() -> None:
    schema = app.openapi()
    operation = schema["paths"]["/api/onboarding/status"]["get"]
    assert operation["tags"] == ["Profile"]
    response = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert response == {"$ref": "#/components/schemas/OnboardingStatusResponse"}
    assert schema["components"]["schemas"]["OnboardingStatusResponse"]["properties"]["completed"]["type"] == "boolean"
    assert schema["components"]["schemas"]["OnboardingStatusResponse"]["required"] == ["completed"]


def test_renewal_a_summary_responses_publish_their_fields() -> None:
    schema = app.openapi()
    paths = schema["paths"]
    models = schema["components"]["schemas"]
    success = lambda path: paths[path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]

    assert success("/api/tier/progress") == {"$ref": "#/components/schemas/TierProgressResponse"}
    assert {"progress", "today_points", "week", "week_points"} <= set(
        models["TierProgressResponse"]["properties"]
    )
    assert success("/api/health/scores/history")["items"] == {
        "$ref": "#/components/schemas/HealthScoreHistoryItem"
    }
    assert success("/api/diet/nutrition-summary") == {
        "$ref": "#/components/schemas/DailyNutritionSummaryResponse"
    }
    assert success("/api/diet/summary/weekly") == {
        "$ref": "#/components/schemas/WeeklyNutritionSummaryResponse"
    }
    assert {"date", "recorded_meal_count", "calories", "carbohydrates", "protein", "fat"} <= set(
        models["NutritionSummary"]["properties"]
    )


def test_published_openapi_matches_current_application() -> None:
    published = json.loads(
        (Path(__file__).resolve().parents[2] / "docs/api-openapi.json").read_text()
    )
    assert published == app.openapi()
