from typing import Any

from app.schemas.analysis import (
    BodyData,
    HealthData,
)

from app.schemas.health_analysis import (
    HealthAnalysisRequest,
)


def _to_float(
    value: Any,
) -> float | None:
    """
    Backend에서 전달된 Decimal 문자열/숫자를
    내부 분석용 float로 안전하게 변환한다.
    """

    if value is None:
        return None

    if isinstance(
        value,
        (int, float),
    ):
        return float(value)

    if isinstance(value, str):
        stripped = value.strip()

        if not stripped:
            return None

        try:
            return float(stripped)
        except ValueError:
            return None

    return None


def build_health_data(
    request: HealthAnalysisRequest,
) -> HealthData:
    health_checkup = request.input.health_checkup

    if health_checkup is None:
        return HealthData()

    return HealthData(
        systolic_bp=health_checkup.systolic_bp,
        diastolic_bp=health_checkup.diastolic_bp,

        fasting_glucose=_to_float(
            health_checkup.fasting_glucose
        ),

        # 현재 Backend 계약에는 HbA1c가 없음
        hba1c=None,

        total_cholesterol=_to_float(
            health_checkup.total_cholesterol
        ),

        ldl=_to_float(
            health_checkup.ldl_cholesterol
        ),

        hdl=_to_float(
            health_checkup.hdl_cholesterol
        ),

        triglyceride=_to_float(
            health_checkup.triglycerides
        ),

        ast=_to_float(
            health_checkup.ast
        ),

        alt=_to_float(
            health_checkup.alt
        ),

        gamma_gtp=_to_float(
            health_checkup.gamma_gtp
        ),

        creatinine=_to_float(
            health_checkup.creatinine
        ),
    )


def build_body_data(
    request: HealthAnalysisRequest,
) -> BodyData:
    body_composition = request.input.body_composition
    health_checkup = request.input.health_checkup

    if body_composition is None and health_checkup is None:
        return BodyData()

    # 인바디 BMI를 우선 사용하고,
    # 없으면 건강검진 BMI를 fallback으로 사용
    body_bmi = None

    if body_composition is not None:
        body_bmi = _to_float(
            body_composition.bmi
        )

    if body_bmi is None and health_checkup is not None:
        body_bmi = _to_float(
            health_checkup.bmi
        )

    return BodyData(
        bmi=body_bmi,

        body_fat_percentage=(
            _to_float(
                body_composition.body_fat_percentage
            )
            if body_composition is not None
            else None
        ),

        skeletal_muscle_mass_kg=(
            _to_float(
                body_composition.skeletal_muscle_mass_kg
            )
            if body_composition is not None
            else None
        ),

        visceral_fat_level=(
            _to_float(
                body_composition.visceral_fat_level
            )
            if body_composition is not None
            else None
        ),

        # 현재 Backend 계약에 waist_hip_ratio 없음
        waist_hip_ratio=None,

        basal_metabolic_rate=(
            _to_float(
                body_composition.basal_metabolic_rate
            )
            if body_composition is not None
            else None
        ),
    )


def build_analysis_inputs(
    request: HealthAnalysisRequest,
) -> tuple[BodyData, HealthData]:
    """
    Backend /health-analysis 요청을
    기존 분석 파이프라인 입력으로 변환한다.
    """

    body_data = build_body_data(
        request
    )

    health_data = build_health_data(
        request
    )

    return (
        body_data,
        health_data,
    )