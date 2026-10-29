"""Read owner-scoped health analysis inputs and generated summaries."""

import asyncio

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Callable, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from backend.app.analysis_popups import POPUP_METRIC_KEYS, PopupResponse, fetch_popup_data
from backend.app.http_client import client_scope

KST = ZoneInfo("Asia/Seoul")

METRIC_NAMES = {
    "bmi": "BMI", "weight_kg": "체중", "body_fat_mass_kg": "체지방량",
    "body_fat_percentage": "체지방률", "skeletal_muscle_mass_kg": "골격근량",
    "fasting_glucose": "공복혈당", "systolic_bp": "수축기 혈압", "diastolic_bp": "이완기 혈압",
}
METRIC_ORDER = {key: index for index, key in enumerate((
    "body_fat_percentage", "skeletal_muscle_mass_kg", "fasting_glucose",
    "bmi", "systolic_bp", "diastolic_bp", "weight_kg", "body_fat_mass_kg",
))}


class DisplayText(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)


class AnalysisSummary(DisplayText):
    description: str = Field(min_length=1, max_length=2000)


class AnalysisGoal(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=500)


class AnalysisStrategy(DisplayText):
    tags: list[str] = Field(min_length=1, max_length=8)
    message: str = Field(min_length=1, max_length=1000)


class DietSuggestion(DisplayText):
    message: str = Field(min_length=1, max_length=1000)
    action_items: list[str] = Field(default_factory=list, max_length=5)
    evidence_metric_keys: list[str] = Field(default_factory=list, max_length=3)
    used_inventory_item_ids: list[UUID] = Field(default_factory=list, max_length=10)


class RefrigeratorContext(BaseModel):
    captured_at: datetime
    available_count: int = Field(ge=0)
    expiring_soon_count: int = Field(ge=0)
    allergy_excluded_count: int = Field(default=0, ge=0)
    used_items: list[str] = Field(default_factory=list, max_length=10)
    expiring_soon_items: list[str] = Field(default_factory=list, max_length=10)


class RecommendationReason(DisplayText):
    description: str = Field(min_length=1, max_length=2000)
    evidence_metric_keys: list[str] = Field(default_factory=list, max_length=8)


