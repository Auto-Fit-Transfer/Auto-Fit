"""Build health-score exercise totals from owner-scoped source records."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from pydantic import BaseModel, Field, model_validator

from backend.app.account_deletion import service_headers
from backend.app.http_client import client_scope, get_with_pgrst303_retry, retry_pgrst303_scope

KST = ZoneInfo("Asia/Seoul")
HealthExerciseGoal = Literal[
    "muscle_gain", "body_fat_loss", "weight_management", "regular_exercise",
]
HEALTH_EXERCISE_GOALS = frozenset({
    "muscle_gain", "body_fat_loss", "weight_management", "regular_exercise",
})
BACKEND_TO_AI_GOAL: dict[str, HealthExerciseGoal] = {
    "weight_loss": "body_fat_loss",
    "muscle_gain": "muscle_gain",
    "maintenance": "weight_management",
    "endurance": "regular_exercise",
}


class WeeklyExerciseTotals(BaseModel):
    completed_minutes: int = Field(ge=0)
    completed_days: int = Field(ge=0, le=7)
    goal_aligned_completed_days: int = Field(ge=0, le=7)

    @model_validator(mode="after")
    def validate_aligned_days(self) -> "WeeklyExerciseTotals":
        if self.goal_aligned_completed_days > self.completed_days:
            raise ValueError("goal-aligned days cannot exceed completed days")
        return self


def aggregate_weekly_exercise(
    logs: list[dict[str, Any]],
    sessions: dict[str, dict[str, Any]],
    items: dict[str, dict[str, Any]],
    recommendation_goals: dict[str, str],
    *,
    goal_type: str,
    week_start: date,
) -> WeeklyExerciseTotals | None:
    """Count one finished item once, including items finished before a session stop.

    Return None when a qualifying source lacks the metadata needed to distinguish
    a set-based item from a time-based one. Callers must then omit the entire
    weekly_exercise object instead of sending partially defaulted zeroes.
    """
    if week_start.weekday() != 0:
        raise ValueError("week_start must be Monday in Asia/Seoul")
    seen: set[tuple[str, str]] = set()
    days: set[date] = set()
    aligned_days: set[date] = set()
    minutes = 0
    for log in logs:
        if log.get("completed") is not True or log.get("skipped") is True:
            continue
        duration = log.get("duration_minutes")
        if isinstance(duration, bool) or not isinstance(duration, int):
            return None
        if duration < 1:
            continue
        session_id = log.get("exercise_session_id")
        item_id = log.get("exercise_item_id")
        if not isinstance(session_id, str) or not isinstance(item_id, str):
            return None
        session = sessions.get(session_id)
        item = items.get(item_id)
        if session is None or item is None:
            return None
        if session.get("status") not in {"completed", "stopped"}:
            continue
        recommendation_id = session.get("exercise_recommendation_id")
        if recommendation_id != item.get("exercise_recommendation_id"):
            return None
        if str(recommendation_id) not in recommendation_goals:
            return None
        execution_type = item.get("execution_type")
        if execution_type == "count_based":
            sets = log.get("completed_sets")
            if isinstance(sets, bool) or not isinstance(sets, int):
                return None
            if sets < 1:
                continue
        elif execution_type != "time_based":
            return None
        try:
            performed = datetime.fromisoformat(str(log["performed_at"]).replace("Z", "+00:00"))
            if performed.tzinfo is None:
                return None
            day = performed.astimezone(KST).date()
        except (KeyError, TypeError, ValueError):
            return None
        if not week_start <= day < week_start + timedelta(days=7):
            continue
        key = (session_id, item_id)
        if key in seen:
            continue
        seen.add(key)
        minutes += duration
        days.add(day)
        if recommendation_goals.get(str(recommendation_id)) == goal_type:
            aligned_days.add(day)
    return WeeklyExerciseTotals(
        completed_minutes=minutes,
        completed_days=len(days),
        goal_aligned_completed_days=len(aligned_days),
    )


async def fetch_weekly_exercise_totals(
    user_id: str,
    *,
    goal_type: str,
    week_start: date,
    settings: Any,
) -> WeeklyExerciseTotals | None:
    """Read the user's source logs; return None rather than a partial score input."""
    if week_start.weekday() != 0:
        raise ValueError("week_start must be Monday in Asia/Seoul")
    start = datetime.combine(week_start, time.min, KST).astimezone(UTC)
    end = datetime.combine(week_start + timedelta(days=7), time.min, KST).astimezone(UTC)
    base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    headers = service_headers(settings)

    async def read_rows(client: httpx.AsyncClient, table: str, params: dict[str, str]) -> list[dict[str, Any]] | None:
        rows: list[dict[str, Any]] = []
        while True:
            try:
                response = await get_with_pgrst303_retry(
                    client, f"{base}/{table}", headers=headers,
                    params={**params, "limit": "1000", "offset": str(len(rows))},
                )
                page = response.json()
            except (httpx.HTTPError, ValueError):
                return None
            if (not response.is_success or not isinstance(page, list)
                    or len(page) > 1000 or any(not isinstance(row, dict) for row in page)):
                return None
            rows.extend(page)
            if len(rows) >= 10_000:
                return None
            if len(page) < 1000:
                return rows

    async def read_by_ids(
        client: httpx.AsyncClient, table: str, ids: set[str],
        id_column: str, fields: str, *, owner_scoped: bool,
    ) -> list[dict[str, Any]] | None:
        if not ids:
            return []
        try:
            validated = sorted({str(UUID(value)) for value in ids})
        except (ValueError, TypeError, AttributeError):
            return None
        rows: list[dict[str, Any]] = []
        for offset in range(0, len(validated), 100):
            batch = validated[offset:offset + 100]
            result = await read_rows(client, table, {
                "select": fields, id_column: f"in.({','.join(batch)})",
                **({"user_id": f"eq.{user_id}"} if owner_scoped else {}),
                "order": f"{id_column}.asc",
            })
            if result is None:
                return None
            rows.extend(result)
        return rows

    async with retry_pgrst303_scope():
        async with client_scope() as client:
            logs = await read_rows(client, "exercise_logs", {
                "select": "exercise_log_id,exercise_session_id,exercise_item_id,performed_at,"
                          "duration_minutes,completed,skipped,completed_sets",
                "user_id": f"eq.{user_id}",
                "performed_at": f"gte.{start.isoformat()}",
                "and": f"(performed_at.lt.{end.isoformat()})",
                "order": "performed_at.asc,exercise_log_id.asc",
            })
            if logs is None:
                return None
            eligible = [row for row in logs if row.get("completed") is True
                        and row.get("skipped") is not True
                        and isinstance(row.get("duration_minutes"), int)
                        and row["duration_minutes"] >= 1]
            session_ids = {str(row.get("exercise_session_id")) for row in eligible}
            item_ids = {str(row.get("exercise_item_id")) for row in eligible}
            sessions = await read_by_ids(
                client, "exercise_sessions", session_ids, "exercise_session_id",
                "exercise_session_id,exercise_recommendation_id,status", owner_scoped=True,
            )
            items = await read_by_ids(
                client, "exercise_items", item_ids, "exercise_item_id",
                "exercise_item_id,exercise_recommendation_id,execution_type", owner_scoped=False,
            )
            if sessions is None or items is None:
                return None
            recommendation_ids = {str(row.get("exercise_recommendation_id")) for row in sessions}
            recommendations = await read_by_ids(
                client, "exercise_recommendations", recommendation_ids,
                "exercise_recommendation_id", "exercise_recommendation_id,goal", owner_scoped=True,
            )
            if recommendations is None:
                return None
    return aggregate_weekly_exercise(
        logs,
        {str(row["exercise_session_id"]): row for row in sessions},
        {str(row["exercise_item_id"]): row for row in items},
        {str(row["exercise_recommendation_id"]): row.get("goal") for row in recommendations},
        goal_type=goal_type, week_start=week_start,
    )


