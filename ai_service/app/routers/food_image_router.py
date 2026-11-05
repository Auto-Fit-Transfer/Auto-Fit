import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import get_settings
from app.core.security import security, verify_api_key
from app.schemas.food_image import (
    FoodAnalysisRecalculateRequest,
    FoodAnalysisResponse,
)
from app.services.food_image_analysis_service import (
    FoodImageAnalysisService,
    FoodImageConfigurationError,
    FoodImageProviderError,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/food-analysis",
    tags=["food-analysis"],
)


@router.post(
    "/analyze",
    response_model=FoodAnalysisResponse,
)
async def analyze_food_image(
    image: UploadFile = File(
        description="스마트폰으로 촬영한 JPEG, PNG 또는 WEBP 음식 이미지",
    ),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> FoodAnalysisResponse:
    """이미지를 저장하지 않고 음식 후보와 공식 DB 영양정보를 반환한다."""

    verify_api_key(credentials)
    settings = get_settings()

    try:
        image_bytes = await image.read(
            settings.food_image_max_bytes + 1
        )
    finally:
        await image.close()

    try:
        async with FoodImageAnalysisService() as service:
            return await service.analyze_image(
                image_bytes=image_bytes,
                declared_content_type=image.content_type,
            )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FoodImageConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except FoodImageProviderError as exc:
        logger.warning("Food image provider failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.exception("Food catalog service is unavailable.")
        raise HTTPException(
            status_code=503,
            detail="Food catalog service is temporarily unavailable.",
        ) from exc
    except Exception as exc:
        logger.exception("Food image analysis failed.")
        raise HTTPException(
            status_code=500,
            detail="Food image analysis failed.",
        ) from exc


@router.post(
    "/recalculate",
    response_model=FoodAnalysisResponse,
)
async def recalculate_food_nutrition(
    request: FoodAnalysisRecalculateRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> FoodAnalysisResponse:
    """사용자가 확정한 음식명과 중량으로 공식 DB 영양값을 재계산한다."""

    verify_api_key(credentials)

    try:
        async with FoodImageAnalysisService() as service:
            return await service.recalculate(request)
    except RuntimeError as exc:
        logger.exception("Food catalog service is unavailable.")
        raise HTTPException(
            status_code=503,
            detail="Food catalog service is temporarily unavailable.",
        ) from exc
    except Exception as exc:
        logger.exception("Food nutrition recalculation failed.")
        raise HTTPException(
            status_code=500,
            detail="Food nutrition recalculation failed.",
        ) from exc
