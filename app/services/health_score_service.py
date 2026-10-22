from dataclasses import dataclass
from typing import Any, Literal

from app.schemas.health_analysis import (
    BodyCompositionInput,
    HealthAnalysisRequest,
    HealthCheckupInput,
    HealthMetricAdjustmentOutput,
    HealthScoreOutput,
    HealthScoreSectionOutput,
    HealthTierName,
    WeeklyDietScoreInput,
    WeeklyExerciseScoreInput,
)


SCORING_VERSION = "health-score-v1"


@dataclass(frozen=True)
class MetricRule:
    metric_key: str
    source: Literal[
        "body",
        "checkup",
    ]
    field_name: str
    weight: float
    unit: str
    preferred_direction: Literal[
        "higher",
        "lower",
        "bmi_range",
    ]
    neutral_change: float
    full_change: float
    target_threshold: float | None = None


# 인바디 40%, 건강검진 60%로 구성한다.
# 동일 영역에서 일부 값이 누락되면 실제 제공된 지표의 가중치를
# 다시 정규화하되 coverage를 응답에 별도로 노출한다.
HEALTH_METRIC_RULES = (
    MetricRule(
        "skeletal_muscle_mass_kg",
        "body",
        "skeletal_muscle_mass_kg",
        12.0,
        "kg",
        "higher",
        0.2,
        2.0,
    ),
    MetricRule(
        "body_fat_percentage",
        "body",
        "body_fat_percentage",
        14.0,
        "%",
        "lower",
        0.5,
        5.0,
    ),
    MetricRule(
        "visceral_fat_level",
        "body",
        "visceral_fat_level",
        6.0,
        "level",
        "lower",
        0.5,
        3.0,
    ),
    MetricRule(
        "bmi",
        "body",
        "bmi",
        8.0,
        "kg/m2",
        "bmi_range",
        0.2,
        2.0,
    ),
    MetricRule(
        "systolic_bp",
        "checkup",
        "systolic_bp",
        9.0,
        "mmHg",
        "lower",
        3.0,
        20.0,
        target_threshold=120.0,
    ),
    MetricRule(
        "diastolic_bp",
        "checkup",
        "diastolic_bp",
        6.0,
        "mmHg",
        "lower",
        2.0,
        12.0,
        target_threshold=80.0,
    ),
    MetricRule(
        "fasting_glucose",
        "checkup",
        "fasting_glucose",
        15.0,
        "mg/dL",
        "lower",
        3.0,
        20.0,
        target_threshold=100.0,
    ),
    MetricRule(
        "total_cholesterol",
        "checkup",
        "total_cholesterol",
        5.0,
        "mg/dL",
        "lower",
        5.0,
        40.0,
        target_threshold=200.0,
    ),
    MetricRule(
        "ldl_cholesterol",
        "checkup",
        "ldl_cholesterol",
        10.0,
        "mg/dL",
        "lower",
        5.0,
        40.0,
        target_threshold=100.0,
    ),
    MetricRule(
        "hdl_cholesterol",
        "checkup",
        "hdl_cholesterol",
        5.0,
        "mg/dL",
        "higher",
        2.0,
        15.0,
        target_threshold=40.0,
    ),
    MetricRule(
        "triglycerides",
        "checkup",
        "triglycerides",
        10.0,
        "mg/dL",
        "lower",
        10.0,
        80.0,
        target_threshold=150.0,
    ),
)


