import asyncio
from types import SimpleNamespace

import app.services.diet_recommendation_service as service
from app.routers.health_router import diet_health_check
from app.schemas.recommendation import ReplaceMealRequest


def _candidate(menu_name: str, calories: float = 500.0) -> dict:
    return {
        "menu_name": menu_name,
        "items": [
            {
                "food_name": menu_name,
                "portion_g": 120.0,
                "calories_kcal": calories,
                "protein_g": 25.0,
                "fat_g": 12.0,
                "carbohydrate_g": 55.0,
            }
        ],
        "nutrition": {
            "calories_kcal": calories,
            "protein_g": 25.0,
            "fat_g": 12.0,
            "carbohydrate_g": 55.0,
        },
        "final_score": 100.0,
        "local_specialties": [],
    }


def _schedule(days: list[str]) -> dict:
    return {
        day: {
            meal_type: _candidate(
                f"{day}-{meal_type}",
                500.0,
            )
            for meal_type in (
                "breakfast",
                "lunch",
                "dinner",
                "snack",
            )
        }
        for day in days
    }


class ErrorResponses:
    async def parse(self, **kwargs):
        raise RuntimeError("simulated OpenAI failure")


class ErrorClient:
    responses = ErrorResponses()


class SlowResponses:
    async def parse(self, **kwargs):
        await asyncio.sleep(0.05)
        return SimpleNamespace(
            output_parsed=service._build_metadata_fallback(
                safe_rag_context=[]
            )
        )


class SlowClient:
    responses = SlowResponses()


async def _run_weekly_and_metadata_fallback_test() -> None:
    days = ["monday", "tuesday", "wednesday"]
    schedule = _schedule(days)

    weekly = await service._request_diet_days_from_llm(
        client=ErrorClient(),
        model="test-model",
        days=days,
        max_output_tokens=500,
        metric_statuses={},
        safety_tags=[],
        food_allergens=["계란"],
        goal_type="general_health",
        additional_input=None,
        safe_rag_context=[],
        fixed_schedule=schedule,
    )

    assert len(weekly.weekly_plan) == 3
    monday_breakfast = weekly.weekly_plan[0].meals.breakfast
    assert monday_breakfast.menu_name == "monday-breakfast"
    assert monday_breakfast.estimated_calories_kcal == 500
    assert monday_breakfast.items is not None
    assert monday_breakfast.items[0].portion_g == 120.0
    assert "검증된 식사" in monday_breakfast.menu_description

    metadata = await service._request_diet_metadata_from_llm(
        client=ErrorClient(),
        model="test-model",
        metric_statuses={},
        safety_tags=[],
        food_allergens=["계란"],
        goal_type="general_health",
        additional_input=None,
        safe_rag_context=[
            {
                "source_org": "검증 기관",
                "title": "검증 문서",
            }
        ],
    )
    assert "공식 Food DB" in metadata.summary
    assert len(metadata.sources) == 1
    assert metadata.sources[0].source_org == "검증 기관"


async def _run_timeout_fallback_test() -> None:
    metadata = await service._request_diet_metadata_from_llm(
        client=SlowClient(),
        model="slow-test-model",
        metric_statuses={},
        safety_tags=[],
        food_allergens=[],
        goal_type="general_health",
        additional_input=None,
        safe_rag_context=[],
    )
    assert "공식 Food DB" in metadata.summary

    # singleflight 공유 작업은 다른 waiter 보호를 위해 timeout 뒤에도
    # 종료될 수 있으므로 테스트 루프를 닫기 전에 정리 시간을 준다.
    await asyncio.sleep(0.06)


async def _run_replacement_fallback_test() -> None:
    current = _candidate("현재 메뉴")
    selected = _candidate("공식 대체 메뉴", 480.0)

    async def fake_prepare(
        *,
        request,
        metric_statuses,
        food_allergens,
    ):
        return [current, selected], [], {}

    async def fake_rag(metric_statuses):
        return []

    class FakeOpenAI:
        def __init__(self, *, api_key):
            self.responses = ErrorResponses()

    original_openai = service.AsyncOpenAI
    original_prepare = service._prepare_verified_food_candidates
    original_rag = service._get_diet_rag_context
    service.AsyncOpenAI = FakeOpenAI
    service._prepare_verified_food_candidates = fake_prepare
    service._get_diet_rag_context = fake_rag

    try:
        result = await service.generate_replacement_meal(
            ReplaceMealRequest(
                target_day="monday",
                target_meal="lunch",
                current_menu_name="현재 메뉴",
            )
        )
    finally:
        service.AsyncOpenAI = original_openai
        service._prepare_verified_food_candidates = original_prepare
        service._get_diet_rag_context = original_rag

    assert result.meal.menu_name == "공식 대체 메뉴"
    assert result.meal.estimated_calories_kcal == 480
    assert result.meal.items is not None
    assert result.meal.items[0].portion_g == 120.0
    assert "검증된 대체 식사" in result.meal.menu_description


async def _run_all() -> None:
    original_settings = service.get_settings
    service._reset_diet_llm_cache_for_tests()
    service._reset_diet_llm_resilience_for_tests()
    settings = SimpleNamespace(
        openai_api_key="test-key",
        openai_replace_meal_model="test-replace-model",
        diet_openai_timeout_seconds=1.0,
        replace_meal_openai_timeout_seconds=1.0,
        diet_llm_cache_ttl_seconds=60.0,
        diet_llm_cache_max_entries=32,
    )
    service.get_settings = lambda: settings

    try:
        await _run_weekly_and_metadata_fallback_test()
        settings.diet_openai_timeout_seconds = 0.01
        await _run_timeout_fallback_test()
        settings.diet_openai_timeout_seconds = 1.0
        await _run_replacement_fallback_test()
        health = await diet_health_check()
        assert health["diet_llm_resilience"]["timeouts"] == 1
    finally:
        service.get_settings = original_settings
        service._reset_diet_llm_cache_for_tests()

    stats = service.get_diet_llm_resilience_stats()
    assert stats["weekly_narrative_fallbacks"] == 1
    assert stats["metadata_fallbacks"] == 2
    assert stats["replacement_fallbacks"] == 1
    assert stats["timeouts"] == 1
    assert stats["errors"] == 3


def main() -> None:
    asyncio.run(_run_all())
    print("Diet OpenAI fallback 테스트: OK")


if __name__ == "__main__":
    main()
