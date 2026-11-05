from __future__ import annotations

from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


RunningDistanceOption = Literal[
    "3km",
    "5km",
    "10km",
    "custom",
]
PaceSource = Literal["user", "default"]
RunningCourseSourceType = Literal[
    "official_metadata",
    "official_gpx",
    "auto_generated",
]
RunningCourseGeometryStatus = Literal[
    "metadata_only",
    "start_geocoded",
    "endpoints_geocoded",
    "verified_polyline",
]
RunningCourseDifficulty = Literal[
    "easy",
    "moderate",
    "hard",
    "unknown",
]
RunningCourseDifficultyBasis = Literal[
    "official",
    "heuristic",
    "unknown",
]
RunningCourseRecommendationStatus = Literal[
    "matched",
    "generation_required",
]
RunningCourseProviderState = Literal[
    "available",
    "disabled",
    "unavailable",
]
RunningLoopGenerationStatus = Literal[
    "matched",
    "best_effort",
    "unavailable",
]
RunningSessionIntensity = Literal[
    "light",
    "moderate",
    "hard",
]
RunningEnvironment = Literal[
    "treadmill",
    "outdoor",
]
RunningDailyCondition = Literal[
    "good",
    "normal",
    "tired",
]
RunningSessionRecommendationStatus = Literal[
    "treadmill_ready",
    "course_candidates",
    "generation_required",
]


class GeoCoordinate(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
    )

    latitude: float = Field(
        ge=-90,
        le=90,
    )
    longitude: float = Field(
        ge=-180,
        le=180,
    )


class RunningDistanceRequest(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
    )

    distance_option: RunningDistanceOption
    custom_distance_km: float | None = Field(
        default=None,
        ge=0.5,
        le=50,
    )

    @model_validator(mode="after")
    def validate_custom_distance(
        self,
    ) -> "RunningDistanceRequest":
        if (
            self.distance_option == "custom"
            and self.custom_distance_km is None
        ):
            raise ValueError(
                "custom_distance_km is required when "
                "distance_option is custom"
            )

        if (
            self.distance_option != "custom"
            and self.custom_distance_km is not None
        ):
            raise ValueError(
                "custom_distance_km is only allowed when "
                "distance_option is custom"
            )

        return self


class RunningCourseRecommendationRequest(
    RunningDistanceRequest
):
    distance_option: RunningDistanceOption = "5km"
    region: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
    )
    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
    )
    pace_minutes_per_km: float | None = Field(
        default=None,
        ge=2,
        le=20,
    )
    desired_difficulty: Literal[
        "easy",
        "moderate",
        "hard",
    ] | None = None
    limit: int = Field(
        default=10,
        ge=1,
        le=20,
    )

    @model_validator(mode="after")
    def validate_location_or_region(
        self,
    ) -> "RunningCourseRecommendationRequest":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError(
                "latitude and longitude must be provided together"
            )

        if self.region is None and self.latitude is None:
            raise ValueError(
                "region or latitude/longitude is required"
            )

        return self

    def current_location(self) -> "GeoCoordinate | None":
        if self.latitude is None or self.longitude is None:
            return None

        return GeoCoordinate(
            latitude=self.latitude,
            longitude=self.longitude,
        )


class RunningSessionRecommendationRequest(BaseModel):
    """Frontend의 러닝 설정을 실행 가능한 거리와 코스로 변환한다."""

    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
    )

    metric_statuses: dict[str, str] = Field(default_factory=dict)
    daily_condition: RunningDailyCondition
    target_minutes: int = Field(
        ge=10,
        le=180,
    )
    intensity: RunningSessionIntensity
    environment: RunningEnvironment
    has_discomfort: bool = False
    discomfort_areas: list[str] = Field(
        default_factory=list,
        max_length=10,
    )
    region: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
    )
    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
    )
    pace_minutes_per_km: float | None = Field(
        default=None,
        ge=2,
        le=20,
    )
    limit: int = Field(
        default=3,
        ge=1,
        le=10,
    )

    @model_validator(mode="after")
    def validate_session_preferences(
        self,
    ) -> "RunningSessionRecommendationRequest":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError(
                "latitude and longitude must be provided together"
            )

        if (
            self.environment == "outdoor"
            and self.region is None
            and self.latitude is None
        ):
            raise ValueError(
                "outdoor running requires region or latitude/longitude"
            )

        if not self.has_discomfort and self.discomfort_areas:
            raise ValueError(
                "discomfort_areas requires has_discomfort=true"
            )

        return self


