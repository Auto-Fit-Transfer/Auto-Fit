from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

from app.schemas.running import GeoCoordinate


EARTH_RADIUS_KM = 6371.0088
DISTANCE_PRESETS_KM = {
    "3km": 3.0,
    "5km": 5.0,
    "10km": 10.0,
}


def coordinate_to_kakao_xy(
    coordinate: GeoCoordinate,
) -> tuple[float, float]:
    """Convert latitude/longitude to Kakao's x/y order."""

    return (
        coordinate.longitude,
        coordinate.latitude,
    )


def kakao_xy_to_coordinate(
    x: float | str,
    y: float | str,
) -> GeoCoordinate:
    """Convert Kakao/GeoJSON x/y order to an API coordinate."""

    return GeoCoordinate(
        latitude=float(y),
        longitude=float(x),
    )


def haversine_distance_km(
    first: GeoCoordinate,
    second: GeoCoordinate,
) -> float:
    """Return the great-circle distance between two WGS84 points."""

    latitude_delta = radians(
        second.latitude - first.latitude
    )
    longitude_delta = radians(
        second.longitude - first.longitude
    )
    first_latitude = radians(first.latitude)
    second_latitude = radians(second.latitude)

    haversine = (
        sin(latitude_delta / 2) ** 2
        + cos(first_latitude)
        * cos(second_latitude)
        * sin(longitude_delta / 2) ** 2
    )

    return 2 * EARTH_RADIUS_KM * asin(
        sqrt(haversine)
    )


def resolve_target_distance_km(
    distance_option: str,
    custom_distance_km: float | None,
) -> float:
    """Resolve a preset or custom running distance."""

    if distance_option in DISTANCE_PRESETS_KM:
        return DISTANCE_PRESETS_KM[distance_option]

    if distance_option == "custom" and custom_distance_km is not None:
        return float(custom_distance_km)

    raise ValueError(
        "custom_distance_km is required for a custom distance"
    )


def distance_tolerance_bounds_km(
    target_distance_km: float,
    tolerance_ratio: float = 0.10,
) -> tuple[float, float]:
    """Return inclusive lower/upper bounds for a target distance."""

    if target_distance_km <= 0:
        raise ValueError("target_distance_km must be positive")

    if not 0 <= tolerance_ratio < 1:
        raise ValueError(
            "tolerance_ratio must be between 0 and 1"
        )

    return (
        target_distance_km * (1 - tolerance_ratio),
        target_distance_km * (1 + tolerance_ratio),
    )


def estimate_running_duration_minutes(
    distance_km: float,
    pace_minutes_per_km: float,
) -> float:
    """Estimate duration from actual route distance and running pace."""

    if distance_km <= 0:
        raise ValueError("distance_km must be positive")

    if pace_minutes_per_km <= 0:
        raise ValueError(
            "pace_minutes_per_km must be positive"
        )

    return round(
        distance_km * pace_minutes_per_km,
        1,
    )
