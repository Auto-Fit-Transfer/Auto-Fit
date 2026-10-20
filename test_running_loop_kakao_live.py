import asyncio

from app.schemas.running import (
    GeoCoordinate,
    RunningLoopGenerationRequest,
)
from app.services.kakao_map_service import KakaoMapService
from app.services.running_route_service import (
    generate_running_loop_routes,
)


async def main() -> None:
    start = GeoCoordinate(
        latitude=37.3948,
        longitude=127.1112,
    )
    waypoints = [
        GeoCoordinate(latitude=37.3948, longitude=127.1197),
        GeoCoordinate(latitude=37.4015, longitude=127.1197),
        GeoCoordinate(latitude=37.4015, longitude=127.1112),
    ]

    async with KakaoMapService() as service:
        route = await service.get_walking_route(
            start=start,
            end=start,
            waypoints=waypoints,
        )

    assert route["distance_m"] > 0
    assert len(route["path"]) >= 2

    generated = await generate_running_loop_routes(
        RunningLoopGenerationRequest(
            start=start,
            distance_option="5km",
            pace_minutes_per_km=6.5,
            candidate_count=1,
            seed=0,
        )
    )
    assert generated.status in {"matched", "best_effort"}
    assert len(generated.candidates) == 1
    assert generated.candidates[0].path
    assert generated.candidates[0].start.coordinate == start
    assert generated.candidates[0].end.coordinate == start
    print(
        "Kakao loop route live test: OK "
        f"(distance_km={route['distance_m'] / 1000:.3f}, "
        f"points={len(route['path'])}, "
        f"generated_status={generated.status}, "
        f"generated_km={generated.candidates[0].distance_km:.3f})"
    )


if __name__ == "__main__":
    asyncio.run(main())
