from app.schemas.health_analysis import (
    BodyCompositionInput,
    DietAdherenceDayInput,
    HealthAnalysisPayload,
    HealthAnalysisRequest,
    HealthCheckupInput,
    HealthScoreContextInput,
    NutritionActualInput,
    NutritionTargetInput,
    PreviousHealthScoreInput,
    WeeklyDietScoreInput,
    WeeklyExerciseScoreInput,
)
from app.services.health_score_service import (
    health_score_service,
)
from app.services import (
    health_analysis_service as health_analysis_module,
)
from app.services.diet_personalization_service import (
    prepare_diet_context,
)


def _checkup(
    *,
    systolic_bp: float = 130,
    diastolic_bp: float = 85,
    fasting_glucose: float = 110,
    total_cholesterol: float = 220,
    ldl_cholesterol: float = 140,
    hdl_cholesterol: float = 45,
    triglycerides: float = 180,
) -> HealthCheckupInput:
    return HealthCheckupInput(
        systolic_bp=int(systolic_bp),
        diastolic_bp=int(diastolic_bp),
        fasting_glucose=fasting_glucose,
        total_cholesterol=total_cholesterol,
        ldl_cholesterol=ldl_cholesterol,
        hdl_cholesterol=hdl_cholesterol,
        triglycerides=triglycerides,
    )


def _body(
    *,
    skeletal_muscle_mass_kg: float = 25,
    body_fat_percentage: float = 28,
    visceral_fat_level: float = 10,
    bmi: float = 25,
) -> BodyCompositionInput:
    return BodyCompositionInput(
        skeletal_muscle_mass_kg=skeletal_muscle_mass_kg,
        body_fat_percentage=body_fat_percentage,
        visceral_fat_level=visceral_fat_level,
        bmi=bmi,
    )


def _nutrition_target() -> NutritionTargetInput:
    return NutritionTargetInput(
        calories_kcal=2000,
        carbohydrate_g=250,
        protein_g=120,
        fat_g=55,
    )


def _nutrition_actual() -> NutritionActualInput:
    return NutritionActualInput(
        calories_kcal=2000,
        carbohydrate_g=250,
        protein_g=120,
        fat_g=55,
    )


def _request(
    *,
    current_checkup: HealthCheckupInput | None = None,
    current_body: BodyCompositionInput | None = None,
    baseline_checkup: HealthCheckupInput | None = None,
    baseline_body: BodyCompositionInput | None = None,
    weekly_diet: WeeklyDietScoreInput | None = None,
    weekly_exercise: WeeklyExerciseScoreInput | None = None,
    previous_health_score: PreviousHealthScoreInput | None = None,
    include_score_context: bool = True,
) -> HealthAnalysisRequest:
    score_context = None

    if include_score_context:
        score_context = HealthScoreContextInput(
            baseline_health_checkup=(
                baseline_checkup
            ),
            baseline_body_composition=(
                baseline_body
            ),
            weekly_diet=weekly_diet,
            weekly_exercise=weekly_exercise,
            previous_health_score=(
                previous_health_score
            ),
        )

    return HealthAnalysisRequest(
        request_id="health-score-test",
        input=HealthAnalysisPayload(
            health_checkup=current_checkup,
            body_composition=current_body,
            score_context=score_context,
        ),
    )


def test_initial_scores_follow_product_policy() -> None:
    baseline_checkup = _checkup()
    baseline_body = _body()
    request = _request(
        current_checkup=baseline_checkup,
        current_body=baseline_body,
        baseline_checkup=baseline_checkup,
        baseline_body=baseline_body,
        weekly_diet=WeeklyDietScoreInput(
            days=[],
        ),
        weekly_exercise=WeeklyExerciseScoreInput(
            goal_type="body_fat_loss",
            target_minutes=90,
            completed_minutes=0,
            target_days=3,
            completed_days=0,
            goal_aligned_completed_days=0,
        ),
    )

    result = health_score_service.calculate(
        request
    )

    assert result.status == "available"
    assert result.diet.score == 0
    assert result.exercise.score == 0
    assert result.health_data.score == 80
    assert result.total_score == 32
    assert result.tier == "CORE"
    assert result.scoring_version == "health-score-v1"
    assert result.comparison_status == "not_provided"
    assert result.score_delta is None
    assert [
        action.section
        for action in result.priority_actions
    ] == [
        "diet",
        "exercise",
    ]


