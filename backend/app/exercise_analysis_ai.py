"""Validate AI exercise-session analysis without letting it rewrite recorded metrics."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


ShortText = Annotated[str, Field(min_length=1, max_length=500)]


class AnalysisNarrative(StrictModel):
    summary: ShortText
    insights: list[ShortText] = Field(min_length=1, max_length=5)
    next_session_adjustments: list[ShortText] = Field(min_length=1, max_length=5)
    safety_notice: str | None = Field(default=None, max_length=500)


class AnalysisEnvelope(StrictModel):
    ok: Literal[True]
    generator: Literal["auto-fit-ai"]
    result: AnalysisNarrative


DIFFICULTY_LABELS = {1: "매우 쉬움", 2: "쉬움", 3: "보통", 4: "어려움", 5: "매우 어려움"}
CONDITION_LABELS = {
    "very_bad": "매우 나쁨", "bad": "나쁨", "normal": "보통",
    "good": "좋음", "very_good": "매우 좋음",
}
ANALYSIS_CACHE_VERSION = "1"
MAX_DISCOMFORT_EVENTS = 30


def analysis_input_hash(payload: dict[str, Any]) -> str:
    serialized = json.dumps(
        {"version": ANALYSIS_CACHE_VERSION, "input": payload},
        ensure_ascii=False, sort_keys=True, allow_nan=False,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def build_analysis_input(result: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    session = result["session"]
    feedback = result.get("feedback")
    if session.get("status") not in {"completed", "stopped"}:
        raise ValueError("Exercise session is not finished")
    if not feedback:
        raise ValueError("Exercise session feedback is required")

    duration_minutes = round(float(session.get("total_duration_seconds") or 0) / 60, 1)
    calories_burned = float(session.get("total_calories_burned") or 0)
    completion_rate = float(session.get("completion_rate") or 0)
    try:
        difficulty = int(feedback["perceived_difficulty"])
        post_condition = feedback["post_condition"]
        difficulty_label = DIFFICULTY_LABELS[difficulty]
        condition_label = CONDITION_LABELS[post_condition]
    except (TypeError, ValueError, KeyError):
        raise ValueError("Exercise session feedback is invalid") from None
    areas = feedback.get("uncomfortable_areas") or []

    metrics = {
        "completion_rate": completion_rate,
        "duration_minutes": duration_minutes,
        "calories_burned": calories_burned,
    }
    feedback_summary = {
        "difficulty": difficulty_label,
        "post_condition": condition_label,
        "uncomfortable_areas": areas,
    }
    payload = {
        "status": session["status"],
        "completion_rate": completion_rate,
        "duration_minutes": duration_minutes,
        "calories_burned": calories_burned if calories_burned > 0 else None,
        "planned_item_count": int(session.get("planned_item_count") or 0),
        "completed_item_count": int(session.get("completed_item_count") or 0),
        "skipped_item_count": int(session.get("skipped_item_count") or 0),
        "exercises": [
            {
                "name": log["exercise_name"],
                "completed": bool(log.get("completed")),
                "skipped": bool(log.get("skipped")),
                "duration_minutes": (
                    float(log["duration_minutes"])
                    if log.get("duration_minutes") is not None else None
                ),
            }
            for log in result.get("logs") or []
        ],
        "discomfort_events": [
            {
                "symptom_type": event["symptom_type"],
                "severity": event.get("severity"),
                "body_areas": event.get("body_areas") or [],
                "action_taken": event.get("action_taken"),
            }
            for event in (result.get("discomfort_logs") or [])[:MAX_DISCOMFORT_EVENTS]
        ],
        "feedback": {
            "perceived_difficulty": difficulty,
            "post_condition": post_condition,
            "uncomfortable_areas": areas,
            "note": feedback.get("note"),
        },
    }
    return payload, metrics, feedback_summary


def build_public_analysis(
    response: dict[str, Any], metrics: dict[str, Any], feedback_summary: dict[str, Any],
    *, has_discomfort_event: bool = False,
) -> dict[str, Any]:
    narrative = AnalysisEnvelope.model_validate(response).result
    needs_safety_notice = has_discomfort_event or bool(feedback_summary["uncomfortable_areas"]) or (
        feedback_summary["post_condition"] in {"나쁨", "매우 나쁨"}
    )
    if needs_safety_notice and not narrative.safety_notice:
        raise ValueError("Exercise AI safety notice is required")
    return {
        "generator": "auto-fit-ai",
        "summary": narrative.summary,
        "metrics": metrics,
        "feedback_summary": feedback_summary,
        "insights": narrative.insights,
        "next_session_adjustments": narrative.next_session_adjustments,
        "safety_notice": narrative.safety_notice,
    }
