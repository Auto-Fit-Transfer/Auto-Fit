"""Read-only, owner-scoped popup data for an existing health assessment."""

import asyncio

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import UTC, datetime
from typing import Any, Callable, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field, ValidationError

from backend.app.http_client import client_scope

VERSION = "1.0.0"
CRITERIA_VERSION = "verified-2026-09-17"
Status = Literal["low", "normal", "caution", "high", "unknown", "review_required"]
POPUP_METRIC_KEYS = frozenset({
    "bmi", "weight_kg", "body_fat_mass_kg", "body_fat_percentage",
    "skeletal_muscle_mass_kg", "fasting_glucose", "systolic_bp", "diastolic_bp",
})


class Range(BaseModel):
    status: Status
    min: str | None = None
    min_inclusive: bool = True
    max: str | None = None
    max_inclusive: bool = False


class Metric(BaseModel):
    key: str
    raw_value: str | None = None
    display_value: str | None = None
    unit: str
    value_origin: Literal["reported", "calculated"] = "reported"
    measured_at: str | None = None
    status: Status = "unknown"
    status_label: str = "판정 보류"
    criteria_id: str | None = None
    criteria_version: str | None = None
    criteria_type: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    applied_conditions: dict[str, Any] = Field(default_factory=dict)
    ranges: list[Range] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    discrepancy: dict[str, str] | None = None


class Source(BaseModel):
    source_id: str
    publisher: str
    title: str
    url: str | None = None
    published_at: str | None = None
    revised_at: str | None = None
    verified_at: str = "2026-09-17"
    source_type: str
    applied_metric_keys: list[str] = Field(default_factory=list)
    applied_excerpt_summary: str


class Interpretation(BaseModel):
    rule_id: str
    text: str
    evidence_metric_keys: list[str] = Field(default_factory=list)


class PopupResponse(BaseModel):
    assessment_id: UUID
    calculation_version: str = VERSION
    body_composition_id: UUID | None = None
    health_checkup_id: UUID | None = None
    criteria_snapshot_available: bool = False
    metrics: list[Metric]
    interpretation: Interpretation
    sources: list[Source]


class AssessmentRecord(BaseModel):
    health_assessment_id: UUID
    body_composition_id: UUID | None = None
    health_checkup_id: UUID | None = None
    input_snapshot: dict = Field(default_factory=dict)
    raw_result: dict = Field(default_factory=dict)


SOURCES = {
    "S1": dict(publisher="김포시보건소", title="비만도 계산",
               url="https://www.gimpo.go.kr/health/contents.do?key=9977",
               source_type="government_information", applied_excerpt_summary="성인 BMI 계산과 정상·과체중·비만 경계"),
    "S2": dict(publisher="InBody UK", title="Body composition analysis",
               url="https://uk.inbody.com/body-composition-analysis/",
               source_type="manufacturer_reference", applied_excerpt_summary="남성 10~20%, 여성 18~28% 제조사 참고 범위"),
    "S3": dict(publisher="질병관리청", title="당뇨병",
               url="https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=5305",
               source_type="government_information", applied_excerpt_summary="공복혈당 100 미만, 100 이상 126 미만, 126 이상 선별 구간"),
    "S4": dict(publisher="질병관리청", title="고혈압",
               url="https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=6765",
               source_type="government_information", applied_excerpt_summary="정상혈압 및 고혈압 경계; 단일 측정은 확정 진단이 아님"),
}


