import logging

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from fastapi.security import HTTPAuthorizationCredentials

from app.core.security import security, verify_api_key
from app.schemas.running import (
    GeoCoordinate,
    RunningPlaceSearchResponse,
    RunningCourseDetailResponse,
    RunningCourseRecommendationRequest,
    RunningCourseRecommendationResponse,
    RunningLoopGenerationRequest,
    RunningLoopGenerationResponse,
    RunningRoutePreviewResponse,
    RunningSessionRecommendationRequest,
    RunningSessionRecommendationResponse,
    WalkingRouteRequest,
)
from app.services.kakao_map_service import (
    KakaoMapConfigurationError,
    KakaoMapProviderError,
    KakaoMapService,
)
from app.services.durunubi_course_service import (
    DurunubiConfigurationError,
    DurunubiProviderError,
)
from app.services.running_route_service import (
    build_walking_route_preview,
    generate_running_loop_routes,
    get_running_course_detail,
    recommend_running_courses,
    recommend_running_session,
    RunningCourseNotFoundError,
)
from app.services.public_running_course_service import (
    PublicRunningCourseConfigurationError,
    PublicRunningCourseProviderError,
)


logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/running",
    tags=["running"],
)


@router.get(
    "/places/search",
    response_model=RunningPlaceSearchResponse,
)
async def search_running_places(
    query: str = Query(min_length=1, max_length=100),
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_m: int | None = Query(default=None, ge=0, le=20000),
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> RunningPlaceSearchResponse:
    verify_api_key(credentials)

    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=422,
            detail=(
                "latitude and longitude must be provided together."
            ),
        )

    center = (
        GeoCoordinate(
            latitude=latitude,
            longitude=longitude,
        )
        if latitude is not None and longitude is not None
        else None
    )

    if radius_m is not None and center is None:
        raise HTTPException(
            status_code=422,
            detail="radius_m requires latitude and longitude.",
        )

    try:
        async with KakaoMapService() as kakao_service:
            places = await kakao_service.search_places(
                query=query,
                center=center,
                radius_m=radius_m,
            )

        return RunningPlaceSearchResponse(places=places)
    except KakaoMapConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except KakaoMapProviderError as exc:
        logger.warning("Kakao place search failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/routes/preview",
    response_model=RunningRoutePreviewResponse,
)
async def preview_running_route(
    request: WalkingRouteRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> RunningRoutePreviewResponse:
    verify_api_key(credentials)

    try:
        route = await build_walking_route_preview(request)
        return RunningRoutePreviewResponse(route=route)
    except KakaoMapConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except KakaoMapProviderError as exc:
        logger.warning("Kakao walking route failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/routes/generate-loop",
    response_model=RunningLoopGenerationResponse,
)
async def generate_running_loop(
    request: RunningLoopGenerationRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> RunningLoopGenerationResponse:
    verify_api_key(credentials)

    try:
        return await generate_running_loop_routes(request)
    except KakaoMapConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except KakaoMapProviderError as exc:
        logger.warning("Kakao loop generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/session/recommend",
    response_model=RunningSessionRecommendationResponse,
)
async def recommend_today_running_session(
    request: RunningSessionRecommendationRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> RunningSessionRecommendationResponse:
    """오늘의 러닝 선택값을 강도, 거리와 공식 코스로 변환한다."""

    verify_api_key(credentials)

    try:
        return await recommend_running_session(request)
    except PublicRunningCourseConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PublicRunningCourseProviderError as exc:
        logger.warning("Public running-session lookup failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except KakaoMapConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except KakaoMapProviderError as exc:
        logger.warning("Kakao running-session lookup failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/courses/recommend",
    response_model=RunningCourseRecommendationResponse,
)
async def recommend_official_running_courses(
    request: RunningCourseRecommendationRequest = Depends(),
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> RunningCourseRecommendationResponse:
    verify_api_key(credentials)

    try:
        return await recommend_running_courses(request)
    except PublicRunningCourseConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PublicRunningCourseProviderError as exc:
        logger.warning("Public running-course lookup failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except KakaoMapConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except KakaoMapProviderError as exc:
        logger.warning("Kakao running-course enrichment failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/courses/{course_id}",
    response_model=RunningCourseDetailResponse,
)
async def get_official_running_course(
    course_id: str,
    pace_minutes_per_km: float | None = Query(
        default=None,
        ge=2,
        le=20,
    ),
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> RunningCourseDetailResponse:
    verify_api_key(credentials)

    try:
        course = await get_running_course_detail(
            course_id=course_id,
            pace_minutes_per_km=pace_minutes_per_km,
        )
        return RunningCourseDetailResponse(course=course)
    except RunningCourseNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="Running course was not found.",
        ) from exc
    except PublicRunningCourseConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PublicRunningCourseProviderError as exc:
        logger.warning("Public running-course detail failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except DurunubiConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except DurunubiProviderError as exc:
        logger.warning("Durunubi course detail failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except KakaoMapConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except KakaoMapProviderError as exc:
        logger.warning("Kakao course geocoding failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
