import asyncio
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

import app.core.security as security_module
import app.routers.recommendation_router as recommendation_router_module
import app.services.diet_recommendation_service as service
from app.schemas.recommendation import (
    DietWeeklyNarrativePartResponse,
    ReplaceDayRequest,
    ReplaceDayResponse,
)


def _candidate(
    menu_name: str,
    *,
    calories: float,
    score: float,
    primary_family: str,
    menu_style: str = "everyday",
) -> dict:
    compact_name = menu_name.replace(" ", "_")
    return {
        "menu_name": menu_name,
        "items": [
            {
                "food_name": menu_name,
                "portion_g": 150.0,
                "calories_kcal": calories,
                "carbohydrate_g": 50.0,
                "protein_g": 25.0,
                "fat_g": 12.0,
                "food_code": f"FOOD-{compact_name}",
                "data_code": f"DATA-{compact_name}",
                "source_name": "공식 Food DB",
            }
        ],
        "nutrition": {
            "calories_kcal": calories,
            "carbohydrate_g": 50.0,
            "protein_g": 25.0,
            "fat_g": 12.0,
        },
        "final_score": score,
        "menu_style": menu_style,
        "_family_signature": {
            "primary": primary_family,
            "carbs": [],
            "sides": [],
        },
        "local_specialties": [],
    }


def _request_payload(**overrides) -> dict:
    payload = {
        "target_date": "2026-11-20",
        "target_day": "friday",
        "today_nutrition": {
            "target": {
                "calories_kcal": 2000,
                "carbohydrate_g": 250,
                "protein_g": 100,
                "fat_g": 60,
            },
            "actual": {
                "calories_kcal": 2300,
                "carbohydrate_g": 280,
                "protein_g": 110,
                "fat_g": 75,
            },
        },
        "current_menu_names": {
            "breakfast": "현재 아침",
            "lunch": "현재 점심",
            "dinner": "현재 저녁",
            "snack": "현재 간식",
        },
        "excluded_menu_names": ["추가 제외 메뉴"],
        "food_allergens": ["계란"],
        "disliked_foods": ["버섯"],
        "meal_target": {
            "calories_kcal": 500,
            "carbohydrate_g": 60,
            "protein_g": 30,
            "fat_g": 15,
        },
        "menu_style_preference": "everyday",
    }
    payload.update(overrides)
    return payload


def test_replace_day_request_requires_matching_date_and_day() -> None:
    with pytest.raises(ValidationError):
        ReplaceDayRequest.model_validate(
            _request_payload(target_day="monday")
        )


def test_replace_day_request_requires_an_exceeded_target() -> None:
    today_nutrition = _request_payload()["today_nutrition"]
    today_nutrition["actual"] = dict(today_nutrition["target"])

    with pytest.raises(ValidationError):
        ReplaceDayRequest.model_validate(
            _request_payload(today_nutrition=today_nutrition)
        )


def test_replace_day_request_rejects_blank_current_menu() -> None:
    current_menu_names = dict(
        _request_payload()["current_menu_names"]
    )
    current_menu_names["snack"] = "   "

    with pytest.raises(ValidationError):
        ReplaceDayRequest.model_validate(
            _request_payload(current_menu_names=current_menu_names)
        )


def test_gentle_rebalance_prioritizes_safe_target_band() -> None:
    adjusted = service._apply_gentle_rebalance_candidate_scores(
        [
            _candidate(
                "목표 범위 메뉴",
                calories=450.0,
                score=-10000.0,
                primary_family="a",
            ),
            _candidate(
                "고열량 메뉴",
                calories=650.0,
                score=50000.0,
                primary_family="b",
            ),
        ],
        calorie_target=500.0,
        required_unique_count=1,
    )

    assert len(adjusted) == 1
    assert adjusted[0]["menu_name"] == "목표 범위 메뉴"
    assert adjusted[0]["_gentle_calorie_ratio"] == 0.9


def test_gentle_rebalance_fallback_still_selects_in_band_first() -> None:
    adjusted = service._apply_gentle_rebalance_candidate_scores(
        [
            _candidate(
                "목표 범위 메뉴",
                calories=450.0,
                score=-10000.0,
                primary_family="a",
            ),
            _candidate(
                "고열량 메뉴",
                calories=650.0,
                score=50000.0,
                primary_family="b",
            ),
        ],
        calorie_target=500.0,
        required_unique_count=2,
    )
    scores = {
        candidate["menu_name"]: candidate["final_score"]
        for candidate in adjusted
    }

    assert scores["목표 범위 메뉴"] > scores["고열량 메뉴"]


