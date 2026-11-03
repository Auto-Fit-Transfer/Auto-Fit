"""Deterministic diagnostics checks without a paid OpenAI request."""

import asyncio
from types import SimpleNamespace
from unittest.mock import patch

from app.services import meal_recipe_service as recipe_module
from app.services.meal_recipe_service import (
    GeneratedRecipeIngredient,
    GeneratedRecipeResponse,
    MealRecipeService,
)


class FakeResponses:
    def __init__(self, responses: list[SimpleNamespace]) -> None:
        self.responses = list(responses)
        self.calls = 0
        self.inputs = []

    async def parse(self, **kwargs) -> SimpleNamespace:
        self.inputs.append(kwargs)
        response = self.responses[self.calls]
        self.calls += 1
        return response


def make_service(responses: list[SimpleNamespace]) -> tuple[MealRecipeService, FakeResponses]:
    service = object.__new__(MealRecipeService)
    client = FakeResponses(responses)
    service.settings = SimpleNamespace(openai_model="gpt-5")
    service.openai_client = SimpleNamespace(responses=client)
    return service, client


def recipe_with_ingredient(name: str) -> GeneratedRecipeResponse:
    return GeneratedRecipeResponse(
        ingredients=[GeneratedRecipeIngredient(name=name, amount_g=50.0)],
        steps=["재료를 준비합니다."],
    )


async def generate(service: MealRecipeService, allergies: list[str] | None = None) -> dict:
    return await service.generate_llm_recipe(
        item={"food_name": "두부구이", "portion_g": 100.0},
        allergies=allergies or [],
        disliked_foods=[],
    )


def warning_texts(warning_mock) -> list[str]:
    return [call.args[0] % call.args[1:] for call in warning_mock.call_args_list]


async def test_unparsed_response_records_metadata_without_recipe_text() -> None:
    empty = SimpleNamespace(
        output_parsed=None,
        status="incomplete",
        incomplete_details=SimpleNamespace(reason="max_output_tokens"),
        usage=SimpleNamespace(
            output_tokens=1200,
            output_tokens_details=SimpleNamespace(reasoning_tokens=1200),
        ),
    )
    service, client = make_service([empty, empty])
    before = MealRecipeService.get_operational_stats()["cache"]["llm_unparsed_responses"]
    with patch.object(recipe_module.logger, "warning") as warning:
        result = await generate(service)
    after = MealRecipeService.get_operational_stats()["cache"]["llm_unparsed_responses"]

    assert client.calls == 2
    assert all(call["reasoning"] == {"effort": "minimal"} for call in client.inputs)
    assert all(call["max_output_tokens"] == 1200 for call in client.inputs)
    assert result["recipe_source"] == "unavailable"
    assert after - before == 2
    messages = warning_texts(warning)
    assert len(messages) == 2
    assert all("incomplete_details={'reason': 'max_output_tokens'}" in message
               and "status=incomplete" in message and "1200" in message
               for message in messages)
    assert all("두부구이" not in message for message in messages)


async def test_safety_rejection_records_count_without_allergen_name() -> None:
    rejected = SimpleNamespace(
        output_parsed=recipe_with_ingredient("우유"),
        status="completed", incomplete_details=None,
    )
    service, client = make_service([rejected, rejected])
    before = MealRecipeService.get_operational_stats()["cache"]["llm_safety_rejections"]
    with patch.object(recipe_module.logger, "warning") as warning:
        result = await generate(service, allergies=["우유"])
    after = MealRecipeService.get_operational_stats()["cache"]["llm_safety_rejections"]

    assert client.calls == 2
    assert result["recipe_source"] == "unavailable"
    assert result["restriction_matches"]
    assert after - before == 2
    messages = warning_texts(warning)
    assert len(messages) == 2
    assert all("restriction_count=" in message and "status=completed" in message
               and "incomplete_details=None" in message for message in messages)
    assert all("우유" not in message for message in messages)


async def test_unparsed_response_without_metadata_can_retry_successfully() -> None:
    service, client = make_service([
        SimpleNamespace(output_parsed=None),
        SimpleNamespace(output_parsed=recipe_with_ingredient("두부")),
    ])
    before = MealRecipeService.get_operational_stats()["cache"]["llm_unparsed_responses"]
    with patch.object(recipe_module.logger, "warning") as warning:
        result = await generate(service)
    after = MealRecipeService.get_operational_stats()["cache"]["llm_unparsed_responses"]

    assert client.calls == 2
    assert result["recipe_source"] == "llm_generated"
    assert after - before == 1
    assert len(warning_texts(warning)) == 1


async def main() -> None:
    await test_unparsed_response_records_metadata_without_recipe_text()
    await test_safety_rejection_records_count_without_allergen_name()
    await test_unparsed_response_without_metadata_can_retry_successfully()
    print("Meal Recipe 진단 지표 테스트: OK")


if __name__ == "__main__":
    asyncio.run(main())
