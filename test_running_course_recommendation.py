import asyncio
import sys
from types import SimpleNamespace

from pydantic import ValidationError

from app.schemas.running import (
    GeoCoordinate,
    RunningCourseRecommendationRequest,
)
from app.services.public_running_course_service import (
    PublicRunningCourseRecord,
    PublicRunningCourseService,
)
from app.services.running_route_service import (
    _filter_courses_within_gps_radius,
    get_running_course_detail,
    recommend_running_courses,
)


if sys.platform == "win32":
    asyncio.set_event_loop_policy(
        asyncio.WindowsSelectorEventLoopPolicy()
    )


class FakePublicCourseService:
    def __init__(
        self,
        courses: list[PublicRunningCourseRecord],
    ) -> None:
        self.courses = courses

    async def fetch_all_courses(
        self,
    ) -> list[PublicRunningCourseRecord]:
        return list(self.courses)

    async def get_course(
        self,
        course_id: str,
    ) -> PublicRunningCourseRecord | None:
        return next(
            (
                course
                for course in self.courses
                if course.course_id == course_id
            ),
            None,
        )


class FakeKakaoMapService:
    def __init__(
        self,
        coordinates: dict[str, GeoCoordinate],
    ) -> None:
        self.coordinates = coordinates

    async def resolve_region_name(
        self,
        coordinate: GeoCoordinate,
    ) -> str:
        return "성남시"

    async def geocode_address(
        self,
        address: str,
    ) -> GeoCoordinate | None:
        return self.coordinates.get(address)


def make_course(
    *,
    course_id: str,
    name: str,
    distance_km: float,
    region: str,
    start_address: str,
) -> PublicRunningCourseRecord:
    return PublicRunningCourseRecord(
        course_id=course_id,
        name=name,
        description=f"{name} 설명",
        distance_km=distance_km,
        source_duration_text="1시간",
        start_name=f"{name} 출발",
        start_address=start_address,
        end_name=f"{name} 출발",
        end_address=start_address,
        route_description=f"{name} 출발→{name} 경유→{name} 출발",
        waypoints=(
            f"{name} 출발",
            f"{name} 경유",
            f"{name} 출발",
        ),
        region=region,
        institution_name=region,
        reference_date="2026-10-01",
        is_loop=True,
    )


async def run_async_tests() -> None:
    near = make_course(
        course_id="near",
        name="가까운 건강길",
        distance_km=5.2,
        region="경기도 성남시",
        start_address="가까운 주소",
    )
    far = make_course(
        course_id="far",
        name="먼 건강길",
        distance_km=5.0,
        region="경기도 성남시",
        start_address="먼 주소",
    )
    wrong_region = make_course(
        course_id="wrong-region",
        name="타지역 건강길",
        distance_km=5.0,
        region="서울특별시 송파구",
        start_address="타지역 주소",
    )
    unknown_location = make_course(
        course_id="unknown-location",
        name="좌표 미확인 건강길",
        distance_km=5.1,
        region="경기도 성남시",
        start_address="좌표 미확인 주소",
    )
    public_service = FakePublicCourseService(
        [far, wrong_region, near, unknown_location]
    )
    kakao_service = FakeKakaoMapService(
        {
            "가까운 주소": GeoCoordinate(
                latitude=37.395,
                longitude=127.111,
            ),
            "먼 주소": GeoCoordinate(
                latitude=37.45,
                longitude=127.15,
            ),
        }
    )
    request = RunningCourseRecommendationRequest(
        distance_option="5km",
        latitude=37.3948,
        longitude=127.1112,
        pace_minutes_per_km=6.0,
        limit=10,
    )
    response = await recommend_running_courses(
        request=request,
        public_course_service=public_service,
        kakao_service=kakao_service,
    )

    assert response.status == "matched"
    assert response.resolved_region == "성남시"
    assert response.distance_min_km == 4.5
    assert response.distance_max_km == 5.5
    assert [course.course_id for course in response.courses] == [
        "near",
    ]
    assert response.courses[0].distance_to_user_km is not None
    assert response.courses[0].distance_to_user_km <= 3.0
    assert response.courses[0].pace_source == "user"
    assert response.courses[0].estimated_duration_minutes == 31.2
    assert response.courses[0].requires_route_validation is True
    assert response.courses[0].source.source_type == "official_metadata"

    gwangju = make_course(
        course_id="gwangju-donggu",
        name="광주 동구 건강길",
        distance_km=5.0,
        region="광주광역시 동구",
        start_address="광주광역시 동구 금남로",
    )
    daegu = make_course(
        course_id="daegu-donggu",
        name="대구 동구 건강길",
        distance_km=5.0,
        region="대구광역시 동구청",
        start_address="대구광역시 동구 신암동",
    )
    ulsan = make_course(
        course_id="ulsan-donggu",
        name="울산 동구 건강길",
        distance_km=5.0,
        region="울산광역시 동구청",
        start_address="울산광역시 동구 화정동",
    )
    regional_response = await recommend_running_courses(
        request=RunningCourseRecommendationRequest(
            region="광주광역시 동구청",
            distance_option="5km",
        ),
        public_course_service=FakePublicCourseService(
            [daegu, ulsan, gwangju]
        ),
    )
    assert [
        course.course_id for course in regional_response.courses
    ] == ["gwangju-donggu"]

    no_match = await recommend_running_courses(
        request=RunningCourseRecommendationRequest(
            region="성남시",
            distance_option="10km",
        ),
        public_course_service=public_service,
    )
    assert no_match.status == "generation_required"
    assert no_match.courses == []
    assert no_match.generation_recommended is True

    moderate_course = make_course(
        course_id="moderate-10k",
        name="평지 10km 길",
        distance_km=10.0,
        region="경기도 성남시",
        start_address="평지 주소",
    )
    hard_course = make_course(
        course_id="hard-10k",
        name="정상 도전 10km 길",
        distance_km=10.0,
        region="경기도 성남시",
        start_address="산길 주소",
    )
    difficulty_response = await recommend_running_courses(
        request=RunningCourseRecommendationRequest(
            region="성남시",
            distance_option="10km",
            desired_difficulty="hard",
        ),
        public_course_service=FakePublicCourseService(
            [moderate_course, hard_course]
        ),
    )
    assert [
        course.course_id for course in difficulty_response.courses
    ] == ["hard-10k", "moderate-10k"]
    assert difficulty_response.courses[0].difficulty == "hard"

    detail = await get_running_course_detail(
        course_id="near",
        pace_minutes_per_km=6.0,
        public_course_service=public_service,
        kakao_service=kakao_service,
    )
    assert detail.course_id == "near"
    assert detail.start.coordinate is not None
    assert detail.geometry_status == "endpoints_geocoded"
    assert detail.path == []


