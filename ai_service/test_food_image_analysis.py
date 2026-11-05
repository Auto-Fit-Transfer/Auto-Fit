from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import httpx

from app.core.config import get_settings
from app.main import app
from app.schemas.food_image import (
    FoodAnalysisRecalculateRequest,
    FoodAnalysisResponse,
    VisionDetectedFood,
    VisionFoodRecognition,
)
from app.services.food_catalog_service import FoodCatalogService
from app.services.food_image_analysis_service import (
    FoodImageAnalysisService,
)


JPEG_BYTES = b"\xff\xd8\xff" + (b"image-data" * 4)


class StubFoodCatalogService(FoodCatalogService):
    async def fetch_all_foods(
        self,
        page_size: int = 1000,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        del page_size, force_refresh
        return [
            {
                "foodCd": "FOOD-001",
                "foodNm": "김치볶음밥",
                "nutConSrtrQua": "100g",
                "enerc": "160",
                "chocdf": "25",
                "prot": "5",
                "fatce": "4",
                "srcNm": "대한민국 전국통합식품영양성분정보",
            },
            {
                "foodCd": "FOOD-002",
                "foodNm": "미역국",
                "nutConSrtrQua": "100g",
                "enerc": "40",
                "chocdf": "3",
                "prot": "2",
                "fatce": "2",
                "srcNm": "대한민국 전국통합식품영양성분정보",
            },
        ]


class FakeResponses:
    def __init__(self, parsed: VisionFoodRecognition) -> None:
        self.parsed = parsed
        self.request: dict[str, Any] | None = None

    async def parse(self, **kwargs: Any) -> SimpleNamespace:
        self.request = kwargs
        return SimpleNamespace(output_parsed=self.parsed)


class FakeOpenAIClient:
    def __init__(self, parsed: VisionFoodRecognition) -> None:
        self.responses = FakeResponses(parsed)


def _response_fixture() -> FoodAnalysisResponse:
    return FoodAnalysisResponse(
        status="completed",
        recognition_source="openai_vision",
        items=[
            {
                "name": "김치볶음밥",
                "amount_g": 250.0,
                "amount_estimated": True,
                "confidence": 0.92,
                "alternative_names": ["볶음밥"],
                "catalog_matched": True,
                "matched_food_code": "FOOD-001",
                "matched_food_name": "김치볶음밥",
                "match_score": 1.0,
                "calories_kcal": 400.0,
                "carbohydrate_g": 62.5,
                "protein_g": 12.5,
                "fat_g": 10.0,
                "nutrition_source": "대한민국 전국통합식품영양성분정보",
                "requires_user_confirmation": True,
                "warnings": ["저장 전에 확인해야 합니다."],
            }
        ],
        total_nutrition={
            "calories_kcal": 400.0,
            "carbohydrate_g": 62.5,
            "protein_g": 12.5,
            "fat_g": 10.0,
        },
        nutrition_complete=True,
        requires_user_confirmation=True,
        message="분석 완료",
    )


async def _test_service_analysis_and_recalculation() -> None:
    recognition = VisionFoodRecognition(
        image_is_food=True,
        foods=[
            VisionDetectedFood(
                name="김치 볶음밥",
                estimated_amount_g=250.0,
                confidence=0.92,
                alternative_names=["김치볶음밥"],
            ),
            VisionDetectedFood(
                name="확인 불가 반찬",
                estimated_amount_g=None,
                confidence=0.35,
                alternative_names=[],
            ),
        ],
        analysis_note="두 가지 음식을 인식했습니다.",
    )
    fake_openai = FakeOpenAIClient(recognition)
    service = FoodImageAnalysisService(
        openai_client=fake_openai,  # type: ignore[arg-type]
        food_catalog_service=StubFoodCatalogService(),
    )

    response = await service.analyze_image(
        image_bytes=JPEG_BYTES,
        declared_content_type="image/jpeg",
    )

    assert response.status == "partial"
    assert response.requires_user_confirmation is True
    assert response.nutrition_complete is False
    assert len(response.items) == 2
    assert response.items[0].catalog_matched is True
    assert response.items[0].matched_food_name == "김치볶음밥"
    assert response.items[0].calories_kcal == 400.0
    assert response.items[0].carbohydrate_g == 62.5
    assert response.items[0].protein_g == 12.5
    assert response.items[0].fat_g == 10.0
    assert response.items[1].catalog_matched is False
    assert response.items[1].calories_kcal is None
    assert response.total_nutrition.calories_kcal == 400.0

    openai_request = fake_openai.responses.request
    assert openai_request is not None
    image_input = openai_request["input"][0]["content"][1]
    assert image_input["type"] == "input_image"
    assert image_input["image_url"].startswith(
        "data:image/jpeg;base64,"
    )
    assert openai_request["text_format"] is VisionFoodRecognition

    recalculated = await service.recalculate(
        FoodAnalysisRecalculateRequest(
            items=[
                {
                    "name": "미역국",
                    "amount_g": 180.0,
                }
            ]
        )
    )
    assert recalculated.status == "completed"
    assert recalculated.recognition_source == "user_input"
    assert recalculated.items[0].amount_estimated is False
    assert recalculated.items[0].confidence is None
    assert recalculated.items[0].calories_kcal == 72.0
    assert recalculated.total_nutrition.protein_g == 3.6


def test_food_image_service_analysis_and_recalculation() -> None:
    asyncio.run(_test_service_analysis_and_recalculation())


def test_food_image_validation_rejects_unsupported_content() -> None:
    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(  # type: ignore[arg-type]
            VisionFoodRecognition(
                image_is_food=False,
                foods=[],
                analysis_note="음식 없음",
            )
        ),
        food_catalog_service=StubFoodCatalogService(),
    )

    try:
        asyncio.run(
            service.analyze_image(
                image_bytes=b"not-an-image",
                declared_content_type="image/jpeg",
            )
        )
    except ValueError as exc:
        assert "JPEG, PNG, and WEBP" in str(exc)
    else:
        raise AssertionError("Unsupported image content was accepted")


