from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import secrets
from contextlib import AsyncExitStack
from math import cos, radians, sin

from app.core.config import get_settings
from app.schemas.running import (
    GeoCoordinate,
    GeneratedRunningLoop,
    RunningCourseDetail,
    RunningCourseDataSourceStatus,
    RunningCourseEndpoint,
    RunningCourseRecommendationRequest,
    RunningCourseRecommendationResponse,
    RunningCourseSource,
    RunningCourseSummary,
    RunningLoopGenerationRequest,
    RunningLoopGenerationResponse,
    RunningRoutePreview,
    RunningSessionRecommendationRequest,
    RunningSessionRecommendationResponse,
    WalkingRouteRequest,
)
from app.services.exercise_context_service import (
    build_exercise_safety_tags,
)
from app.services.durunubi_course_service import (
    DURUNUBI_DATASET_NAME,
    DURUNUBI_PROVIDER_NAME,
    DurunubiConfigurationError,
    DurunubiCourseRecord,
    DurunubiCourseService,
    DurunubiGeometry,
    DurunubiProviderError,
)
from app.services.kakao_map_service import (
    KakaoMapProviderError,
    KakaoMapService,
)
from app.services.public_running_course_service import (
    PUBLIC_RUNNING_COURSE_DATASET_NAME,
    PublicRunningCourseRecord,
    PublicRunningCourseService,
)
from app.utils.coordinates import (
    distance_tolerance_bounds_km,
    estimate_running_duration_minutes,
    haversine_distance_km,
    resolve_target_distance_km,
)


class RunningCourseNotFoundError(LookupError):
    """Raised when a requested official course no longer exists."""


logger = logging.getLogger(__name__)
_GEOCODE_CACHE: dict[str, GeoCoordinate | None] = {}
_INTENSITY_PACE_FACTORS = {
    "light": 1.15,
    "moderate": 1.0,
    "hard": 0.90,
}


async def build_walking_route_preview(
    request: WalkingRouteRequest,
) -> RunningRoutePreview:
    settings = get_settings()
    pace = (
        request.pace_minutes_per_km
        if request.pace_minutes_per_km is not None
        else settings.running_default_pace_minutes_per_km
    )
    pace_source = (
        "user"
        if request.pace_minutes_per_km is not None
        else "default"
    )

    async with KakaoMapService() as kakao_service:
        route = await kakao_service.get_walking_route(
            start=request.start,
            end=request.end,
            waypoints=request.waypoints,
        )

    distance_km = round(
        route["distance_m"] / 1000,
        3,
    )

    return RunningRoutePreview(
        distance_km=distance_km,
        estimated_duration_minutes=(
            estimate_running_duration_minutes(
                distance_km=distance_km,
                pace_minutes_per_km=pace,
            )
        ),
        pace_minutes_per_km=pace,
        pace_source=pace_source,
        pace_assumed=(pace_source == "default"),
        provider_duration_seconds=route.get(
            "duration_seconds"
        ),
        start=request.start,
        end=request.end,
        waypoints=request.waypoints,
        path=route["path"],
    )


