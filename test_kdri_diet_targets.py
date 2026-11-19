import pytest

from app.schemas.recommendation import DietRecommendationRequest
from app.services.diet_recommendation_service import (
    DEFAULT_MEAL_TARGET,
    DEFAULT_SNACK_TARGET,
    _resolve_nutrition_targets,
)
from app.services.kdri_nutrition_service import (
    AUTOFIT_KDRI_TARGET_POLICY_VERSION,
    calculate_kdri_diet_targets,
    resolve_kdri_adult_group_id,
)


@pytest.mark.parametrize(
    ("age", "sex", "expected_group"),
    [
        (19, "male", "male_19_29_years"),
        (29, "male", "male_19_29_years"),
        (30, "male", "male_30_49_years"),
        (49, "female", "female_30_49_years"),
        (50, "female", "female_50_64_years"),
        (64, "male", "male_50_64_years"),
        (65, "male", "male_65_74_years"),
        (74, "female", "female_65_74_years"),
        (75, "female", "female_75_plus_years"),
        (120, "male", "male_75_plus_years"),
    ],
)
def test_kdri_adult_group_boundaries(
    age: int,
    sex: str,
    expected_group: str,
) -> None:
    assert resolve_kdri_adult_group_id(
        age_years=age,
        sex=sex,
    ) == expected_group


@pytest.mark.parametrize("invalid_age", [18, 121])
def test_kdri_rejects_out_of_range_nutrition_profile(
    invalid_age: int,
) -> None:
    with pytest.raises(ValueError):
        resolve_kdri_adult_group_id(
            age_years=invalid_age,
            sex="male",
        )

    with pytest.raises(ValueError):
        DietRecommendationRequest(
            nutrition_profile={
                "profile_mode": "basic_profile",
                "age_years": invalid_age,
                "sex": "male",
                "height_cm": 175,
                "weight_kg": 75,
            }
        )


def test_kdri_target_uses_official_eer_and_versioned_autofit_policy() -> None:
    result = calculate_kdri_diet_targets(
        age_years=34,
        sex="male",
    )

    assert result["reference_group_id"] == "male_30_49_years"
    assert result["daily_target"] == {
        "calories_kcal": 2500.0,
        "protein_g": 125.0,
        "fat_g": 69.4,
        "carbohydrate_g": 343.8,
    }
    assert result["meal_target"] == {
        "calories_kcal": 750.0,
        "protein_g": 37.5,
        "fat_g": 20.8,
        "carbohydrate_g": 103.1,
    }
    assert result["snack_target"] == {
        "calories_kcal": 250.0,
        "protein_g": 12.5,
        "fat_g": 6.9,
        "carbohydrate_g": 34.4,
    }
    assert result["policy_version"] == AUTOFIT_KDRI_TARGET_POLICY_VERSION
    assert result["height_weight_personalized"] is False


def test_target_precedence_is_explicit_then_kdri_then_legacy_default() -> None:
    explicit = DietRecommendationRequest(
        meal_target={
            "calories_kcal": 610,
            "protein_g": 31,
            "fat_g": 18,
            "carbohydrate_g": 77,
        },
        nutrition_profile={
            "profile_mode": "basic_profile",
            "age_years": 34,
            "sex": "male",
            "height_cm": 175,
            "weight_kg": 75,
        },
    )
    explicit_result = _resolve_nutrition_targets(explicit)
    assert explicit_result["target_source"] == "explicit"
    assert explicit_result["meal_target"] == {
        "calories_kcal": 610.0,
        "protein_g": 31.0,
        "fat_g": 18.0,
        "carbohydrate_g": 77.0,
    }
    assert explicit_result["reference_group_id"] == "male_30_49_years"

    kdri = DietRecommendationRequest(
        nutrition_profile={
            "profile_mode": "basic_profile",
            "age_years": 34,
            "sex": "male",
            "height_cm": 175,
            "weight_kg": 75,
        }
    )
    kdri_result = _resolve_nutrition_targets(kdri)
    assert kdri_result["target_source"] == "kdri"
    assert kdri_result["meal_target"]["calories_kcal"] == 750.0
    assert kdri_result["snack_target"]["calories_kcal"] == 250.0

    legacy = _resolve_nutrition_targets(DietRecommendationRequest())
    assert legacy["target_source"] == "default"
    assert legacy["meal_target"] == DEFAULT_MEAL_TARGET
    assert legacy["snack_target"] == DEFAULT_SNACK_TARGET


def test_health_records_mode_requires_both_source_records() -> None:
    valid = DietRecommendationRequest(
        nutrition_profile={
            "profile_mode": "health_records",
            "age_years": 52,
            "sex": "female",
            "height_cm": 160,
            "weight_kg": 60,
            "data_sources": {
                "inbody_available": True,
                "health_checkup_available": True,
            },
        }
    )
    assert valid.nutrition_profile is not None
    assert valid.nutrition_profile.profile_mode == "health_records"

    with pytest.raises(ValueError):
        DietRecommendationRequest(
            nutrition_profile={
                "profile_mode": "health_records",
                "age_years": 52,
                "sex": "female",
                "height_cm": 160,
                "weight_kg": 60,
                "data_sources": {
                    "inbody_available": True,
                    "health_checkup_available": False,
                },
            }
        )


def test_basic_profile_rejects_a_fully_available_health_record_pair() -> None:
    with pytest.raises(ValueError):
        DietRecommendationRequest(
            nutrition_profile={
                "profile_mode": "basic_profile",
                "age_years": 34,
                "sex": "male",
                "height_cm": 175,
                "weight_kg": 75,
                "data_sources": {
                    "inbody_available": True,
                    "health_checkup_available": True,
                },
            }
        )


def test_new_fields_keep_backward_compatible_defaults() -> None:
    request = DietRecommendationRequest()

    assert request.nutrition_profile is None
    assert request.reference_standard == "KDRI_2025"
    assert request.menu_style_preference == "balanced"

    with pytest.raises(ValueError):
        DietRecommendationRequest(menu_style_preference="unknown")

    with pytest.raises(ValueError):
        DietRecommendationRequest(reference_standard="KDRI_2020")
