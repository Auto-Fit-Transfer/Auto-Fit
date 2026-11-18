"""Generate a health assessment from confirmed measurements, never OCR source data."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, model_validator

from backend.app.account_deletion import service_headers
from backend.app.ai_server import AIEndpoint, AIServerClient, get_ai_server_config
from backend.app.analysis_summary import MainAnalysis, fetch_analysis_input
from backend.app.http_client import client_scope

KST = ZoneInfo("Asia/Seoul")
logger = logging.getLogger(__name__)


class ScoreSection(BaseModel):
    status: Literal["available", "unavailable"]
    score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    maximum: int = Field(default=100, ge=1)
    message: str
    breakdown: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def score_matches_status(self) -> "ScoreSection":
        if (self.status == "available") != (self.score is not None):
            raise ValueError("Health score section status and score disagree")
        return self


class ScoreTrend(BaseModel):
    previous_score: float = Field(ge=0, le=100, allow_inf_nan=False)
    current_score: float = Field(ge=0, le=100, allow_inf_nan=False)
    score_delta: float = Field(ge=-100, le=100, allow_inf_nan=False)
    trend: Literal["improved", "unchanged", "declined"]


class SectionTrends(BaseModel):
    diet: ScoreTrend
    exercise: ScoreTrend
    health_data: ScoreTrend


class ChangeReason(BaseModel):
    section: Literal["diet", "exercise", "health_data"]
    trend: Literal["improved", "unchanged", "declined"]
    title: str
    message: str


class PriorityAction(BaseModel):
    section: Literal["diet", "exercise", "health_data"]
    priority: int = Field(ge=1, le=3)
    title: str
    message: str


class MetricAdjustment(BaseModel):
    metric_key: str
    baseline_value: float = Field(allow_inf_nan=False)
    current_value: float = Field(allow_inf_nan=False)
    unit: str
    trend: Literal["improved", "unchanged", "declined"]
    normalized_change: float = Field(ge=-1, le=1, allow_inf_nan=False)


class GeneratedScore(BaseModel):
    status: Literal["available", "unavailable"]
    total_score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    maximum: int = Field(default=100, ge=1)
    scoring_version: str
    tier: Literal["CORE", "BALANCE", "ACTIVE", "FIT", "PEAK"] | None = None
    tier_level: int | None = Field(default=None, ge=1, le=2)
    comparison_status: Literal["available", "not_provided", "current_score_unavailable", "version_mismatch"] = "not_provided"
    previous_total_score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    score_delta: float | None = Field(default=None, ge=-100, le=100, allow_inf_nan=False)
    trend: Literal["improved", "unchanged", "declined"] | None = None
    section_trends: SectionTrends | None = None
    change_reasons: list[ChangeReason] = Field(default_factory=list)
    priority_actions: list[PriorityAction] = Field(default_factory=list)
    diet: ScoreSection
    exercise: ScoreSection
    health_data: ScoreSection
    health_metric_adjustments: list[MetricAdjustment] = Field(default_factory=list)

    @model_validator(mode="after")
    def total_matches_status(self) -> "GeneratedScore":
        if (self.status == "available") != (self.total_score is not None):
            raise ValueError("Total health score status and value disagree")
        if self.status == "available" and any(
            section.status != "available" for section in (self.diet, self.exercise, self.health_data)
        ):
            raise ValueError("A total score requires all three areas")
        if self.status == "unavailable" and all(
            section.status == "available" for section in (self.diet, self.exercise, self.health_data)
        ):
            raise ValueError("A missing total requires an unavailable area")
        return self


class GeneratedAnalysis(MainAnalysis):
    health_score: GeneratedScore


class ModelInfo(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    version: str = Field(min_length=1, max_length=200)


class GeneratedReply(BaseModel):
    schema_version: Literal["1.0"]
    request_id: str
    analysis: GeneratedAnalysis
    model: ModelInfo


def weekly_diet_score_context(days: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Use seven complete targets and measured meals; never fill missing targets with zeroes."""
    if len(days) != 7:
        return None
    result = []
    dates = []
    fields = (("calories", "calories_kcal"), ("carbohydrates", "carbohydrate_g"),
              ("protein", "protein_g"), ("fat", "fat_g"))
    for day in days:
        try:
            date = datetime.fromisoformat(day["date"]).date()
            if day.get("has_recommendation") is not True or day.get("has_unknown_items") is True:
                return None
            target = {}
            actual = {}
            for source, destination in fields:
                metric = day[source]
                target_value = float(metric["target"])
                consumed_value = float(metric["consumed"])
                if not 0 < target_value < float("inf") or not 0 <= consumed_value < float("inf"):
                    return None
                target[destination] = target_value
                actual[destination] = consumed_value
            count = day["recorded_meal_count"]
            if type(count) is not int or count < 0:
                return None
        except (KeyError, TypeError, ValueError, OverflowError):
            return None
        dates.append(date)
        result.append({"date": date.isoformat(), "target": target,
                       "actual": actual if count else None})
    if dates[0].weekday() != 0 or any(
        (day - dates[0]).days != index for index, day in enumerate(dates)
    ):
        return None
    return {"expected_days": 7, "days": result}