def main() -> None:
    payload_items, total_count = (
        PublicRunningCourseService.parse_course_page_payload(
            {
                "header": {
                    "resultCode": "00",
                    "resultMsg": "NORMAL_CODE",
                },
                "body": {
                    "items": {
                        "item": {
                            "stretNm": "도심건강길",
                            "stretLt": "5.2km",
                        }
                    },
                    "totalCount": "1",
                },
            }
        )
    )
    assert len(payload_items) == 1
    assert total_count == 1

    normalized = PublicRunningCourseService.normalize_course(
        {
            "stretNm": "도심건강길",
            "stretIntrcn": "도심 속 산책길",
            "stretLt": "5.2km",
            "reqreTime": "1시간",
            "beginSpotNm": "시청",
            "beginRdnmadr": "경기도 성남시 시작로 1",
            "endSpotNm": "시청",
            "endRdnmadr": "경기도 성남시 시작로 1",
            "coursInfo": "시청→공원→시청",
            "institutionNm": "경기도 성남시",
            "referenceDate": "2026-10-01",
        }
    )
    assert normalized is not None
    assert normalized.distance_km == 5.2
    assert normalized.waypoints == ("시청", "공원", "시청")
    assert normalized.is_loop is True

    RunningCourseRecommendationRequest(
        region="성남시",
        distance_option="3km",
    )
    try:
        RunningCourseRecommendationRequest(
            distance_option="5km",
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("region/location validation did not run")

    asyncio.run(run_async_tests())
    print("running course recommendation tests: OK")


def test_running_course_recommendation() -> None:
    main()


def test_gps_radius_filter() -> None:
    inside = SimpleNamespace(
        course_id="inside",
        distance_to_user_km=2.999,
    )
    boundary = SimpleNamespace(
        course_id="boundary",
        distance_to_user_km=3.0,
    )
    outside = SimpleNamespace(
        course_id="outside",
        distance_to_user_km=3.001,
    )
    unknown = SimpleNamespace(
        course_id="unknown",
        distance_to_user_km=None,
    )
    courses = [inside, boundary, outside, unknown]

    filtered = _filter_courses_within_gps_radius(
        courses=courses,
        current_location=GeoCoordinate(
            latitude=37.3948,
            longitude=127.1112,
        ),
        radius_km=3.0,
    )
    assert [course.course_id for course in filtered] == [
        "inside",
        "boundary",
    ]

    assert _filter_courses_within_gps_radius(
        courses=courses,
        current_location=None,
        radius_km=3.0,
    ) == courses


if __name__ == "__main__":
    main()
