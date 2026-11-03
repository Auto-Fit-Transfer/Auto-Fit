import hashlib
from types import SimpleNamespace

import pytest

from app.schemas.recommendation import (
    ExerciseRecommendationRequest,
)
from app.services.exercise_catalog_service import (
    EXERCISE_CATALOG_PATH,
    _matches_request,
    candidates_by_key,
    get_exercise_catalog_version,
    load_exercise_catalog,
    select_exercise_candidates,
)
import app.services.exercise_recommendation_service as service


def run_immediate(coroutine):
    """Run a coroutine whose test doubles complete without I/O waits."""

    try:
        coroutine.send(None)
    except StopIteration as exc:
        return exc.value

    coroutine.close()
    raise AssertionError("test coroutine unexpectedly waited for I/O")


def _home_request() -> ExerciseRecommendationRequest:
    return ExerciseRecommendationRequest(
        exercise_mode="home_training",
        daily_condition="normal",
        available_minutes=20,
        preferred_training_types=[
            "home_training",
            "bodyweight",
        ],
        home_training_preferences={
            "equipment": "none",
            "workout_style": "quiet",
        },
    )


def test_catalog_candidates_follow_request_constraints() -> None:
    candidates = select_exercise_candidates(
        _home_request()
    )

    assert candidates
    assert len(candidates) <= 48
    assert len(candidates_by_key(candidates)) == len(candidates)

    for candidate in candidates:
        assert candidate.exercise_key.startswith("ex_")
        assert candidate.assets
        assert set(
            candidate.recommended_training_types
        ).issubset({"home_training", "bodyweight"})
        for asset in candidate.assets:
            assert asset.exercise_mode == "home_training"
            assert "/Home_Workout/" in asset.animation_path


def test_backend_contract_filters_multiple_gym_equipment() -> None:
    request = ExerciseRecommendationRequest(
        available_minutes=60,
        location="gym",
        available_equipment=["machine", "dumbbell"],
        condition_level="보통",
        discomfort_areas=["오른쪽 무릎"],
    )

    candidates = select_exercise_candidates(request)
    candidate_keys = {
        candidate.exercise_key for candidate in candidates
    }
    matched_rows = [
        row
        for row in load_exercise_catalog()
        if row.exercise_key in candidate_keys
        and _matches_request(row, request)
    ]

    assert candidates
    assert request.daily_condition == "normal"
    assert request.has_discomfort is True
    assert matched_rows
    assert all(
        row.asset.exercise_mode == "gym"
        and row.gym_training_style in {"", "any", "machine", "free_weight"}
        for row in matched_rows
    )


def test_every_backend_equipment_combination_has_compatible_candidates() -> None:
    equipment = ["machine", "band", "dumbbell", "mat", "other"]
    rows_by_key: dict[str, list] = {}
    for row in load_exercise_catalog():
        rows_by_key.setdefault(row.exercise_key, []).append(row)

    for location in ("gym", "home", "outdoor", "other"):
        for mask in range(1 << len(equipment)):
            selected = {
                name for index, name in enumerate(equipment)
                if mask & (1 << index)
            }
            request = ExerciseRecommendationRequest(
                available_minutes=45,
                location=location,
                available_equipment=sorted(selected),
                condition_level="보통",
            )
            candidates = select_exercise_candidates(request)
            assert candidates, (location, selected)
            for candidate in candidates:
                all_rows = rows_by_key[candidate.exercise_key]
                if location == "gym":
                    styles = {
                        row.gym_training_style for row in all_rows
                        if row.asset.exercise_mode == "gym"
                    }
                    allowed = {"", "any"}
                    if "machine" in selected:
                        allowed.add("machine")
                    if "dumbbell" in selected:
                        allowed.add("free_weight")
                    assert not styles.isdisjoint(allowed), (
                        location, selected, candidate.exercise_key
                    )
                else:
                    home_equipment = {
                        row.home_equipment for row in all_rows
                        if row.asset.exercise_mode == "home_training"
                    }
                    allowed = {"", "none"}
                    if "band" in selected:
                        allowed.add("band")
                    if "dumbbell" in selected:
                        allowed.add("dumbbell")
                    if location == "home" and "other" in selected:
                        allowed.add("other")
                    assert not home_equipment.isdisjoint(allowed), (
                        location, selected, candidate.exercise_key
                    )


def test_equipment_selection_order_does_not_change_candidates() -> None:
    first = ExerciseRecommendationRequest(
        available_minutes=45,
        location="gym",
        available_equipment=["machine", "dumbbell"],
        condition_level="보통",
    )
    reversed_order = ExerciseRecommendationRequest(
        available_minutes=45,
        location="gym",
        available_equipment=["dumbbell", "machine"],
        condition_level="보통",
    )
    assert select_exercise_candidates(first) == select_exercise_candidates(
        reversed_order
    )


