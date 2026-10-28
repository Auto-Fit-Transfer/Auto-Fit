from __future__ import annotations

import asyncio
import base64
from difflib import SequenceMatcher
import logging
import re
import unicodedata
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.schemas.food_image import (
    FoodAnalysisItem,
    FoodAnalysisNutrition,
    FoodAnalysisRecalculateRequest,
    FoodAnalysisResponse,
    VisionDetectedFood,
    VisionFoodRecognition,
)
from app.services.food_catalog_service import FoodCatalogService


logger = logging.getLogger(__name__)


SUPPORTED_IMAGE_MEDIA_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


VISION_INSTRUCTIONS = """
너는 Auto-Fit의 음식 사진 인식 도우미다.

사진에 실제로 보이는 음식만 식별한다.
한 사진에 여러 음식이나 반찬이 있으면 서로 다른 항목으로 분리한다.
그릇, 식기, 포장지, 장식은 음식으로 분류하지 않는다.
숨겨진 재료나 보이지 않는 음식은 추측하지 않는다.
음식 이름은 한국 사용자가 검색하기 쉬운 일반적인 한국어 메뉴명으로 작성한다.
사진만으로 양을 합리적으로 추정할 수 있을 때만 estimated_amount_g를 제공한다.
중량을 판단하기 어렵다면 estimated_amount_g는 null로 둔다.
칼로리나 영양성분은 생성하지 않는다.
의료적 평가나 식단 처방을 하지 않는다.
confidence는 각 음식 이름 인식에 대한 0~1 신뢰도다.
alternative_names에는 공식 음식 DB 검색에 도움이 되는 짧은 대체 이름만 넣는다.
""".strip()


class FoodImageConfigurationError(RuntimeError):
    """이미지 분석에 필요한 서버 설정이 없을 때 발생한다."""


class FoodImageProviderError(RuntimeError):
    """외부 이미지 분석 제공자 호출이 실패했을 때 발생한다."""