def weekly_exercise_score_context(
    goal: dict[str, Any] | None,
    totals: WeeklyExerciseTotals | None,
    ai_goal_type: HealthExerciseGoal | None,
) -> dict[str, Any]:
    """Only produce an AI score object when all fields and the goal mapping exist."""
    if goal is None or totals is None or ai_goal_type not in HEALTH_EXERCISE_GOALS:
        return {}
    target_minutes = goal.get("weekly_duration_minutes")
    target_days = goal.get("weekly_frequency")
    if (isinstance(target_minutes, bool) or not isinstance(target_minutes, int)
            or target_minutes < 1 or isinstance(target_days, bool)
            or not isinstance(target_days, int) or not 1 <= target_days <= 7):
        return {}
    return {"weekly_exercise": {
        "goal_type": ai_goal_type,
        "target_minutes": target_minutes,
        "completed_minutes": totals.completed_minutes,
        "target_days": target_days,
        "completed_days": totals.completed_days,
        "goal_aligned_completed_days": totals.goal_aligned_completed_days,
    }}


async def fetch_weekly_exercise_score_context(
    user_id: str,
    settings: Any,
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Build a complete AI score context, or omit weekly_exercise entirely."""
    day = today or datetime.now(KST).date()
    base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    async with retry_pgrst303_scope():
        async with client_scope() as client:
            try:
                response = await get_with_pgrst303_retry(
                    client, f"{base}/exercise_goals", headers=service_headers(settings),
                    params={
                        "select": "goal_type,weekly_frequency,weekly_duration_minutes,starts_on,ends_on,status",
                        "user_id": f"eq.{user_id}", "status": "eq.active",
                        "order": "starts_on.desc,updated_at.desc", "limit": "1",
                    },
                )
                goals = response.json()
            except (httpx.HTTPError, ValueError):
                return {}
    if (not response.is_success or not isinstance(goals, list) or len(goals) > 1
            or any(not isinstance(goal, dict) for goal in goals) or not goals):
        return {}
    goal = goals[0]
    goal_type = goal.get("goal_type")
    ai_goal_type = BACKEND_TO_AI_GOAL.get(goal_type) if isinstance(goal_type, str) else None
    if ai_goal_type is None or goal.get("status") != "active":
        return {}
    try:
        if (goal.get("starts_on") and date.fromisoformat(goal["starts_on"]) > day
                or goal.get("ends_on") and date.fromisoformat(goal["ends_on"]) < day):
            return {}
    except (TypeError, ValueError):
        return {}
    week_start = day - timedelta(days=day.weekday())
    totals = await fetch_weekly_exercise_totals(
        user_id, goal_type=goal_type, week_start=week_start, settings=settings,
    )
    return weekly_exercise_score_context(goal, totals, ai_goal_type)