def test_perfect_week_scores_diet_and_exercise_at_100() -> None:
    diet_days = [
        DietAdherenceDayInput(
            date=f"2026-10-{day:02d}",
            target=_nutrition_target(),
            actual=_nutrition_actual(),
        )
        for day in range(1, 8)
    ]
    baseline_checkup = _checkup()
    baseline_body = _body()
    request = _request(
        current_checkup=baseline_checkup,
        current_body=baseline_body,
        baseline_checkup=baseline_checkup,
        baseline_body=baseline_body,
        weekly_diet=WeeklyDietScoreInput(
            days=diet_days,
        ),
        weekly_exercise=WeeklyExerciseScoreInput(
            goal_type="body_fat_loss",
            target_minutes=90,
            completed_minutes=100,
            target_days=3,
            completed_days=4,
            goal_aligned_completed_days=3,
        ),
    )

    result = health_score_service.calculate(
        request
    )

    assert result.diet.score == 100
    assert result.exercise.score == 100
    assert result.health_data.score == 80
    assert result.total_score == 92
    assert result.tier == "PEAK"


def test_missing_diet_days_count_as_zero() -> None:
    request = _request(
        current_checkup=_checkup(),
        current_body=_body(),
        baseline_checkup=_checkup(),
        baseline_body=_body(),
        weekly_diet=WeeklyDietScoreInput(
            days=[
                DietAdherenceDayInput(
                    date="2026-10-01",
                    target=_nutrition_target(),
                    actual=_nutrition_actual(),
                )
            ],
        ),
        weekly_exercise=WeeklyExerciseScoreInput(
            goal_type="regular_exercise",
            target_minutes=90,
            target_days=3,
        ),
    )

    result = health_score_service.calculate(
        request
    )

    assert result.diet.score == 14.3
    assert result.diet.breakdown["logged_days"] == 1


def test_health_data_improvement_and_decline_change_baseline_80() -> None:
    baseline_checkup = _checkup()
    baseline_body = _body()

    improved = health_score_service.calculate(
        _request(
            current_checkup=_checkup(
                systolic_bp=115,
                diastolic_bp=75,
                fasting_glucose=95,
                total_cholesterol=190,
                ldl_cholesterol=105,
                hdl_cholesterol=55,
                triglycerides=120,
            ),
            current_body=_body(
                skeletal_muscle_mass_kg=27,
                body_fat_percentage=23,
                visceral_fat_level=7,
                bmi=23,
            ),
            baseline_checkup=baseline_checkup,
            baseline_body=baseline_body,
            weekly_diet=WeeklyDietScoreInput(),
            weekly_exercise=WeeklyExerciseScoreInput(
                goal_type="body_fat_loss",
                target_minutes=90,
                target_days=3,
            ),
        )
    )
    declined = health_score_service.calculate(
        _request(
            current_checkup=_checkup(
                systolic_bp=150,
                diastolic_bp=100,
                fasting_glucose=140,
                total_cholesterol=270,
                ldl_cholesterol=195,
                hdl_cholesterol=30,
                triglycerides=300,
            ),
            current_body=_body(
                skeletal_muscle_mass_kg=22,
                body_fat_percentage=35,
                visceral_fat_level=14,
                bmi=30,
            ),
            baseline_checkup=baseline_checkup,
            baseline_body=baseline_body,
            weekly_diet=WeeklyDietScoreInput(),
            weekly_exercise=WeeklyExerciseScoreInput(
                goal_type="body_fat_loss",
                target_minutes=90,
                target_days=3,
            ),
        )
    )

    assert improved.health_data.score is not None
    assert improved.health_data.score > 80
    assert declined.health_data.score is not None
    assert declined.health_data.score < 80
    assert any(
        item.trend == "improved"
        for item in improved.health_metric_adjustments
    )
    assert any(
        item.trend == "declined"
        for item in declined.health_metric_adjustments
    )


def test_health_data_requires_both_inbody_and_checkup() -> None:
    result = health_score_service.calculate(
        _request(
            current_checkup=_checkup(),
            current_body=None,
            baseline_checkup=_checkup(),
            baseline_body=_body(),
            weekly_diet=WeeklyDietScoreInput(),
            weekly_exercise=WeeklyExerciseScoreInput(
                goal_type="regular_exercise",
                target_minutes=90,
                target_days=3,
            ),
        )
    )

    assert result.status == "unavailable"
    assert result.total_score is None
    assert result.health_data.status == "unavailable"
    assert result.health_data.score is None
    assert (
        result.comparison_status
        == "current_score_unavailable"
    )


def test_normal_health_value_is_not_rewarded_for_becoming_lower() -> None:
    baseline_checkup = _checkup(
        fasting_glucose=95,
    )
    current_checkup = _checkup(
        fasting_glucose=80,
    )
    body = _body()
    result = health_score_service.calculate(
        _request(
            current_checkup=current_checkup,
            current_body=body,
            baseline_checkup=baseline_checkup,
            baseline_body=body,
            weekly_diet=WeeklyDietScoreInput(),
            weekly_exercise=WeeklyExerciseScoreInput(
                goal_type="regular_exercise",
                target_minutes=90,
                target_days=3,
            ),
        )
    )

    glucose_adjustment = next(
        item
        for item in result.health_metric_adjustments
        if item.metric_key == "fasting_glucose"
    )

    assert glucose_adjustment.trend == "unchanged"
    assert result.health_data.score == 80


