"""Server-to-server exercise-session analysis endpoint."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import verify_api_key
from app.schemas.exercise_session_analysis import (
    ExerciseSessionAnalysisRequest,
    ExerciseSessionAnalysisResponse,
)
from app.services.exercise_session_analysis_service import analyze_exercise_session


logger = logging.getLogger(__name__)
router = APIRouter(tags=["exercise-analysis"])


@router.post("/analyze/exercise-session", response_model=ExerciseSessionAnalysisResponse)
async def analyze_session(
    request: ExerciseSessionAnalysisRequest,
    _: None = Depends(verify_api_key),
) -> ExerciseSessionAnalysisResponse:
    try:
        narrative = await analyze_exercise_session(request)
    except (RuntimeError, TimeoutError):
        logger.warning("Exercise analysis service unavailable")
        raise HTTPException(503, detail="Exercise analysis is temporarily unavailable") from None
    except Exception:
        logger.error("Exercise analysis failed")
        raise HTTPException(500, detail="Exercise analysis failed") from None
    return ExerciseSessionAnalysisResponse(
        ok=True, generator="auto-fit-ai", result=narrative,
    )
