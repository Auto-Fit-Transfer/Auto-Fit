import asyncio
from types import SimpleNamespace

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

    prompt = captured["llm_kwargs"]["input"]
    instructions = captured["llm_kwargs"]["instructions"]
    assert selected["menu_name"] in prompt
    assert "버섯" in prompt
    assert "설명, guidance" in prompt
    assert "menu_description" in instructions


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
    )
    assert context.disliked_foods == ["버섯"]
    assert context.meal_target is not None

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


def main() -> None:
    _run_selection_failure_test()
    _run_chat_context_test()
    asyncio.run(
        _run_pipeline_test()
    )
    print("재추천 공식 후보 파이프라인 테스트: OK")


if __name__ == "__main__":
    main()
