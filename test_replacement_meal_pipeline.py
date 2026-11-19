import asyncio
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

import app.services.diet_recommendation_service as service
from app.schemas.chat import ChatContext
from app.schemas.recommendation import (
    ReplaceMealLLMResponse,
    ReplaceMealRequest,
)
from app.services.chat_orchestrator_service import (
    _extract_weekly_menu_names,
)


def _candidate(
    menu_name: str,
    *,
    score: float,
    calories: float,
    menu_style: str = "everyday",
) -> dict:
    return {
        "menu_name": menu_name,
        "items": [
            {
                "food_name": menu_name.split(" + ")[0],
                "portion_g": 120.0,
                "calories_kcal": calories,
                "protein_g": 25.4,
                "fat_g": 11.2,
                "carbohydrate_g": 48.6,
            }
        ],
        "nutrition": {
            "calories_kcal": calories,
            "protein_g": 25.4,
            "fat_g": 11.2,
            "carbohydrate_g": 48.6,
        },
        "final_score": score,
        "menu_style": menu_style,
        "local_specialties": ["지역 식재료"],
    }


async def _run_pipeline_test() -> None:
    current = _candidate(
        "현재구이 + 현재밥",
        score=100.0,
        calories=510.0,
    )
    already_used = _candidate(
        "기존국 + 기존밥",
        score=95.0,
        calories=490.0,
    )
    selected = _candidate(
        "검증생선구이 + 검증잡곡밥",
        score=90.0,
        calories=503.6,
    )
    snack = _candidate(
        "검증과일",
        score=80.0,
        calories=180.0,
    )

    captured: dict = {}

    async def fake_prepare(
        *,
        request,
        metric_statuses,
        food_allergens,
    ):
        captured["prepare_request"] = request
        captured["metric_statuses"] = metric_statuses
        captured["food_allergens"] = food_allergens
        return (
            [current, already_used, selected],
            [snack],
            {"location": {"match_type": "exact"}},
        )

    async def fake_rag(metric_statuses):
        captured["rag_metric_statuses"] = metric_statuses
        return []

    llm_result = ReplaceMealLLMResponse(
        menu_description="검증 후보에 대한 설명",
        guidance="검증 후보에 대한 안내",
        cautions=["주의 문구"],
    )

    class FakeResponses:
        async def parse(self, **kwargs):
            captured["llm_kwargs"] = kwargs
            return SimpleNamespace(
                output_parsed=llm_result
            )

    class FakeOpenAI:
        def __init__(self, *, api_key):
            captured["api_key_received"] = bool(api_key)
            self.responses = FakeResponses()

    original_settings = service.get_settings
    original_openai = service.AsyncOpenAI
    original_prepare = service._prepare_verified_food_candidates
    original_rag = service._get_diet_rag_context

    service.get_settings = lambda: SimpleNamespace(
        openai_api_key="test-key",
        openai_replace_meal_model="test-model",
        replace_meal_openai_timeout_seconds=1.0,
        diet_llm_cache_ttl_seconds=60.0,
        diet_llm_cache_max_entries=32,
    )
    service.AsyncOpenAI = FakeOpenAI
    service._prepare_verified_food_candidates = fake_prepare
    service._get_diet_rag_context = fake_rag
    service._reset_diet_llm_cache_for_tests()

    try:
        request = ReplaceMealRequest(
            metric_statuses={
                "blood_pressure": "high",
            },
            target_day="monday",
            target_meal="lunch",
            current_menu_name=current["menu_name"],
            excluded_menu_names=[
                current["menu_name"],
                already_used["menu_name"],
            ],
            current_ingredients=["현재구이", "현재밥"],
            food_allergens=["계란"],
            disliked_foods=["버섯"],
            goal_type="general_health",
            additional_input="짜지 않게",
            sido="경상북도",
            sigungu="영양군",
            meal_target={
                "calories_kcal": 500,
                "protein_g": 30,
                "fat_g": 15,
                "carbohydrate_g": 60,
            },
        )

        result = await service.generate_replacement_meal(
            request
        )
    finally:
        service.get_settings = original_settings
        service.AsyncOpenAI = original_openai
        service._prepare_verified_food_candidates = original_prepare
        service._get_diet_rag_context = original_rag
        service._reset_diet_llm_cache_for_tests()

    assert captured["food_allergens"] == ["계란"]
    assert captured["prepare_request"].disliked_foods == ["버섯"]
    assert captured["prepare_request"].meal_target is not None
    assert captured["prepare_request"].sido == "경상북도"
    assert captured["prepare_request"].sigungu == "영양군"

    assert result.day == "monday"
    assert result.meal_type == "lunch"
    assert result.meal.menu_name == selected["menu_name"]
    assert result.meal.estimated_calories_kcal == 503.6
    assert result.meal.nutrition.carbohydrate_g == 48.6
    assert result.meal.nutrition.protein_g == 25.4
    assert result.meal.nutrition.fat_g == 11.2
    assert result.meal.items is not None
    assert result.meal.items[0].food_name == "검증생선구이"
    assert result.meal.items[0].portion_g == 120.0
    assert result.meal.ingredients is None
    assert result.meal.image_prompt is None
    assert result.meal.menu_description == "검증 후보에 대한 설명"
    assert result.meal.guidance == "검증 후보에 대한 안내"
    assert result.adjustment is None

    prompt = captured["llm_kwargs"]["input"]
    instructions = captured["llm_kwargs"]["instructions"]
    assert selected["menu_name"] in prompt
    assert "버섯" in prompt
    assert "설명, guidance" in prompt
    assert "menu_description" in instructions


