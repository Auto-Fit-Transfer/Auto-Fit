import asyncio
import sys

from pydantic import ValidationError

from app.schemas.running import (
    GeoCoordinate,
    RunningLoopGenerationRequest,
)
from app.services.kakao_map_service import KakaoMapProviderError
from app.services.running_route_service import (
    generate_running_loop_routes,
)
from app.utils.coordinates import haversine_distance_km


if sys.platform == "win32":
    asyncio.set_event_loop_policy(
        asyncio.WindowsSelectorEventLoopPolicy()
    )


class FakeAdaptiveKakaoService:
    async def get_walking_route(
        self,
        start: GeoCoordinate,
        end: GeoCoordinate,
        waypoints: list[GeoCoordinate] | None = None,
    ) -> dict[str, object]:
        path = [start, *(waypoints or []), end]
        geometric_distance_km = sum(
            haversine_distance_km(path[index - 1], path[index])
            for index in range(1, len(path))
        )
        return {
            "distance_m": geometric_distance_km * 1.25 * 1000,
            "duration_seconds": 3600,
            "path": path,
        }

    async def resolve_region_name(
        self,
        coordinate: GeoCoordinate,
    ) -> str:
        return "성남시"


class FakeBestEffortKakaoService(FakeAdaptiveKakaoService):
    async def get_walking_route(
        self,
        start: GeoCoordinate,
        end: GeoCoordinate,
        waypoints: list[GeoCoordinate] | None = None,
    ) -> dict[str, object]:
        return {
            "distance_m": 7000,
            "duration_seconds": 4800,
            "path": [start, *(waypoints or []), end],
        }


class FakeFailingKakaoService:
    async def get_walking_route(
        self,
        start: GeoCoordinate,
        end: GeoCoordinate,
        waypoints: list[GeoCoordinate] | None = None,
    ) -> dict[str, object]:
        raise KakaoMapProviderError("route unavailable")


async def run_async_tests() -> None:
    start = GeoCoordinate(
        latitude=37.3948,
        longitude=127.1112,
    )
    request = RunningLoopGenerationRequest(
        start=start,
        distance_option="5km",
        pace_minutes_per_km=6.0,
        candidate_count=3,
        seed=42,
    )

    response = await generate_running_loop_routes(
        request=request,
        kakao_service=FakeAdaptiveKakaoService(),
    )
    assert response.status == "matched"
    assert response.resolved_region == "성남시"
    assert response.target_distance_km == 5.0
    assert response.distance_min_km == 4.5
    assert response.distance_max_km == 5.5
    assert response.tolerance_percent == 10.0
    assert response.attempts_used == 6
    assert len(response.candidates) == 3
    assert len(
        {candidate.course_id for candidate in response.candidates}
    ) == 3
    assert all(
        candidate.within_tolerance
        for candidate in response.candidates
    )
    assert all(
        candidate.source.source_type == "auto_generated"
        for candidate in response.candidates
    )
    assert all(
        candidate.start.coordinate == candidate.end.coordinate
        for candidate in response.candidates
    )
    assert all(
        candidate.path[0] == start and candidate.path[-1] == start
        for candidate in response.candidates
    )
    assert response.candidates[0].pace_source == "user"
    assert response.candidates[0].pace_assumed is False

    best_effort = await generate_running_loop_routes(
        request=request,
        kakao_service=FakeBestEffortKakaoService(),
    )
    assert best_effort.status == "best_effort"
    assert best_effort.candidates
    assert all(
        not candidate.within_tolerance
        for candidate in best_effort.candidates
    )
    assert all(
        candidate.distance_km == 7.0
        for candidate in best_effort.candidates
    )
    assert best_effort.message is not None

    unavailable = await generate_running_loop_routes(
        request=request,
        kakao_service=FakeFailingKakaoService(),
    )
    assert unavailable.status == "unavailable"
    assert unavailable.candidates == []
    assert unavailable.attempts_used == 6
    assert unavailable.message is not None


def main() -> None:
    RunningLoopGenerationRequest(
        start=GeoCoordinate(latitude=37.4, longitude=127.1),
        distance_option="custom",
        custom_distance_km=7.5,
    )
    try:
        RunningLoopGenerationRequest(
            start=GeoCoordinate(latitude=37.4, longitude=127.1),
            distance_option="custom",
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("custom distance validation did not run")

    asyncio.run(run_async_tests())
    print("running loop generation tests: OK")


if __name__ == "__main__":
    main()