async def _test_router_contract() -> None:
    from app.routers import food_image_router

    settings = get_settings()
    previous_key = settings.ai_server_api_key
    settings.ai_server_api_key = "food-image-test-key"

    original_analyze = FoodImageAnalysisService.analyze_image
    original_recalculate = FoodImageAnalysisService.recalculate

    async def fake_analyze(
        self: FoodImageAnalysisService,
        *,
        image_bytes: bytes,
        declared_content_type: str | None,
    ) -> FoodAnalysisResponse:
        del self
        assert image_bytes == JPEG_BYTES
        assert declared_content_type == "image/jpeg"
        return _response_fixture()

    async def fake_recalculate(
        self: FoodImageAnalysisService,
        request: FoodAnalysisRecalculateRequest,
    ) -> FoodAnalysisResponse:
        del self
        assert request.items[0].amount_g == 200.0
        response = _response_fixture()
        response.recognition_source = "user_input"
        response.items[0].amount_estimated = False
        return response

    FoodImageAnalysisService.analyze_image = fake_analyze
    FoodImageAnalysisService.recalculate = fake_recalculate
    app.openapi_schema = None

    transport = httpx.ASGITransport(app=app)
    headers = {"Authorization": "Bearer food-image-test-key"}

    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            analyzed = await client.post(
                "/food-analysis/analyze",
                files={
                    "image": (
                        "meal.jpg",
                        JPEG_BYTES,
                        "image/jpeg",
                    )
                },
                headers=headers,
            )
            recalculated = await client.post(
                "/food-analysis/recalculate",
                json={
                    "items": [
                        {
                            "name": "김치볶음밥",
                            "amount_g": 200.0,
                        }
                    ]
                },
                headers=headers,
            )
            unauthorized = await client.post(
                "/food-analysis/recalculate",
                json={
                    "items": [
                        {
                            "name": "김치볶음밥",
                            "amount_g": 200.0,
                        }
                    ]
                },
            )

        assert analyzed.status_code == 200
        assert analyzed.json()["items"][0]["catalog_matched"] is True
        assert recalculated.status_code == 200
        assert recalculated.json()["recognition_source"] == "user_input"
        assert unauthorized.status_code == 401

        openapi = app.openapi()
        analyze_operation = openapi["paths"][
            "/food-analysis/analyze"
        ]["post"]
        assert "multipart/form-data" in analyze_operation[
            "requestBody"
        ]["content"]
        assert analyze_operation["security"] == [{"HTTPBearer": []}]
        assert (
            openapi["paths"]["/food-analysis/recalculate"]["post"][
                "security"
            ]
            == [{"HTTPBearer": []}]
        )
    finally:
        FoodImageAnalysisService.analyze_image = original_analyze
        FoodImageAnalysisService.recalculate = original_recalculate
        settings.ai_server_api_key = previous_key
        app.openapi_schema = None
        del food_image_router


def test_food_image_router_contract() -> None:
    asyncio.run(_test_router_contract())
