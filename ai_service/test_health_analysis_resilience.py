import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import app.services.health_analysis_service as service
from app.routers.health_router import (
    health_analysis_health_check,
)
from app.schemas.health_analysis import (
    DietContextInput,
    HealthAnalysisRequest,
    InventoryItemInput,
)


CONTRACT_PATH = (
    Path(__file__).resolve().parent
    / "docs"
    / "health_report_api_contract_examples.json"
)


class FakeAnalysisGraph:
    async def ainvoke(self, state):
        return {
            "rule_engine_result": {},
            "merged_analysis": {
                "metric_statuses": {
                    "bmi": "high",
                    "unsupported_metric": "high",
                }
            },
            "rag_context": [],
        }


def _success_draft():
    return service.LLMHealthAnalysisDraft(
        headline_title="정상 건강 분석",
        summary_title="건강 상태 요약",
        summary_description="검증된 상태를 바탕으로 분석했습니다.",
        strategy_title="건강 관리 전략",
        strategy_tags=["균형"],
        strategy_message="현재 생활 습관을 점검하세요.",
        key_metric_keys=[
            "bmi",
            "unsupported_metric",
        ],
        recommendation_reasons=[],
        final_direction_from="현재 상태",
        final_direction_to="건강 습관 유지",
        diet_suggestion=service.LLMDietSuggestion(
            title="냉장고 활용",
            message="두부를 활용하세요.",
            action_items=["두부 확인하기"],
            evidence_metric_keys=[
                "bmi",
                "unsupported_metric",
            ],
            used_item_names=[
                "두부",
                "입력에 없는 재료",
            ],
        ),
    )


class SuccessResponses:
    async def parse(self, **kwargs):
        return SimpleNamespace(
            output_parsed=_success_draft()
        )


class ErrorResponses:
    async def parse(self, **kwargs):
        raise RuntimeError(
            "simulated health analysis failure"
        )


class SlowResponses:
    async def parse(self, **kwargs):
        await asyncio.sleep(0.05)
        return SimpleNamespace(
            output_parsed=_success_draft()
        )


class EmptyResponses:
    async def parse(self, **kwargs):
        return SimpleNamespace(
            output_parsed=None
        )


class FakeOpenAI:
    responses_factory = SuccessResponses

    def __init__(self, *, api_key):
        self.responses = self.responses_factory()


def _request_with_inventory() -> HealthAnalysisRequest:
    examples = json.loads(
        CONTRACT_PATH.read_text(
            encoding="utf-8"
        )
    )
    request = HealthAnalysisRequest.model_validate(
        examples["initial_baseline"]["request"]
    )
    diet_context = DietContextInput(
        captured_at="2026-10-28T09:00:00+09:00",
        inventory=[
            InventoryItemInput(
                inventory_item_id="tofu-id",
                name="두부",
                quantity=300,
                unit="g",
                freshness_status="expiring_soon",
            ),
            InventoryItemInput(
                inventory_item_id="rice-id",
                name="현미",
                quantity=500,
                unit="g",
                freshness_status="fresh",
            ),
            InventoryItemInput(
                inventory_item_id="milk-id",
                name="우유",
                quantity=1,
                unit="L",
                freshness_status="fresh",
            ),
        ],
        allergies=["우유"],
    )
    return request.model_copy(
        update={
            "input": request.input.model_copy(
                update={
                    "diet_context": diet_context,
                }
            ),
        }
    )


async def _run_all() -> None:
    original_settings = service.get_settings
    original_openai = service.AsyncOpenAI
    original_graph = service.analysis_context_graph

    settings = SimpleNamespace(
        openai_api_key="test-key",
        openai_model="test-model",
        health_analysis_openai_timeout_seconds=1.0,
    )
    service.get_settings = lambda: settings
    service.AsyncOpenAI = FakeOpenAI
    service.analysis_context_graph = FakeAnalysisGraph()
    service._reset_health_analysis_resilience_for_tests()

    request = _request_with_inventory()

    try:
        FakeOpenAI.responses_factory = SuccessResponses
        success = await service.generate_health_analysis(
            request
        )
        assert success.model.name == "test-model"
        assert success.model.version == "health-analysis-v1"
        assert success.analysis.health_score.total_score == 32
        assert success.analysis.key_metric_keys == ["bmi"]
        assert success.analysis.diet_suggestion.used_inventory_item_ids == [
            "tofu-id"
        ]
        assert success.analysis.refrigerator_context.used_items == [
            "두부"
        ]

        FakeOpenAI.responses_factory = ErrorResponses
        error_fallback = await service.generate_health_analysis(
            request
        )
        assert error_fallback.model.name == "deterministic"
        assert error_fallback.model.version == (
            "health-analysis-fallback-v1"
        )
        assert error_fallback.analysis.health_score.total_score == 32
        assert error_fallback.analysis.key_metric_keys == ["bmi"]
        assert (
            error_fallback
            .analysis
            .diet_suggestion
            .used_inventory_item_ids
        ) == []
        refrigerator = (
            error_fallback
            .analysis
            .refrigerator_context
        )
        assert refrigerator.available_count == 2
        assert refrigerator.expiring_soon_count == 1
        assert refrigerator.allergy_excluded_count == 1
        assert refrigerator.used_items == []
        assert refrigerator.expiring_soon_items == ["두부"]

        settings.health_analysis_openai_timeout_seconds = 0.01
        FakeOpenAI.responses_factory = SlowResponses
        timeout_fallback = await service.generate_health_analysis(
            request
        )
        assert timeout_fallback.model.name == "deterministic"
        assert timeout_fallback.analysis.health_score.total_score == 32

        settings.health_analysis_openai_timeout_seconds = 1.0
        FakeOpenAI.responses_factory = EmptyResponses
        empty_output_fallback = await service.generate_health_analysis(
            request
        )
        assert empty_output_fallback.model.name == "deterministic"
        assert (
            empty_output_fallback
            .analysis
            .health_score
            .total_score
        ) == 32

        request_without_inventory = request.model_copy(
            update={
                "input": request.input.model_copy(
                    update={
                        "diet_context": None,
                    }
                ),
            }
        )
        no_inventory = await service.generate_health_analysis(
            request_without_inventory
        )
        assert no_inventory.model.name == "deterministic"
        assert no_inventory.analysis.health_score.total_score == 32

        health = await health_analysis_health_check()
        assert health["health_analysis_resilience"] == {
            "llm_successes": 1,
            "llm_fallbacks": 3,
            "llm_timeouts": 1,
            "llm_errors": 2,
            "empty_inventory_fallbacks": 1,
        }
    finally:
        service.get_settings = original_settings
        service.AsyncOpenAI = original_openai
        service.analysis_context_graph = original_graph
        service._reset_health_analysis_resilience_for_tests()


def test_health_analysis_resilience() -> None:
    asyncio.run(_run_all())


if __name__ == "__main__":
    test_health_analysis_resilience()
    print("Health analysis resilience 테스트: OK")