async def _run_gentle_rebalance_pipeline_test() -> None:
    current = _candidate(
        "현재 점심",
        score=1000.0,
        calories=500.0,
    )
    below_floor = _candidate(
        "너무 적은 점심",
        score=5000.0,
        calories=420.0,
    )
    selected = _candidate(
        "안전한 가벼운 점심",
        score=1.0,
        calories=425.0,
    )
    higher = _candidate(
        "감량 없는 점심",
        score=5000.0,
        calories=500.0,
    )
    snack = _candidate(
        "검증 간식",
        score=80.0,
        calories=180.0,
    )
    captured: dict = {}

    async def fake_prepare(
        *,
        request,
        metric_statuses,
        food_allergens,
    ):
        return (
            [current, below_floor, selected, higher],
            [snack],
            {"candidate_source": "test"},
        )

    async def fake_rag(metric_statuses):
        return []

    llm_result = ReplaceMealLLMResponse(
        menu_description="가볍게 조정한 공식 후보",
        guidance="선택한 범위 안에서 드세요.",
        cautions=[],
    )

    class FakeResponses:
        async def parse(self, **kwargs):
            captured["prompt"] = kwargs["input"]
            return SimpleNamespace(
                status="completed",
                incomplete_details=None,
                usage=None,
                output_parsed=llm_result,
            )

    class FakeOpenAI:
        def __init__(self, *, api_key):
            self.responses = FakeResponses()

    original_settings = service.get_settings
    original_openai = service.AsyncOpenAI
    original_prepare = service._prepare_verified_food_candidates
    original_rag = service._get_diet_rag_context
    service._reset_diet_llm_cache_for_tests()

    service.get_settings = lambda: SimpleNamespace(
        openai_api_key="test-key",
        openai_replace_meal_model="test-model",
        replace_meal_openai_timeout_seconds=1.0,
        diet_llm_cache_ttl_seconds=60.0,
        diet_llm_cache_max_entries=32,
    )
    service.AsyncOpenAI = FakeOpenAI
    service._prepare_verified_food_candidates = fake_prepare
    service._get_diet_rag_context = fake_rag

    try:
        request = ReplaceMealRequest(
            target_day="tuesday",
            target_meal="lunch",
            current_menu_name=current["menu_name"],
            meal_target={
                "calories_kcal": 500,
                "protein_g": 30,
                "fat_g": 15,
                "carbohydrate_g": 60,
            },
            adjustment_policy="gentle_rebalance_v1",
            requested_calorie_reduction_kcal=100,
        )
        result = await service.generate_replacement_meal(request)
    finally:
        service.get_settings = original_settings
        service.AsyncOpenAI = original_openai
        service._prepare_verified_food_candidates = original_prepare
        service._get_diet_rag_context = original_rag
        service._reset_diet_llm_cache_for_tests()

    assert result.meal.menu_name == selected["menu_name"]
    assert result.adjustment is not None
    assert result.adjustment.baseline_calories_kcal == 500.0
    assert result.adjustment.requested_reduction_kcal == 100.0
    assert result.adjustment.maximum_allowed_reduction_kcal == 75.0
    assert result.adjustment.target_calories_kcal == 425.0
    assert result.adjustment.selected_calories_kcal == 425.0
    assert result.adjustment.estimated_reduction_kcal == 75.0
    assert result.adjustment.remaining_reduction_kcal == 25.0
    assert result.adjustment.selected_calorie_ratio == 0.85
    assert result.adjustment.limited_by_policy is True
    assert any("최대 15%" in caution for caution in result.cautions)
    assert any("25kcal" in caution for caution in result.cautions)
    assert selected["menu_name"] in captured["prompt"]
    assert "limited_by_policy" not in captured["prompt"]