async def generate_running_loop_routes(
    request: RunningLoopGenerationRequest,
    kakao_service: KakaoMapService | None = None,
) -> RunningLoopGenerationResponse:
    settings = get_settings()
    target_distance_km = resolve_target_distance_km(
        request.distance_option,
        request.custom_distance_km,
    )
    minimum_km, maximum_km = distance_tolerance_bounds_km(
        target_distance_km,
        settings.running_loop_tolerance_ratio,
    )
    pace = (
        request.pace_minutes_per_km
        if request.pace_minutes_per_km is not None
        else settings.running_default_pace_minutes_per_km
    )
    pace_source = (
        "user"
        if request.pace_minutes_per_km is not None
        else "default"
    )
    root_seed = (
        request.seed
        if request.seed is not None
        else secrets.randbelow(2_147_483_648)
    )

    async with AsyncExitStack() as stack:
        active_kakao_service = kakao_service
        if active_kakao_service is None:
            active_kakao_service = await stack.enter_async_context(
                KakaoMapService()
            )

        results = await asyncio.gather(
            *(
                _generate_loop_candidate(
                    candidate_index=index,
                    root_seed=root_seed,
                    start=request.start,
                    target_distance_km=target_distance_km,
                    minimum_km=minimum_km,
                    maximum_km=maximum_km,
                    pace=pace,
                    pace_source=pace_source,
                    attempts_limit=(
                        settings.running_loop_attempts_per_candidate
                    ),
                    kakao_service=active_kakao_service,
                )
                for index in range(request.candidate_count)
            )
        )

        attempts_used = sum(attempts for _, attempts in results)
        successful = [
            candidate
            for candidate, _ in results
            if candidate is not None
        ]
        successful.sort(
            key=lambda candidate: (
                not candidate.within_tolerance,
                candidate.distance_error_percent,
                candidate.course_id,
            )
        )
        successful = _deduplicate_generated_routes(successful)
        matched = [
            candidate
            for candidate in successful
            if candidate.within_tolerance
        ]

        resolved_region: str | None = None
        if successful:
            try:
                resolved_region = (
                    await active_kakao_service.resolve_region_name(
                        request.start
                    )
                )
            except KakaoMapProviderError as exc:
                logger.warning(
                    "Generated loop region lookup failed: %s",
                    exc,
                )

        if matched:
            status = "matched"
            selected = matched[: request.candidate_count]
            message = None
        elif successful:
            status = "best_effort"
            selected = successful[: request.candidate_count]
            message = (
                "No generated route met the requested distance within "
                "the configured tolerance. The closest routes are "
                "returned with their actual distance and error."
            )
        else:
            status = "unavailable"
            selected = []
            message = (
                "No walkable loop route could be generated after the "
                "limited attempts. Choose another start point or try "
                "again with a different seed."
            )

        return RunningLoopGenerationResponse(
            status=status,
            resolved_region=resolved_region,
            target_distance_km=round(target_distance_km, 3),
            distance_min_km=round(minimum_km, 3),
            distance_max_km=round(maximum_km, 3),
            tolerance_percent=round(
                settings.running_loop_tolerance_ratio * 100,
                1,
            ),
            attempts_used=attempts_used,
            candidates=selected,
            message=message,
        )


async def _generate_loop_candidate(
    candidate_index: int,
    root_seed: int,
    start: GeoCoordinate,
    target_distance_km: float,
    minimum_km: float,
    maximum_km: float,
    pace: float,
    pace_source: str,
    attempts_limit: int,
    kakao_service: KakaoMapService,
) -> tuple[GeneratedRunningLoop | None, int]:
    candidate_seed = (
        root_seed + candidate_index * 13_751
    ) % 2_147_483_648
    base_angle_degrees = (
        (candidate_seed % 36_000) / 100
    ) % 360
    distance_scale = 1.0
    best: GeneratedRunningLoop | None = None
    attempts_used = 0

    for attempt_index in range(attempts_limit):
        attempts_used += 1
        angle_degrees = (
            base_angle_degrees
            + (29.0 * attempt_index if best is None else 0.0)
        ) % 360
        waypoints = _build_square_loop_waypoints(
            start=start,
            target_distance_km=target_distance_km,
            angle_degrees=angle_degrees,
            distance_scale=distance_scale,
        )

        try:
            route = await kakao_service.get_walking_route(
                start=start,
                end=start,
                waypoints=waypoints,
            )
        except KakaoMapProviderError as exc:
            logger.warning(
                "Kakao loop candidate %s attempt %s failed: %s",
                candidate_index + 1,
                attempt_index + 1,
                exc,
            )
            continue

        distance_km = round(route["distance_m"] / 1000, 3)
        if distance_km <= 0:
            continue
        within_tolerance = minimum_km <= distance_km <= maximum_km
        distance_error_km = round(
            distance_km - target_distance_km,
            3,
        )
        distance_error_percent = round(
            abs(distance_error_km) / target_distance_km * 100,
            2,
        )
        course_id = _build_generated_course_id(
            candidate_seed=candidate_seed,
            path=route["path"],
        )
        generated = GeneratedRunningLoop(
            course_id=course_id,
            name=(
                f"Auto-Fit {target_distance_km:g}km "
                f"순환 코스 {candidate_index + 1}"
            ),
            target_distance_km=round(target_distance_km, 3),
            distance_km=distance_km,
            distance_error_km=distance_error_km,
            distance_error_percent=distance_error_percent,
            within_tolerance=within_tolerance,
            estimated_duration_minutes=(
                estimate_running_duration_minutes(
                    distance_km=distance_km,
                    pace_minutes_per_km=pace,
                )
            ),
            pace_minutes_per_km=pace,
            pace_source=pace_source,
            pace_assumed=(pace_source == "default"),
            difficulty=_difficulty_from_distance(distance_km),
            start=RunningCourseEndpoint(
                name="출발점",
                coordinate=start,
            ),
            end=RunningCourseEndpoint(
                name="도착점",
                coordinate=start,
            ),
            waypoints=waypoints,
            path=route["path"],
            provider_duration_seconds=route.get(
                "duration_seconds"
            ),
            generation_seed=candidate_seed,
            source=RunningCourseSource(
                provider="Kakao Maps",
                dataset_name="Kakao walking route",
                source_type="auto_generated",
            ),
        )
        if (
            best is None
            or generated.distance_error_percent
            < best.distance_error_percent
        ):
            best = generated

        if within_tolerance:
            break

        correction = target_distance_km / distance_km
        distance_scale = min(
            1.8,
            max(0.55, distance_scale * correction),
        )

    return best, attempts_used


