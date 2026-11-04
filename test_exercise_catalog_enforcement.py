import hashlib
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.recommendation import (
    ExerciseItem,
    ExerciseRecommendationRequest,
    ExerciseRecommendationResponse,
    ExerciseSession,
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
import app.routers.recommendation_router as recommendation_router


def run_immediate(coroutine):
    """Run a coroutine whose test doubles complete without I/O waits."""

    try:
        coroutine.send(None)
    except StopIteration as exc:
        return exc.value

    coroutine.close()
    raise AssertionError("test coroutine unexpectedly waited for I/O")


def _home_request(
    available_minutes: int = 20,
) -> ExerciseRecommendationRequest:
    return ExerciseRecommendationRequest(
        exercise_mode="home_training",
        daily_condition="normal",
        available_minutes=available_minutes,
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
        intensity="moderate",
        sessions=[
            {
                "name": "홈트",
                "exercises": [
                    {
                        "exercise_key": "ex_not_in_catalog",
                        "name": "임의 운동",
                        "duration_minutes": 5,
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


def _duration_selection(
    exercise_key: str,
    *session_totals: int,
    estimated_duration_minutes: int | None = None,
) -> service._CatalogExerciseRecommendationSelection:
    return service._CatalogExerciseRecommendationSelection(
        summary="운동 시간 계약 fixture",
        weekly_frequency=3,
        intensity="moderate",
        sessions=[
            {
                "name": f"세션 {index}",
                "estimated_duration_minutes": (
                    estimated_duration_minutes
                ),
                "exercises": [
                    {
                        "exercise_key": exercise_key,
                        "name": "카탈로그 운동",
                        "duration_minutes": total_minutes,
                    }
                ],
            }
            for index, total_minutes in enumerate(
                session_totals,
                start=1,
            )
        ],
    )


@pytest.mark.parametrize("total_minutes", [45, 50])
def test_hydration_accepts_target_through_plus_five_minutes(
    total_minutes: int,
) -> None:
    request = _home_request(45)
    candidates = select_exercise_candidates(request)
    selection = _duration_selection(
        candidates[0].exercise_key,
        total_minutes,
        estimated_duration_minutes=1,
    )

    result = service._hydrate_catalog_response(
        selection,
        candidates,
        target_duration_minutes=request.available_minutes,
    )

    session = result.sessions[0]
    assert session.estimated_duration_minutes == total_minutes
    assert session.estimated_duration_minutes == sum(
        exercise.duration_minutes for exercise in session.exercises
    )


@pytest.mark.parametrize("total_minutes", [44, 51])
def test_hydration_rejects_duration_outside_target_window(
    total_minutes: int,
) -> None:
    request = _home_request(45)
    candidates = select_exercise_candidates(request)
    selection = _duration_selection(
        candidates[0].exercise_key,
        total_minutes,
    )

    with pytest.raises(service._ExerciseSelectionValidationError):
        service._hydrate_catalog_response(
            selection,
            candidates,
            target_duration_minutes=request.available_minutes,
        )


def test_hydration_rejects_when_any_session_breaks_duration_window() -> None:
    request = _home_request(45)
    candidates = select_exercise_candidates(request)
    selection = _duration_selection(
        candidates[0].exercise_key,
        45,
        44,
    )

    with pytest.raises(service._ExerciseSelectionValidationError):
        service._hydrate_catalog_response(
            selection,
            candidates,
            target_duration_minutes=request.available_minutes,
        )


def test_hydration_normalizes_legacy_none_duration_to_actual_total() -> None:
    request = ExerciseRecommendationRequest()
    assert request.available_minutes is None
    candidates = select_exercise_candidates(request)
    selection = _duration_selection(
        candidates[0].exercise_key,
        5,
        estimated_duration_minutes=30,
    )

    result = service._hydrate_catalog_response(
        selection,
        candidates,
        target_duration_minutes=request.available_minutes,
    )

    assert result.sessions[0].estimated_duration_minutes == 5


@pytest.mark.parametrize(
    ("available_minutes", "should_accept"),
    [(200, True), (201, False)],
)
def test_request_enforces_200_minute_maximum(
    available_minutes: int,
    should_accept: bool,
) -> None:
    if should_accept:
        assert _home_request(available_minutes).available_minutes == 200
        return

    with pytest.raises(ValidationError):
        _home_request(available_minutes)


@pytest.mark.parametrize(
    ("target_minutes", "total_minutes", "should_accept"),
    [
        (195, 195, True),
        (195, 200, True),
        (195, 201, False),
        (198, 198, True),
        (198, 200, True),
        (198, 201, False),
        (200, 200, True),
        (200, 201, False),
    ],
)
def test_hydration_caps_session_total_at_200_minutes(
    target_minutes: int,
    total_minutes: int,
    should_accept: bool,
) -> None:
    request = _home_request(target_minutes)
    candidates = select_exercise_candidates(request)
    exercise_durations = (
        [total_minutes]
        if total_minutes <= 200
        else [200, total_minutes - 200]
    )
    selection = service._CatalogExerciseRecommendationSelection(
        summary="최대 요청 시간 경계 fixture",
        weekly_frequency=3,
        intensity="moderate",
        sessions=[
            {
                "name": "최대 시간 세션",
                "exercises": [
                    {
                        "exercise_key": candidates[index].exercise_key,
                        "name": f"카탈로그 운동 {index + 1}",
                        "duration_minutes": duration_minutes,
                    }
                    for index, duration_minutes in enumerate(
                        exercise_durations
                    )
                ],
            }
        ],
    )

    if should_accept:
        result = service._hydrate_catalog_response(
            selection,
            candidates,
            target_duration_minutes=request.available_minutes,
        )
        assert (
            result.sessions[0].estimated_duration_minutes
            == total_minutes
        )
        return

    with pytest.raises(
        service._ExerciseSelectionValidationError
    ) as exc_info:
        service._hydrate_catalog_response(
            selection,
            candidates,
            target_duration_minutes=request.available_minutes,
        )

    assert exc_info.value.reason == "session_duration_out_of_range"
    assert exc_info.value.details == {
        "target_minutes": target_minutes,
        "actual_minutes": total_minutes,
        "maximum_minutes": 200,
    }


@pytest.mark.parametrize(
    ("total_minutes", "should_accept"),
    [(200, True), (201, False)],
)
def test_hydration_applies_absolute_maximum_without_target(
    total_minutes: int,
    should_accept: bool,
) -> None:
    request = ExerciseRecommendationRequest()
    candidates = select_exercise_candidates(request)
    exercise_durations = (
        [total_minutes]
        if total_minutes <= 200
        else [200, total_minutes - 200]
    )
    selection = service._CatalogExerciseRecommendationSelection(
        summary="레거시 절대 상한 fixture",
        weekly_frequency=3,
        intensity="moderate",
        sessions=[
            {
                "name": "레거시 세션",
                "estimated_duration_minutes": 1,
                "exercises": [
                    {
                        "exercise_key": candidates[index].exercise_key,
                        "name": f"카탈로그 운동 {index + 1}",
                        "duration_minutes": duration_minutes,
                    }
                    for index, duration_minutes in enumerate(
                        exercise_durations
                    )
                ],
            }
        ],
    )

    if should_accept:
        result = service._hydrate_catalog_response(
            selection,
            candidates,
        )
        assert result.sessions[0].estimated_duration_minutes == 200
        return

    with pytest.raises(
        service._ExerciseSelectionValidationError
    ) as exc_info:
        service._hydrate_catalog_response(
            selection,
            candidates,
        )

    assert exc_info.value.details == {
        "actual_minutes": 201,
        "maximum_minutes": 200,
    }


@pytest.mark.parametrize(
    ("target_minutes", "maximum_minutes"),
    [(20, 25), (195, 200), (198, 200), (200, 200), (None, 200)],
)
def test_maximum_session_duration_is_capped_at_200(
    target_minutes: int | None,
    maximum_minutes: int,
) -> None:
    assert (
        service._maximum_session_duration_minutes(target_minutes)
        == maximum_minutes
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
                        intensity="high",
                        sessions=[
                            {
                                "name": "홈트",
                                "focus": "전신",
                                "estimated_duration_minutes": 1,
                                "exercises": [
                                    {
                                        "exercise_key": (
                                            selected.exercise_key
                                        ),
                                        "name": "카탈로그 운동",
                                        "duration_minutes": 20,
                                        "intensity": "moderate",
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
    assert request.daily_condition == "normal"
    assert result.intensity == "high"
    assert result.sessions[0].estimated_duration_minutes == 20
    assert result.sessions[0].estimated_duration_minutes == sum(
        item.duration_minutes
        for item in result.sessions[0].exercises
    )
    assert selected.exercise_key in (
        fake_client.responses.input_text
    )
    assert '"target_minutes": 20' in fake_client.responses.input_text
    assert '"maximum_minutes": 25' in fake_client.responses.input_text
    assert '"absolute_maximum_minutes": 200' in (
        fake_client.responses.input_text
    )
    assert '"applies_to_each_session": true' in (
        fake_client.responses.input_text
    )
    assert "catalog_candidates" in (
        fake_client.responses.input_text
    )


def _response_with_intensity(
    intensity: str,
    *,
    exercise_intensity: str | None = None,
) -> ExerciseRecommendationResponse:
    return ExerciseRecommendationResponse(
        catalog_version="sha256:test",
        summary="운동 강도 계약 테스트",
        weekly_frequency=3,
        intensity=intensity,
        sessions=[
            ExerciseSession(
                name="전신 운동",
                exercises=[
                    ExerciseItem(
                        exercise_key="ex_test",
                        name="테스트 운동",
                        catalog_name_en="Test Exercise",
                        exercise_modes=["gym"],
                        duration_minutes=5,
                        intensity=exercise_intensity,
                        instructions=[],
                    )
                ],
            )
        ],
        cautions=[],
        sources=[],
    )


@pytest.mark.parametrize(
    "intensity",
    ["low", "moderate", "high"],
)
def test_exercise_intensity_contract_accepts_canonical_values(
    intensity: str,
) -> None:
    response = _response_with_intensity(
        intensity,
        exercise_intensity=intensity,
    )

    assert response.intensity == intensity
    assert (
        response.sessions[0].exercises[0].intensity
        == intensity
    )


def test_exercise_item_intensity_can_fall_back_to_result() -> None:
    response = _response_with_intensity(
        "low",
        exercise_intensity=None,
    )

    assert response.sessions[0].exercises[0].intensity is None


@pytest.mark.parametrize(
    "invalid_intensity",
    ["보통", "가벼움", "medium", "anything"],
)
def test_exercise_intensity_contract_rejects_noncanonical_values(
    invalid_intensity: str,
) -> None:
    with pytest.raises(ValidationError):
        _response_with_intensity(invalid_intensity)

    with pytest.raises(ValidationError):
        _response_with_intensity(
            "moderate",
            exercise_intensity=invalid_intensity,
        )

    with pytest.raises(ValidationError):
        service._CatalogExerciseRecommendationSelection(
            summary="잘못된 상위 강도",
            weekly_frequency=3,
            intensity=invalid_intensity,
            sessions=[
                {
                    "name": "홈트",
                    "exercises": [
                        {
                            "exercise_key": "ex_test",
                            "name": "테스트 운동",
                            "duration_minutes": 5,
                        }
                    ],
                }
            ],
        )

    with pytest.raises(ValidationError):
        service._CatalogExerciseRecommendationSelection(
            summary="잘못된 운동별 강도",
            weekly_frequency=3,
            intensity="moderate",
            sessions=[
                {
                    "name": "홈트",
                    "exercises": [
                        {
                            "exercise_key": "ex_test",
                            "name": "테스트 운동",
                            "duration_minutes": 5,
                            "intensity": invalid_intensity,
                        }
                    ],
                }
            ],
        )


def test_selection_requires_duration_and_non_empty_plan() -> None:
    with pytest.raises(ValidationError):
        service._CatalogExerciseRecommendationSelection(
            summary="빈 세션",
            weekly_frequency=3,
            intensity="moderate",
            sessions=[],
        )

    with pytest.raises(ValidationError):
        service._CatalogExerciseRecommendationSelection(
            summary="빈 운동 목록",
            weekly_frequency=3,
            intensity="moderate",
            sessions=[
                {
                    "name": "빈 세션",
                    "exercises": [],
                }
            ],
        )

    with pytest.raises(ValidationError):
        service._CatalogExerciseRecommendationSelection(
            summary="운동 시간 누락",
            weekly_frequency=3,
            intensity="moderate",
            sessions=[
                {
                    "name": "홈트",
                    "exercises": [
                        {
                            "exercise_key": "ex_test",
                            "name": "테스트 운동",
                        }
                    ],
                }
            ],
        )


def test_generate_retries_unparsed_response_once(
    monkeypatch,
) -> None:
    request = _home_request()
    selected = select_exercise_candidates(request)[0]

    class FakeResponses:
        def __init__(self) -> None:
            self.calls = 0

        async def parse(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(output_parsed=None)
            return SimpleNamespace(
                output_parsed=(
                    service._CatalogExerciseRecommendationSelection(
                        summary="재생성 성공",
                        weekly_frequency=3,
                        intensity="low",
                        sessions=[
                            {
                                "name": "홈트",
                                "exercises": [
                                    {
                                        "exercise_key": (
                                            selected.exercise_key
                                        ),
                                        "name": "카탈로그 운동",
                                        "duration_minutes": 20,
                                        "intensity": None,
                                    }
                                ],
                            }
                        ],
                    )
                )
            )

    fake_responses = FakeResponses()

    async def fake_rag_node(_state):
        return {"rag_context": []}

    monkeypatch.setattr(
        service,
        "_get_openai_client",
        lambda: SimpleNamespace(responses=fake_responses),
    )
    monkeypatch.setattr(service, "rag_node", fake_rag_node)

    result = run_immediate(
        service.generate_exercise_recommendation(request)
    )

    assert fake_responses.calls == 2
    assert result.intensity == "low"
    assert result.sessions[0].exercises[0].intensity is None


def test_generate_retries_after_duration_violation_and_succeeds(
    monkeypatch,
) -> None:
    request = _home_request()
    selected = select_exercise_candidates(request)[0]

    class FakeResponses:
        def __init__(self) -> None:
            self.calls = 0

        async def parse(self, **_kwargs):
            self.calls += 1
            duration_minutes = 19 if self.calls == 1 else 20
            return SimpleNamespace(
                output_parsed=_duration_selection(
                    selected.exercise_key,
                    duration_minutes,
                )
            )

    fake_responses = FakeResponses()

    async def fake_rag_node(_state):
        return {"rag_context": []}

    monkeypatch.setattr(
        service,
        "_get_openai_client",
        lambda: SimpleNamespace(responses=fake_responses),
    )
    monkeypatch.setattr(service, "rag_node", fake_rag_node)

    result = run_immediate(
        service.generate_exercise_recommendation(request)
    )

    assert fake_responses.calls == 2
    assert result.sessions[0].estimated_duration_minutes == 20


def test_generate_fails_after_two_unparsed_responses(
    monkeypatch,
) -> None:
    request = _home_request()

    class FakeResponses:
        def __init__(self) -> None:
            self.calls = 0

        async def parse(self, **_kwargs):
            self.calls += 1
            return SimpleNamespace(output_parsed=None)

    fake_responses = FakeResponses()

    async def fake_rag_node(_state):
        return {"rag_context": []}

    monkeypatch.setattr(
        service,
        "_get_openai_client",
        lambda: SimpleNamespace(responses=fake_responses),
    )
    monkeypatch.setattr(service, "rag_node", fake_rag_node)

    with pytest.raises(RuntimeError):
        run_immediate(
            service.generate_exercise_recommendation(request)
        )

    assert fake_responses.calls == 2


def test_exercise_endpoint_returns_503_for_invalid_generation(
    monkeypatch,
) -> None:
    request = _home_request()

    async def fail_generation(_request):
        raise RuntimeError("invalid structured output")

    monkeypatch.setattr(
        recommendation_router,
        "generate_exercise_recommendation",
        fail_generation,
    )
    monkeypatch.setattr(
        recommendation_router,
        "verify_api_key",
        lambda _credentials: None,
    )

    with pytest.raises(HTTPException) as exc_info:
        run_immediate(
            recommendation_router.recommend_exercise(
                request,
                credentials=None,
            )
        )

    assert exc_info.value.status_code == 503


def test_exercise_endpoint_returns_503_after_duration_retries_exhausted(
    monkeypatch,
) -> None:
    request = _home_request()
    selected = select_exercise_candidates(request)[0]

    class FakeResponses:
        def __init__(self) -> None:
            self.calls = 0

        async def parse(self, **_kwargs):
            self.calls += 1
            return SimpleNamespace(
                output_parsed=_duration_selection(
                    selected.exercise_key,
                    19,
                )
            )

    fake_responses = FakeResponses()

    async def fake_rag_node(_state):
        return {"rag_context": []}

    monkeypatch.setattr(
        service,
        "_get_openai_client",
        lambda: SimpleNamespace(responses=fake_responses),
    )
    monkeypatch.setattr(service, "rag_node", fake_rag_node)
    monkeypatch.setattr(
        recommendation_router,
        "verify_api_key",
        lambda _credentials: None,
    )

    with pytest.raises(HTTPException) as exc_info:
        run_immediate(
            recommendation_router.recommend_exercise(
                request,
                credentials=None,
            )
        )

    assert fake_responses.calls == 2
    assert exc_info.value.status_code == 503
