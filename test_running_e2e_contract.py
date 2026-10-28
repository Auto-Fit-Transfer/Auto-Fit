import json
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.core.security as security_module
import app.routers.running_router as running_router_module
from app.main import app
from app.schemas.running import (
    RunningCourseDetail,
    RunningCourseRecommendationRequest,
    RunningCourseRecommendationResponse,
    RunningLoopGenerationRequest,
    RunningLoopGenerationResponse,
    RunningPlaceSearchResponse,
    RunningRoutePreview,
    WalkingRouteRequest,
)


ROOT = Path(__file__).resolve().parent
EXAMPLES_PATH = ROOT / "docs" / "running_api_contract_examples.json"
TEST_API_KEY = "running-e2e-test-key"


def main() -> None:
    examples = json.loads(
        EXAMPLES_PATH.read_text(encoding="utf-8")
    )
    calls: list[str] = []

    async def fake_recommend(
        request: RunningCourseRecommendationRequest,
    ) -> RunningCourseRecommendationResponse:
        if request.distance_option == "5km":
            assert request.desired_difficulty == "easy"
        calls.append(f"recommend:{request.distance_option}")
        case_name = (
            "generation_required"
            if request.distance_option == "10km"
            else "official_metadata_recommendation"
        )
        return RunningCourseRecommendationResponse.model_validate(
            examples[case_name]["response"]
        )

    async def fake_detail(
        course_id: str,
        pace_minutes_per_km: float | None = None,
    ) -> RunningCourseDetail:
        calls.append(f"detail:{course_id}")
        return RunningCourseDetail.model_validate(
            examples["official_metadata_detail"]["response"]["course"]
        )

    async def fake_generate(
        request: RunningLoopGenerationRequest,
    ) -> RunningLoopGenerationResponse:
        calls.append(f"generate:{request.distance_option}")
        return RunningLoopGenerationResponse.model_validate(
            examples["loop_matched"]["response"]
        )

    async def fake_preview(
        request: WalkingRouteRequest,
    ) -> RunningRoutePreview:
        calls.append("preview")
        return RunningRoutePreview.model_validate(
            examples["route_preview"]["response"]["route"]
        )

    class FakeKakaoMapService:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def search_places(self, query, center, radius_m):
            calls.append(f"places:{query}")
            response = RunningPlaceSearchResponse.model_validate(
                examples["place_search"]["response"]
            )
            return response.places

    original_security_settings = security_module.get_settings
    original_recommend = running_router_module.recommend_running_courses
    original_detail = running_router_module.get_running_course_detail
    original_generate = running_router_module.generate_running_loop_routes
    original_preview = running_router_module.build_walking_route_preview
    original_kakao_service = running_router_module.KakaoMapService

    security_module.get_settings = lambda: SimpleNamespace(
        ai_server_api_key=TEST_API_KEY
    )
    running_router_module.recommend_running_courses = fake_recommend
    running_router_module.get_running_course_detail = fake_detail
    running_router_module.generate_running_loop_routes = fake_generate
    running_router_module.build_walking_route_preview = fake_preview
    running_router_module.KakaoMapService = FakeKakaoMapService

    headers = {"Authorization": f"Bearer {TEST_API_KEY}"}
    try:
        with TestClient(app) as client:
            unauthorized = client.get(
                "/running/courses/recommend",
                params={"region": "성남시", "distance_option": "5km"},
            )
            assert unauthorized.status_code == 401

            place_search = client.get(
                "/running/places/search",
                params=examples["place_search"]["request"],
                headers=headers,
            )
            assert place_search.status_code == 200
            assert place_search.json() == examples[
                "place_search"
            ]["response"]

            official = client.get(
                "/running/courses/recommend",
                params=examples[
                    "official_metadata_recommendation"
                ]["request"],
                headers=headers,
            )
            assert official.status_code == 200
            assert official.json() == examples[
                "official_metadata_recommendation"
            ]["response"]

            missing = client.get(
                "/running/courses/recommend",
                params=examples["generation_required"]["request"],
                headers=headers,
            )
            assert missing.status_code == 200
            assert missing.json()["status"] == "generation_required"
            assert missing.json()["generation_recommended"] is True

            generated = client.post(
                "/running/routes/generate-loop",
                json=examples["loop_matched"]["request"],
                headers=headers,
            )
            assert generated.status_code == 200
            assert generated.json() == examples[
                "loop_matched"
            ]["response"]

            detail_request = examples[
                "official_metadata_detail"
            ]["request"]
            detail = client.get(
                (
                    "/running/courses/"
                    f"{detail_request['course_id']}"
                ),
                params={
                    "pace_minutes_per_km": detail_request[
                        "pace_minutes_per_km"
                    ]
                },
                headers=headers,
            )
            assert detail.status_code == 200
            assert detail.json() == examples[
                "official_metadata_detail"
            ]["response"]

            preview = client.post(
                "/running/routes/preview",
                json=examples["route_preview"]["request"],
                headers=headers,
            )
            assert preview.status_code == 200
            assert preview.json() == examples[
                "route_preview"
            ]["response"]
            preview_payload = preview.json()
            # origin/backend validates these fields at the response root
            # before signing and storing the route snapshot.
            assert preview_payload["distance_km"] > 0
            assert preview_payload["path"]
            assert preview_payload["distance_km"] == (
                preview_payload["route"]["distance_km"]
            )
            assert preview_payload["path"] == (
                preview_payload["route"]["path"]
            )
    finally:
        security_module.get_settings = original_security_settings
        running_router_module.recommend_running_courses = original_recommend
        running_router_module.get_running_course_detail = original_detail
        running_router_module.generate_running_loop_routes = original_generate
        running_router_module.build_walking_route_preview = original_preview
        running_router_module.KakaoMapService = original_kakao_service

    assert calls == [
        "places:판교역",
        "recommend:5km",
        "recommend:10km",
        "generate:5km",
        "detail:metadata-example",
        "preview",
    ]
    print("Running HTTP E2E contract: OK")


def test_running_http_e2e_contract() -> None:
    main()


if __name__ == "__main__":
    main()
