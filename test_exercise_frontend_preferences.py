from types import SimpleNamespace

from pydantic import ValidationError

from app.schemas.recommendation import (
    ExerciseRecommendationRequest,
    ExerciseRecommendationResponse,
)
import app.services.exercise_recommendation_service as service


class FakeResponses:
    def __init__(self) -> None:
        self.input_text = ""

    async def parse(self, **kwargs):
        self.input_text = kwargs["input"]
        return SimpleNamespace(
            output_parsed=ExerciseRecommendationResponse(
                summary="오늘의 설정을 반영한 홈트",
                weekly_frequency=3,
                intensity="가벼움",
                sessions=[],
                cautions=[],
                sources=[],
            )
        )


class FakeClient:
    def __init__(self) -> None:
        self.responses = FakeResponses()


def run_immediate(coroutine):
    """Run a coroutine whose test doubles complete without I/O waits."""

    try:
        coroutine.send(None)
    except StopIteration as exc:
        return exc.value

    coroutine.close()
    raise AssertionError("test coroutine unexpectedly waited for I/O")


async def run_service_test() -> None:
    request = ExerciseRecommendationRequest(
        exercise_mode="home_training",
        daily_condition="tired",
        available_minutes=15,
        has_discomfort=True,
        discomfort_areas=["knee"],
        home_training_preferences={
            "equipment": "none",
            "workout_style": "quiet",
        },
        preferred_training_types=[
            "home_training",
            "bodyweight",
        ],
    )
    fake_client = FakeClient()

    original_client = service._get_openai_client
    original_rag_node = service.rag_node

    async def fake_rag_node(_state):
        return {"rag_context": []}

    try:
        service._get_openai_client = lambda: fake_client
        service.rag_node = fake_rag_node
        response = await service.generate_exercise_recommendation(
            request
        )
    finally:
        service._get_openai_client = original_client
        service.rag_node = original_rag_node

    assert response.summary == "오늘의 설정을 반영한 홈트"
    assert '"exercise_mode": "home_training"' in (
        fake_client.responses.input_text
    )
    assert '"daily_condition": "tired"' in (
        fake_client.responses.input_text
    )
    assert '"equipment": "none"' in fake_client.responses.input_text
    assert '"workout_style": "quiet"' in (
        fake_client.responses.input_text
    )
    assert '"recovery_priority"' in fake_client.responses.input_text
    assert '"discomfort_reported"' in fake_client.responses.input_text


def main() -> None:
    gym_request = ExerciseRecommendationRequest(
        exercise_mode="gym",
        daily_condition="good",
        available_minutes=30,
        gym_preferences={
            "training_style": "machine",
            "focus_area": "upper_body",
        },
    )
    assert gym_request.gym_preferences is not None
    assert gym_request.gym_preferences.training_style == "machine"

    ExerciseRecommendationRequest(
        goal_type="weight_loss",
        available_minutes=30,
    )

    custom_home = ExerciseRecommendationRequest(
        exercise_mode="home_training",
        daily_condition="normal",
        available_minutes=25,
        home_training_preferences={
            "equipment": "other",
            "other_equipment": "yoga_mat",
            "workout_style": "other",
            "other_workout_style": "mobility",
        },
    )
    assert custom_home.home_training_preferences is not None
    assert (
        custom_home.home_training_preferences.other_equipment
        == "yoga_mat"
    )

    try:
        ExerciseRecommendationRequest(
            exercise_mode="home_training",
            daily_condition="normal",
            available_minutes=25,
            home_training_preferences={
                "equipment": "other",
                "workout_style": "quiet",
            },
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("custom equipment validation did not run")

    try:
        ExerciseRecommendationRequest(
            exercise_mode="gym",
            daily_condition="normal",
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("gym preferences validation did not run")

    try:
        ExerciseRecommendationRequest(
            discomfort_areas=["knee"],
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("discomfort validation did not run")

    run_immediate(run_service_test())
    print("exercise frontend preference tests: OK")


if __name__ == "__main__":
    main()
