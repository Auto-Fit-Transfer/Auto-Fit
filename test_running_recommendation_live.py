import asyncio

from app.schemas.running import RunningCourseRecommendationRequest
from app.services.running_route_service import (
    get_running_course_detail,
    recommend_running_courses,
)


async def main() -> None:
    response = await recommend_running_courses(
        RunningCourseRecommendationRequest(
            distance_option="5km",
            region="담양군",
            latitude=35.321,
            longitude=126.988,
            pace_minutes_per_km=6.5,
            desired_difficulty="easy",
            limit=3,
        )
    )

    assert response.status == "matched"
    courses = response.courses
    assert courses
    assert all(
        response.distance_min_km
        <= course.distance_km
        <= response.distance_max_km
        for course in courses
    )
    assert all(
        course.source.source_type == "official_metadata"
        for course in courses
    )
    assert all(
        course.requires_route_validation is True
        for course in courses
    )

    detail = await get_running_course_detail(
        course_id=courses[0].course_id,
        pace_minutes_per_km=6.5,
    )
    assert detail.course_id == courses[0].course_id
    assert detail.estimated_duration_minutes > 0
    print(
        "running recommendation/detail live test: OK "
        f"(courses={len(courses)}, "
        f"geometry={courses[0].geometry_status})"
    )


if __name__ == "__main__":
    asyncio.run(main())
