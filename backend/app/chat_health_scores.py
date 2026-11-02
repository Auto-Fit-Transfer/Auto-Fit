"""Read-only score answers, shared by the preview and future chat storage flow."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

import httpx
from backend.app.http_client import client_scope
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class Assessment(BaseModel):
    health_assessment_id: UUID | None = None
    overall_score: Decimal = Field(ge=0, le=100)
    assessed_at: datetime

    @field_validator("assessed_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("Assessment date requires a timezone")
        return value


class AssessmentItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    health_assessment_id: UUID
    metric_type: str = Field(min_length=1, max_length=100)
    metric_name: str = Field(min_length=1, max_length=200)
    metric_score: Decimal | None = Field(default=None, ge=0, le=100)
    evaluation_status: str | None = Field(default=None, max_length=100)
    sequence_order: int = Field(ge=0)


async def fetch_scores(
    url: str, headers: dict, user_id: str, client: httpx.AsyncClient | None = None,
) -> list[Assessment]:
    try:
        async with client_scope(client) as client:
            response = await client.get(
                f"{url}/rest/v1/health_assessments",
                headers=headers,
                params={
                    "select": "health_assessment_id,overall_score,assessed_at",
                    "user_id": f"eq.{user_id}",
                    "assessed_at": f"lte.{datetime.now(UTC).isoformat()}",
                    "order": "assessed_at.desc,health_assessment_id.desc",
                    "limit": "2",
                },
            )
            response.raise_for_status()
            rows = response.json()
            if not isinstance(rows, list):
                raise ValueError("Expected assessment list")
            return [Assessment.model_validate(row) for row in rows]
    except (httpx.HTTPError, ValueError, ValidationError):
        raise HTTPException(502, detail={
            "code": "DATA_SOURCE_ERROR",
            "message": "건강 점수를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            "fields": None,
        }) from None


async def fetch_assessment_items(
    url: str, headers: dict, assessments: list[Assessment],
) -> dict[UUID, list[AssessmentItem]]:
    assessment_ids = [
        row.health_assessment_id for row in assessments
        if row.health_assessment_id is not None
    ]
    if not assessment_ids:
        return {}
    allowed_ids = set(assessment_ids)
    try:
        async with client_scope() as client:
            response = await client.get(
                f"{url}/rest/v1/health_assessment_items",
                headers=headers,
                params={
                    "select": (
                        "health_assessment_id,metric_type,metric_name,metric_score,"
                        "evaluation_status,sequence_order"
                    ),
                    "health_assessment_id": (
                        "in.(" + ",".join(str(value) for value in assessment_ids) + ")"
                    ),
                    "order": "health_assessment_id.asc,sequence_order.asc,health_assessment_item_id.asc",
                    "limit": "101",
                },
            )
            response.raise_for_status()
            rows = response.json()
            if not isinstance(rows, list) or len(rows) > 100:
                raise ValueError("Expected at most 100 assessment items")
            items = [AssessmentItem.model_validate(row) for row in rows]
            if any(item.health_assessment_id not in allowed_ids for item in items):
                raise ValueError("Unexpected assessment item owner")
            grouped = {assessment_id: [] for assessment_id in assessment_ids}
            for item in items:
                grouped[item.health_assessment_id].append(item)
            return grouped
    except (httpx.HTTPError, ValueError, ValidationError):
        raise HTTPException(502, detail={
            "code": "DATA_SOURCE_ERROR",
            "message": "건강 평가 근거를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            "fields": None,
        }) from None


def build_score_answer(
    rows: list[Assessment], mode: Literal["latest", "change"], explain: bool = False,
    items: dict[UUID, list[AssessmentItem]] | None = None,
) -> dict:
    answer = {
        "content": "", "intent": f"health_score_{mode}",
        "response_source": "database", "needs_more_data": False,
        "evidence": [], "required_data": [],
    }
    if not rows:
        answer["content"] = "저장된 건강 평가가 없습니다. 건강 데이터를 업로드하고 평가를 완료해 주세요."
        answer["required_data"] = ["health_assessment"]
    else:
        current = rows[0]
        previous = rows[1] if mode == "change" and len(rows) > 1 else None
        answer["evidence"] = [{
            "metric": "health_score", "label": "건강 점수",
            "current_value": float(current.overall_score),
            "previous_value": float(previous.overall_score) if previous else None,
            "unit": "점", "measured_at": current.assessed_at.isoformat(),
        }]
        answer["content"] = f"최근 평가({current.assessed_at.isoformat()})의 건강 점수는 {current.overall_score:g}점입니다."
        if mode == "change":
            if previous:
                delta = current.overall_score - previous.overall_score
                change = "동일합니다" if delta == 0 else f"{abs(delta):g}점 {'높아졌습니다' if delta > 0 else '낮아졌습니다'}"
                answer["content"] += f" 이전 평가({previous.assessed_at.isoformat()})의 {previous.overall_score:g}점과 비교해 {change}."
            else:
                answer["content"] += " 비교할 이전 평가가 없습니다."
                answer["required_data"].append("previous_health_assessment")
        if explain:
            item_evidence = _explanation_evidence(current, previous, mode, items or {})
            if item_evidence:
                answer["evidence"].extend(item_evidence)
                labels = ", ".join(_format_item_change(item) for item in item_evidence)
                if mode == "change":
                    answer["content"] += (
                        f" 점수 변화의 직접 원인으로 단정할 수는 없지만, 함께 확인된 평가 항목은 {labels}입니다."
                    )
                else:
                    answer["content"] += (
                        f" 평가 항목 중 점수가 낮은 항목은 {labels}입니다. 이 항목만으로 원인이나 개선 방법을 단정할 수는 없습니다."
                    )
            else:
                answer["content"] += " 점수만으로 원인이나 개선 방법을 판단할 수 없습니다. 평가 항목별 근거 확인이 필요합니다."
                answer["required_data"].append("assessment_explanation_evidence")
    if answer["required_data"]:
        answer.update(response_source="need_more_data", needs_more_data=True)
    return answer


def _explanation_evidence(
    current: Assessment,
    previous: Assessment | None,
    mode: Literal["latest", "change"],
    items: dict[UUID, list[AssessmentItem]],
) -> list[dict]:
    if current.health_assessment_id is None:
        return []
    current_items = [
        item for item in items.get(current.health_assessment_id, [])
        if item.metric_score is not None
    ]
    if mode == "change":
        if previous is None or previous.health_assessment_id is None:
            return []
        previous_by_metric = {
            (item.metric_type, item.metric_name): item
            for item in items.get(previous.health_assessment_id, [])
            if item.metric_score is not None
        }
        pairs = [
            (item, previous_by_metric.get((item.metric_type, item.metric_name)))
            for item in current_items
        ]
        pairs = [(current_item, previous_item) for current_item, previous_item in pairs if previous_item]
        pairs.sort(key=lambda pair: (
            pair[0].metric_score - pair[1].metric_score,
            pair[0].sequence_order,
            pair[0].metric_name,
        ))
        selected = pairs[:3]
    else:
        current_items.sort(key=lambda item: (
            item.metric_score, item.sequence_order, item.metric_name,
        ))
        selected = [(item, None) for item in current_items[:3]]
    return [{
        "metric": "health_assessment_item",
        "metric_type": current_item.metric_type,
        "label": current_item.metric_name,
        "current_value": float(current_item.metric_score),
        "previous_value": (
            float(previous_item.metric_score) if previous_item is not None else None
        ),
        "unit": "점",
        "measured_at": current.assessed_at.isoformat(),
        "evaluation_status": current_item.evaluation_status,
    } for current_item, previous_item in selected]


def _format_item_change(item: dict) -> str:
    current_value = f"{item['current_value']:g}점"
    if item["previous_value"] is None:
        return f"{item['label']} {current_value}"
    return f"{item['label']} {item['previous_value']:g}→{current_value}"