def _build_square_loop_waypoints(
    start: GeoCoordinate,
    target_distance_km: float,
    angle_degrees: float,
    distance_scale: float,
) -> list[GeoCoordinate]:
    latitude_factor = cos(radians(start.latitude))
    if abs(latitude_factor) < 0.01:
        raise ValueError(
            "Loop generation is unavailable near the poles."
        )

    side_m = target_distance_km * 1000 * distance_scale / 4
    angle = radians(angle_degrees)
    vertices = (
        (side_m, 0.0),
        (side_m, side_m),
        (0.0, side_m),
    )
    waypoints: list[GeoCoordinate] = []
    for east_m, north_m in vertices:
        rotated_east = east_m * cos(angle) - north_m * sin(angle)
        rotated_north = east_m * sin(angle) + north_m * cos(angle)
        waypoints.append(
            GeoCoordinate(
                latitude=(
                    start.latitude + rotated_north / 111_320
                ),
                longitude=(
                    start.longitude
                    + rotated_east / (111_320 * latitude_factor)
                ),
            )
        )

    return waypoints


def _build_generated_course_id(
    candidate_seed: int,
    path: list[GeoCoordinate],
) -> str:
    path_text = "|".join(
        f"{point.latitude:.5f},{point.longitude:.5f}"
        for point in path
    )
    digest = hashlib.sha256(
        f"{candidate_seed}|{path_text}".encode("utf-8")
    ).hexdigest()[:16]
    return f"generated-{digest}"


def _deduplicate_generated_routes(
    candidates: list[GeneratedRunningLoop],
) -> list[GeneratedRunningLoop]:
    selected: list[GeneratedRunningLoop] = []
    selected_cells: list[set[tuple[float, float]]] = []

    for candidate in candidates:
        cells = {
            (
                round(point.latitude, 3),
                round(point.longitude, 3),
            )
            for point in candidate.path
        }
        is_duplicate = any(
            _route_cell_overlap(cells, existing) >= 0.75
            for existing in selected_cells
        )
        if not is_duplicate:
            selected.append(candidate)
            selected_cells.append(cells)

    return selected


def _route_cell_overlap(
    first: set[tuple[float, float]],
    second: set[tuple[float, float]],
) -> float:
    smaller_size = min(len(first), len(second))
    if smaller_size == 0:
        return 0.0
    return len(first & second) / smaller_size


