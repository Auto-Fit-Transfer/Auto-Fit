from pydantic import ValidationError

from app.schemas.running import RunningSessionRecommendationRequest
from app.services.public_running_course_service import (
    PublicRunningCourseRecord,
)
from app.services.running_route_service import (
    recommend_running_session,
)


class FakePublicCourseService:
    def __init__(self) -> None:
        self.course = PublicRunningCourseRecord(
            course_id="safe-loop",
            name="가벼운 순환길",
            description="평탄한 순환 코스",
            distance_km=4.0,
            source_duration_text="30분",
            start_name="공원 입구",
            start_address="경기도 성남시 공원로 1",
            end_name="공원 입구",
            end_address="경기도 성남시 공원로 1",
            route_description="공원 입구→산책로→공원 입구",
            waypoints=("공원 입구", "산책로", "공원 입구"),
            region="경기도 성남시",
            institution_name="성남시",
            reference_date="2026-10-01",
            is_loop=True,
        )

    async def fetch_all_courses(self):
        return [self.course]


def run_immediate(coroutine):
    """Run a coroutine whose test doubles complete without I/O waits."""

    try:
        coroutine.send(None)
    except StopIteration as exc:
        return exc.value

    coroutine.close()
    raise AssertionError("test coroutine unexpectedly waited for I/O")


async def run_tests() -> None:
    treadmill = await recommend_running_session(
        RunningSessionRecommendationRequest(
            daily_condition="good",
            target_minutes=45,
            intensity="hard",
            environment="treadmill",
            pace_minutes_per_km=6.0,
        )
    )
    assert treadmill.status == "treadmill_ready"
    assert treadmill.recommended_intensity == "hard"
    assert treadmill.recommended_pace_minutes_per_km == 5.4
    assert treadmill.target_distance_km == 8.333
    assert treadmill.pace_source == "user"
    assert treadmill.pace_assumed is False
    assert treadmill.course_recommendation is None

    outdoor = await recommend_running_session(
        RunningSessionRecommendationRequest(
            daily_condition="tired",
            target_minutes=30,
            intensity="hard",
            environment="outdoor",
            has_discomfort=True,
            discomfort_areas=["knee"],
            region="성남시",
        ),
        public_course_service=FakePublicCourseService(),
    )
    assert outdoor.status == "course_candidates"
    assert outdoor.recommended_intensity == "light"
    assert outdoor.intensity_adjusted is True
    assert outdoor.target_distance_km == 3.727
    assert outdoor.pace_source == "default"
    assert outdoor.pace_assumed is True
    assert "recovery_priority" in outdoor.safety_tags
    assert "discomfort_reported" in outdoor.safety_tags
    assert outdoor.course_recommendation is not None
    assert outdoor.course_recommendation.courses[0].pace_source == "default"
    assert outdoor.course_recommendation.courses[0].pace_assumed is True

    blood_pressure = await recommend_running_session(
        RunningSessionRecommendationRequest(
            metric_statuses={"blood_pressure": "high"},
            daily_condition="normal",
            target_minutes=30,
            intensity="hard",
            environment="treadmill",
        )
    )
    assert blood_pressure.recommended_intensity == "moderate"
    assert blood_pressure.intensity_adjusted is True


def main() -> None:
    try:
        RunningSessionRecommendationRequest(
            daily_condition="good",
            target_minutes=30,
            intensity="light",
            environment="outdoor",
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("outdoor location validation did not run")

    run_immediate(run_tests())
    print("running session recommendation tests: OK")


def test_running_session_recommendation() -> None:
    main()


if __name__ == "__main__":
    main()
