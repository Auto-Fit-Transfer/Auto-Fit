import logging

from fastapi import (
    APIRouter,
    Depends,
)

from fastapi.responses import (
    JSONResponse,
)

from fastapi.security import (
    HTTPAuthorizationCredentials,
)

from app.core.security import (
    security,
    verify_api_key,
)

from app.schemas.health_analysis import (
    DietRefreshRequest,
    DietRefreshResponse,
    HealthAnalysisRequest,
    HealthAnalysisResponse,
)

from app.services.diet_refresh_service import (
    generate_diet_refresh,
)

from app.services.health_analysis_service import (
    generate_health_analysis,
)

from app.services.health_analysis_validation_service import (
    HealthAnalysisValidationError,
)


logger = logging.getLogger(
    __name__
)


router = APIRouter(
    tags=[
        "health-analysis",
    ]
)


# =========================================================
# Full Health Analysis
# =========================================================


@router.post(
    "/health-analysis",
    response_model=HealthAnalysisResponse,
    response_model_by_alias=True,
)
async def health_analysis(
    request: HealthAnalysisRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
):
    """
    Backend -> AI Server 종합 건강 분석 API.

    처리 범위:
    - 건강검진 데이터
    - 체성분 데이터
    - 사용자 목표
    - 냉장고 재료
    - 알레르기 정보
    - 유통기한 임박 재료
    - Rule Engine 건강 상태 분류
    - RAG 기반 근거 검색
    - LLM 기반 종합 분석
    - 냉장고 맞춤 식단 제안

    AI Server는 사용자 DB에 직접 접근하지 않는다.
    """

    # -----------------------------------------------------
    # Server-to-Server 인증
    # -----------------------------------------------------

    verify_api_key(
        credentials
    )

    try:
        return await generate_health_analysis(
            request
        )

    # -----------------------------------------------------
    # 입력 검증 오류
    # -----------------------------------------------------

    except HealthAnalysisValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": exc.message,
                    "fields": exc.fields,
                }
            },
        )

    # -----------------------------------------------------
    # 외부 AI / 내부 서비스 일시 오류
    # -----------------------------------------------------

    except RuntimeError:
        logger.exception(
            "Health analysis service unavailable."
        )

        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": (
                        "Health analysis service "
                        "is temporarily unavailable."
                    ),
                    "fields": [],
                }
            },
        )

    # -----------------------------------------------------
    # 기타 서버 오류
    # -----------------------------------------------------

    except Exception:
        # 건강정보 원문이나 사용자 입력은
        # 로그에 직접 기록하지 않는다.
        logger.exception(
            "Health analysis failed."
        )

        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": (
                        "Health analysis failed."
                    ),
                    "fields": [],
                }
            },
        )


# =========================================================
# Diet Personalization Refresh
# =========================================================


@router.post(
    "/health-analysis/diet-refresh",
    response_model=DietRefreshResponse,
    response_model_by_alias=True,
)
async def refresh_diet_personalization(
    request: DietRefreshRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
):
    """
    냉장고 정보 변경 후 식단 개인화 영역만 다시 생성한다.

    기존 건강 분석의 다음 항목은 다시 생성하지 않는다.

    - headline
    - summary
    - goal
    - strategy
    - key_metric_keys
    - recommendation_reasons
    - final_direction

    최신 냉장고 정보를 기준으로 다음 항목만 반환한다.

    - diet_suggestion
    - refrigerator_context
    """

    # -----------------------------------------------------
    # Server-to-Server 인증
    # -----------------------------------------------------

    verify_api_key(
        credentials
    )

    try:
        return await generate_diet_refresh(
            request
        )

    # -----------------------------------------------------
    # 요청값 검증 오류
    # -----------------------------------------------------

    except ValueError:
        logger.exception(
            "Diet refresh validation failed."
        )

        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": (
                        "Diet refresh input "
                        "validation failed."
                    ),
                    "fields": [],
                }
            },
        )

    # -----------------------------------------------------
    # 외부 AI / 내부 서비스 일시 오류
    # -----------------------------------------------------

    except RuntimeError:
        logger.exception(
            "Diet refresh service unavailable."
        )

        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": (
                        "Diet refresh service "
                        "is temporarily unavailable."
                    ),
                    "fields": [],
                }
            },
        )

    # -----------------------------------------------------
    # 기타 서버 오류
    # -----------------------------------------------------

    except Exception:
        logger.exception(
            "Diet refresh failed."
        )

        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": (
                        "Diet refresh failed."
                    ),
                    "fields": [],
                }
            },
        )