class HealthScoreService:
    """
    사용자 주간 건강점수를 결정론적으로 계산한다.

    LLM은 점수, 등급, 증감값 계산에 관여하지 않는다.
    """

    def calculate(
        self,
        request: HealthAnalysisRequest,
    ) -> HealthScoreOutput:
        score_context = request.input.score_context

        diet = self._calculate_diet_score(
            score_context.weekly_diet
            if score_context is not None
            else None
        )
        exercise = self._calculate_exercise_score(
            score_context.weekly_exercise
            if score_context is not None
            else None
        )
        health_data, adjustments = (
            self._calculate_health_data_score(
                current_checkup=request.input.health_checkup,
                current_body=request.input.body_composition,
                baseline_checkup=(
                    score_context.baseline_health_checkup
                    if score_context is not None
                    else None
                ),
                baseline_body=(
                    score_context.baseline_body_composition
                    if score_context is not None
                    else None
                ),
            )
        )

        sections = (
            diet,
            exercise,
            health_data,
        )

        if any(
            section.status != "available"
            or section.score is None
            for section in sections
        ):
            return HealthScoreOutput(
                status="unavailable",
                total_score=None,
                scoring_version=SCORING_VERSION,
                tier=None,
                tier_level=None,
                diet=diet,
                exercise=exercise,
                health_data=health_data,
                health_metric_adjustments=adjustments,
            )

        total_score = round(
            (diet.score or 0.0) * 0.30
            + (exercise.score or 0.0) * 0.30
            + (health_data.score or 0.0) * 0.40,
            1,
        )
        tier, tier_level = self._resolve_tier(
            total_score
        )

        return HealthScoreOutput(
            status="available",
            total_score=total_score,
            scoring_version=SCORING_VERSION,
            tier=tier,
            tier_level=tier_level,
            diet=diet,
            exercise=exercise,
            health_data=health_data,
            health_metric_adjustments=adjustments,
        )

    def _calculate_diet_score(
        self,
        weekly: WeeklyDietScoreInput | None,
    ) -> HealthScoreSectionOutput:
        if weekly is None:
            return self._unavailable_section(
                "주간 목표 영양량과 실제 섭취 기록이 필요합니다."
            )

        unique_days = []
        seen_dates: set[str] = set()

        for day in weekly.days:
            normalized_date = day.date.strip()

            if (
                not normalized_date
                or normalized_date in seen_dates
            ):
                continue

            seen_dates.add(normalized_date)
            unique_days.append(day)

            if len(unique_days) >= weekly.expected_days:
                break

        nutrient_totals = {
            "calories": 0.0,
            "protein": 0.0,
            "carbohydrate": 0.0,
            "fat": 0.0,
        }
        logged_days = 0

        for day in unique_days:
            if day.actual is None:
                continue

            logged_days += 1
            nutrient_totals["calories"] += (
                self._nutrition_adherence(
                    day.actual.calories_kcal,
                    day.target.calories_kcal,
                )
            )
            nutrient_totals["protein"] += (
                self._nutrition_adherence(
                    day.actual.protein_g,
                    day.target.protein_g,
                )
            )
            nutrient_totals["carbohydrate"] += (
                self._nutrition_adherence(
                    day.actual.carbohydrate_g,
                    day.target.carbohydrate_g,
                )
            )
            nutrient_totals["fat"] += (
                self._nutrition_adherence(
                    day.actual.fat_g,
                    day.target.fat_g,
                )
            )

        denominator = float(
            weekly.expected_days
        )
        nutrient_scores = {
            key: round(value / denominator, 1)
            for key, value in nutrient_totals.items()
        }

        score = round(
            nutrient_scores["calories"] * 0.30
            + nutrient_scores["protein"] * 0.30
            + nutrient_scores["carbohydrate"] * 0.20
            + nutrient_scores["fat"] * 0.20,
            1,
        )

        return HealthScoreSectionOutput(
            status="available",
            score=score,
            message=(
                "추천 메뉴 종류가 아니라 1주간 칼로리와 "
                "탄수화물·단백질·지방 목표 준수율로 계산했습니다."
            ),
            breakdown={
                **nutrient_scores,
                "logged_days": float(logged_days),
                "expected_days": float(weekly.expected_days),
            },
        )

    def _calculate_exercise_score(
        self,
        weekly: WeeklyExerciseScoreInput | None,
    ) -> HealthScoreSectionOutput:
        if weekly is None:
            return self._unavailable_section(
                "주간 운동 목표와 실제 수행 기록이 필요합니다."
            )

        duration_ratio = self._capped_ratio(
            weekly.completed_minutes,
            weekly.target_minutes,
        )
        frequency_ratio = self._capped_ratio(
            weekly.completed_days,
            weekly.target_days,
        )
        goal_alignment_ratio = self._capped_ratio(
            min(
                weekly.goal_aligned_completed_days,
                weekly.completed_days,
            ),
            weekly.target_days,
        )

        duration_score = duration_ratio * 50.0
        frequency_score = frequency_ratio * 30.0
        goal_alignment_score = (
            goal_alignment_ratio * 20.0
        )
        score = round(
            duration_score
            + frequency_score
            + goal_alignment_score,
            1,
        )

        return HealthScoreSectionOutput(
            status="available",
            score=score,
            message=(
                "목표 시간 50%, 주간 횟수 30%, 선택한 운동 "
                "목적에 맞는 추천 운동 수행도 20%로 계산했습니다."
            ),
            breakdown={
                "duration": round(duration_score, 1),
                "frequency": round(frequency_score, 1),
                "goal_alignment": round(
                    goal_alignment_score,
                    1,
                ),
            },
        )

    def _calculate_health_data_score(
        self,
        *,
        current_checkup: HealthCheckupInput | None,
        current_body: BodyCompositionInput | None,
        baseline_checkup: HealthCheckupInput | None,
        baseline_body: BodyCompositionInput | None,
    ) -> tuple[
        HealthScoreSectionOutput,
        list[HealthMetricAdjustmentOutput],
    ]:
        # 사용자의 요구사항에 따라 인바디와 건강검진이
        # 현재/최초 기준 모두 존재해야 계산한다.
        if (
            current_checkup is None
            or current_body is None
            or baseline_checkup is None
            or baseline_body is None
        ):
            return (
                self._unavailable_section(
                    "현재 및 최초 기준 인바디와 건강검진 "
                    "데이터가 모두 필요합니다."
                ),
                [],
            )

        sources: dict[str, tuple[Any, Any]] = {
            "body": (
                baseline_body,
                current_body,
            ),
            "checkup": (
                baseline_checkup,
                current_checkup,
            ),
        }

        weighted_signal = 0.0
        available_weight = 0.0
        body_metric_count = 0
        checkup_metric_count = 0
        adjustments: list[
            HealthMetricAdjustmentOutput
        ] = []

        for rule in HEALTH_METRIC_RULES:
            baseline_source, current_source = sources[
                rule.source
            ]
            baseline_value = self._to_float(
                getattr(
                    baseline_source,
                    rule.field_name,
                    None,
                )
            )
            current_value = self._to_float(
                getattr(
                    current_source,
                    rule.field_name,
                    None,
                )
            )

            if (
                baseline_value is None
                or current_value is None
            ):
                continue

            if rule.source == "body":
                body_metric_count += 1
            else:
                checkup_metric_count += 1

            signal = self._metric_signal(
                rule,
                baseline_value,
                current_value,
            )
            weighted_signal += signal * rule.weight
            available_weight += rule.weight

            adjustments.append(
                HealthMetricAdjustmentOutput(
                    metric_key=rule.metric_key,
                    baseline_value=baseline_value,
                    current_value=current_value,
                    unit=rule.unit,
                    trend=self._trend(signal),
                    normalized_change=round(
                        signal,
                        4,
                    ),
                )
            )

        if (
            body_metric_count == 0
            or checkup_metric_count == 0
            or available_weight <= 0
        ):
            return (
                self._unavailable_section(
                    "인바디와 건강검진 양쪽에 비교 가능한 "
                    "건강 지표가 각각 하나 이상 필요합니다."
                ),
                adjustments,
            )

        normalized_signal = max(
            -1.0,
            min(
                1.0,
                weighted_signal / available_weight,
            ),
        )

        # 최초 기준점은 80점이다. 개선은 최대 +20점,
        # 악화는 최대 -80점으로 반영해 0~100 범위를 유지한다.
        if normalized_signal >= 0:
            adjustment_score = (
                normalized_signal * 20.0
            )
        else:
            adjustment_score = (
                normalized_signal * 80.0
            )

        score = round(
            max(
                0.0,
                min(
                    100.0,
                    80.0 + adjustment_score,
                ),
            ),
            1,
        )

        return (
            HealthScoreSectionOutput(
                status="available",
                score=score,
                message=(
                    "최초 인바디와 건강검진을 기준 80점으로 "
                    "설정하고 현재 지표의 개선·악화를 반영했습니다."
                ),
                breakdown={
                    "baseline_score": 80.0,
                    "change_adjustment": round(
                        score - 80.0,
                        1,
                    ),
                    "data_coverage_percent": round(
                        available_weight,
                        1,
                    ),
                },
            ),
            adjustments,
        )

    @staticmethod
    def _nutrition_adherence(
        actual: float,
        target: float,
    ) -> float:
        error_ratio = abs(
            actual - target
        ) / target

        # 목표의 ±10% 이내는 일상적인 계량 오차를 고려해 만점.
        if error_ratio <= 0.10:
            return 100.0

        # 50% 이상 벗어나면 해당 영양 항목은 0점.
        if error_ratio >= 0.50:
            return 0.0

        return (
            (0.50 - error_ratio)
            / 0.40
            * 100.0
        )

    @staticmethod
    def _capped_ratio(
        actual: int,
        target: int,
    ) -> float:
        return max(
            0.0,
            min(
                1.0,
                float(actual) / float(target),
            ),
        )

    def _metric_signal(
        self,
        rule: MetricRule,
        baseline: float,
        current: float,
    ) -> float:
        if rule.preferred_direction == "bmi_range":
            return self._bmi_signal(
                baseline,
                current,
                rule,
            )

        if rule.target_threshold is not None:
            return self._threshold_signal(
                baseline=baseline,
                current=current,
                preferred_direction=(
                    rule.preferred_direction
                ),
                threshold=rule.target_threshold,
                neutral_change=rule.neutral_change,
                full_change=rule.full_change,
            )

        raw_change = current - baseline

        if rule.preferred_direction == "lower":
            beneficial_change = -raw_change
        else:
            beneficial_change = raw_change

        return self._normalize_change(
            beneficial_change,
            rule.neutral_change,
            rule.full_change,
        )

    def _threshold_signal(
        self,
        *,
        baseline: float,
        current: float,
        preferred_direction: Literal[
            "higher",
            "lower",
            "bmi_range",
        ],
        threshold: float,
        neutral_change: float,
        full_change: float,
    ) -> float:
        """
        정상 기준을 이미 달성한 상태에서 수치를 더 낮추거나
        높였다는 이유만으로 추가 점수를 주지 않는다.

        예: 공복혈당이 100 미만이면 더 낮아졌다고 무조건
        개선으로 보지 않고, 정상 범위를 벗어나 악화될 때만 감점한다.
        """

        if preferred_direction == "lower":
            baseline_distance = max(
                0.0,
                baseline - threshold,
            )
            current_distance = max(
                0.0,
                current - threshold,
            )
        else:
            baseline_distance = max(
                0.0,
                threshold - baseline,
            )
            current_distance = max(
                0.0,
                threshold - current,
            )

        beneficial_change = (
            baseline_distance
            - current_distance
        )

        return self._normalize_change(
            beneficial_change,
            neutral_change,
            full_change,
        )

    def _bmi_signal(
        self,
        baseline: float,
        current: float,
        rule: MetricRule,
    ) -> float:
        normal_min = 18.5
        normal_max = 23.0

        def distance_from_normal(
            value: float,
        ) -> float:
            if value < normal_min:
                return normal_min - value
            if value >= normal_max:
                return value - normal_max
            return 0.0

        beneficial_change = (
            distance_from_normal(baseline)
            - distance_from_normal(current)
        )

        return self._normalize_change(
            beneficial_change,
            rule.neutral_change,
            rule.full_change,
        )

    @staticmethod
    def _normalize_change(
        beneficial_change: float,
        neutral_change: float,
        full_change: float,
    ) -> float:
        magnitude = abs(
            beneficial_change
        )

        if magnitude <= neutral_change:
            return 0.0

        normalized = min(
            1.0,
            (
                magnitude - neutral_change
            )
            / (
                full_change - neutral_change
            ),
        )

        return (
            normalized
            if beneficial_change > 0
            else -normalized
        )

    @staticmethod
    def _trend(
        signal: float,
    ) -> Literal[
        "improved",
        "unchanged",
        "declined",
    ]:
        if signal > 0:
            return "improved"
        if signal < 0:
            return "declined"
        return "unchanged"

    @staticmethod
    def _resolve_tier(
        score: float,
    ) -> tuple[
        HealthTierName,
        int,
    ]:
        if score < 40:
            return "CORE", 1
        if score < 60:
            return "BALANCE", 1
        if score < 75:
            return "ACTIVE", 1
        if score < 85:
            return "FIT", 1
        if score < 90:
            return "FIT", 2
        return "PEAK", 1

    @staticmethod
    def _unavailable_section(
        message: str,
    ) -> HealthScoreSectionOutput:
        return HealthScoreSectionOutput(
            status="unavailable",
            score=None,
            message=message,
            breakdown={},
        )

    @staticmethod
    def _to_float(
        value: Any,
    ) -> float | None:
        if value is None:
            return None

        if isinstance(
            value,
            (int, float),
        ):
            return float(value)

        if isinstance(value, str):
            normalized = value.strip()

            if not normalized:
                return None

            try:
                return float(normalized)
            except ValueError:
                return None

        return None


health_score_service = HealthScoreService()