async def recommend_running_courses(
    request: RunningCourseRecommendationRequest,
    public_course_service: PublicRunningCourseService | None = None,
    kakao_service: KakaoMapService | None = None,
    durunubi_service: DurunubiCourseService | None = None,
    pace_source_override: str | None = None,
) -> RunningCourseRecommendationResponse:
    settings = get_settings()
    current_location = request.current_location()

    if pace_source_override not in {None, "user", "default"}:
        raise ValueError(
            "pace_source_override must be user or default"
        )

    async with AsyncExitStack() as stack:
        public_service = public_course_service
        if public_service is None:
            public_service = await stack.enter_async_context(
                PublicRunningCourseService()
            )

        durunubi_enabled = (
            durunubi_service is not None
            or settings.running_durunubi_enabled
        )
        active_durunubi_service = durunubi_service
        if durunubi_enabled and active_durunubi_service is None:
            active_durunubi_service = await stack.enter_async_context(
                DurunubiCourseService()
            )

        needs_kakao = current_location is not None
        active_kakao_service = kakao_service
        if needs_kakao and active_kakao_service is None:
            active_kakao_service = await stack.enter_async_context(
                KakaoMapService()
            )

        resolved_region = request.region
        if resolved_region is None:
            if current_location is None or active_kakao_service is None:
                raise ValueError(
                    "A region or current location is required."
                )
            resolved_region = (
                await active_kakao_service.resolve_region_name(
                    current_location
                )
            )

        if not resolved_region:
            raise ValueError(
                "The current location could not be resolved to a region."
            )

        target_distance_km = resolve_target_distance_km(
            request.distance_option,
            request.custom_distance_km,
        )
        minimum_km, maximum_km = distance_tolerance_bounds_km(
            target_distance_km
        )
        all_courses = await public_service.fetch_all_courses()
        public_candidates = [
            course
            for course in all_courses
            if minimum_km <= course.distance_km <= maximum_km
            and _matches_region(course, resolved_region)
        ]
        public_candidates.sort(
            key=lambda course: (
                abs(course.distance_km - target_distance_km),
                not course.is_loop,
                course.name,
            )
        )

        coordinates: dict[str, GeoCoordinate | None] = {}
        if (
            current_location is not None
            and active_kakao_service is not None
            and public_candidates
        ):
            coordinates = await _geocode_candidate_endpoints(
                candidates=public_candidates[
                    : settings.running_course_geocode_limit
                ],
                kakao_service=active_kakao_service,
            )

        pace = (
            request.pace_minutes_per_km
            if request.pace_minutes_per_km is not None
            else settings.running_default_pace_minutes_per_km
        )
        pace_source = (
            pace_source_override
            or (
                "user"
                if request.pace_minutes_per_km is not None
                else "default"
            )
        )
        public_summaries = [
            _build_course_summary(
                record=course,
                coordinates=coordinates,
                current_location=current_location,
                pace=pace,
                pace_source=pace_source,
            )
            for course in public_candidates
        ]

        data_sources = [
            RunningCourseDataSourceStatus(
                source_type="official_metadata",
                state="available",
                message=(
                    f"{len(public_candidates)} matching course(s) from "
                    "the nationwide official metadata catalog."
                ),
            )
        ]
        gpx_summaries: list[RunningCourseSummary] = []
        if not durunubi_enabled:
            data_sources.append(
                RunningCourseDataSourceStatus(
                    source_type="official_gpx",
                    state="disabled",
                    message=(
                        "Durunubi GPX enrichment is disabled. "
                        "Official metadata recommendations remain available."
                    ),
                )
            )
        elif active_durunubi_service is not None:
            try:
                durunubi_courses = (
                    await active_durunubi_service.fetch_all_courses()
                )
                durunubi_candidates = [
                    course
                    for course in durunubi_courses
                    if minimum_km <= course.distance_km <= maximum_km
                    and _matches_durunubi_region(
                        course,
                        resolved_region,
                    )
                ]
                durunubi_candidates.sort(
                    key=lambda course: (
                        abs(
                            course.distance_km
                            - target_distance_km
                        ),
                        not course.is_loop,
                        course.name,
                    )
                )
                (
                    gpx_summaries,
                    geometry_failures,
                ) = await _build_durunubi_summaries(
                    candidates=durunubi_candidates[
                        : settings.running_durunubi_geometry_limit
                    ],
                    service=active_durunubi_service,
                    current_location=current_location,
                    pace=pace,
                    pace_source=pace_source,
                    minimum_km=minimum_km,
                    maximum_km=maximum_km,
                )
                message = (
                    f"{len(gpx_summaries)} matching course(s) with "
                    "validated GPX geometry."
                )
                if geometry_failures:
                    message += (
                        f" {geometry_failures} GPX file(s) could not "
                        "be validated and were excluded."
                    )
                data_sources.append(
                    RunningCourseDataSourceStatus(
                        source_type="official_gpx",
                        state="available",
                        message=message,
                    )
                )
            except (
                DurunubiConfigurationError,
                DurunubiProviderError,
            ) as exc:
                logger.warning(
                    "Durunubi enrichment unavailable; using official "
                    "metadata fallback: %s",
                    exc,
                )
                data_sources.append(
                    RunningCourseDataSourceStatus(
                        source_type="official_gpx",
                        state="unavailable",
                        message=(
                            "Durunubi GPX enrichment is temporarily "
                            "unavailable. Official metadata fallback "
                            "was used."
                        ),
                    )
                )

        summaries = [*gpx_summaries, *public_summaries]
        summaries.sort(
            key=lambda course: _recommendation_sort_key(
                course=course,
                target_distance_km=target_distance_km,
                current_location=current_location,
                desired_difficulty=request.desired_difficulty,
            )
        )
        selected = summaries[: request.limit]
        matched = bool(selected)

        return RunningCourseRecommendationResponse(
            status=("matched" if matched else "generation_required"),
            resolved_region=resolved_region,
            target_distance_km=round(target_distance_km, 3),
            distance_min_km=round(minimum_km, 3),
            distance_max_km=round(maximum_km, 3),
            courses=selected,
            data_sources=data_sources,
            generation_recommended=not matched,
            message=(
                None
                if matched
                else (
                    "No official course matched the requested region and "
                    "distance range. Generate a route from the user's "
                    "selected start point instead."
                )
            ),
        )