class FoodImageAnalysisService:
    """
    음식 사진 인식과 공식 Food DB 영양 계산을 조율한다.

    사용자별 저장이나 OCR은 담당하지 않는다.
    """

    def __init__(
        self,
        *,
        openai_client: AsyncOpenAI | None = None,
        food_catalog_service: FoodCatalogService | None = None,
    ) -> None:
        self.settings = get_settings()
        self._openai_client = openai_client
        self._owns_openai_client = openai_client is None
        self.food_catalog_service = (
            food_catalog_service or FoodCatalogService()
        )

    async def __aenter__(self) -> FoodImageAnalysisService:
        return self

    async def __aexit__(
        self,
        exc_type: Any,
        exc: BaseException | None,
        traceback: Any,
    ) -> None:
        del exc_type, exc, traceback
        if self._owns_openai_client and self._openai_client is not None:
            await self._openai_client.close()
            self._openai_client = None

    async def analyze_image(
        self,
        *,
        image_bytes: bytes,
        declared_content_type: str | None,
    ) -> FoodAnalysisResponse:
        media_type = self._validate_image(
            image_bytes=image_bytes,
            declared_content_type=declared_content_type,
        )
        recognition = await self._recognize_foods(
            image_bytes=image_bytes,
            media_type=media_type,
        )

        if not recognition.image_is_food or not recognition.foods:
            return self._empty_response(
                recognition_source="openai_vision",
                message=(
                    recognition.analysis_note
                    or "사진에서 확인 가능한 음식을 찾지 못했습니다."
                ),
            )

        return await self._build_response(
            detected_foods=recognition.foods,
            recognition_source="openai_vision",
            amount_estimated=True,
            default_message=recognition.analysis_note,
        )

    async def recalculate(
        self,
        request: FoodAnalysisRecalculateRequest,
    ) -> FoodAnalysisResponse:
        detected_foods = [
            VisionDetectedFood(
                name=item.name,
                estimated_amount_g=item.amount_g,
                confidence=1.0,
                alternative_names=[],
            )
            for item in request.items
        ]

        return await self._build_response(
            detected_foods=detected_foods,
            recognition_source="user_input",
            amount_estimated=False,
            default_message=(
                "사용자가 확인한 음식명과 중량으로 영양정보를 다시 계산했습니다."
            ),
        )

    def _get_openai_client(self) -> AsyncOpenAI:
        if self._openai_client is not None:
            return self._openai_client

        if not self.settings.openai_api_key:
            raise FoodImageConfigurationError(
                "OPENAI_API_KEY is not configured."
            )

        self._openai_client = AsyncOpenAI(
            api_key=self.settings.openai_api_key
        )
        return self._openai_client

    async def _recognize_foods(
        self,
        *,
        image_bytes: bytes,
        media_type: str,
    ) -> VisionFoodRecognition:
        encoded_image = base64.b64encode(image_bytes).decode("ascii")
        image_url = f"data:{media_type};base64,{encoded_image}"
        client = self._get_openai_client()

        try:
            response = await asyncio.wait_for(
                client.responses.parse(
                    model=self.settings.openai_food_image_model,
                    instructions=VISION_INSTRUCTIONS,
                    input=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "input_text",
                                    "text": (
                                        "이 식사 사진에 보이는 음식을 최대 "
                                        f"{self.settings.food_image_max_items}개까지 "
                                        "분리해서 식별하세요."
                                    ),
                                },
                                {
                                    "type": "input_image",
                                    "image_url": image_url,
                                    "detail": "high",
                                },
                            ],
                        }
                    ],
                    reasoning={"effort": "low"},
                    text_format=VisionFoodRecognition,
                    max_output_tokens=1000,
                ),
                timeout=self.settings.food_image_openai_timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            raise FoodImageProviderError(
                "Food image analysis timed out."
            ) from exc
        except FoodImageConfigurationError:
            raise
        except Exception as exc:
            logger.exception("OpenAI food image analysis failed.")
            raise FoodImageProviderError(
                "Food image analysis provider failed."
            ) from exc

        parsed = response.output_parsed
        if parsed is None:
            raise FoodImageProviderError(
                "Food image analysis returned an empty result."
            )

        parsed.foods = parsed.foods[
            : self.settings.food_image_max_items
        ]
        return parsed

    async def _build_response(
        self,
        *,
        detected_foods: list[VisionDetectedFood],
        recognition_source: str,
        amount_estimated: bool,
        default_message: str,
    ) -> FoodAnalysisResponse:
        try:
            raw_foods = await self.food_catalog_service.fetch_all_foods()
            catalog = self._normalize_catalog(raw_foods)
        except Exception:
            logger.exception(
                "Official food catalog loading failed during image analysis."
            )
            catalog = []
        items = [
            self._build_item(
                detected=detected,
                catalog=catalog,
                amount_estimated=amount_estimated,
                recognition_source=recognition_source,
            )
            for detected in detected_foods
        ]

        complete = bool(items) and all(
            item.catalog_matched
            and item.amount_g is not None
            and item.calories_kcal is not None
            and item.carbohydrate_g is not None
            and item.protein_g is not None
            and item.fat_g is not None
            for item in items
        )
        status = "completed" if complete else "partial"
        total = self._calculate_total(items)

        if complete:
            message = default_message or (
                "음식 인식과 공식 Food DB 영양 계산이 완료되었습니다."
            )
        else:
            message = (
                "일부 음식 또는 중량을 공식 Food DB와 확정하지 못했습니다. "
                "저장 전에 음식명과 중량을 확인해 주세요."
            )

        return FoodAnalysisResponse(
            status=status,
            recognition_source=recognition_source,
            items=items,
            total_nutrition=total,
            nutrition_complete=complete,
            requires_user_confirmation=True,
            message=message,
        )

    def _build_item(
        self,
        *,
        detected: VisionDetectedFood,
        catalog: list[dict[str, Any]],
        amount_estimated: bool,
        recognition_source: str,
    ) -> FoodAnalysisItem:
        matched_food, score = self._find_catalog_match(
            detected=detected,
            catalog=catalog,
        )
        warnings: list[str] = []

        if matched_food is None:
            warnings.append(
                "공식 Food DB에서 일치하는 음식을 찾지 못했습니다."
            )
            if detected.estimated_amount_g is None:
                warnings.append("사진에서 중량을 추정하지 못했습니다.")
            return FoodAnalysisItem(
                name=detected.name,
                amount_g=detected.estimated_amount_g,
                amount_estimated=amount_estimated,
                confidence=(
                    detected.confidence
                    if recognition_source == "openai_vision"
                    else None
                ),
                alternative_names=detected.alternative_names,
                catalog_matched=False,
                warnings=warnings,
            )

        nutrition: dict[str, Any] | None = None
        if detected.estimated_amount_g is not None:
            nutrition = self.food_catalog_service.calculate_portion_nutrition(
                matched_food,
                detected.estimated_amount_g,
            )
        else:
            warnings.append("사진에서 중량을 추정하지 못했습니다.")

        if amount_estimated:
            warnings.append(
                "사진 기반 음식명과 중량은 추정값이므로 저장 전에 확인해야 합니다."
            )

        return FoodAnalysisItem(
            name=detected.name,
            amount_g=detected.estimated_amount_g,
            amount_estimated=amount_estimated,
            confidence=(
                detected.confidence
                if recognition_source == "openai_vision"
                else None
            ),
            alternative_names=detected.alternative_names,
            catalog_matched=True,
            matched_food_code=matched_food.get("food_code") or None,
            matched_food_name=matched_food.get("food_name") or None,
            match_score=score,
            calories_kcal=(
                nutrition.get("calories_kcal") if nutrition else None
            ),
            carbohydrate_g=(
                nutrition.get("carbohydrate_g") if nutrition else None
            ),
            protein_g=(nutrition.get("protein_g") if nutrition else None),
            fat_g=(nutrition.get("fat_g") if nutrition else None),
            nutrition_source=matched_food.get("source_name") or (
                "대한민국 전국통합식품영양성분정보"
            ),
            warnings=warnings,
        )

    def _normalize_catalog(
        self,
        raw_foods: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        catalog: list[dict[str, Any]] = []

        for raw_food in raw_foods:
            food = self.food_catalog_service.normalize_food(raw_food)
            required = (
                food.get("food_name"),
                food.get("calories_kcal"),
                food.get("carbohydrate_g"),
                food.get("protein_g"),
                food.get("fat_g"),
            )
            if any(value is None or value == "" for value in required):
                continue
            if any(
                float(food[key]) < 0
                for key in (
                    "calories_kcal",
                    "carbohydrate_g",
                    "protein_g",
                    "fat_g",
                )
            ):
                continue
            catalog.append(food)

        return catalog

    def _find_catalog_match(
        self,
        *,
        detected: VisionDetectedFood,
        catalog: list[dict[str, Any]],
    ) -> tuple[dict[str, Any] | None, float | None]:
        query_names = [detected.name, *detected.alternative_names]
        best_food: dict[str, Any] | None = None
        best_score = 0.0

        for food in catalog:
            food_name = str(food.get("food_name") or "")
            for query_name in query_names:
                score = self._name_similarity(query_name, food_name)
                if score > best_score:
                    best_food = food
                    best_score = score
                if score == 1.0:
                    break
            if best_score == 1.0:
                break

        if (
            best_food is None
            or best_score < self.settings.food_catalog_match_threshold
        ):
            return None, None

        return best_food, round(best_score, 4)

    @classmethod
    def _name_similarity(cls, left: str, right: str) -> float:
        left_compact, left_tokens = cls._normalize_name(left)
        right_compact, right_tokens = cls._normalize_name(right)

        if not left_compact or not right_compact:
            return 0.0
        if left_compact == right_compact:
            return 1.0

        sequence_score = SequenceMatcher(
            None,
            left_compact,
            right_compact,
        ).ratio()
        containment_score = 0.0
        shorter = min(len(left_compact), len(right_compact))
        longer = max(len(left_compact), len(right_compact))
        if shorter >= 2 and (
            left_compact in right_compact
            or right_compact in left_compact
        ):
            containment_score = 0.82 + (0.18 * shorter / longer)

        token_score = 0.0
        union = left_tokens | right_tokens
        if union:
            token_score = len(left_tokens & right_tokens) / len(union)

        return min(
            1.0,
            max(sequence_score, containment_score, token_score),
        )

    @staticmethod
    def _normalize_name(value: str) -> tuple[str, set[str]]:
        normalized = unicodedata.normalize("NFKC", value).casefold()
        normalized = re.sub(r"[\(\[\{].*?[\)\]\}]", " ", normalized)
        normalized = normalized.replace("_", " ")
        token_text = re.sub(r"[^0-9a-z가-힣]+", " ", normalized)
        tokens = {
            token
            for token in token_text.split()
            if token
        }
        compact = token_text.replace(" ", "")
        return compact, tokens

    @staticmethod
    def _calculate_total(
        items: list[FoodAnalysisItem],
    ) -> FoodAnalysisNutrition:
        return FoodAnalysisNutrition(
            calories_kcal=round(
                sum(item.calories_kcal or 0 for item in items),
                2,
            ),
            carbohydrate_g=round(
                sum(item.carbohydrate_g or 0 for item in items),
                2,
            ),
            protein_g=round(
                sum(item.protein_g or 0 for item in items),
                2,
            ),
            fat_g=round(
                sum(item.fat_g or 0 for item in items),
                2,
            ),
        )

    @staticmethod
    def _empty_response(
        *,
        recognition_source: str,
        message: str,
    ) -> FoodAnalysisResponse:
        return FoodAnalysisResponse(
            status="unavailable",
            recognition_source=recognition_source,
            items=[],
            total_nutrition=FoodAnalysisNutrition(
                calories_kcal=0,
                carbohydrate_g=0,
                protein_g=0,
                fat_g=0,
            ),
            nutrition_complete=False,
            requires_user_confirmation=True,
            message=message,
        )

    def _validate_image(
        self,
        *,
        image_bytes: bytes,
        declared_content_type: str | None,
    ) -> str:
        if not image_bytes:
            raise ValueError("Image file is empty.")
        if len(image_bytes) > self.settings.food_image_max_bytes:
            raise ValueError(
                "Image file exceeds the configured size limit."
            )

        detected_content_type = self._detect_image_media_type(image_bytes)
        if detected_content_type is None:
            raise ValueError(
                "Only JPEG, PNG, and WEBP image files are supported."
            )

        if (
            declared_content_type
            and declared_content_type not in {
                "application/octet-stream",
                detected_content_type,
            }
        ):
            raise ValueError(
                "Declared image content type does not match the file."
            )

        return detected_content_type

    @staticmethod
    def _detect_image_media_type(image_bytes: bytes) -> str | None:
        if image_bytes.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if (
            len(image_bytes) >= 12
            and image_bytes.startswith(b"RIFF")
            and image_bytes[8:12] == b"WEBP"
        ):
            return "image/webp"
        return None
