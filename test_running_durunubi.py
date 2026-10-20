import asyncio
import sys

from app.schemas.running import (
    GeoCoordinate,
    RunningCourseRecommendationRequest,
)
from app.services.durunubi_course_service import (
    DurunubiCourseRecord,
    DurunubiCourseService,
    DurunubiGeometry,
    DurunubiProviderError,
)
from app.services.public_running_course_service import (
    PublicRunningCourseRecord,
)
from app.services.running_route_service import (
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


class FakeDurunubiCourseService:
    def __init__(
        self,
        courses: list[DurunubiCourseRecord],
        geometries: dict[str, DurunubiGeometry],
    ) -> None:
        self.courses = courses
        self.geometries = geometries

    async def fetch_all_courses(
        self,
    ) -> list[DurunubiCourseRecord]:
        return list(self.courses)

    async def get_course(
        self,
        course_id: str,
    ) -> DurunubiCourseRecord | None:
        normalized = course_id.removeprefix("durunubi-")
        return next(
            (
                course
                for course in self.courses
                if course.course_id == normalized
            ),
            None,
        )

    async def get_geometry(
        self,
        course: DurunubiCourseRecord,
    ) -> DurunubiGeometry:
        return self.geometries[course.course_id]


class FailingDurunubiCourseService:
    async def fetch_all_courses(
        self,
    ) -> list[DurunubiCourseRecord]:
        raise DurunubiProviderError("provider unavailable")


def make_public_course() -> PublicRunningCourseRecord:
    return PublicRunningCourseRecord(
        course_id="metadata-course",
        name="메타데이터 건강길",
        description="공식 메타데이터 코스",
        distance_km=5.0,
        source_duration_text="1시간",
        start_name="출발점",
        start_address="경기도 성남시",
        end_name="도착점",
        end_address="경기도 성남시",
        route_description="출발점→공원→도착점",
        waypoints=("출발점", "공원", "도착점"),
        region="경기도 성남시",
        institution_name="성남시",
        reference_date="2026-10-01",
        is_loop=False,
    )


def make_durunubi_course() -> DurunubiCourseRecord:
    return DurunubiCourseRecord(
        course_id="123",
        route_id="45",
        name="두루누비 순환길",
        distance_km=5.0,
        duration_minutes=70.0,
        difficulty="moderate",
        is_loop=True,
        description="두루누비 공식 설명",
        summary="성남시 순환형 코스",
        tourism_points="중앙공원",
        traveler_info="보행로 이용",
        region="경기도 성남시",
        gpx_url="http://www.durunubi.kr/example.gpx",
        modified_at="20261001",
    )


def make_geometry() -> DurunubiGeometry:
    return DurunubiGeometry(
        path=(
            GeoCoordinate(latitude=37.3948, longitude=127.1112),
            GeoCoordinate(latitude=37.4100, longitude=127.1300),
            GeoCoordinate(latitude=37.3949, longitude=127.1113),
        ),
        distance_km=5.0,
        original_point_count=3,
    )


async def run_async_tests() -> None:
    public_course = make_public_course()
    durunubi_course = make_durunubi_course()
    geometry = make_geometry()
    public_service = FakePublicCourseService([public_course])
    durunubi_service = FakeDurunubiCourseService(
        [durunubi_course],
        {durunubi_course.course_id: geometry},
    )

    response = await recommend_running_courses(
        request=RunningCourseRecommendationRequest(
            region="성남시",
            distance_option="5km",
            pace_minutes_per_km=6.0,
            limit=10,
        ),
        public_course_service=public_service,
        durunubi_service=durunubi_service,
    )

    assert response.status == "matched"
    assert [course.course_id for course in response.courses] == [
        "durunubi-123",
        "metadata-course",
    ]
    gpx_course = response.courses[0]
    assert gpx_course.source.source_type == "official_gpx"
    assert gpx_course.source.source_course_id == "123"
    assert gpx_course.geometry_status == "verified_polyline"
    assert gpx_course.geometry_distance_km == 5.0
    assert gpx_course.requires_route_validation is False
    assert gpx_course.difficulty == "moderate"
    assert gpx_course.difficulty_basis == "official"
    assert gpx_course.estimated_duration_minutes == 30.0
    assert response.data_sources[1].state == "available"

    detail = await get_running_course_detail(
        course_id="durunubi-123",
        pace_minutes_per_km=6.0,
        public_course_service=public_service,
        durunubi_service=durunubi_service,
    )
    assert detail.course_id == "durunubi-123"
    assert detail.source_duration_text == "1시간 10분"
    assert detail.path == list(geometry.path)
    assert detail.start.coordinate == geometry.path[0]
    assert detail.end.coordinate == geometry.path[-1]

    fallback = await recommend_running_courses(
        request=RunningCourseRecommendationRequest(
            region="성남시",
            distance_option="5km",
        ),
        public_course_service=public_service,
        durunubi_service=FailingDurunubiCourseService(),
    )
    assert [course.course_id for course in fallback.courses] == [
        "metadata-course"
    ]
    assert fallback.data_sources[1].state == "unavailable"


def main() -> None:
    items, total_count = DurunubiCourseService.parse_course_page_payload(
        {
            "response": {
                "header": {
                    "resultCode": "0000",
                    "resultMsg": "OK",
                },
                "body": {
                    "items": {
                        "item": {
                            "crsIdx": "123",
                            "crsKorNm": "두루누비 순환길",
                        }
                    },
                    "totalCount": "1",
                },
            }
        }
    )
    assert len(items) == 1
    assert total_count == 1

    normalized = DurunubiCourseService.normalize_course(
        {
            "routeIdx": "45",
            "crsIdx": "123",
            "crsKorNm": "두루누비 순환길",
            "crsDstnc": "5.0",
            "crsTotlRqrmHour": "70",
            "crsLevel": "2",
            "crsCycle": "순환형",
            "crsContents": "<p>공식 설명</p>",
            "crsSummary": "코스 요약",
            "sigun": "경기도 성남시",
            "gpxpath": "http://www.durunubi.kr/example.gpx",
            "modifiedtime": "20261001",
        }
    )
    assert normalized is not None
    assert normalized.difficulty == "moderate"
    assert normalized.is_loop is True
    assert normalized.description == "공식 설명"

    gpx = b"""<?xml version='1.0' encoding='UTF-8'?>
    <gpx xmlns='http://www.topografix.com/GPX/1/1'>
      <trk><trkseg>
        <trkpt lat='37.3948' lon='127.1112'/>
        <trkpt lat='37.4000' lon='127.1200'/>
        <trkpt lat='37.4100' lon='127.1300'/>
      </trkseg></trk>
    </gpx>
    """
    parsed_geometry = DurunubiCourseService.parse_gpx(
        gpx,
        max_points=2,
    )
    assert parsed_geometry.original_point_count == 3
    assert len(parsed_geometry.path) == 2
    assert parsed_geometry.distance_km > 0
    assert parsed_geometry.path[0].latitude == 37.3948
    assert parsed_geometry.path[-1].longitude == 127.13

    assert (
        DurunubiCourseService._normalize_gpx_url(
            "http://www.durunubi.kr/example.gpx"
        )
        == "https://www.durunubi.kr/example.gpx"
    )
    try:
        DurunubiCourseService._normalize_gpx_url(
            "https://example.com/untrusted.gpx"
        )
    except DurunubiProviderError:
        pass
    else:
        raise AssertionError("unapproved GPX URL was accepted")

    asyncio.run(run_async_tests())
    print("running Durunubi tests: OK")


if __name__ == "__main__":
    main()