async def recommend_running_session(
    request: RunningSessionRecommendationRequest,
    public_course_service: PublicRunningCourseService | None = None,
    kakao_service: KakaoMapService | None = None,
    durunubi_service: DurunubiCourseService | None = None,
) -> RunningSessionRecommendationResponse:
    """Convert today's running selections into pace, distance and course."""

    settings = get_settings()
    safety_tags = build_exercise_safety_tags(
        request.metric_statuses
    )

    recommended_intensity = request.intensity
    if request.daily_condition == "tired":
        safety_tags.append("recovery_priority")
        recommended_intensity = "light"

    if request.has_discomfort:
        safety_tags.append("discomfort_reported")
        recommended_intensity = "light"

    if (
        "blood_pressure_caution" in safety_tags
        and recommended_intensity == "hard"
    ):
        recommended_intensity = "moderate"

    safety_tags = sorted(set(safety_tags))
    base_pace = (
        request.pace_minutes_per_km
        if request.pace_minutes_per_km is not None
        else settings.running_default_pace_minutes_per_km
    )
    pace_source = (
        "user"
        if request.pace_minutes_per_km is not None
        else "default"
    )
    planned_pace = round(
        min(
            20.0,
            max(
                2.0,
                base_pace
                * _INTENSITY_PACE_FACTORS[recommended_intensity],
            ),
        ),
        2,
    )
    target_distance_km = round(
        request.target_minutes / planned_pace,
        3,
    )

    if not 0.5 <= target_distance_km <= 50:
        raise ValueError(
            "The selected duration and pace must produce a target "
            "distance between 0.5km and 50km."
        )

    cautions: list[str] = []
    if pace_source == "default":
        cautions.append(
            "저장된 러닝 페이스가 없어 기본 페이스를 가정했습니다. "
            "사용자가 실제 페이스를 수정할 수 있게 표시하세요."
        )
    if request.daily_condition == "tired":
        cautions.append(
            "피곤한 날의 설정을 반영해 가벼운 강도로 조정했습니다."
        )
    if request.has_discomfort:
        areas = ", ".join(request.discomfort_areas)
        area_text = f" ({areas})" if areas else ""
        cautions.append(
            "불편 부위"
            f"{area_text}에 통증이 생기거나 심해지면 즉시 중단하세요."
        )
    if "blood_pressure_caution" in safety_tags:
        cautions.append(
            "혈압 관련 안전 상태를 반영해 과도한 고강도 달리기를 "
            "피하고 몸 상태를 확인하세요."
        )

    course_recommendation = None
    if request.environment == "treadmill":
        status = "treadmill_ready"
    else:
        course_recommendation = await recommend_running_courses(
            request=RunningCourseRecommendationRequest(
                distance_option="custom",
                custom_distance_km=target_distance_km,
                region=request.region,
                latitude=request.latitude,
                longitude=request.longitude,
                pace_minutes_per_km=planned_pace,
                desired_difficulty={
                    "light": "easy",
                    "moderate": "moderate",
                    "hard": "hard",
                }[recommended_intensity],
                limit=request.limit,
            ),
            public_course_service=public_course_service,
            kakao_service=kakao_service,
            durunubi_service=durunubi_service,
            pace_source_override=pace_source,
        )
        status = (
            "course_candidates"
            if course_recommendation.status == "matched"
            else "generation_required"
        )

    return RunningSessionRecommendationResponse(
        status=status,
        environment=request.environment,
        daily_condition=request.daily_condition,
        target_minutes=request.target_minutes,
        requested_intensity=request.intensity,
        recommended_intensity=recommended_intensity,
        intensity_adjusted=(recommended_intensity != request.intensity),
        target_distance_km=target_distance_km,
        recommended_pace_minutes_per_km=planned_pace,
        recommended_speed_kmh=round(60 / planned_pace, 1),
        pace_source=pace_source,
        pace_assumed=(pace_source == "default"),
        safety_tags=safety_tags,
        cautions=cautions[:5],
        course_recommendation=course_recommendation,
    )