def _run_selection_failure_test() -> None:
    candidate = _candidate(
        "중복메뉴",
        score=100.0,
        calories=500.0,
    )

    try:
        service._select_replacement_candidate(
            candidates=[candidate],
            current_menu_name="중복 메뉴",
            excluded_menu_names=[],
        )
    except RuntimeError:
        return

    raise AssertionError(
        "현재 메뉴만 존재할 때 RuntimeError가 필요합니다."
    )


def _run_chat_context_test() -> None:
    context = ChatContext(
        disliked_foods=["버섯"],
        sido="경상북도",
        sigungu="영양군",
        nearby_regions=[],
        meal_target={
            "calories_kcal": 500,
            "protein_g": 30,
            "fat_g": 15,
            "carbohydrate_g": 60,
        },
        nutrition_profile={
            "profile_mode": "basic_profile",
            "age_years": 34,
            "sex": "male",
            "height_cm": 175,
            "weight_kg": 75,
        },
        menu_style_preference="health_focused",
    )
    assert context.disliked_foods == ["버섯"]
    assert context.meal_target is not None
    assert context.nutrition_profile is not None
    assert context.menu_style_preference == "health_focused"

    menu_names = _extract_weekly_menu_names(
        {
            "weekly_plan": [
                {
                    "day": "monday",
                    "meals": {
                        "breakfast": {
                            "menu_name": "아침 메뉴"
                        },
                        "lunch": {
                            "menu_name": "점심 메뉴"
                        },
                    },
                },
                {
                    "day": "tuesday",
                    "meals": {
                        "breakfast": {
                            "menu_name": "아침메뉴"
                        },
                    },
                },
            ]
        }
    )
    assert menu_names == [
        "아침 메뉴",
        "점심 메뉴",
    ]


def _run_style_filter_test() -> None:
    everyday = _candidate(
        "일반식",
        score=100.0,
        calories=500.0,
        menu_style="everyday",
    )
    health = _candidate(
        "건강식",
        score=90.0,
        calories=480.0,
        menu_style="health_focused",
    )

    filtered = service._filter_replacement_candidates_by_style(
        candidates=[everyday, health],
        menu_style_preference="health_focused",
    )
    assert filtered == [health]

    try:
        service._filter_replacement_candidates_by_style(
            candidates=[everyday],
            menu_style_preference="health_focused",
        )
    except RuntimeError as exc:
        assert "health_focused" in str(exc)
    else:
        raise AssertionError("재추천이 반대 메뉴 스타일을 허용했습니다.")


def test_replacement_style_filter_contract() -> None:
    _run_style_filter_test()


def test_general_replacement_pipeline_keeps_existing_contract() -> None:
    asyncio.run(_run_pipeline_test())


def test_gentle_rebalance_pipeline_returns_adjustment_summary() -> None:
    asyncio.run(_run_gentle_rebalance_pipeline_test())


def test_gentle_rebalance_request_contract() -> None:
    base_payload = {
        "target_day": "monday",
        "target_meal": "lunch",
        "current_menu_name": "현재 점심",
    }
    meal_target = {
        "calories_kcal": 500,
        "protein_g": 30,
        "fat_g": 15,
        "carbohydrate_g": 60,
    }

    with pytest.raises(ValidationError):
        ReplaceMealRequest(
            **base_payload,
            requested_calorie_reduction_kcal=50,
        )

    with pytest.raises(ValidationError):
        ReplaceMealRequest(
            **base_payload,
            adjustment_policy="gentle_rebalance_v1",
            requested_calorie_reduction_kcal=50,
        )

    with pytest.raises(ValidationError):
        ReplaceMealRequest(
            **base_payload,
            meal_target=meal_target,
            adjustment_policy="gentle_rebalance_v1",
        )

    valid = ReplaceMealRequest(
        **base_payload,
        meal_target=meal_target,
        adjustment_policy="gentle_rebalance_v1",
        requested_calorie_reduction_kcal=50,
    )
    assert valid.adjustment_policy == "gentle_rebalance_v1"
    assert valid.requested_calorie_reduction_kcal == 50.0