def test_gentle_rebalance_deduplicates_normalized_menu_names() -> None:
    adjusted = service._apply_gentle_rebalance_candidate_scores(
        [
            _candidate(
                "같은 메뉴",
                calories=450.0,
                score=90.0,
                primary_family="a",
            ),
            _candidate(
                "같은메뉴",
                calories=460.0,
                score=80.0,
                primary_family="b",
            ),
            _candidate(
                "다른 메뉴",
                calories=470.0,
                score=70.0,
                primary_family="c",
            ),
        ],
        calorie_target=500.0,
        required_unique_count=2,
    )

    assert len(adjusted) == 2
    assert {
        service._normalize_text(candidate["menu_name"])
        for candidate in adjusted
    } == {"같은메뉴", "다른메뉴"}


def test_replacement_day_disallows_partial_unique_schedule() -> None:
    meals = [
        _candidate(
            "새 메뉴 A",
            calories=450.0,
            score=90.0,
            primary_family="a",
        ),
        _candidate(
            "새 메뉴 B",
            calories=460.0,
            score=80.0,
            primary_family="b",
        ),
    ]
    snacks = [
        _candidate(
            "새 간식",
            calories=180.0,
            score=70.0,
            primary_family="snack",
        )
    ]

    with pytest.raises(RuntimeError):
        service._build_fixed_partial_schedule(
            days=["friday"],
            meal_candidates=meals,
            snack_candidates=snacks,
            allow_menu_reuse=False,
        )


def test_single_day_narrative_fallback_preserves_all_four_meals() -> None:
    schedule = {
        "friday": {
            meal_type: _candidate(
                f"{meal_type} 새 메뉴",
                calories=(180.0 if meal_type == "snack" else 450.0),
                score=90.0,
                primary_family=meal_type,
            )
            for meal_type in (
                "breakfast",
                "lunch",
                "dinner",
                "snack",
            )
        }
    }

    narrative = service._build_weekly_narrative_fallback(
        days=["friday"],
        fixed_schedule=schedule,
    )
    result = service._apply_fixed_schedule_to_partial_response(
        response=narrative,
        schedule=schedule,
    )

    assert len(result.weekly_plan) == 1
    assert result.weekly_plan[0].day == "friday"
    assert result.weekly_plan[0].meals.snack.menu_name == "snack 새 메뉴"

    with pytest.raises(ValidationError):
        ReplaceDayResponse(
            target_date=date(2026, 11, 20),
            target_day="friday",
            replaced_meal_types=[
                "breakfast",
                "lunch",
                "dinner",
                "snack",
            ],
            day_plan=result.weekly_plan[0],
            daily_nutrition={
                "calories_kcal": 1.0,
                "carbohydrate_g": 200.0,
                "protein_g": 100.0,
                "fat_g": 48.0,
            },
        )


