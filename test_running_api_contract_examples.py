import json
from pathlib import Path

from app.schemas.running import (
    RunningCourseDetailResponse,
    RunningCourseRecommendationRequest,
    RunningCourseRecommendationResponse,
    RunningLoopGenerationRequest,
    RunningLoopGenerationResponse,
    RunningPlaceSearchResponse,
    RunningRoutePreviewResponse,
    WalkingRouteRequest,
)


ROOT = Path(__file__).resolve().parent
EXAMPLES_PATH = ROOT / "docs" / "running_api_contract_examples.json"


def main() -> None:
    examples = json.loads(
        EXAMPLES_PATH.read_text(encoding="utf-8")
    )
    assert examples["contract_version"] == "1.2"
    assert set(examples) == {
        "contract_version",
        "place_search",
        "official_metadata_recommendation",
        "generation_required",
        "official_metadata_detail",
        "official_gpx_detail",
        "loop_matched",
        "loop_best_effort",
        "loop_unavailable",
        "route_preview",
    }

    place_case = examples["place_search"]
    assert place_case["request"]["query"] == "판교역"
    place_response = RunningPlaceSearchResponse.model_validate(
        place_case["response"]
    )
    assert place_response.places

    official_case = examples["official_metadata_recommendation"]
    official_request = RunningCourseRecommendationRequest.model_validate(
        official_case["request"]
    )
    official_response = RunningCourseRecommendationResponse.model_validate(
        official_case["response"]
    )
    assert official_request.current_location() is not None
    assert official_response.status == "matched"
    assert official_response.courses
    assert all(
        course.source.source_type == "official_metadata"
        and course.requires_route_validation
        for course in official_response.courses
    )

    generation_case = examples["generation_required"]
    RunningCourseRecommendationRequest.model_validate(
        generation_case["request"]
    )
    generation_response = (
        RunningCourseRecommendationResponse.model_validate(
            generation_case["response"]
        )
    )
    assert generation_response.status == "generation_required"
    assert generation_response.courses == []
    assert generation_response.generation_recommended is True

    metadata_detail_case = examples["official_metadata_detail"]
    metadata_detail_response = RunningCourseDetailResponse.model_validate(
        metadata_detail_case["response"]
    )
    assert metadata_detail_response.course.course_id == (
        metadata_detail_case["request"]["course_id"]
    )
    assert metadata_detail_response.course.source.source_type == (
        "official_metadata"
    )
    assert metadata_detail_response.course.path == []

    detail_case = examples["official_gpx_detail"]
    detail_response = RunningCourseDetailResponse.model_validate(
        detail_case["response"]
    )
    assert detail_case["request"]["course_id"].startswith(
        "durunubi-"
    )
    assert detail_response.course.source.source_type == "official_gpx"
    assert detail_response.course.geometry_status == "verified_polyline"
    assert detail_response.course.requires_route_validation is False
    assert len(detail_response.course.path) >= 2

    matched_case = examples["loop_matched"]
    matched_request = RunningLoopGenerationRequest.model_validate(
        matched_case["request"]
    )
    matched_response = RunningLoopGenerationResponse.model_validate(
        matched_case["response"]
    )
    assert matched_response.status == "matched"
    assert matched_response.candidates
    for candidate in matched_response.candidates:
        assert candidate.within_tolerance is True
        assert candidate.source.source_type == "auto_generated"
        assert candidate.path[0] == matched_request.start
        assert candidate.path[-1] == matched_request.start

    best_effort_case = examples["loop_best_effort"]
    RunningLoopGenerationRequest.model_validate(
        best_effort_case["request"]
    )
    best_effort_response = RunningLoopGenerationResponse.model_validate(
        best_effort_case["response"]
    )
    assert best_effort_response.status == "best_effort"
    assert best_effort_response.candidates
    assert all(
        not candidate.within_tolerance
        and candidate.distance_error_percent
        > best_effort_response.tolerance_percent
        for candidate in best_effort_response.candidates
    )

    unavailable_case = examples["loop_unavailable"]
    RunningLoopGenerationRequest.model_validate(
        unavailable_case["request"]
    )
    unavailable_response = RunningLoopGenerationResponse.model_validate(
        unavailable_case["response"]
    )
    assert unavailable_response.status == "unavailable"
    assert unavailable_response.candidates == []
    assert unavailable_response.message

    preview_case = examples["route_preview"]
    preview_request = WalkingRouteRequest.model_validate(
        preview_case["request"]
    )
    preview_response = RunningRoutePreviewResponse.model_validate(
        preview_case["response"]
    )
    assert preview_response.route.start == preview_request.start
    assert preview_response.route.end == preview_request.end
    assert preview_response.route.path

    print("Running API contract examples: OK")


def test_running_api_contract_examples() -> None:
    main()


if __name__ == "__main__":
    main()
