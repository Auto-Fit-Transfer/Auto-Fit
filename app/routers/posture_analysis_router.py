import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import get_settings
from app.core.security import security, verify_api_key
from app.schemas.posture_analysis import (
    PostureAnalysisErrorCode,
    PostureAnalysisErrorResponse,
    PostureAnalysisResponse,
    PostureCapabilitiesResponse,
)
from app.services.posture_analysis_service import (
    PostureAnalysisError,
    PostureAnalysisService,
    PostureConfigurationError,
    PostureModelError,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/posture-analysis",
    tags=["posture-analysis"],
)


def _posture_error_response(
    *,
    status_code: int,
    code: PostureAnalysisErrorCode,
    message: str,
    fields: tuple[str, ...] = (),
) -> JSONResponse:
    payload = PostureAnalysisErrorResponse.model_validate(
        {
            "detail": message,
            "error": {
                "code": code,
                "message": message,
                "fields": list(fields),
            },
        }
    )
    return JSONResponse(
        status_code=status_code,
        content=payload.model_dump(mode="json"),
    )


@router.get(
    "/capabilities",
    response_model=PostureCapabilitiesResponse,
)
async def get_posture_analysis_capabilities(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> PostureCapabilitiesResponse:
    """운동 자산 key와 촬영 방향이 고정된 자세 분석 목록을 반환한다."""

    verify_api_key(credentials)
    return PostureAnalysisService(
        settings=get_settings()
    ).get_capabilities()


@router.post(
    "/analyze",
    response_model=PostureAnalysisResponse,
    responses={
        422: {
            "model": PostureAnalysisErrorResponse,
            "description": "자세 분석 입력·영상 품질 오류",
        },
        500: {
            "model": PostureAnalysisErrorResponse,
            "description": "분류되지 않은 자세 분석 서버 오류",
        },
        503: {
            "model": PostureAnalysisErrorResponse,
            "description": "자세 분석 모델·런타임 일시 장애",
        },
    },
)
async def analyze_posture_video(
    video: UploadFile = File(
        description="capabilities 촬영 안내에 맞춘 짧은 전신 운동 영상",
    ),
    posture_analysis_job_id: UUID = Form(),
    exercise_code: str = Form(default="squat"),
    camera_view: str = Form(default="side"),
    exercise_key: str | None = Form(default=None),
    analysis_side: str | None = Form(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> PostureAnalysisResponse | JSONResponse:
    """영상을 저장하지 않고 등록된 운동별 자세 규칙으로 분석한다."""

    verify_api_key(credentials)
    settings = get_settings()
    declared_content_type = video.content_type

    try:
        try:
            video_bytes = await video.read(
                settings.posture_video_max_bytes + 1
            )
        finally:
            await video.close()

        service = PostureAnalysisService(settings=settings)
        return await service.analyze_video(
            posture_analysis_job_id=posture_analysis_job_id,
            exercise_code=exercise_code,
            camera_view=camera_view,
            exercise_key=exercise_key,
            analysis_side=analysis_side,
            video_bytes=video_bytes,
            declared_content_type=declared_content_type,
        )
    except PostureAnalysisError as exc:
        return _posture_error_response(
            status_code=422,
            code=exc.code,
            message=str(exc),
            fields=exc.fields,
        )
    except PostureConfigurationError as exc:
        logger.error("Posture analysis is not configured: %s", exc)
        return _posture_error_response(
            status_code=503,
            code="MODEL_UNAVAILABLE",
            message=(
                "Posture analysis model is temporarily unavailable."
            ),
        )
    except PostureModelError as exc:
        logger.exception("Posture model inference failed.")
        return _posture_error_response(
            status_code=503,
            code="MODEL_UNAVAILABLE",
            message=(
                "Posture analysis model is temporarily unavailable."
            ),
        )
    except Exception:
        logger.exception("Posture analysis failed.")
        return _posture_error_response(
            status_code=500,
            code="INTERNAL_ERROR",
            message="Posture analysis failed.",
        )