@pytest.mark.parametrize("location", ["home", "outdoor", "other"])
def test_mat_contract_uses_portable_bodyweight_candidates(
    location: str,
) -> None:
    request = ExerciseRecommendationRequest(
        available_minutes=30,
        location=location,
        available_equipment=["mat"],
        condition_level="좋음",
        discomfort_areas=[],
    )

    candidates = select_exercise_candidates(request)
    candidate_keys = {
        candidate.exercise_key for candidate in candidates
    }
    matched_rows = [
        row
        for row in load_exercise_catalog()
        if row.exercise_key in candidate_keys
        and _matches_request(row, request)
    ]

    assert candidates
    assert matched_rows
    assert all(
        row.asset.exercise_mode == "home_training"
        and not row.equipment_detail
        and row.home_equipment == "none"
        for row in matched_rows
    )


def test_explicit_empty_equipment_uses_no_equipment_candidates() -> None:
    request = ExerciseRecommendationRequest(
        available_minutes=30,
        location="home",
        available_equipment=[],
        condition_level="안 좋아요",
        discomfort_areas=[],
    )

    candidates = select_exercise_candidates(request)
    candidate_keys = {
        candidate.exercise_key for candidate in candidates
    }
    matched_rows = [
        row
        for row in load_exercise_catalog()
        if row.exercise_key in candidate_keys
        and _matches_request(row, request)
    ]

    assert candidates
    assert request.daily_condition == "poor"
    assert matched_rows
    assert all(not row.equipment_detail for row in matched_rows)


def test_catalog_version_is_cross_platform_stable() -> None:
    source = EXERCISE_CATALOG_PATH.read_bytes()
    normalized = source.replace(b"\r\n", b"\n").replace(
        b"\r",
        b"\n",
    )

    assert get_exercise_catalog_version() == (
        "sha256:" + hashlib.sha256(normalized).hexdigest()
    )


def test_hydration_rejects_key_outside_candidates() -> None:
    candidates = select_exercise_candidates(
        _home_request()
    )
    selection = service._CatalogExerciseRecommendationSelection(
        summary="catalog enforcement fixture",
        weekly_frequency=3,
        intensity="보통",
        sessions=[
            {
                "name": "홈트",
                "exercises": [
                    {
                        "exercise_key": "ex_not_in_catalog",
                        "name": "임의 운동",
                    }
                ],
            }
        ],
    )

    with pytest.raises(RuntimeError):
        service._hydrate_catalog_response(
            selection,
            candidates,
        )


def test_generate_hydrates_only_catalog_assets(
    monkeypatch,
) -> None:
    request = _home_request()
    candidates = select_exercise_candidates(request)
    selected = candidates[0]

    class FakeResponses:
        def __init__(self) -> None:
            self.input_text = ""

        async def parse(self, **kwargs):
            self.input_text = kwargs["input"]
            return SimpleNamespace(
                output_parsed=(
                    service._CatalogExerciseRecommendationSelection(
                        summary="CSV 운동만 사용",
                        weekly_frequency=3,
                        intensity="보통",
                        sessions=[
                            {
                                "name": "홈트",
                                "focus": "전신",
                                "estimated_duration_minutes": 20,
                                "exercises": [
                                    {
                                        "exercise_key": (
                                            selected.exercise_key
                                        ),
                                        "name": "카탈로그 운동",
                                        "duration_minutes": 5,
                                        "intensity": "보통",
                                        "instructions": [
                                            "안정적으로 수행하세요."
                                        ],
                                    }
                                ],
                            }
                        ],
                        cautions=[],
                        sources=[],
                    )
                )
            )

    class FakeClient:
        def __init__(self) -> None:
            self.responses = FakeResponses()

    fake_client = FakeClient()

    async def fake_rag_node(_state):
        return {"rag_context": []}

    monkeypatch.setattr(
        service,
        "_get_openai_client",
        lambda: fake_client,
    )
    monkeypatch.setattr(
        service,
        "rag_node",
        fake_rag_node,
    )

    result = run_immediate(
        service.generate_exercise_recommendation(request)
    )

    exercise = result.sessions[0].exercises[0]
    assert exercise.exercise_key == selected.exercise_key
    assert exercise.catalog_name_en == selected.exercise_name_en
    assert exercise.name == "카탈로그 운동"
    assert exercise.exercise_modes == sorted(
        {
            asset.exercise_mode
            for asset in selected.assets
        }
    )
    assert result.catalog_version == (
        get_exercise_catalog_version()
    )
    assert selected.exercise_key in (
        fake_client.responses.input_text
    )
    assert "catalog_candidates" in (
        fake_client.responses.input_text
    )