async def _run_replacement_day_pipeline() -> None:
    current_breakfast = _candidate(
        "현재 아침",
        calories=490.0,
        score=999.0,
        primary_family="blocked",
    )
    current_snack = _candidate(
        "현재 간식",
        calories=190.0,
        score=999.0,
        primary_family="blocked_snack",
    )
    current_lunch = _candidate(
        "현재 점심",
        calories=490.0,
        score=999.0,
        primary_family="blocked_lunch",
    )
    current_dinner = _candidate(
        "현재 저녁",
        calories=490.0,
        score=999.0,
        primary_family="blocked_dinner",
    )
    meals = [
        current_breakfast,
        current_lunch,
        current_dinner,
        _candidate(
            "추가 제외 메뉴",
            calories=450.0,
            score=998.0,
            primary_family="excluded",
        ),
        _candidate(
            "건강식 고득점",
            calories=450.0,
            score=997.0,
            primary_family="health",
            menu_style="health_focused",
        ),
        _candidate(
            "새 아침",
            calories=440.0,
            score=91.0,
            primary_family="a",
        ),
        _candidate(
            "새 점심",
            calories=460.0,
            score=90.0,
            primary_family="b",
        ),
        _candidate(
            "새 저녁",
            calories=480.0,
            score=89.0,
            primary_family="c",
        ),
    ]
    snacks = [
        current_snack,
        _candidate(
            "새 간식",
            calories=180.0,
            score=80.0,
            primary_family="snack",
        ),
    ]
    captured: dict = {}

    async def fake_prepare(*, request, metric_statuses, food_allergens):
        captured["request"] = request
        captured["allergens"] = food_allergens
        return meals, snacks, {"candidate_source": "test"}

    async def fake_rag(metric_statuses):
        return [
            {
                "source_org": "검증 기관",
                "title": "검증 지침",
                "content": "검증된 식생활 지침",
            }
        ]

    narrative = DietWeeklyNarrativePartResponse.model_validate(
        {
            "weekly_plan": [
                {
                    "day": "friday",
                    "meals": {
                        meal_type: {
                            "menu_description": f"{meal_type} 설명",
                            "guidance": f"{meal_type} 안내",
                        }
                        for meal_type in (
                            "breakfast",
                            "lunch",
                            "dinner",
                            "snack",
                        )
                    },
                }
            ]
        }
    )

    class FakeResponses:
        async def parse(self, **kwargs):
            captured["llm_kwargs"] = kwargs
            return SimpleNamespace(
                status="completed",
                incomplete_details=None,
                usage=None,
                output_parsed=narrative,
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
        openai_diet_model="test-model",
        diet_openai_timeout_seconds=1.0,
        diet_llm_cache_ttl_seconds=60.0,
        diet_llm_cache_max_entries=32,
    )
    service.AsyncOpenAI = FakeOpenAI
    service._prepare_verified_food_candidates = fake_prepare
    service._get_diet_rag_context = fake_rag

    try:
        request = ReplaceDayRequest.model_validate(
            _request_payload()
        )
        result = await service.generate_replacement_day(request)
    finally:
        service.get_settings = original_settings
        service.AsyncOpenAI = original_openai
        service._prepare_verified_food_candidates = original_prepare
        service._get_diet_rag_context = original_rag
        service._reset_diet_llm_cache_for_tests()

    meal_names = [
        getattr(result.day_plan.meals, meal_type).menu_name
        for meal_type in result.replaced_meal_types
    ]
    assert result.target_date == date(2026, 11, 20)
    assert result.target_day == "friday"
    assert result.adjustment_policy == "gentle_rebalance_v1"
    assert len(meal_names) == 4
    assert len(set(meal_names)) == 4
    assert "현재 아침" not in meal_names
    assert "현재 점심" not in meal_names
    assert "현재 저녁" not in meal_names
    assert "현재 간식" not in meal_names
    assert "추가 제외 메뉴" not in meal_names
    assert "건강식 고득점" not in meal_names
    assert result.daily_nutrition.calories_kcal == 1560.0
    assert result.daily_nutrition.carbohydrate_g == 200.0
    assert result.daily_nutrition.protein_g == 100.0
    assert result.daily_nutrition.fat_g == 48.0
    assert captured["allergens"] == ["계란"]

    first_item = result.day_plan.meals.breakfast.items[0]
    assert first_item.food_code is not None
    assert first_item.data_code is not None
    assert first_item.source_name == "공식 Food DB"


def test_replacement_day_pipeline_returns_four_new_meals() -> None:
    asyncio.run(_run_replacement_day_pipeline())


def _replace_day_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(recommendation_router_module.router)
    return app


def test_replace_day_router_requires_authentication(monkeypatch) -> None:
    monkeypatch.setattr(
        security_module,
        "get_settings",
        lambda: SimpleNamespace(ai_server_api_key="test-key"),
    )

    with TestClient(_replace_day_test_app()) as client:
        response = client.post(
            "/recommend/diet/replace-day",
            json=_request_payload(),
        )

    assert response.status_code == 401
    assert response.json()["detail"] == (
        "Missing authorization credentials."
    )


def test_replace_day_router_maps_runtime_error_to_503(monkeypatch) -> None:
    monkeypatch.setattr(
        security_module,
        "get_settings",
        lambda: SimpleNamespace(ai_server_api_key="test-key"),
    )

    async def fail_with_runtime_error(_request):
        raise RuntimeError("candidate shortage")

    monkeypatch.setattr(
        recommendation_router_module,
        "generate_replacement_day",
        fail_with_runtime_error,
    )

    with TestClient(_replace_day_test_app()) as client:
        response = client.post(
            "/recommend/diet/replace-day",
            json=_request_payload(),
            headers={"Authorization": "Bearer test-key"},
        )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Diet day replacement service is temporarily unavailable."
    )


def test_replace_day_router_maps_unexpected_error_to_500(monkeypatch) -> None:
    monkeypatch.setattr(
        security_module,
        "get_settings",
        lambda: SimpleNamespace(ai_server_api_key="test-key"),
    )

    async def fail_with_unexpected_error(_request):
        raise ValueError("unexpected")

    monkeypatch.setattr(
        recommendation_router_module,
        "generate_replacement_day",
        fail_with_unexpected_error,
    )

    with TestClient(_replace_day_test_app()) as client:
        response = client.post(
            "/recommend/diet/replace-day",
            json=_request_payload(),
            headers={"Authorization": "Bearer test-key"},
        )

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Diet day replacement failed."
    )
