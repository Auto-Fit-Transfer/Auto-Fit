"""Build the minimal, confirmed profile accepted by the AI diet contract."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo


KST = ZoneInfo("Asia/Seoul")


def completed_age_years(birth_date: date, *, today: date | None = None) -> int:
    """Return the completed age using the Korean calendar date."""
    current_date = today or datetime.now(KST).date()
    return current_date.year - birth_date.year - (
        (current_date.month, current_date.day) < (birth_date.month, birth_date.day)
    )


def is_adult_birth_date(value: str | date | None, *, today: date | None = None) -> bool:
    """Missing or invalid birthdays cannot authorize adult diet generation."""
    try:
        birth_date = value if isinstance(value, date) else date.fromisoformat(value)
    except (TypeError, ValueError):
        return False
    return completed_age_years(birth_date, today=today) >= 19


def is_supported_diet_birth_date(value: str | date | None, *, today: date | None = None) -> bool:
    """The current KDRI diet contract supports completed ages 19 through 120."""
    try:
        birth_date = value if isinstance(value, date) else date.fromisoformat(value)
    except (TypeError, ValueError):
        return False
    return 19 <= completed_age_years(birth_date, today=today) <= 120


def _number(field: str, *sources: dict[str, Any] | None) -> float:
    for source in sources:
        value = source.get(field) if source else None
        if value is None:
            continue
        try:
            number = Decimal(str(value))
        except InvalidOperation as exc:
            raise ValueError(f"Invalid {field}") from exc
        if not number.is_finite():
            raise ValueError(f"Invalid {field}")
        return float(number)
    raise ValueError(f"Missing {field}")


def build_nutrition_profile(
    profile: dict[str, Any],
    checkup: dict[str, Any] | None,
    body_composition: dict[str, Any] | None,
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Use confirmed measurements; never send uploaded files or OCR text."""
    current_date = today or datetime.now(KST).date()
    raw_birth_date = profile.get("birth_date")
    try:
        birth_date = (
            raw_birth_date if isinstance(raw_birth_date, date)
            else date.fromisoformat(raw_birth_date)
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("Missing or invalid birth_date") from exc
    age_years = completed_age_years(birth_date, today=current_date)
    if age_years < 19 or age_years > 120:
        raise ValueError("Age is outside the supported diet range")

    sex = profile.get("gender")
    if sex not in ("male", "female"):
        raise ValueError("Sex is outside the supported diet values")

    height_cm = _number("height_cm", body_composition, checkup, profile)
    weight_kg = _number("weight_kg", body_composition, checkup, profile)
    if not 80 <= height_cm <= 250 or not 20 <= weight_kg <= 400:
        raise ValueError("Measurements are outside the supported diet range")

    has_body = body_composition is not None
    has_checkup = checkup is not None
    return {
        "profile_mode": "health_records" if has_body and has_checkup else "basic_profile",
        "age_years": age_years,
        "sex": sex,
        "height_cm": height_cm,
        "weight_kg": weight_kg,
        "data_sources": {
            "inbody_available": has_body,
            "health_checkup_available": has_checkup,
        },
    }