async def get_running_course_detail(
    course_id: str,
    pace_minutes_per_km: float | None = None,
    public_course_service: PublicRunningCourseService | None = None,
    kakao_service: KakaoMapService | None = None,
    durunubi_service: DurunubiCourseService | None = None,
) -> RunningCourseDetail:
    settings = get_settings()

    async with AsyncExitStack() as stack:
        if course_id.startswith("durunubi-"):
            durunubi_enabled = (
                durunubi_service is not None
                or settings.running_durunubi_enabled
            )
            if not durunubi_enabled:
                raise DurunubiConfigurationError(
                    "Durunubi GPX provider is disabled."
                )

            active_durunubi_service = durunubi_service
            if active_durunubi_service is None:
                active_durunubi_service = (
                    await stack.enter_async_context(
                        DurunubiCourseService()
                    )
                )

            durunubi_record = (
                await active_durunubi_service.get_course(course_id)
            )
            if durunubi_record is None:
                raise RunningCourseNotFoundError(course_id)

            geometry = await active_durunubi_service.get_geometry(
                durunubi_record
            )
            pace = (
                pace_minutes_per_km
                if pace_minutes_per_km is not None
                else settings.running_default_pace_minutes_per_km
            )
            pace_source = (
                "user"
                if pace_minutes_per_km is not None
                else "default"
            )
            summary = _build_durunubi_summary(
                record=durunubi_record,
                geometry=geometry,
                current_location=None,
                pace=pace,
                pace_source=pace_source,
            )
            return RunningCourseDetail(
                **summary.model_dump(),
                source_duration_text=(
                    _format_duration_minutes(
                        durunubi_record.duration_minutes
                    )
                ),
                route_description=(
                    durunubi_record.description
                    or durunubi_record.summary
                ),
                path=list(geometry.path),
            )

        public_service = public_course_service
        if public_service is None:
            public_service = await stack.enter_async_context(
                PublicRunningCourseService()
            )

        record = await public_service.get_course(course_id)
        if record is None:
            raise RunningCourseNotFoundError(course_id)

        active_kakao_service = kakao_service
        if (
            active_kakao_service is None
            and settings.kakao_rest_api_key
        ):
            active_kakao_service = await stack.enter_async_context(
                KakaoMapService()
            )

        coordinates: dict[str, GeoCoordinate | None] = {}
        if active_kakao_service is not None:
            coordinates = await _geocode_candidate_endpoints(
                candidates=[record],
                kakao_service=active_kakao_service,
            )

        pace = (
            pace_minutes_per_km
            if pace_minutes_per_km is not None
            else settings.running_default_pace_minutes_per_km
        )
        pace_source = (
            "user" if pace_minutes_per_km is not None else "default"
        )
        summary = _build_course_summary(
            record=record,
            coordinates=coordinates,
            current_location=None,
            pace=pace,
            pace_source=pace_source,
        )

        return RunningCourseDetail(
            **summary.model_dump(),
            source_duration_text=record.source_duration_text,
            route_description=record.route_description,
            path=[],
        )


def _matches_region(
    course: PublicRunningCourseRecord,
    requested_region: str,
) -> bool:
    return _matches_region_text(
        course.region_search_text(),
        requested_region,
    )


def _matches_durunubi_region(
    course: DurunubiCourseRecord,
    requested_region: str,
) -> bool:
    return _matches_region_text(course.region, requested_region)


