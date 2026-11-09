import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import get_settings
from app.core.security import security, verify_api_key
from app.schemas.posture_analysis import (
    PostureAnalysisResult,
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
    response_model=PostureAnalysisResult,
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
) -> PostureAnalysisResult:
    """영상을 저장하지 않고 등록된 운동별 자세 규칙으로 분석한다."""

    verify_api_key(credentials)
    settings = get_settings()
    declared_content_type = video.content_type

    try:
        video_bytes = await video.read(
            settings.posture_video_max_bytes + 1
        )
    finally:
        await video.close()

    try:
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
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostureConfigurationError as exc:
        logger.error("Posture analysis is not configured: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PostureModelError as exc:
        logger.exception("Posture model inference failed.")
        raise HTTPException(
            status_code=503,
            detail="Posture analysis model is temporarily unavailable.",
        ) from exc
    except Exception as exc:
        logger.exception("Posture analysis failed.")
        raise HTTPException(
            status_code=500,
            detail="Posture analysis failed.",
        ) from exc