def test_strict_gentle_rebalance_bounds_and_cap() -> None:
    candidates = [
        _candidate("84 퍼센트", score=100.0, calories=420.0),
        _candidate("85 퍼센트", score=1.0, calories=425.0),
        _candidate("95 퍼센트", score=100.0, calories=475.0),
        _candidate("100 퍼센트", score=1000.0, calories=500.0),
        _candidate("101 퍼센트", score=5000.0, calories=505.0),
    ]

    filtered, metadata = (
        service._filter_strict_gentle_rebalance_candidates(
            candidates,
            baseline_calories_kcal=500.0,
            requested_reduction_kcal=100.0,
        )
    )

    assert {
        candidate["menu_name"]
        for candidate in filtered
    } == {
        "85 퍼센트",
        "95 퍼센트",
        "100 퍼센트",
    }
    assert metadata["baseline_calories_kcal"] == 500.0
    assert metadata["requested_reduction_kcal"] == 100.0
    assert metadata["maximum_allowed_reduction_kcal"] == pytest.approx(75.0)
    assert metadata["effective_requested_reduction_kcal"] == pytest.approx(
        75.0
    )
    assert metadata["target_calories_kcal"] == pytest.approx(425.0)
    assert metadata["limited_by_policy"] is True


def test_strict_gentle_rebalance_respects_small_requested_reduction() -> None:
    filtered, metadata = (
        service._filter_strict_gentle_rebalance_candidates(
            [
                _candidate("과도한 감소", score=100.0, calories=425.0),
                _candidate("요청 경계", score=1.0, calories=475.0),
                _candidate("원래 목표", score=100.0, calories=500.0),
            ],
            baseline_calories_kcal=500.0,
            requested_reduction_kcal=25.0,
        )
    )

    assert {
        candidate["menu_name"]
        for candidate in filtered
    } == {"요청 경계", "원래 목표"}
    assert metadata["target_calories_kcal"] == 475.0
    assert metadata["limited_by_policy"] is False


def test_strict_gentle_rebalance_rejects_missing_safe_candidate() -> None:
    with pytest.raises(RuntimeError):
        service._filter_strict_gentle_rebalance_candidates(
            [
                _candidate("너무 적음", score=100.0, calories=420.0),
                _candidate("너무 많음", score=100.0, calories=505.0),
            ],
            baseline_calories_kcal=500.0,
            requested_reduction_kcal=100.0,
        )


@pytest.mark.parametrize(
    ("selected_ratio", "requested_reduction"),
    [
        (1.0, 0.01),
        (0.85, 100.0),
    ],
)
def test_gentle_rebalance_summary_preserves_raw_decimal_boundaries(
    selected_ratio: float,
    requested_reduction: float,
) -> None:
    baseline = 333.34
    selected_calories = baseline * selected_ratio
    filtered, context = (
        service._filter_strict_gentle_rebalance_candidates(
            [
                _candidate(
                    "소수점 경계 메뉴",
                    score=100.0,
                    calories=selected_calories,
                )
            ],
            baseline_calories_kcal=baseline,
            requested_reduction_kcal=requested_reduction,
        )
    )
    summary, _ = service._build_gentle_rebalance_adjustment_summary(
        adjustment_context=context,
        selected_calories_kcal=(
            filtered[0]["nutrition"]["calories_kcal"]
        ),
    )

    assert summary.baseline_calories_kcal == baseline
    assert summary.requested_reduction_kcal == requested_reduction
    assert summary.selected_calorie_ratio == pytest.approx(
        selected_ratio
    )


def test_gentle_rebalance_marks_any_capped_request() -> None:
    _, context = service._filter_strict_gentle_rebalance_candidates(
        [_candidate("경계 메뉴", score=100.0, calories=425.0)],
        baseline_calories_kcal=500.0,
        requested_reduction_kcal=75.005,
    )

    assert context["limited_by_policy"] is True


def test_gentle_rebalance_snack_uses_explicit_slot_target() -> None:
    request = ReplaceMealRequest(
        target_day="monday",
        target_meal="snack",
        current_menu_name="현재 간식",
        meal_target={
            "calories_kcal": 180,
            "protein_g": 9,
            "fat_g": 6,
            "carbohydrate_g": 24,
        },
        adjustment_policy="gentle_rebalance_v1",
        requested_calorie_reduction_kcal=20,
    )

    resolved = service._resolve_nutrition_targets(request)
    assert resolved["snack_target"] == {
        "calories_kcal": 180.0,
        "protein_g": 9.0,
        "fat_g": 6.0,
        "carbohydrate_g": 24.0,
    }


def test_chat_context_preserves_diet_profile_and_style() -> None:
    _run_chat_context_test()


def main() -> None:
    _run_selection_failure_test()
    _run_chat_context_test()
    _run_style_filter_test()
    asyncio.run(
        _run_pipeline_test()
    )
    print("재추천 공식 후보 파이프라인 테스트: OK")


if __name__ == "__main__":
    main()
