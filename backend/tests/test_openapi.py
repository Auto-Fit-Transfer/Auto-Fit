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
        if method in {"get", "post", "patch", "delete"}
    ]

    assert len(diet_operations) == 19
    assert "get" in paths["/api/diet/weekly-recommendations/{plan_id}/meals/{day}/{meal_type}/recipe"]
    assert "post" in paths["/api/diet/recommendations/generate-preview"]
    assert "post" in paths["/api/diet/meal-logs/{meal_log_id}/photo"]
    assert "patch" in paths["/api/diet/meals/{diet_meal_id}/feedback"]
    assert all(operation["tags"] == ["Diet"] for operation in diet_operations)


def test_onboarding_status_has_boolean_response_schema() -> None:
    schema = app.openapi()
    operation = schema["paths"]["/api/onboarding/status"]["get"]
    assert operation["tags"] == ["Profile"]
    response = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert response == {"$ref": "#/components/schemas/OnboardingStatusResponse"}
    assert schema["components"]["schemas"]["OnboardingStatusResponse"]["properties"]["completed"]["type"] == "boolean"
    assert schema["components"]["schemas"]["OnboardingStatusResponse"]["required"] == ["completed"]


def test_running_recommendation_parameters_match_published_openapi() -> None:
    published = json.loads((Path(__file__).resolve().parents[2] / "docs/openapi.json").read_text())
    path = "/api/running/courses/recommend"
    assert published["paths"][path]["get"]["parameters"] == app.openapi()["paths"][path]["get"]["parameters"]