class FinalDirection(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    from_: str = Field(alias="from", min_length=1, max_length=500)
    to: str = Field(min_length=1, max_length=500)


class MainAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    headline: DisplayText
    summary: AnalysisSummary
    goal: AnalysisGoal
    strategy: AnalysisStrategy
    key_metric_keys: list[str] = Field(min_length=1, max_length=3)
    recommendation_reasons: list[RecommendationReason] = Field(min_length=1, max_length=10)
    final_direction: FinalDirection
    diet_suggestion: DietSuggestion | None = None
    refrigerator_context: RefrigeratorContext | None = None

    @model_validator(mode="after")
    def validate_metric_references(self):
        groups = [self.key_metric_keys] + [reason.evidence_metric_keys for reason in self.recommendation_reasons]
        if self.diet_suggestion is not None:
            groups.append(self.diet_suggestion.evidence_metric_keys)
        if any(len(keys) != len(set(keys)) or any(key not in POPUP_METRIC_KEYS for key in keys) for keys in groups):
            raise ValueError("Analysis metric references must match popup metric keys")
        return self


class MainAnalysisResponse(MainAnalysis):
    assessment_id: UUID


class HealthCheckupAnalysisInput(BaseModel):
    health_checkup_id: UUID
    checkup_date: date
    height_cm: Decimal | None = None
    weight_kg: Decimal | None = None
    bmi: Decimal | None = None
    systolic_bp: int | None = None
    diastolic_bp: int | None = None
    fasting_glucose: Decimal | None = None
    total_cholesterol: Decimal | None = None
    hdl_cholesterol: Decimal | None = None
    ldl_cholesterol: Decimal | None = None
    triglycerides: Decimal | None = None
    ast: Decimal | None = None
    alt: Decimal | None = None
    gamma_gtp: Decimal | None = None
    hemoglobin: Decimal | None = None
    creatinine: Decimal | None = None
    institution_name: str | None = None
    checkup_type: str | None = None


class BodyCompositionAnalysisInput(BaseModel):
    body_composition_id: UUID
    measured_at: datetime
    height_cm: Decimal | None = None
    weight_kg: Decimal | None = None
    skeletal_muscle_mass_kg: Decimal | None = None
    body_fat_mass_kg: Decimal | None = None
    body_fat_percentage: Decimal | None = None
    bmi: Decimal | None = None
    basal_metabolic_rate: Decimal | None = None
    visceral_fat_level: Decimal | None = None
    body_water_percentage: Decimal | None = None
    body_water_liters: Decimal | None = None
    protein_percentage: Decimal | None = None
    device_name: str | None = None


class FoodInventoryAnalysisInput(BaseModel):
    inventory_item_id: UUID
    name: str = Field(min_length=1, max_length=100)
    quantity: Decimal | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    purchased_on: date | None = None
    expires_on: date | None = None
    freshness_status: Literal["fresh", "expiring_soon", "unknown"]


class DietContextAnalysisInput(BaseModel):
    captured_at: datetime
    inventory: list[FoodInventoryAnalysisInput] = Field(default_factory=list, max_length=200)
    allergies: list[str] = Field(default_factory=list, max_length=24)


class AnalysisInputResponse(BaseModel):
    ready: bool
    missing: list[Literal["health_checkup", "body_composition"]]
    health_checkup: HealthCheckupAnalysisInput | None = None
    body_composition: BodyCompositionAnalysisInput | None = None
    diet_context: DietContextAnalysisInput


def prepare_inventory_snapshot(
    rows: list[dict[str, Any]],
    food_names: dict[str, str] | None = None,
    reference_date: date | None = None,
) -> list[FoodInventoryAnalysisInput]:
    """Normalize currently usable inventory without trusting stored freshness."""
    today = reference_date or datetime.now(KST).date()
    catalog = food_names or {}
    prepared: list[FoodInventoryAnalysisInput] = []
    for row in rows:
        if row.get("is_available") is False:
            continue
        quantity = row.get("quantity")
        if quantity is not None and Decimal(str(quantity)) <= 0:
            continue
        expires_on = date.fromisoformat(row["expires_on"]) if isinstance(row.get("expires_on"), str) else row.get("expires_on")
        if expires_on is not None and expires_on < today:
            continue
        name = row.get("custom_name") or catalog.get(str(row.get("food_item_id")))
        if not isinstance(name, str) or not name.strip():
            continue
        freshness = "unknown"
        if expires_on is not None:
            freshness = "expiring_soon" if (expires_on - today).days <= 3 else "fresh"
        prepared.append(FoodInventoryAnalysisInput(
            inventory_item_id=row.get("user_food_inventory_id"),
            name=name.strip(),
            quantity=quantity,
            unit=row.get("unit"),
            purchased_on=row.get("purchased_on"),
            expires_on=expires_on,
            freshness_status=freshness,
        ))
    return prepared


def build_diet_personalization(
    diet_context: DietContextAnalysisInput | dict | None,
    evidence_metric_keys: list[str],
) -> tuple[DietSuggestion | None, RefrigeratorContext | None]:
    """Build grounded copy from an assessment-time refrigerator snapshot."""
    if diet_context is None:
        return None, None
    try:
        context = DietContextAnalysisInput.model_validate(diet_context)
    except ValidationError:
        return None, None
    inventory = sorted(
        context.inventory,
        key=lambda item: (item.freshness_status != "expiring_soon", item.expires_on or date.max, item.name),
    )
    allergy_aliases = {
        "우유": {"우유", "요거트", "치즈"}, "유제품": {"우유", "요거트", "치즈"},
        "milk": {"우유", "요거트", "치즈"}, "dairy": {"우유", "요거트", "치즈"},
        "대두": {"대두", "콩", "두부"}, "콩": {"대두", "콩", "두부"}, "soy": {"대두", "콩", "두부"},
        "견과류": {"견과", "호두", "아몬드", "땅콩"}, "견과": {"견과", "호두", "아몬드", "땅콩"},
        "생선": {"생선", "연어", "고등어", "참치"}, "어류": {"생선", "연어", "고등어", "참치"},
    }
    normalized_allergies = {name.strip().casefold() for name in context.allergies if name.strip()}

    def conflicts(item: FoodInventoryAnalysisInput) -> bool:
        item_name = item.name.casefold()
        for allergy in normalized_allergies:
            if allergy in item_name or item_name in allergy:
                return True
            if any(alias.casefold() in item_name for alias in allergy_aliases.get(allergy, set())):
                return True
        return False

    safe_inventory = [item for item in inventory if not conflicts(item)]
    expiring = [item for item in safe_inventory if item.freshness_status == "expiring_soon"]
    selected = safe_inventory[:3]
    if selected:
        names = [item.name for item in selected]
        if expiring:
            message = f"유통기한이 가까운 {', '.join(item.name for item in expiring[:3])}부터 식사에 활용해 보세요."
        else:
            message = f"현재 보유한 {', '.join(names)}을 우선 활용하는 식사 구성을 제안해요."
        actions = [f"{name} 활용하기" for name in names]
    else:
        names = []
        message = "사용 가능한 냉장고 재료가 없어요. 재료를 등록하면 보유 식재료를 반영한 제안을 받을 수 있어요."
        actions = ["냉장고 재료 등록하기"]
    suggestion = DietSuggestion(
        title="Auto-Fit 냉장고 맞춤 제안",
        message=message,
        action_items=actions,
        evidence_metric_keys=evidence_metric_keys[:3],
        used_inventory_item_ids=[item.inventory_item_id for item in selected],
    )
    refrigerator = RefrigeratorContext(
        captured_at=context.captured_at,
        available_count=len(inventory),
        expiring_soon_count=len(expiring),
        allergy_excluded_count=len(inventory) - len(safe_inventory),
        used_items=names,
        expiring_soon_items=[item.name for item in expiring[:10]],
    )
    return suggestion, refrigerator


def attach_main_analysis(raw_result: dict, analysis: MainAnalysis | dict) -> dict:
    """Prepare a validated result for an assessment writer's existing transaction."""
    if not isinstance(raw_result, dict):
        raise ValueError("raw_result must be an object")
    validated = MainAnalysis.model_validate(analysis)
    return {**raw_result, "total_analysis": validated.model_dump(
        mode="json", by_alias=True, include=set(MainAnalysis.model_fields),
    )}


async def fetch_analysis_input(user_id: str, settings: Any) -> AnalysisInputResponse:
    """Return only the latest confirmed, owner-scoped values needed by an analyzer."""
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"

    async with client_scope() as client:
        async def latest(table: str, select: str, order: str) -> dict | None:
            try:
                response = await client.get(
                    f"{settings.supabase_url}/rest/v1/{table}",
                    headers=headers,
                    params={
                        "select": select,
                        "user_id": f"eq.{user_id}",
                        "order": order,
                        "limit": "1",
                    },
                    timeout=15,
                )
                response.raise_for_status()
                rows = response.json()
            except (httpx.HTTPError, ValueError):
                raise HTTPException(502, detail="건강 분석 입력 자료를 조회하지 못했습니다.") from None
            if not isinstance(rows, list) or len(rows) > 1 or any(not isinstance(row, dict) for row in rows):
                raise HTTPException(502, detail="건강 분석 입력 자료 형식을 확인할 수 없습니다.")
            return rows[0] if rows else None

        async def many(table: str, select: str, params: dict[str, str]) -> list[dict[str, Any]]:
            try:
                response = await client.get(
                    f"{settings.supabase_url}/rest/v1/{table}",
                    headers=headers,
                    params={"select": select, **params},
                    timeout=15,
                )
                response.raise_for_status()
                rows = response.json()
            except (httpx.HTTPError, ValueError):
                raise HTTPException(502, detail="건강 분석 입력 자료를 조회하지 못했습니다.") from None
            if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                raise HTTPException(502, detail="건강 분석 입력 자료 형식을 확인할 수 없습니다.")
            return rows

        checkup_row, body_row, inventory_rows, selected_allergies, allergy_catalog = await asyncio.gather(
            latest(
                "health_checkups",
                "health_checkup_id,checkup_date,height_cm,weight_kg,bmi,systolic_bp,diastolic_bp,"
                "fasting_glucose,total_cholesterol,hdl_cholesterol,ldl_cholesterol,triglycerides,"
                "ast,alt,gamma_gtp,hemoglobin,creatinine,institution_name,checkup_type",
                "checkup_date.desc,created_at.desc,health_checkup_id.desc",
            ),
            latest(
                "body_compositions",
                "body_composition_id,measured_at,height_cm,weight_kg,skeletal_muscle_mass_kg,"
                "body_fat_mass_kg,body_fat_percentage,bmi,basal_metabolic_rate,visceral_fat_level,"
                "body_water_percentage,body_water_liters,protein_percentage,device_name",
                "measured_at.desc,created_at.desc,body_composition_id.desc",
            ),
            many(
                "user_food_inventory",
                "user_food_inventory_id,food_item_id,custom_name,quantity,unit,purchased_on,expires_on,is_available",
                {"user_id": f"eq.{user_id}", "is_available": "eq.true", "order": "expires_on.asc.nullslast,created_at.asc"},
            ),
            many(
                "user_allergies",
                "allergy_type_id,custom_name",
                {"user_id": f"eq.{user_id}", "order": "created_at.asc"},
            ),
            many(
                "allergy_types",
                "allergy_type_id,name",
                {"is_active": "eq.true", "order": "name.asc"},
            ),
        )
        food_ids = sorted({str(row["food_item_id"]) for row in inventory_rows if row.get("food_item_id")})
        food_rows = await many(
            "food_items",
            "food_item_id,name",
            {"food_item_id": f"in.({','.join(food_ids)})"},
        ) if food_ids else []

    try:
        checkup = HealthCheckupAnalysisInput.model_validate(checkup_row) if checkup_row else None
        body = BodyCompositionAnalysisInput.model_validate(body_row) if body_row else None
    except ValidationError:
        raise HTTPException(502, detail="건강 분석 입력 자료 형식을 확인할 수 없습니다.") from None
    missing = []
    if checkup is None:
        missing.append("health_checkup")
    if body is None:
        missing.append("body_composition")
    food_names = {str(row.get("food_item_id")): row.get("name") for row in food_rows if row.get("name")}
    allergy_names = {str(row.get("allergy_type_id")): row.get("name") for row in allergy_catalog if row.get("name")}
    allergies = list(dict.fromkeys(
        name.strip()
        for row in selected_allergies
        if isinstance(name := (row.get("custom_name") or allergy_names.get(str(row.get("allergy_type_id")))), str)
        and name.strip()
    ))
    return AnalysisInputResponse(
        ready=not missing,
        missing=missing,
        health_checkup=checkup,
        body_composition=body,
        diet_context=DietContextAnalysisInput(
            captured_at=datetime.now(KST),
            inventory=prepare_inventory_snapshot(inventory_rows, food_names),
            allergies=allergies,
        ),
    )


def build_draft_analysis(assessment: dict, popup: PopupResponse) -> MainAnalysisResponse | None:
    """Use only confirmed assessment-time criteria for provisional screen copy."""
    if str(popup.assessment_id) != str(assessment.get("health_assessment_id")):
        return None
    snapshot = assessment.get("input_snapshot")
    if not isinstance(snapshot, dict):
        return None
    goal = snapshot.get("goal")
    if not isinstance(goal, dict) or not isinstance(goal.get("text"), str):
        return None
    goal_text = goal["text"].strip()
    if not goal_text or len(goal_text) > 500:
        return None
    eligible = [m for m in popup.metrics if m.display_value is not None and m.criteria_id
                and m.source_ids and m.status in {"low", "normal", "caution", "high"}]
    if not eligible:
        return None
    eligible.sort(key=lambda m: (0 if m.status in {"low", "high"} else 1 if m.status == "caution" else 2,
                                 METRIC_ORDER.get(m.key, 99)))
    important = eligible[:3]
    by_key = {m.key: m for m in eligible}
    special = (goal.get("goal_type") == "weight_loss" and goal.get("short_term") is True
               and by_key.get("body_fat_percentage") and by_key["body_fat_percentage"].status == "high"
               and by_key.get("skeletal_muscle_mass_kg") and by_key["skeletal_muscle_mass_kg"].status == "low"
               and by_key.get("fasting_glucose") and by_key["fasting_glucose"].status == "caution")
    if special:
        important = [by_key[key] for key in ("body_fat_percentage", "skeletal_muscle_mass_kg", "fasting_glucose")]
        reasons = [
            RecommendationReason(title="체중 외 지표도 살펴봤어요",
                                 description="체지방률과 골격근량의 판정을 함께 확인했어요.",
                                 evidence_metric_keys=["body_fat_percentage", "skeletal_muscle_mass_kg"]),
            RecommendationReason(title="공복혈당도 함께 확인했어요",
                                 description="공복혈당에 주의 판정이 적용돼 식사·활동 계획을 검토할 때 참고해요.",
                                 evidence_metric_keys=["fasting_glucose"]),
        ]
        summary = AnalysisSummary(title="이번 분석에서는 체성분과 공복혈당을 함께 확인했어요",
                                  description="체지방률은 높음, 골격근량은 낮음, 공복혈당은 주의로 평가됐어요. 각 판정에 적용된 기준도 확인할 수 있어요.")
        strategy = AnalysisStrategy(title="체성분과 공복혈당을 함께 고려한 감량 방향",
                                    tags=["체성분 확인", "근육량 확인", "식사·활동 점검"],
                                    message="목표 기간과 이번 측정 결과를 함께 보고 실행 계획을 정해요.")
        direction = "측정 결과를 함께 고려한 감량 계획"
    else:
        relevant = [m for m in important if m.status != "normal"] or important[:1]
        reasons = [RecommendationReason(
            title=f"{METRIC_NAMES.get(m.key, m.key)} 판정을 확인했어요",
            description=f"{METRIC_NAMES.get(m.key, m.key)}은 {m.status_label}으로 평가됐어요. 적용된 기준을 함께 확인해요.",
            evidence_metric_keys=[m.key],
        ) for m in relevant]
        summary = AnalysisSummary(title="이번 분석에서 확인된 지표를 살펴봐요",
                                  description=" · ".join(f"{METRIC_NAMES.get(m.key, m.key)} {m.status_label}" for m in important))
        strategy = AnalysisStrategy(title="확인된 지표를 함께 고려한 목표 점검",
                                    tags=["평가 결과 확인", "목표 점검"],
                                    message="평가 당시 목표와 확인된 지표를 함께 살펴봐요.")
        direction = "확인된 지표를 함께 고려한 계획"
    metric_keys = [m.key for m in important]
    diet_suggestion, refrigerator_context = build_diet_personalization(
        snapshot.get("diet_context"), metric_keys
    )
    return MainAnalysisResponse(
        assessment_id=assessment["health_assessment_id"],
        headline=DisplayText(title="목표는 이어가되, 현재 상태를 함께 살펴봐요"),
        summary=summary, goal=AnalysisGoal(text=goal_text), strategy=strategy,
        key_metric_keys=metric_keys, recommendation_reasons=reasons,
        final_direction=FinalDirection.model_validate({"from": goal_text, "to": direction}),
        diet_suggestion=diet_suggestion,
        refrigerator_context=refrigerator_context,
    )


async def fetch_main_analysis(user_id: str, settings: Any) -> MainAnalysisResponse:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with client_scope() as client:
            response = await client.get(
                f"{settings.supabase_url}/rest/v1/health_assessments",
                headers=headers,
                params={
                    "select": "health_assessment_id,input_snapshot,raw_result",
                    "user_id": f"eq.{user_id}",
                    "assessed_at": f"lte.{datetime.now(UTC).isoformat()}",
                    "order": "assessed_at.desc,health_assessment_id.desc",
                    "limit": "1",
                },
                timeout=15,
            )
            response.raise_for_status()
            rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="건강 분석 자료를 조회하지 못했습니다.") from None
    if not isinstance(rows, list) or len(rows) > 1 or any(not isinstance(row, dict) for row in rows):
        raise HTTPException(502, detail="건강 분석 자료 형식을 확인할 수 없습니다.")
    if not rows:
        raise HTTPException(404, detail="건강 평가를 찾을 수 없습니다.")
    row = rows[0]
    result = row.get("raw_result")
    if not isinstance(result, dict):
        raise HTTPException(502, detail="건강 분석 자료 형식을 확인할 수 없습니다.")
    saved = result.get("total_analysis")
    if saved is None:
        try:
            assessment_id = UUID(str(row.get("health_assessment_id")))
        except (TypeError, ValueError):
            raise HTTPException(502, detail="건강 분석 자료 형식을 확인할 수 없습니다.") from None
        popup = await fetch_popup_data(assessment_id, user_id, settings)
        draft = build_draft_analysis(row, popup)
        if draft is None:
            raise HTTPException(404, detail="종합 분석 결과가 아직 없습니다.")
        return draft
    if not isinstance(saved, dict):
        raise HTTPException(502, detail="종합 분석 결과 형식을 확인할 수 없습니다.")
    try:
        return MainAnalysisResponse.model_validate({**saved, "assessment_id": row.get("health_assessment_id")})
    except ValidationError:
        raise HTTPException(502, detail="종합 분석 결과 형식을 확인할 수 없습니다.") from None


