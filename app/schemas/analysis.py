from typing import Any, Literal

from pydantic import BaseModel, Field


# =========================================================
# Input
# =========================================================


class BodyData(BaseModel):
    """
    체성분 분석 입력.

    Backend에서 일부 값만 전달할 수 있으므로
    모든 항목을 Optional로 처리한다.
    """

    bmi: float | None = None
    body_fat_percentage: float | None = None
    skeletal_muscle_mass_kg: float | None = None
    visceral_fat_level: int | None = None
    waist_hip_ratio: float | None = None
    basal_metabolic_rate: float | None = None


class HealthData(BaseModel):
    """
    건강검진 분석 입력.

    분석 계약에 맞춰 혈압은
    systolic / diastolic 두 값으로 분리한다.
    """

    systolic_bp: float | None = None
    diastolic_bp: float | None = None
    fasting_glucose: float | None = None
    hba1c: float | None = None
    total_cholesterol: float | None = None
    triglyceride: float | None = None
    hdl: float | None = None
    ldl: float | None = None
    ast: float | None = None
    alt: float | None = None
    gamma_gtp: float | None = None
    creatinine: float | None = None


class AnalysisRequest(BaseModel):
    """
    Backend -> AI Server 종합 분석 요청.
    """

    user_id: str | None = None

    body_data: BodyData | None = None

    health_data: HealthData | None = None


# =========================================================
# Rule Engine Output
# =========================================================


class MetricResult(BaseModel):
    """
    개별 지표 분석 결과.
    """

    value: Any | None = None

    status: str

    message: str

    criterion: str | None = None

    source: str | None = None

    reference: str | None = None


# =========================================================
# Final LLM Output
# =========================================================


class HealthRiskItem(BaseModel):
    name: str
    reason: str

    severity: Literal[
        "low",
        "moderate",
        "high",
    ]


class SourceItem(BaseModel):
    source_org: str
    title: str


class FinalAnswer(BaseModel):
    summary: str = ""

    health_risks: list[HealthRiskItem] = Field(
        default_factory=list
    )

    exercise: list[str] = Field(
        default_factory=list
    )

    diet: list[str] = Field(
        default_factory=list
    )

    cautions: list[str] = Field(
        default_factory=list
    )

    sources: list[SourceItem] = Field(
        default_factory=list
    )


# =========================================================
# Analysis Response
# =========================================================


class AnalysisResponse(BaseModel):
    user_id: str | None = None

    body_analysis: dict[str, MetricResult] = Field(
        default_factory=dict
    )

    health_analysis: dict[str, MetricResult] = Field(
        default_factory=dict
    )

    final_answer: FinalAnswer = Field(
        default_factory=FinalAnswer
    )

    warnings: list[str] = Field(
        default_factory=list
    )

    analysis_version: str = "langgraph-v1"
