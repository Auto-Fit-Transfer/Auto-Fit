from pydantic import ValidationError

from app.schemas.running import (
    GeoCoordinate,
    RunningDistanceRequest,
    WalkingRouteRequest,
)
from app.services.kakao_map_service import KakaoMapService
from app.services.running_route_service import _matches_region_text
from app.utils.coordinates import (
    distance_tolerance_bounds_km,
    estimate_running_duration_minutes,
    haversine_distance_km,
    kakao_xy_to_coordinate,
    resolve_target_distance_km,
)


class FakeKakaoSearchService(KakaoMapService):
    def __init__(self) -> None:
        self.request_params: list[dict[str, object]] = []

    async def _request_json(
        self,
        path: str,
        params: dict[str, object],
    ) -> dict[str, object]:
        self.request_params.append(params)
        return {
            "documents": [
                {
                    "place_name": f"장소 {index}",
                    "address_name": "광주광역시 동구",
                    "road_address_name": "광주광역시 동구 금남로",
                    "x": str(126.90 + index / 1000),
                    "y": str(35.14 + index / 1000),
                    "distance": str(index * 10),
                }
                for index in range(11)
            ],
            "meta": {"is_end": True},
        }


def run_immediate(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as exc:
        return exc.value

    coroutine.close()
    raise AssertionError("test coroutine unexpectedly waited for I/O")


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

    resolved_region = KakaoMapService.parse_region_name_payload(
        {
            "documents": [
                {
                    "region_type": "H",
                    "region_1depth_name": "광주광역시",
                    "region_2depth_name": "동구",
                    "address_name": "광주광역시 동구 서남동",
                }
            ]
        }
    )
    assert resolved_region == "광주광역시 동구"

    assert _matches_region_text(
        "광주광역시 동구 광주광역시 동구청",
        "광주광역시 동구청",
    )
    assert not _matches_region_text(
        "대구광역시 동구 대구광역시 동구청",
        "광주광역시 동구청",
    )
    assert not _matches_region_text(
        "울산광역시 동구 울산광역시 동구청",
        "광주광역시 동구청",
    )

    search_service = FakeKakaoSearchService()
    places = run_immediate(
        search_service.search_places(
            query="광주광역시 동구청",
            size=2,
        )
    )
    assert len(places) == 2
    assert search_service.request_params[0]["size"] == 2

    print("running foundation tests: OK")


def test_running_foundation() -> None:
    main()


if __name__ == "__main__":
    main()