def test_tier_policy_matches_fit_two_design() -> None:
    assert health_score_service._resolve_tier(86) == (
        "FIT",
        2,
    )


def test_existing_request_without_score_context_is_compatible() -> None:
    result = health_score_service.calculate(
        _request(
            current_checkup=_checkup(),
            current_body=_body(),
            include_score_context=False,
        )
    )

    assert result.status == "unavailable"
    assert result.total_score is None
    assert result.diet.status == "unavailable"
    assert result.exercise.status == "unavailable"
    assert result.health_data.status == "unavailable"


def test_health_analysis_response_includes_score() -> None:
    baseline_checkup = _checkup()
    baseline_body = _body()
    request = _request(
        current_checkup=baseline_checkup,
        current_body=baseline_body,
        baseline_checkup=baseline_checkup,
        baseline_body=baseline_body,
        weekly_diet=WeeklyDietScoreInput(),
        weekly_exercise=WeeklyExerciseScoreInput(
            goal_type="regular_exercise",
            target_minutes=90,
            target_days=3,
        ),
    )

    score = health_score_service.calculate(
        request
    )
    response = health_analysis_module._build_empty_inventory_fallback(
        request=request,
        metric_statuses={},
        prepared=prepare_diet_context(None),
        health_score=score,
    )

    assert response.analysis.health_score.status == "available"
    assert response.analysis.health_score.total_score == 32
    assert response.analysis.health_score.health_data.score == 80


def test_previous_week_score_builds_trends_and_reasons() -> None:
    diet_days = [
        DietAdherenceDayInput(
            date=f"2026-10-{day:02d}",
            target=_nutrition_target(),
            actual=_nutrition_actual(),
        )
        for day in range(1, 8)
    ]
    checkup = _checkup()
    body = _body()
    result = health_score_service.calculate(
        _request(
            current_checkup=checkup,
            current_body=body,
            baseline_checkup=checkup,
            baseline_body=body,
            weekly_diet=WeeklyDietScoreInput(
                days=diet_days,
            ),
            weekly_exercise=WeeklyExerciseScoreInput(
                goal_type="regular_exercise",
                target_minutes=90,
                completed_minutes=90,
                target_days=3,
                completed_days=3,
                goal_aligned_completed_days=3,
            ),
            previous_health_score=PreviousHealthScoreInput(
                total_score=70,
                diet_score=60,
                exercise_score=70,
                health_data_score=80,
            ),
        )
    )

    assert result.total_score == 92
    assert result.comparison_status == "available"
    assert result.previous_total_score == 70
    assert result.score_delta == 22
    assert result.trend == "improved"
    assert result.section_trends is not None
    assert result.section_trends.diet.score_delta == 40
    assert result.section_trends.exercise.score_delta == 30
    assert result.section_trends.health_data.trend == "unchanged"
    assert len(result.change_reasons) == 3
    assert result.change_reasons[0].section == "diet"


def test_previous_score_version_mismatch_is_not_compared() -> None:
    checkup = _checkup()
    body = _body()
    result = health_score_service.calculate(
        _request(
            current_checkup=checkup,
            current_body=body,
            baseline_checkup=checkup,
            baseline_body=body,
            weekly_diet=WeeklyDietScoreInput(),
            weekly_exercise=WeeklyExerciseScoreInput(
                goal_type="regular_exercise",
                target_minutes=90,
                target_days=3,
            ),
            previous_health_score=PreviousHealthScoreInput(
                scoring_version="health-score-v0",
                total_score=50,
                diet_score=50,
                exercise_score=50,
                health_data_score=50,
            ),
        )
    )

    assert result.comparison_status == "version_mismatch"
    assert result.previous_total_score is None
    assert result.score_delta is None
    assert result.section_trends is None
    assert result.change_reasons == []


def test_declined_health_metrics_create_safe_priority_action() -> None:
    diet_days = [
        DietAdherenceDayInput(
            date=f"2026-10-{day:02d}",
            target=_nutrition_target(),
            actual=_nutrition_actual(),
        )
        for day in range(1, 8)
    ]
    result = health_score_service.calculate(
        _request(
            current_checkup=_checkup(
                fasting_glucose=140,
                triglycerides=300,
            ),
            current_body=_body(
                body_fat_percentage=35,
            ),
            baseline_checkup=_checkup(),
            baseline_body=_body(),
            weekly_diet=WeeklyDietScoreInput(
                days=diet_days,
            ),
            weekly_exercise=WeeklyExerciseScoreInput(
                goal_type="body_fat_loss",
                target_minutes=90,
                completed_minutes=90,
                target_days=3,
                completed_days=3,
                goal_aligned_completed_days=3,
            ),
        )
    )

    assert len(result.priority_actions) == 1
    action = result.priority_actions[0]
    assert action.section == "health_data"
    assert action.priority == 1
    assert "의료진" in action.message