async def refresh_diet_personalization(
    assessment_id: UUID,
    user_id: str,
    settings: Any,
) -> MainAnalysisResponse:
    """Snapshot current diet context and merge it into an existing assessment."""
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with client_scope() as client:
            response = await client.get(
                f"{settings.supabase_url}/rest/v1/health_assessments",
                headers=headers,
                params={
                    "select": "health_assessment_id,input_snapshot,raw_result",
                    "health_assessment_id": f"eq.{assessment_id}",
                    "user_id": f"eq.{user_id}",
                    "limit": "1",
                },
                timeout=15,
            )
            response.raise_for_status()
            rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="건강 분석 자료를 조회하지 못했습니다.") from None
    if not isinstance(rows, list) or len(rows) > 1 or any(not isinstance(row, dict) for row in rows):
        raise HTTPException(502, detail="건강 분석 자료 형식을 확인할 수 없습니다.")
    if not rows:
        raise HTTPException(404, detail="건강 평가를 찾을 수 없습니다.")
    row = rows[0]
    snapshot = row.get("input_snapshot")
    raw_result = row.get("raw_result")
    if not isinstance(snapshot, dict) or not isinstance(raw_result, dict):
        raise HTTPException(502, detail="건강 분석 자료 형식을 확인할 수 없습니다.")

    saved = raw_result.get("total_analysis")
    if saved is None:
        popup = await fetch_popup_data(assessment_id, user_id, settings)
        draft = build_draft_analysis(row, popup)
        if draft is None:
            raise HTTPException(409, detail="맞춤 제안을 연결할 종합 분석 결과가 아직 없습니다.")
        base_analysis = MainAnalysis.model_validate(draft.model_dump(mode="json", by_alias=True))
    elif isinstance(saved, dict):
        try:
            base_analysis = MainAnalysis.model_validate(saved)
        except ValidationError:
            raise HTTPException(502, detail="종합 분석 결과 형식을 확인할 수 없습니다.") from None
    else:
        raise HTTPException(502, detail="종합 분석 결과 형식을 확인할 수 없습니다.")

    analysis_input = await fetch_analysis_input(user_id, settings)
    diet_context = analysis_input.diet_context
    diet_suggestion, refrigerator_context = build_diet_personalization(
        diet_context, base_analysis.key_metric_keys
    )
    updated_analysis = MainAnalysis.model_validate({
        **base_analysis.model_dump(mode="json", by_alias=True),
        "diet_suggestion": diet_suggestion.model_dump(mode="json") if diet_suggestion else None,
        "refrigerator_context": refrigerator_context.model_dump(mode="json") if refrigerator_context else None,
    })
    try:
        async with client_scope() as client:
            response = await client.post(
                f"{settings.supabase_url}/rest/v1/rpc/refresh_health_assessment_personalization",
                headers=headers,
                json={
                    "p_user_id": user_id,
                    "p_assessment_id": str(assessment_id),
                    "p_diet_context": diet_context.model_dump(mode="json"),
                    "p_total_analysis": updated_analysis.model_dump(mode="json", by_alias=True),
                },
                timeout=15,
            )
            response.raise_for_status()
            updated_row = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="맞춤 제안 저장에 실패했습니다.") from None
    if not isinstance(updated_row, dict) or str(updated_row.get("health_assessment_id")) != str(assessment_id):
        raise HTTPException(502, detail="맞춤 제안 저장 결과를 확인할 수 없습니다.")
    return MainAnalysisResponse.model_validate({
        **updated_analysis.model_dump(mode="json", by_alias=True),
        "assessment_id": assessment_id,
    })


