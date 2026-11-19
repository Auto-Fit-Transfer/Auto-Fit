from datetime import date

import pytest

from backend.app.diet_nutrition_profile import (
    build_nutrition_profile, is_adult_birth_date, is_supported_diet_birth_date,
)


PROFILE = {
    "birth_date": "2000-11-19", "gender": "female",
    "height_cm": 165, "weight_kg": 60,
}
TODAY = date(2026, 11, 19)


@pytest.mark.parametrize("birthday,allowed", [
    ("2007-11-19", True),
    ("2007-11-20", False),
    ("2027-01-01", False),
    (None, False),
    ("invalid", False),
])
def test_adult_diet_gate_uses_kst_completed_age(birthday, allowed):
    assert is_adult_birth_date(birthday, today=TODAY) is allowed


@pytest.mark.parametrize("birthday,allowed", [
    ("1906-11-19", True),
    ("1905-11-19", False),
    ("2007-11-19", True),
    ("2007-11-20", False),
])
def test_supported_diet_age_includes_19_and_120_only(birthday, allowed):
    assert is_supported_diet_birth_date(birthday, today=TODAY) is allowed


def test_confirmed_measurements_take_priority_over_basic_profile():
    result = build_nutrition_profile(
        PROFILE,
        {"height_cm": 167, "weight_kg": 64},
        {"height_cm": 168, "weight_kg": 62},
        today=TODAY,
    )
    assert result == {
        "profile_mode": "health_records", "age_years": 26, "sex": "female",
        "height_cm": 168.0, "weight_kg": 62.0,
        "data_sources": {"inbody_available": True, "health_checkup_available": True},
    }


def test_missing_individual_measurement_falls_back_without_claiming_both_documents():
    result = build_nutrition_profile(
        PROFILE, {"height_cm": 170}, None, today=TODAY,
    )
    assert result["profile_mode"] == "basic_profile"
    assert result["height_cm"] == 170
    assert result["weight_kg"] == 60
    assert result["data_sources"] == {
        "inbody_available": False, "health_checkup_available": True,
    }


@pytest.mark.parametrize("birthday,allowed", [
    ("2007-11-19", True),
    ("2007-11-20", False),
    ("1906-11-19", True),
    ("1905-11-19", False),
])
def test_diet_age_boundaries_use_completed_years(birthday, allowed):
    profile = {**PROFILE, "birth_date": birthday}
    if allowed:
        assert build_nutrition_profile(profile, None, None, today=TODAY)["age_years"] in (19, 120)
    else:
        with pytest.raises(ValueError, match="Age"):
            build_nutrition_profile(profile, None, None, today=TODAY)


@pytest.mark.parametrize("changes", [
    {"gender": "other"},
    {"height_cm": None},
    {"weight_kg": 401},
])
def test_unsupported_profile_is_not_silently_sent_to_ai(changes):
    with pytest.raises(ValueError):
        build_nutrition_profile({**PROFILE, **changes}, None, None, today=TODAY)