def _matches_region_text(
    search_text: str,
    requested_region: str,
) -> bool:
    haystack = _normalize_region_text(search_text)
    requested = _normalize_region_text(requested_region)

    if not requested:
        return True
    if requested in haystack:
        return True

    tokens = [
        _normalize_region_text(token)
        for token in re.findall(
            r"[0-9A-Za-z가-힣]+",
            requested_region,
        )
        if len(_normalize_region_text(token)) >= 2
    ]
    if len(tokens) > 1 and tokens[0].endswith(
        ("도", "특별시", "광역시", "특별자치시")
    ):
        tokens = tokens[1:]

    return any(token in haystack for token in reversed(tokens))


async def _build_durunubi_summaries(
    candidates: list[DurunubiCourseRecord],
    service: DurunubiCourseService,
    current_location: GeoCoordinate | None,
    pace: float,
    pace_source: str,
    minimum_km: float,
    maximum_km: float,
) -> tuple[list[RunningCourseSummary], int]:
    semaphore = asyncio.Semaphore(5)

    async def build(
        record: DurunubiCourseRecord,
    ) -> RunningCourseSummary | None:
        try:
            async with semaphore:
                geometry = await service.get_geometry(record)
        except DurunubiProviderError as exc:
            logger.warning(
                "Durunubi GPX validation failed for course %s: %s",
                record.course_id,
                exc,
            )
            return None

        if not minimum_km <= geometry.distance_km <= maximum_km:
            return None

        return _build_durunubi_summary(
            record=record,
            geometry=geometry,
            current_location=current_location,
            pace=pace,
            pace_source=pace_source,
        )

    results = await asyncio.gather(
        *(build(record) for record in candidates)
    )
    summaries = [result for result in results if result is not None]
    return summaries, len(results) - len(summaries)


def _build_durunubi_summary(
    record: DurunubiCourseRecord,
    geometry: DurunubiGeometry,
    current_location: GeoCoordinate | None,
    pace: float,
    pace_source: str,
) -> RunningCourseSummary:
    start_coordinate = geometry.path[0]
    end_coordinate = geometry.path[-1]
    distance_to_user_km = (
        round(
            haversine_distance_km(
                current_location,
                start_coordinate,
            ),
            3,
        )
        if current_location is not None
        else None
    )
    waypoints = (
        [record.tourism_points]
        if record.tourism_points
        else []
    )

    return RunningCourseSummary(
        course_id=f"durunubi-{record.course_id}",
        name=record.name,
        description=record.summary or record.description,
        region=record.region,
        distance_km=geometry.distance_km,
        geometry_distance_km=geometry.distance_km,
        distance_to_user_km=distance_to_user_km,
        estimated_duration_minutes=estimate_running_duration_minutes(
            distance_km=geometry.distance_km,
            pace_minutes_per_km=pace,
        ),
        pace_minutes_per_km=pace,
        pace_source=pace_source,
        pace_assumed=(pace_source == "default"),
        difficulty=record.difficulty,
        difficulty_basis="official",
        is_loop=record.is_loop,
        start=RunningCourseEndpoint(
            name=f"{record.name} 출발점",
            address=record.region,
            coordinate=start_coordinate,
        ),
        end=RunningCourseEndpoint(
            name=f"{record.name} 도착점",
            address=record.region,
            coordinate=end_coordinate,
        ),
        waypoints=waypoints,
        geometry_status="verified_polyline",
        requires_route_validation=False,
        source=RunningCourseSource(
            provider=DURUNUBI_PROVIDER_NAME,
            dataset_name=DURUNUBI_DATASET_NAME,
            source_type="official_gpx",
            source_course_id=record.course_id,
            reference_date=record.modified_at,
            license_name="이용허락범위 제한 없음",
        ),
    )


def _format_duration_minutes(
    duration_minutes: float | None,
) -> str | None:
    if duration_minutes is None:
        return None
    rounded = round(duration_minutes)
    hours, minutes = divmod(rounded, 60)
    if hours and minutes:
        return f"{hours}시간 {minutes}분"
    if hours:
        return f"{hours}시간"
    return f"{minutes}분"