class RunningPlace(BaseModel):
    place_name: str
    address_name: str | None = None
    road_address_name: str | None = None
    coordinate: GeoCoordinate
    distance_m: int | None = Field(
        default=None,
        ge=0,
    )


class RunningPlaceSearchResponse(BaseModel):
    ok: bool = True
    generator: str = "auto-fit-ai"
    places: list[RunningPlace]


class RunningCourseEndpoint(BaseModel):
    name: str | None = None
    address: str | None = None
    coordinate: GeoCoordinate | None = None


class RunningCourseSource(BaseModel):
    provider: str
    dataset_name: str
    source_type: RunningCourseSourceType
    source_course_id: str | None = None
    reference_date: str | None = None
    license_name: str | None = None


class RunningCourseSummary(BaseModel):
    course_id: str
    name: str
    description: str | None = None
    region: str
    distance_km: float = Field(gt=0)
    distance_to_user_km: float | None = Field(
        default=None,
        ge=0,
    )
    estimated_duration_minutes: float = Field(gt=0)
    pace_minutes_per_km: float = Field(
        ge=2,
        le=20,
    )
    pace_source: PaceSource
    pace_assumed: bool
    difficulty: RunningCourseDifficulty
    difficulty_basis: RunningCourseDifficultyBasis
    is_loop: bool
    start: RunningCourseEndpoint
    end: RunningCourseEndpoint
    waypoints: list[str] = Field(default_factory=list)
    geometry_status: RunningCourseGeometryStatus
    geometry_distance_km: float | None = Field(
        default=None,
        gt=0,
    )
    requires_route_validation: bool
    source: RunningCourseSource


class RunningCourseDetail(RunningCourseSummary):
    source_duration_text: str | None = None
    route_description: str | None = None
    path: list[GeoCoordinate] = Field(default_factory=list)


class RunningCourseDataSourceStatus(BaseModel):
    source_type: RunningCourseSourceType
    state: RunningCourseProviderState
    message: str | None = None


class RunningCourseRecommendationResponse(BaseModel):
    ok: bool = True
    generator: str = "auto-fit-ai"
    status: RunningCourseRecommendationStatus
    resolved_region: str
    target_distance_km: float = Field(gt=0)
    distance_min_km: float = Field(gt=0)
    distance_max_km: float = Field(gt=0)
    courses: list[RunningCourseSummary]
    data_sources: list[RunningCourseDataSourceStatus] = Field(
        default_factory=list
    )
    generation_recommended: bool
    message: str | None = None


class RunningSessionRecommendationResponse(BaseModel):
    ok: bool = True
    generator: str = "auto-fit-ai"
    status: RunningSessionRecommendationStatus
    environment: RunningEnvironment
    daily_condition: RunningDailyCondition
    target_minutes: int = Field(ge=10, le=180)
    requested_intensity: RunningSessionIntensity
    recommended_intensity: RunningSessionIntensity
    intensity_adjusted: bool
    target_distance_km: float = Field(ge=0.5, le=50)
    recommended_pace_minutes_per_km: float = Field(
        ge=2,
        le=20,
    )
    recommended_speed_kmh: float = Field(
        gt=0,
        le=30,
    )
    pace_source: PaceSource
    pace_assumed: bool
    safety_tags: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(
        default_factory=list,
        max_length=5,
    )
    course_recommendation: (
        RunningCourseRecommendationResponse
        | None
    ) = None