def create_analysis_summary_router(current_user_dependency: Callable, settings_dependency: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/health-assessments", tags=["Health Analysis"], dependencies=[Depends(HTTPBearer(auto_error=False))])

    @router.get(
        "/input", response_model=AnalysisInputResponse, summary="건강검진·인바디 통합 분석 입력 조회",
        description="본인의 확정된 최신 건강검진 OCR 값, 인바디, 사용 가능한 냉장고 재료와 알레르기를 한 응답으로 반환합니다. 두 건강 자료가 모두 있으면 ready=true이며, 누락 자료는 missing에 표시합니다.",
        responses={401: {"description": "로그인 필요"}, 502: {"description": "자료 조회 또는 저장 형식 오류"}},
    )
    async def analysis_input(user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency)):
        return await fetch_analysis_input(user.id, settings)

    @router.get(
        "/latest", response_model=MainAnalysisResponse, summary="최신 종합 건강 분석 결과 조회",
        responses={401: {"description": "로그인 필요"}, 404: {"description": "평가 또는 생성 가능한 종합 분석 없음"},
                   502: {"description": "자료 조회 또는 저장 형식 오류"}},
    )
    async def latest_analysis(user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency)):
        return await fetch_main_analysis(user.id, settings)

    @router.post(
        "/{assessment_id}/diet-personalization/refresh",
        response_model=MainAnalysisResponse,
        summary="건강 평가의 냉장고 맞춤 제안 갱신",
        description="본인 평가의 건강 분석은 유지하고 현재 냉장고 재료와 알레르기를 스냅샷해 식단 맞춤 제안만 갱신합니다.",
        responses={
            401: {"description": "로그인 필요"},
            404: {"description": "본인 평가 없음"},
            409: {"description": "종합 분석 결과 미준비"},
            502: {"description": "자료 조회 또는 저장 실패"},
        },
    )
    async def refresh_personalization(
        assessment_id: UUID,
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ):
        return await refresh_diet_personalization(assessment_id, user.id, settings)

    return router