def _normalize_region_text(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()


async def _geocode_candidate_endpoints(
    candidates: list[PublicRunningCourseRecord],
    kakao_service: KakaoMapService,
) -> dict[str, GeoCoordinate | None]:
    addresses = list(
        dict.fromkeys(
            address
            for course in candidates
            for address in (
                course.start_address,
                course.end_address,
            )
            if address
        )
    )
    semaphore = asyncio.Semaphore(5)

    async def geocode(address: str) -> tuple[str, GeoCoordinate | None]:
        if address in _GEOCODE_CACHE:
            return address, _GEOCODE_CACHE[address]

        async with semaphore:
            coordinate = await kakao_service.geocode_address(address)
        _GEOCODE_CACHE[address] = coordinate
        return address, coordinate

    results = await asyncio.gather(
        *(geocode(address) for address in addresses)
    )
    return dict(results)


def _build_course_summary(
    record: PublicRunningCourseRecord,
    coordinates: dict[str, GeoCoordinate | None],
    current_location: GeoCoordinate | None,
    pace: float,
    pace_source: str,
) -> RunningCourseSummary:
    start_coordinate = (
        coordinates.get(record.start_address)
        if record.start_address
        else None
    )
    end_coordinate = (
        coordinates.get(record.end_address)
        if record.end_address
        else None
    )
    distance_to_user_km = (
        round(
            haversine_distance_km(
                current_location,
                start_coordinate,
            ),
            3,
        )
        if current_location is not None
        and start_coordinate is not None
        else None
    )
    geometry_status = "metadata_only"
    if start_coordinate is not None and end_coordinate is not None:
        geometry_status = "endpoints_geocoded"
    elif start_coordinate is not None:
        geometry_status = "start_geocoded"

    difficulty = _estimate_course_difficulty(record)

    return RunningCourseSummary(
        course_id=record.course_id,
        name=record.name,
        description=record.description,
        region=record.region,
        distance_km=record.distance_km,
        distance_to_user_km=distance_to_user_km,
        estimated_duration_minutes=estimate_running_duration_minutes(
            distance_km=record.distance_km,
            pace_minutes_per_km=pace,
        ),
        pace_minutes_per_km=pace,
        pace_source=pace_source,
        pace_assumed=(pace_source == "default"),
        difficulty=difficulty,
        difficulty_basis="heuristic",
        is_loop=record.is_loop,
        start=RunningCourseEndpoint(
            name=record.start_name,
            address=record.start_address,
            coordinate=start_coordinate,
        ),
        end=RunningCourseEndpoint(
            name=record.end_name,
            address=record.end_address,
            coordinate=end_coordinate,
        ),
        waypoints=list(record.waypoints),
        geometry_status=geometry_status,
        requires_route_validation=True,
        source=RunningCourseSource(
            provider=record.institution_name,
            dataset_name=PUBLIC_RUNNING_COURSE_DATASET_NAME,
            source_type="official_metadata",
            reference_date=record.reference_date,
            license_name=None,
        ),
    )


def _estimate_course_difficulty(
    record: PublicRunningCourseRecord,
) -> str:
    difficulty = _difficulty_from_distance(record.distance_km)

    terrain_text = " ".join(
        value
        for value in (
            record.name,
            record.description,
            record.route_description,
        )
        if value
    )
    steep_keywords = (
        "정상",
        "등산",
        "산성",
        "고개",
        "봉우리",
    )

    if any(keyword in terrain_text for keyword in steep_keywords):
        if difficulty == "easy":
            return "moderate"
        return "hard"

    return difficulty


def _difficulty_from_distance(distance_km: float) -> str:
    if distance_km <= 5.5:
        return "easy"
    if distance_km <= 10.5:
        return "moderate"
    return "hard"


def _recommendation_sort_key(
    course: RunningCourseSummary,
    target_distance_km: float,
    current_location: GeoCoordinate | None,
    desired_difficulty: str | None = None,
) -> tuple[float | int | str, ...]:
    distance_error = abs(course.distance_km - target_distance_km)
    difficulty_order = {
        "easy": 0,
        "moderate": 1,
        "hard": 2,
    }
    difficulty_penalty = (
        abs(
            difficulty_order[course.difficulty]
            - difficulty_order[desired_difficulty]
        )
        if desired_difficulty is not None
        and course.difficulty in difficulty_order
        else (3 if desired_difficulty is not None else 0)
    )
    source_priority = (
        0 if course.source.source_type == "official_gpx" else 1
    )

    if current_location is not None:
        return (
            course.distance_to_user_km is None,
            course.distance_to_user_km or 0.0,
            distance_error,
            difficulty_penalty,
            source_priority,
            not course.is_loop,
            course.name,
        )

    return (
        distance_error,
        difficulty_penalty,
        source_priority,
        not course.is_loop,
        course.name,
    )
