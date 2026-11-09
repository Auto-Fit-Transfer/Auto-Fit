from __future__ import annotations

import asyncio
from io import BytesIO
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from PIL import Image

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
    FoodImageCapacityError,
    FoodImageProviderError,
    FoodImageValidationError,
    _get_analysis_semaphore,
    get_food_image_resilience_stats,
)


def _image_bytes(
    image_format: str = "JPEG",
    *,
    size: tuple[int, int] = (32, 24),
    with_exif: bool = False,
) -> bytes:
    image = Image.new("RGB", size, (220, 120, 40))
    output = BytesIO()
    kwargs: dict[str, Any] = {}
    if with_exif:
        exif = Image.Exif()
        exif[305] = "Auto-Fit test camera"
        kwargs["exif"] = exif
    image.save(output, format=image_format, **kwargs)
    return output.getvalue()


JPEG_BYTES = _image_bytes()


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


def test_food_image_preparation_decodes_resizes_and_removes_metadata() -> None:
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
    original_limit = service.settings.food_image_target_max_dimension
    service.settings.food_image_target_max_dimension = 512
    try:
        prepared, media_type = service._prepare_image(
            image_bytes=_image_bytes(
                size=(1200, 800),
                with_exif=True,
            ),
            declared_content_type="image/jpeg",
        )
    finally:
        service.settings.food_image_target_max_dimension = original_limit

    assert media_type == "image/jpeg"
    with Image.open(BytesIO(prepared)) as normalized:
        assert max(normalized.size) == 512
        assert not normalized.getexif()


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


def test_food_image_validation_rejects_damaged_magic_byte_file() -> None:
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

    with pytest.raises(FoodImageValidationError, match="damaged"):
        service._prepare_image(
            image_bytes=b"\xff\xd8\xffnot-a-real-jpeg",
            declared_content_type="image/jpeg",
        )


class FailingFoodCatalogService(FoodCatalogService):
    async def fetch_all_foods(
        self,
        page_size: int = 1000,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        del page_size, force_refresh
        raise RuntimeError("catalog offline")


def test_food_catalog_outage_is_not_hidden_as_partial_response() -> None:
    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(  # type: ignore[arg-type]
            VisionFoodRecognition(
                image_is_food=True,
                foods=[
                    VisionDetectedFood(
                        name="김치볶음밥",
                        estimated_amount_g=200,
                        confidence=0.9,
                        alternative_names=[],
                    )
                ],
                analysis_note="인식 완료",
            )
        ),
        food_catalog_service=FailingFoodCatalogService(),
    )

    with pytest.raises(RuntimeError, match="temporarily unavailable"):
        asyncio.run(
            service.analyze_image(
                image_bytes=JPEG_BYTES,
                declared_content_type="image/jpeg",
            )
        )


class SimilarFoodCatalogService(FoodCatalogService):
    async def fetch_all_foods(
        self,
        page_size: int = 1000,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        del page_size, force_refresh
        return [
            {
                "foodCd": "CAKE-001",
                "foodNm": "당근 그릭요거트 케이크",
                "nutConSrtrQua": "100g",
                "enerc": "300",
                "chocdf": "40",
                "prot": "8",
                "fatce": "12",
                "srcNm": "대한민국 전국통합식품영양성분정보",
            },
            {
                "foodCd": "YOGURT-001",
                "foodNm": "그릭요거트",
                "nutConSrtrQua": "50g",
                "enerc": "60",
                "chocdf": "4",
                "prot": "5",
                "fatce": "2",
                "srcNm": "대한민국 전국통합식품영양성분정보",
            },
        ]


def test_recalculation_prefers_exact_food_code_and_serving_basis() -> None:
    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(  # type: ignore[arg-type]
            VisionFoodRecognition(
                image_is_food=False,
                foods=[],
                analysis_note="unused",
            )
        ),
        food_catalog_service=SimilarFoodCatalogService(),
    )

    response = asyncio.run(
        service.recalculate(
            FoodAnalysisRecalculateRequest(
                items=[
                    {
                        "name": "그릭요거트",
                        "amount_g": 100,
                        "matched_food_code": "YOGURT-001",
                    }
                ]
            )
        )
    )

    assert response.status == "completed"
    assert response.items[0].matched_food_code == "YOGURT-001"
    assert response.items[0].calories_kcal == 120
    assert response.items[0].protein_g == 10


def test_recalculation_rejects_stale_code_for_changed_food_name() -> None:
    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(  # type: ignore[arg-type]
            VisionFoodRecognition(
                image_is_food=False,
                foods=[],
                analysis_note="unused",
            )
        ),
        food_catalog_service=SimilarFoodCatalogService(),
    )

    response = asyncio.run(
        service.recalculate(
            FoodAnalysisRecalculateRequest(
                items=[
                    {
                        "name": "김치볶음밥",
                        "amount_g": 200,
                        "matched_food_code": "YOGURT-001",
                    }
                ]
            )
        )
    )

    assert response.status == "partial"
    assert response.items[0].catalog_matched is False
    assert response.items[0].calories_kcal is None


