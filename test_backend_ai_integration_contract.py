import json
from pathlib import Path

from app.main import app


ROOT = Path(__file__).resolve().parent
SPEC_PATH = ROOT / "docs" / "backend_ai_integration_spec.md"
OPENAPI_SNAPSHOT_PATH = ROOT / "docs" / "ai-openapi.json"


EXPECTED_OPERATIONS = {
    "/chat": (
        "BackendChatRequest",
        "BackendChatResponse",
    ),
    "/chat/orchestrate": (
        "ChatRequest",
        "ChatResponse",
    ),
    "/health-analysis": (
        "HealthAnalysisRequest",
        "HealthAnalysisResponse",
    ),
    "/health-analysis/diet-refresh": (
        "DietRefreshRequest",
        "DietRefreshResponse",
    ),
    "/recommend/exercise": (
        "ExerciseRecommendationRequest",
        "ExerciseGenerateResponse",
    ),
    "/recommend/diet": (
        "DietRecommendationRequest",
        "DietGenerateResponse",
    ),
    "/recommend/diet/replace-meal": (
        "ReplaceMealRequest",
        "DietMealRegenerateResponse",
    ),
    "/recommend/diet/recipe": (
        "DietRecipeRequest",
        "DietRecipeResponse",
    ),
    "/running/routes/preview": (
        "WalkingRouteRequest",
        "RunningRoutePreviewResponse",
    ),
    "/running/routes/generate-loop": (
        "RunningLoopGenerationRequest",
        "RunningLoopGenerationResponse",
    ),
    "/food-analysis/recalculate": (
        "FoodAnalysisRecalculateRequest",
        "FoodAnalysisResponse",
    ),
}

EXPECTED_MULTIPART_OPERATIONS = {
    "/food-analysis/analyze": "FoodAnalysisResponse",
}

EXPECTED_GET_RESPONSES = {
    "/running/places/search": "RunningPlaceSearchResponse",
    "/running/courses/recommend": (
        "RunningCourseRecommendationResponse"
    ),
    "/running/courses/{course_id}": "RunningCourseDetailResponse",
}


def _schema_name(schema: dict) -> str:
    return schema["$ref"].rsplit("/", 1)[-1]


def test_documented_operations_match_openapi() -> None:
    openapi = app.openapi()

    for path, (request_name, response_name) in (
        EXPECTED_OPERATIONS.items()
    ):
        operation = openapi["paths"][path]["post"]

        request_schema = operation[
            "requestBody"
        ]["content"]["application/json"]["schema"]
        response_schema = operation[
            "responses"
        ]["200"]["content"]["application/json"]["schema"]

        assert _schema_name(request_schema) == request_name
        assert _schema_name(response_schema) == response_name
        assert operation["security"] == [{"HTTPBearer": []}]

    for path, response_name in EXPECTED_GET_RESPONSES.items():
        operation = openapi["paths"][path]["get"]
        response_schema = operation[
            "responses"
        ]["200"]["content"]["application/json"]["schema"]

        assert _schema_name(response_schema) == response_name
        assert operation["security"] == [{"HTTPBearer": []}]

    for path, response_name in EXPECTED_MULTIPART_OPERATIONS.items():
        operation = openapi["paths"][path]["post"]
        request_content = operation["requestBody"]["content"]
        response_schema = operation[
            "responses"
        ]["200"]["content"]["application/json"]["schema"]

        assert "multipart/form-data" in request_content
        assert _schema_name(response_schema) == response_name
        assert operation["security"] == [{"HTTPBearer": []}]


def test_spec_references_every_operation() -> None:
    spec = SPEC_PATH.read_text(encoding="utf-8")

    for path in EXPECTED_OPERATIONS:
        assert path in spec

    for path in EXPECTED_GET_RESPONSES:
        assert path in spec

    for path in EXPECTED_MULTIPART_OPERATIONS:
        assert path in spec

    assert "chat_api_contract.md" in spec
    assert "chat_api_contract_examples.json" in spec
    assert "running_backend_e2e_contract.md" in spec
    assert "running_api_contract_examples.json" in spec
    assert "food_image_backend_contract.md" in spec


def test_openapi_snapshot_matches_runtime_schema() -> None:
    snapshot = json.loads(
        OPENAPI_SNAPSHOT_PATH.read_text(encoding="utf-8")
    )

    assert snapshot == app.openapi()


if __name__ == "__main__":
    test_documented_operations_match_openapi()
    test_spec_references_every_operation()
    test_openapi_snapshot_matches_runtime_schema()
    print("Backend-AI integration contract test: OK")