def _analysis_key(user_id: str, source: dict[str, Any], score_context: dict[str, Any]) -> str:
    # The hash is a stable idempotency key, not a copy of sensitive measurements.
    basis = {"user_id": user_id,
             "health_checkup_id": source["health_checkup_id"],
             "body_composition_id": source["body_composition_id"],
             "score_context": score_context}
    encoded = json.dumps(basis, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def _assessment_items(score: GeneratedScore) -> list[dict[str, Any]]:
    names = (("diet", "식단"), ("exercise", "운동"), ("health_data", "건강 데이터"))
    return [{"metric_type": key, "metric_name": label, "metric_value": None,
             "metric_unit": "점", "metric_score": getattr(score, key).score,
             "evaluation_status": getattr(score, key).status,
             "evaluation": getattr(score, key).message, "sequence_order": index}
            for index, (key, label) in enumerate(names)]


async def _saved_assessment_id(user_id: str, analysis_key: str, settings: Any) -> str | None:
    try:
        async with client_scope() as client:
            response = await client.get(
                f"{settings.supabase_url}/rest/v1/health_assessments",
                headers=service_headers(settings),
                params={"select": "health_assessment_id", "user_id": f"eq.{user_id}",
                        "analysis_key": f"eq.{analysis_key}", "limit": "1"}, timeout=15,
            )
            response.raise_for_status()
            rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="건강 평가 저장 상태를 확인하지 못했습니다.") from None
    if not isinstance(rows, list) or len(rows) > 1:
        raise HTTPException(502, detail="건강 평가 저장 상태를 확인하지 못했습니다.")
    return str(rows[0]["health_assessment_id"]) if rows else None


async def generate_confirmed_health_assessment(
    user_id: str,
    settings: Any,
    *,
    weekly_diet_loader: Callable[[str, Any], Awaitable[dict[str, Any] | None]] | None = None,
) -> dict[str, Any]:
    """Run once both document types exist; a repeated confirm retries or reuses the result."""
    config = get_ai_server_config()
    if config is None:
        return {"status": "unavailable", "assessment_id": None}
    analysis_input = await fetch_analysis_input(user_id, settings)
    if not analysis_input.ready:
        return {"status": "waiting_for_documents", "assessment_id": None}
    prepared = analysis_input.model_dump(mode="json", exclude_none=True)
    checkup = prepared["health_checkup"]
    body = prepared["body_composition"]
    score_context = prepared["score_context"]
    weekly_diet = await weekly_diet_loader(user_id, settings) if weekly_diet_loader else None
    if weekly_diet is not None:
        score_context["weekly_diet"] = weekly_diet
    source = {"health_checkup_id": checkup["health_checkup_id"],
              "body_composition_id": body["body_composition_id"]}
    analysis_key = _analysis_key(user_id, source, score_context)
    existing = await _saved_assessment_id(user_id, analysis_key, settings)
    if existing is not None:
        return {"status": "saved", "assessment_id": existing}

    payload = {"schema_version": "1.0", "request_id": analysis_key,
               "input": {"health_checkup": checkup, "body_composition": body,
                         "diet_context": prepared["diet_context"], "score_context": score_context}}
    reply_data = await AIServerClient(config).post(AIEndpoint.HEALTH, payload)
    try:
        reply = GeneratedReply.model_validate(reply_data)
        if reply.request_id != analysis_key:
            raise ValueError("AI request ID mismatch")
    except (ValidationError, ValueError):
        raise HTTPException(502, detail="건강 분석 응답 형식을 확인하지 못했습니다.") from None
    score = reply.analysis.health_score
    total_analysis = MainAnalysis.model_validate(reply.analysis.model_dump(
        mode="json", by_alias=True, exclude={"health_score"}
    )).model_dump(mode="json", by_alias=True)
    today = datetime.now(KST).date()
    snapshot = {"health_checkup_id": source["health_checkup_id"],
                "body_composition_id": source["body_composition_id"],
                "goal": {"text": total_analysis["goal"]["text"]},
                "score_context": {"scoring_version": score.scoring_version,
                                  "week_start": (today - timedelta(days=today.weekday())).isoformat()}}
    # Canonical measurement tables already hold the needed numbers. Keep the
    # derived score, but do not duplicate baseline/current values in the result.
    raw_result = {"health_score": score.model_dump(
        mode="json", exclude={"health_metric_adjustments"}
    ),
                  "total_analysis": total_analysis}
    save_payload = {
        "p_user_id": user_id, "p_health_checkup_id": source["health_checkup_id"],
        "p_body_composition_id": source["body_composition_id"],
        "p_analysis_key": analysis_key,
        "p_score_status": "available" if score.status == "available" else "partial",
        "p_overall_score": score.total_score,
        "p_health_data_status": score.health_data.status,
        "p_health_data_score": score.health_data.score,
        "p_needs_score_refresh": score.status == "unavailable" and (
            "weekly_diet" not in score_context or "weekly_exercise" not in score_context
        ),
        "p_summary": total_analysis["summary"]["description"],
        "p_model_name": reply.model.name, "p_model_version": reply.model.version,
        "p_input_snapshot": snapshot, "p_raw_result": raw_result,
        "p_items": _assessment_items(score),
    }
    try:
        async with client_scope() as client:
            response = await client.post(
                f"{settings.supabase_url}/rest/v1/rpc/save_generated_health_assessment",
                headers=service_headers(settings), json=save_payload, timeout=15,
            )
            response.raise_for_status()
            saved = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="건강 분석 결과를 저장하지 못했습니다.") from None
    if not isinstance(saved, dict) or not isinstance(saved.get("health_assessment_id"), str):
        raise HTTPException(502, detail="건강 분석 저장 결과를 확인하지 못했습니다.")
    return {"status": "saved", "assessment_id": saved["health_assessment_id"]}