class AmbiguousExactCatalogService(FoodCatalogService):
    async def fetch_all_foods(
        self,
        page_size: int = 1000,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        del page_size, force_refresh
        base = {
            "foodNm": "김치볶음밥",
            "nutConSrtrQua": "100g",
            "chocdf": "25",
            "prot": "5",
            "fatce": "4",
            "srcNm": "대한민국 전국통합식품영양성분정보",
        }
        return [
            {**base, "foodCd": "RICE-001", "enerc": "160"},
            {**base, "foodCd": "RICE-002", "enerc": "220"},
        ]


def test_ambiguous_exact_catalog_rows_are_not_auto_confirmed() -> None:
    recognition = VisionFoodRecognition(
        image_is_food=True,
        foods=[
            VisionDetectedFood(
                name="김치볶음밥",
                estimated_amount_g=200,
                confidence=0.95,
                alternative_names=[],
            )
        ],
        analysis_note="인식 완료",
    )
    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(recognition),  # type: ignore[arg-type]
        food_catalog_service=AmbiguousExactCatalogService(),
    )

    response = asyncio.run(
        service.analyze_image(
            image_bytes=JPEG_BYTES,
            declared_content_type="image/jpeg",
        )
    )

    assert response.status == "partial"
    assert response.items[0].catalog_matched is False


def test_generic_name_does_not_match_longer_different_dish() -> None:
    recognition = VisionFoodRecognition(
        image_is_food=True,
        foods=[
            VisionDetectedFood(
                name="그릭요거트",
                estimated_amount_g=100,
                confidence=0.9,
                alternative_names=["당근 그릭요거트 케이크"],
            )
        ],
        analysis_note="인식 완료",
    )

    class CakeOnlyCatalog(SimilarFoodCatalogService):
        async def fetch_all_foods(
            self,
            page_size: int = 1000,
            force_refresh: bool = False,
        ) -> list[dict[str, Any]]:
            foods = await super().fetch_all_foods(
                page_size=page_size,
                force_refresh=force_refresh,
            )
            return foods[:1]

    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(recognition),  # type: ignore[arg-type]
        food_catalog_service=CakeOnlyCatalog(),
    )
    response = asyncio.run(
        service.analyze_image(
            image_bytes=JPEG_BYTES,
            declared_content_type="image/jpeg",
        )
    )

    assert response.status == "partial"
    assert response.items[0].catalog_matched is False


def test_low_confidence_result_requires_correction_before_storage() -> None:
    recognition = VisionFoodRecognition(
        image_is_food=True,
        foods=[
            VisionDetectedFood(
                name="김치볶음밥",
                estimated_amount_g=200,
                confidence=0.2,
                alternative_names=[],
            )
        ],
        analysis_note="낮은 신뢰도",
    )
    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(recognition),  # type: ignore[arg-type]
        food_catalog_service=StubFoodCatalogService(),
    )

    response = asyncio.run(
        service.analyze_image(
            image_bytes=JPEG_BYTES,
            declared_content_type="image/jpeg",
        )
    )

    assert response.status == "partial"
    assert response.nutrition_complete is False
    assert response.items[0].catalog_matched is True
    assert any("신뢰도가 낮" in warning for warning in response.items[0].warnings)


def test_missing_amount_does_not_claim_that_amount_was_estimated() -> None:
    recognition = VisionFoodRecognition(
        image_is_food=True,
        foods=[
            VisionDetectedFood(
                name="김치볶음밥",
                estimated_amount_g=None,
                confidence=0.95,
                alternative_names=[],
            )
        ],
        analysis_note="중량 확인 불가",
    )
    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(recognition),  # type: ignore[arg-type]
        food_catalog_service=StubFoodCatalogService(),
    )

    response = asyncio.run(
        service.analyze_image(
            image_bytes=JPEG_BYTES,
            declared_content_type="image/jpeg",
        )
    )

    warnings = response.items[0].warnings
    assert response.items[0].amount_estimated is False
    assert any("추정하지 못" in warning for warning in warnings)
    assert not any("중량은 추정값" in warning for warning in warnings)


def test_unparsed_openai_response_is_observable() -> None:
    fake_openai = FakeOpenAIClient(None)  # type: ignore[arg-type]
    service = FoodImageAnalysisService(
        openai_client=fake_openai,  # type: ignore[arg-type]
        food_catalog_service=StubFoodCatalogService(),
    )
    before = get_food_image_resilience_stats()["unparsed_responses"]

    with pytest.raises(FoodImageProviderError, match="empty result"):
        asyncio.run(
            service.analyze_image(
                image_bytes=JPEG_BYTES,
                declared_content_type="image/jpeg",
            )
        )

    after = get_food_image_resilience_stats()["unparsed_responses"]
    assert after == before + 1


async def _test_food_image_capacity_limit() -> None:
    service = FoodImageAnalysisService(
        openai_client=FakeOpenAIClient(  # type: ignore[arg-type]
            VisionFoodRecognition(
                image_is_food=False,
                foods=[],
                analysis_note="unused",
            )
        ),
        food_catalog_service=StubFoodCatalogService(),
    )
    original_limit = service.settings.food_image_max_concurrent_analyses
    original_timeout = service.settings.food_image_queue_timeout_seconds
    service.settings.food_image_max_concurrent_analyses = 1
    service.settings.food_image_queue_timeout_seconds = 0.01
    semaphore = _get_analysis_semaphore(1)
    await semaphore.acquire()
    try:
        with pytest.raises(FoodImageCapacityError, match="busy"):
            await service._recognize_foods(
                image_bytes=JPEG_BYTES,
                media_type="image/jpeg",
            )
    finally:
        semaphore.release()
        service.settings.food_image_max_concurrent_analyses = original_limit
        service.settings.food_image_queue_timeout_seconds = original_timeout


def test_food_image_capacity_limit() -> None:
    asyncio.run(_test_food_image_capacity_limit())


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
        assert "/health/food-image" in openapi["paths"]
    finally:
        FoodImageAnalysisService.analyze_image = original_analyze
        FoodImageAnalysisService.recalculate = original_recalculate
        settings.ai_server_api_key = previous_key
        app.openapi_schema = None
        del food_image_router


def test_food_image_router_contract() -> None:
    asyncio.run(_test_router_contract())
