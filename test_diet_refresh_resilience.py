import asyncio
from types import SimpleNamespace

import app.services.diet_refresh_service as service
from app.routers.health_router import (
    health_analysis_health_check,
)
from app.schemas.health_analysis import (
    BodyCompositionInput,
    DietContextInput,
    DietRefreshRequest,
    HealthCheckupInput,
    InventoryItemInput,
)


class FakeAnalysisGraph:
    def __init__(self):
        self.calls = 0

    async def ainvoke(self, state):
        self.calls += 1
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


def _success_draft() -> service.LLMDietRefreshDraft:
    return service.LLMDietRefreshDraft(
        title="냉장고 재료 활용",
        message="두부를 활용해 보세요.",
        action_items=["두부 상태 확인하기"],
        evidence_metric_keys=[
            "bmi",
            "unsupported_metric",
        ],
        used_item_names=[
            "두부",
            "우유",
            "입력에 없는 재료",
        ],
    )


class SuccessResponses:
    async def parse(self, **kwargs):
        return SimpleNamespace(
            output_parsed=_success_draft()
        )


class ErrorResponses:
    async def parse(self, **kwargs):
        raise RuntimeError(
            "simulated diet refresh failure"
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


def _request_with_inventory() -> DietRefreshRequest:
    return DietRefreshRequest(
        request_id="diet-refresh-resilience-test",
        health_checkup=HealthCheckupInput(
            bmi=25,
            fasting_glucose=110,
        ),
        body_composition=BodyCompositionInput(
            bmi=25,
            body_fat_percentage=28,
        ),
        diet_context=DietContextInput(
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
        ),
    )


async def _run_all() -> None:
    original_settings = service.get_settings
    original_openai = service.AsyncOpenAI
    original_graph = service.analysis_context_graph

    settings = SimpleNamespace(
        openai_api_key="test-key",
        openai_model="test-model",
        diet_refresh_openai_timeout_seconds=1.0,
    )
    service.get_settings = lambda: settings
    service.AsyncOpenAI = FakeOpenAI
    fake_graph = FakeAnalysisGraph()
    service.analysis_context_graph = fake_graph
    service._reset_diet_refresh_resilience_for_tests()

    request = _request_with_inventory()

    try:
        FakeOpenAI.responses_factory = SuccessResponses
        success = await service.generate_diet_refresh(
            request
        )
        assert success.model.name == "test-model"
        assert success.model.version == "diet-refresh-v1"
        assert success.request_id == request.request_id
        assert success.diet_suggestion.evidence_metric_keys == [
            "bmi"
        ]
        assert success.diet_suggestion.used_inventory_item_ids == [
            "tofu-id"
        ]
        assert success.refrigerator_context.used_items == [
            "두부"
        ]
        assert "우유" not in success.refrigerator_context.used_items

        FakeOpenAI.responses_factory = ErrorResponses
        error_fallback = await service.generate_diet_refresh(
            request
        )
        assert error_fallback.model.name == "deterministic"
        assert error_fallback.model.version == (
            "diet-refresh-fallback-v1"
        )
        assert error_fallback.request_id == request.request_id
        assert (
            error_fallback
            .diet_suggestion
            .used_inventory_item_ids
        ) == []
        refrigerator = error_fallback.refrigerator_context
        assert refrigerator.available_count == 2
        assert refrigerator.expiring_soon_count == 1
        assert refrigerator.allergy_excluded_count == 1
        assert refrigerator.used_items == []
        assert refrigerator.expiring_soon_items == ["두부"]
        assert "두부" in error_fallback.diet_suggestion.message
        assert "우유" not in error_fallback.diet_suggestion.message

        settings.diet_refresh_openai_timeout_seconds = 0.01
        FakeOpenAI.responses_factory = SlowResponses
        timeout_fallback = await service.generate_diet_refresh(
            request
        )
        assert timeout_fallback.model.name == "deterministic"
        assert timeout_fallback.refrigerator_context.available_count == 2

        settings.diet_refresh_openai_timeout_seconds = 1.0
        FakeOpenAI.responses_factory = EmptyResponses
        empty_output_fallback = await service.generate_diet_refresh(
            request
        )
        assert empty_output_fallback.model.name == "deterministic"

        no_inventory_request = request.model_copy(
            update={
                "diet_context": DietContextInput(
                    captured_at=(
                        "2026-10-28T09:00:00+09:00"
                    ),
                    inventory=[],
                    allergies=["우유"],
                )
            }
        )
        no_inventory = await service.generate_diet_refresh(
            no_inventory_request
        )
        assert no_inventory.model.name == "deterministic"
        assert no_inventory.model.version == (
            "diet-refresh-fallback-v1"
        )
        assert no_inventory.refrigerator_context.available_count == 0
        assert fake_graph.calls == 4

        health = await health_analysis_health_check()
        assert health["diet_refresh_resilience"] == {
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
        service._reset_diet_refresh_resilience_for_tests()


def test_diet_refresh_resilience() -> None:
    asyncio.run(_run_all())


if __name__ == "__main__":
    test_diet_refresh_resilience()
    print("Diet refresh resilience 테스트: OK")