class RunningCourseDetailResponse(BaseModel):
    ok: bool = True
    generator: str = "auto-fit-ai"
    course: RunningCourseDetail


class RunningLoopGenerationRequest(RunningDistanceRequest):
    start: GeoCoordinate
    pace_minutes_per_km: float | None = Field(
        default=None,
        ge=2,
        le=20,
    )
    candidate_count: int = Field(
        default=3,
        ge=1,
        le=3,
    )
    seed: int | None = Field(
        default=None,
        ge=0,
        le=2_147_483_647,
    )


class GeneratedRunningLoop(BaseModel):
    course_id: str
    name: str
    target_distance_km: float = Field(gt=0)
    distance_km: float = Field(gt=0)
    distance_error_km: float
    distance_error_percent: float = Field(ge=0)
    within_tolerance: bool
    estimated_duration_minutes: float = Field(gt=0)
    pace_minutes_per_km: float = Field(
        ge=2,
        le=20,
    )
    pace_source: PaceSource
    pace_assumed: bool
    difficulty: RunningCourseDifficulty
    is_loop: bool = True
    start: RunningCourseEndpoint
    end: RunningCourseEndpoint
    waypoints: list[GeoCoordinate] = Field(
        min_length=2,
        max_length=5,
    )
    path: list[GeoCoordinate] = Field(min_length=2)
    provider_duration_seconds: int | None = Field(
        default=None,
        ge=0,
    )
    generation_seed: int = Field(ge=0)
    source: RunningCourseSource


class RunningLoopGenerationResponse(BaseModel):
    ok: bool = True
    generator: str = "auto-fit-ai"
    status: RunningLoopGenerationStatus
    resolved_region: str | None = None
    target_distance_km: float = Field(gt=0)
    distance_min_km: float = Field(gt=0)
    distance_max_km: float = Field(gt=0)
    tolerance_percent: float = Field(gt=0)
    attempts_used: int = Field(ge=0)
    candidates: list[GeneratedRunningLoop]
    message: str | None = None


class WalkingRouteRequest(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
    )

    start: GeoCoordinate
    end: GeoCoordinate
    waypoints: list[GeoCoordinate] = Field(
        default_factory=list,
        max_length=5,
    )
    pace_minutes_per_km: float | None = Field(
        default=None,
        ge=2,
        le=20,
    )


class RunningRoutePreview(BaseModel):
    provider: Literal["kakao"] = "kakao"
    distance_km: float = Field(gt=0)
    estimated_duration_minutes: float = Field(gt=0)
    pace_minutes_per_km: float = Field(
        ge=2,
        le=20,
    )
    pace_source: PaceSource
    pace_assumed: bool
    provider_duration_seconds: int | None = Field(
        default=None,
        ge=0,
    )
    start: GeoCoordinate
    end: GeoCoordinate
    waypoints: list[GeoCoordinate] = Field(
        default_factory=list,
        max_length=5,
    )
    path: list[GeoCoordinate] = Field(
        min_length=2,
    )


class RunningRoutePreviewResponse(RunningRoutePreview):
    """Route preview with the legacy wrapper and Backend flat fields.

    The AI contract originally exposed the preview under ``route``.  The
    authenticated Backend proxy validates and signs ``distance_km`` and
    ``path`` at the response root.  Keep both representations identical so
    existing clients remain compatible while the Backend can consume the
    response without reshaping it.
    """

    ok: bool = True
    generator: str = "auto-fit-ai"
    route: RunningRoutePreview

    @model_validator(mode="before")
    @classmethod
    def mirror_route_fields(
        cls,
        value: object,
    ) -> object:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        route = normalized.get("route")
        if isinstance(route, RunningRoutePreview):
            route_fields = route.model_dump()
        elif isinstance(route, dict):
            route_fields = route
        else:
            return normalized

        for field_name in RunningRoutePreview.model_fields:
            if field_name in route_fields:
                normalized[field_name] = route_fields[field_name]

        return normalized
