from pydantic import ValidationError

from app.schemas.running import (
    GeoCoordinate,
    RunningDistanceRequest,
    WalkingRouteRequest,
)
from app.services.kakao_map_service import KakaoMapService
from app.utils.coordinates import (
    distance_tolerance_bounds_km,
    estimate_running_duration_minutes,
    haversine_distance_km,
    kakao_xy_to_coordinate,
    resolve_target_distance_km,
)


def main() -> None:
    start = GeoCoordinate(
        latitude=37.394776627382875,
        longitude=127.11119669891646,
    )
    end = GeoCoordinate(
        latitude=37.4199323570413,
        longitude=127.12629039752096,
    )

    assert haversine_distance_km(start, end) > 0
    assert resolve_target_distance_km("5km", None) == 5.0
    assert resolve_target_distance_km("custom", 7.5) == 7.5
    assert distance_tolerance_bounds_km(5.0) == (4.5, 5.5)
    assert estimate_running_duration_minutes(5.0, 6.5) == 32.5

    request = WalkingRouteRequest(
        start=start,
        end=end,
        pace_minutes_per_km=6.5,
    )
    assert request.waypoints == []

    RunningDistanceRequest(distance_option="3km")
    RunningDistanceRequest(
        distance_option="custom",
        custom_distance_km=7.5,
    )

    try:
        RunningDistanceRequest(distance_option="custom")
    except ValidationError:
        pass
    else:
        raise AssertionError("custom distance validation did not run")

    coordinate = kakao_xy_to_coordinate(
        127.1,
        37.4,
    )
    assert coordinate.longitude == 127.1
    assert coordinate.latitude == 37.4

    parsed = KakaoMapService.parse_walking_route_payload(
        {
            "status": "OK",
            "route": {
                "properties": {
                    "totalDistance": 4163,
                    "totalTime": 4012,
                },
                "legs": [
                    {
                        "steps": [
                            {
                                "path": {
                                    "points": [
                                        [127.1, 37.4],
                                        [127.11, 37.41],
                                    ]
                                }
                            }
                        ]
                    }
                ],
            },
        }
    )
    assert parsed["distance_m"] == 4163.0
    assert parsed["duration_seconds"] == 4012
    assert len(parsed["path"]) == 2

    print("running foundation tests: OK")


if __name__ == "__main__":
    main()