def number(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
        return result if result.is_finite() and abs(result) <= 100000 else None
    except (InvalidOperation, ValueError):
        return None


def display(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def interval(status: Status, low: str | None, high: str | None,
             low_inclusive: bool = True, high_inclusive: bool = False) -> Range:
    return Range(status=status, min=low, max=high, min_inclusive=low_inclusive, max_inclusive=high_inclusive)


def classify(value: Decimal, ranges: list[Range]) -> Status:
    for r in ranges:
        low, high = number(r.min), number(r.max)
        if low is not None and (value < low or (value == low and not r.min_inclusive)):
            continue
        if high is not None and (value > high or (value == high and not r.max_inclusive)):
            continue
        return r.status
    return "review_required"


def build_popups(assessment: dict, body: dict | None, checkup: dict | None) -> PopupResponse:
    # Only an evaluation-time snapshot may enable criteria. Never use today's profile.
    snapshot = assessment.get("input_snapshot")
    snapshot = snapshot if isinstance(snapshot, dict) else {}
    b = snapshot.get("body_composition", body or {})
    c = snapshot.get("health_checkup", checkup or {})
    b = b if isinstance(b, dict) else {}
    c = c if isinstance(c, dict) else {}
    context = snapshot.get("popup_context", {})
    context = context if isinstance(context, dict) else {}
    result = assessment.get("raw_result")
    result = result if isinstance(result, dict) else {}
    saved = result.get("popup_criteria", {})
    saved = saved if isinstance(saved, dict) else {}
    adult = context.get("adult_eligibility_confirmed") is True
    metrics: list[Metric] = []
    specs = [
        ("bmi", "kg/m²", b, "measured_at"),
        ("weight_kg", "kg", b, "measured_at"),
        ("body_fat_mass_kg", "kg", b, "measured_at"),
        ("body_fat_percentage", "%", b, "measured_at"),
        ("skeletal_muscle_mass_kg", "kg", b, "measured_at"),
        ("fasting_glucose", "mg/dL", c, "checkup_date"),
        ("systolic_bp", "mmHg", c, "checkup_date"),
        ("diastolic_bp", "mmHg", c, "checkup_date"),
    ]
    w, h, f, p = [number(b.get(k)) for k in ("weight_kg", "height_cm", "body_fat_mass_kg", "body_fat_percentage")]
    calculations = {}
    if w is not None and 0 < w <= 500:
        if h is not None and 50 <= h <= 300:
            calculations["bmi"] = w / (h / 100) ** 2
        if p is not None and 0 <= p <= 100:
            calculations["body_fat_mass_kg"] = w * p / 100
        if f is not None and 0 <= f <= w:
            calculations["body_fat_percentage"] = f / w * 100

    for key, unit, data, date_key in specs:
        original = data.get(key)
        v = number(original)
        calculated = calculations.get(key)
        m = Metric(key=key, unit=unit, measured_at=str(data[date_key]) if data.get(date_key) else None)
        if original is not None and v is None:
            m.status = "review_required"
        elif v is None and calculated is not None:
            v = calculated
            m.value_origin = "calculated"
        if v is not None:
            m.raw_value, m.display_value = str(v), display(v)
            maximum = {"bmi": 100, "weight_kg": 500, "body_fat_percentage": 100,
                       "body_fat_mass_kg": 300, "skeletal_muscle_mass_kg": 300,
                       "fasting_glucose": 2000, "systolic_bp": 300, "diastolic_bp": 200}[key]
            if v < 0 or v > maximum or (key in {"bmi", "weight_kg", "fasting_glucose", "systolic_bp", "diastolic_bp"} and v == 0):
                m.status = "review_required"
            if m.value_origin == "reported" and calculated is not None and display(v) != display(calculated):
                m.discrepancy = {"reported": str(v), "calculated": str(calculated)}
        else:
            m.missing_fields = [key]
        metrics.append(m)

    by_key = {m.key: m for m in metrics}
    if b.get("weight_kg") is not None and (w is None or not 1 <= w <= 500):
        for key in ("bmi", "weight_kg", "body_fat_mass_kg", "body_fat_percentage", "skeletal_muscle_mass_kg"):
            by_key[key].status = "review_required"
    if b.get("height_cm") is not None and (h is None or not 50 <= h <= 300):
        by_key["bmi"].status = "review_required"
    muscle = number(b.get("skeletal_muscle_mass_kg"))
    if w is not None and ((f is not None and f > w) or (muscle is not None and muscle > w)):
        for key in ("body_fat_mass_kg", "body_fat_percentage", "skeletal_muscle_mass_kg"):
            by_key[key].status = "review_required"
    if (b.get("body_fat_mass_kg") is not None and (f is None or not 0 <= f <= 300)) or (b.get("body_fat_percentage") is not None and (p is None or not 0 <= p <= 100)):
        by_key["body_fat_mass_kg"].status = by_key["body_fat_percentage"].status = "review_required"
    sv, dv = number(c.get("systolic_bp")), number(c.get("diastolic_bp"))
    if sv is not None and dv is not None and sv <= dv:
        by_key["systolic_bp"].status = by_key["diastolic_bp"].status = "review_required"

    report_sources: dict[str, Source] = {}
    for m in metrics:
        rule = saved.get(m.key)
        if not isinstance(rule, dict) or rule.get("criteria_id") != "measurement-report-reference":
            continue
        if rule.get("version") != "measurement-report-v1" or rule.get("report_verified") is not True:
            continue
        record_id = assessment.get("body_composition_id") if m.key in {"bmi", "body_fat_percentage", "skeletal_muscle_mass_kg"} else assessment.get("health_checkup_id")
        if m.key in {"weight_kg", "body_fat_mass_kg"} or not record_id or str(rule.get("record_id")) != str(record_id):
            continue
        if m.raw_value is None or m.status == "review_required":
            continue
        low, high = number(rule.get("lower")), number(rule.get("upper"))
        status = rule.get("reported_status")
        if low is not None and high is not None and 0 <= low <= high:
            m.ranges = [interval("low", None, str(low)), interval("normal", str(low), str(high), True, True), interval("high", str(high), None, False)]
            m.status = classify(Decimal(m.raw_value), m.ranges)
            if isinstance(status, str) and status in {"low", "normal", "caution", "high"} and status != m.status:
                m.status = "review_required"
        elif isinstance(status, str) and status in {"low", "normal", "caution", "high"}:
            m.status = status  # No invented ranges when only a report label exists.
        else:
            continue
        m.criteria_id, m.criteria_version, m.criteria_type = "measurement-report-reference", "measurement-report-v1", "measurement_report"
        sid = f"measurement-report-{record_id}"
        m.source_ids = [sid]
        publisher = rule.get("publisher")
        title = rule.get("title")
        report_sources[sid] = Source(source_id=sid, publisher=publisher[:200] if isinstance(publisher, str) else "측정기관", title=title[:200] if isinstance(title, str) else "확인된 측정 결과지", source_type="measurement_report", applied_excerpt_summary="해당 측정 기록의 확인된 판정·참고 범위. 범위가 없는 경우 판정만 인용합니다.")

    for m in metrics:
        rule = saved.get(m.key)
        if not isinstance(rule, dict) or rule.get("version") != CRITERIA_VERSION or not adult or m.criteria_id:
            continue
        if m.raw_value is None or m.status == "review_required":
            continue
        cid = rule.get("criteria_id")
        ranges, source = [], None
        if m.key == "bmi" and cid == "kr-adult-bmi":
            ranges = [interval("low", None, "18.5"), interval("normal", "18.5", "23"),
                      interval("caution", "23", "25"), interval("high", "25", None)]
            source = "S1"
        elif m.key == "body_fat_percentage" and context.get("inbody_record_verified") is True:
            sex = context.get("sex")
            if isinstance(sex, str) and sex in {"male", "female"} and cid == f"inbody-public-pbf-adult-{sex}":
                low, high = ("10", "20") if sex == "male" else ("18", "28")
                ranges = [interval("low", "0", low), interval("normal", low, high, True, True),
                          interval("high", high, "100", False, True)]
                source = "S2"
        elif m.key == "fasting_glucose" and cid == "kdca-fasting-glucose" and context.get("fasting_confirmed") is True:
            # Low-side alerts must be explicitly reviewed before enabling this simplified rule.
            if context.get("glucose_low_side_reviewed") is True:
                ranges = [interval("normal", "0", "100"), interval("caution", "100", "126"), interval("high", "126", None)]
                source = "S3"
        elif m.key in {"systolic_bp", "diastolic_bp"} and cid == "kdca-blood-pressure" and context.get("bp_low_side_reviewed") is True:
            sbp, dbp = by_key["systolic_bp"], by_key["diastolic_bp"]
            if sbp.raw_value is not None and dbp.raw_value is not None and sbp.status != "review_required" and dbp.status != "review_required":
                sv, dv = Decimal(sbp.raw_value), Decimal(dbp.raw_value)
                if sv <= dv:
                    sbp.status = dbp.status = "review_required"
                    continue
                m.status = "high" if sv >= 140 or dv >= 90 else "normal" if sv < 120 and dv < 80 else "caution"
                source = "S4"
        if source:
            m.criteria_id, m.criteria_version = cid, CRITERIA_VERSION
            m.criteria_type = SOURCES[source]["source_type"]
            m.source_ids = [source]
            m.applied_conditions = {k: context[k] for k in ("adult_eligibility_confirmed", "inbody_record_verified", "fasting_confirmed", "glucose_low_side_reviewed", "bp_low_side_reviewed") if isinstance(context.get(k), bool)}
            if isinstance(context.get("sex"), str) and context["sex"] in {"male", "female"}:
                m.applied_conditions["sex"] = context["sex"]
            m.ranges = ranges
            if ranges:
                m.status = classify(Decimal(m.raw_value), ranges)
                calculated = calculations.get(m.key)
                if m.value_origin == "reported" and calculated is not None and classify(calculated, ranges) != m.status:
                    m.discrepancy = {"reported": m.raw_value, "calculated": str(calculated)}
                    m.status = "review_required"

    # kg of fat has no universal threshold; the source percentage is shown separately.
    labels = {"low": "낮음", "normal": "정상", "caution": "주의", "high": "높음", "unknown": "판정 보류", "review_required": "확인 필요"}
    for m in metrics:
        calculated = calculations.get(m.key)
        if m.ranges and m.value_origin == "reported" and calculated is not None and m.status != "review_required" and classify(calculated, m.ranges) != m.status:
            m.discrepancy = {"reported": m.raw_value, "calculated": str(calculated)}
            m.status = "review_required"
        m.status_label = labels[m.status]
        if m.raw_value is None and m.status == "unknown":
            m.status_label = "측정값 없음"
    if by_key["bmi"].criteria_id == "kr-adult-bmi":
        by_key["bmi"].status_label = {"low": "저체중", "caution": "과체중", "high": "비만 범위"}.get(by_key["bmi"].status, by_key["bmi"].status_label)
    if by_key["fasting_glucose"].criteria_id == "kdca-fasting-glucose":
        by_key["fasting_glucose"].status_label = {"normal": "공복혈당 정상 범위", "caution": "주의 · 공복혈당장애 범위", "high": "당뇨병 의심 범위"}.get(by_key["fasting_glucose"].status, by_key["fasting_glucose"].status_label)

    body_metrics = [by_key[k] for k in ("bmi", "body_fat_percentage", "skeletal_muscle_mass_kg")]
    if any(m.status == "review_required" for m in metrics):
        interpretation = Interpretation(rule_id="confirm_values", text="입력값과 적용 기준을 확인한 후 해석할 수 있어요.")
    elif by_key["bmi"].status == "normal" and by_key["body_fat_percentage"].status == "high":
        muscle_status = by_key["skeletal_muscle_mass_kg"].status
        text = "BMI는 정상 범위지만 체지방률은 높게 평가됐어요."
        if muscle_status == "low":
            text += " 골격근량은 낮게 평가됐어요. 체중과 함께 체성분을 확인해요."
        elif muscle_status == "unknown":
            text += " 골격근량은 적용 기준 확인이 필요해요."
        else:
            text += " 체중과 함께 체성분을 확인해요."
        interpretation = Interpretation(rule_id="normal_bmi_high_fat", text=text, evidence_metric_keys=["bmi", "body_fat_percentage"] + (["skeletal_muscle_mass_kg"] if muscle_status == "low" else []))
    elif all(m.status == "normal" for m in body_metrics):
        interpretation = Interpretation(rule_id="all_body_metrics_normal", text="확인된 체성분 지표는 적용 기준의 정상 범위예요.", evidence_metric_keys=[m.key for m in body_metrics])
    elif any(m.status in {"low", "caution", "high"} for m in body_metrics):
        interpretation = Interpretation(rule_id="outside_reference", text="정상 범위를 벗어난 지표가 있어요. 각 지표의 기준을 함께 확인해요.", evidence_metric_keys=[m.key for m in body_metrics if m.status in {"low", "caution", "high"}])
    else:
        interpretation = Interpretation(rule_id="insufficient_criteria", text="현재 자료만으로 체성분을 충분히 해석하기 어려워요.")
    used = {s for m in metrics for s in m.source_ids}
    sources = []
    for s in sorted(used):
        source = report_sources[s] if s in report_sources else Source(source_id=s, **SOURCES[s])
        source.applied_metric_keys = [m.key for m in metrics if s in m.source_ids]
        sources.append(source)
    return PopupResponse(assessment_id=assessment["health_assessment_id"], body_composition_id=assessment.get("body_composition_id"), health_checkup_id=assessment.get("health_checkup_id"), criteria_snapshot_available=bool(used), metrics=metrics, interpretation=interpretation, sources=sources)


async def fetch_popup_data(assessment_id: UUID | None, user_id: str, settings: Any) -> PopupResponse:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    async with client_scope() as client:
        async def row(table: str, params: dict) -> dict | None:
            try:
                response = await client.get(
                    f"{settings.supabase_url}/rest/v1/{table}",
                    headers=headers,
                    params={"user_id": f"eq.{user_id}", "limit": "1", **params},
                    timeout=15,
                )
                response.raise_for_status()
                rows = response.json()
                if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
                    raise ValueError()
                return rows[0] if rows else None
            except (httpx.HTTPError, ValueError):
                raise HTTPException(502, detail="건강 분석 자료를 조회하지 못했습니다.") from None
        query = {"select": "health_assessment_id,body_composition_id,health_checkup_id,input_snapshot,raw_result", "order": "assessed_at.desc,health_assessment_id.desc"}
        if assessment_id is not None:
            query["health_assessment_id"] = f"eq.{assessment_id}"
        else:
            query["assessed_at"] = f"lte.{datetime.now(UTC).isoformat()}"
        assessment = await row("health_assessments", query)
        if assessment is None:
            raise HTTPException(404, detail="건강 평가를 찾을 수 없습니다.")
        try:
            assessment = AssessmentRecord.model_validate(assessment).model_dump(mode="json")
        except ValidationError:
            raise HTTPException(502, detail="건강 평가 자료 형식을 확인할 수 없습니다.") from None
        async def body_row() -> dict | None:
            if not assessment.get("body_composition_id"):
                return None
            return await row("body_compositions", {"select": "measured_at,height_cm,weight_kg,bmi,body_fat_mass_kg,body_fat_percentage,skeletal_muscle_mass_kg", "body_composition_id": f"eq.{assessment['body_composition_id']}"})

        async def checkup_row() -> dict | None:
            if not assessment.get("health_checkup_id"):
                return None
            return await row("health_checkups", {"select": "checkup_date,fasting_glucose,systolic_bp,diastolic_bp", "health_checkup_id": f"eq.{assessment['health_checkup_id']}"})

        body, checkup = await asyncio.gather(body_row(), checkup_row())
        # A dangling or cross-owner link must not expose snapshot health values either.
        if (assessment.get("body_composition_id") and body is None) or (assessment.get("health_checkup_id") and checkup is None):
            raise HTTPException(404, detail="연결된 건강 자료를 찾을 수 없습니다.")
        return build_popups(assessment, body, checkup)


def create_analysis_popups_router(current_user_dependency: Callable, settings_dependency: Callable) -> APIRouter:
    # HTTPBearer documents Swagger's Authorize button; the existing user dependency
    # remains the only authentication authority and rejects missing/invalid tokens.
    router = APIRouter(prefix="/api/health-assessments", tags=["Health Analysis"], dependencies=[Depends(HTTPBearer(auto_error=False))])

    @router.get("/latest/popups", response_model=PopupResponse, summary="최신 건강 평가의 팝업 데이터 조회", responses={401: {"description": "로그인 필요"}, 404: {"description": "평가 없음"}, 502: {"description": "자료 조회 실패"}})
    async def latest_popups(user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency)):
        return await fetch_popup_data(None, user.id, settings)

    @router.get("/{assessment_id}/popups", response_model=PopupResponse, summary="건강 평가의 체성분·판정 기준·출처 팝업 데이터 조회", description="본인 평가만 조회합니다. 평가 당시 기준 스냅샷이 없으면 수치는 표시하고 판정은 보류합니다. 최신 프로필이나 예시 기준으로 과거 평가를 다시 판정하지 않습니다.", responses={401: {"description": "로그인 필요"}, 404: {"description": "본인 평가 또는 연결 자료 없음"}, 502: {"description": "자료 조회 실패"}})
    async def assessment_popups(assessment_id: UUID, user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency)):
        return await fetch_popup_data(assessment_id, user.id, settings)

    return router