async def refresh_deferred_health_assessments(
    settings: Any,
    *,
    after_user_id: str | None = None,
    limit: int = 25,
    weekly_diet_loader: Callable[[str, Any], Awaitable[dict[str, Any] | None]],
) -> dict[str, Any]:
    """Revisit a page of partial scores; wait until both weekly contexts exist."""
    if not 1 <= limit <= 100:
        raise ValueError("Pending score page size must be between 1 and 100")
    if get_ai_server_config() is None:
        return {"next_after": None, "checked": 0, "saved": 0, "failed": 0}
    try:
        async with client_scope() as client:
            response = await client.post(
                f"{settings.supabase_url}/rest/v1/rpc/list_pending_health_score_users",
                headers=service_headers(settings),
                json={"p_after_user_id": after_user_id, "p_limit": limit}, timeout=15,
            )
            response.raise_for_status()
            rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="보류된 건강 점수를 조회하지 못했습니다.") from None
    if not isinstance(rows, list) or len(rows) > limit or any(
        not isinstance(row, dict) or not isinstance(row.get("user_id"), str)
        for row in rows
    ):
        raise HTTPException(502, detail="보류된 건강 점수 형식을 확인하지 못했습니다.")
    try:
        user_ids = [str(UUID(row["user_id"])) for row in rows]
    except ValueError:
        raise HTTPException(502, detail="보류된 건강 점수 형식을 확인하지 못했습니다.") from None
    checked = saved = failed = 0
    for user_id in dict.fromkeys(user_ids):
        checked += 1
        try:
            prepared = await fetch_analysis_input(user_id, settings)
            if not prepared.ready or "weekly_exercise" not in prepared.score_context:
                continue
            weekly_diet = await weekly_diet_loader(user_id, settings)
            if weekly_diet is None:
                continue

            async def loaded_diet(_user_id: str, _settings: Any) -> dict[str, Any]:
                return weekly_diet

            result = await generate_confirmed_health_assessment(
                user_id, settings, weekly_diet_loader=loaded_diet,
            )
            if result["status"] == "saved":
                saved += 1
        except Exception as exc:
            # Keep one user's transient AI/storage failure from blocking others.
            logger.warning("Deferred health assessment retry failed: %s", type(exc).__name__)
            failed += 1
    return {"next_after": user_ids[-1] if len(rows) == limit else None,
            "checked": checked, "saved": saved, "failed": failed}
