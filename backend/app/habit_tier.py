"""Read the authenticated user's cumulative R8 habit tier."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.app.account_deletion import service_headers
from backend.app.http_client import client_scope


KST = ZoneInfo("Asia/Seoul")
POINT_HISTORY_PAGE_SIZE = 500


class TierDayPoints(BaseModel):
    date: date
    points: int = Field(ge=0)


class TierProgressResponse(BaseModel):
    progress: dict[str, Any]
    today_points: int = Field(ge=0)
    week: list[TierDayPoints] = Field(min_length=7, max_length=7)
    week_points: int = Field(ge=0)


def summarize_week_points(events: list[dict[str, Any]], target_date: date) -> dict[date, int]:
    """Bucket immutable point events into the target's Monday-Sunday KST week."""
    monday = target_date - timedelta(days=target_date.weekday())
    totals = {monday + timedelta(days=offset): 0 for offset in range(7)}
    for event in events:
        points = event.get("points")
        timestamp = event.get("occurred_at")
        if type(points) is not int or points <= 0 or not isinstance(timestamp, str):
            raise ValueError("Invalid tier point event")
        try:
            occurred_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("Invalid tier point timestamp") from exc
        if occurred_at.tzinfo is None:
            raise ValueError("Tier point timestamp requires a timezone")
        local_day = occurred_at.astimezone(KST).date()
        if local_day in totals:
            totals[local_day] += points
    return totals


async def read_week_point_totals(
    user_id: str, settings: Any, target_date: date,
) -> dict[date, int]:
    """Read one user's point ledger for a KST week without truncating a busy week."""
    monday = target_date - timedelta(days=target_date.weekday())
    start = datetime.combine(monday, time.min, tzinfo=KST).astimezone(UTC)
    end = datetime.combine(monday + timedelta(days=7), time.min, tzinfo=KST).astimezone(UTC)
    base_params = {
        "select": "user_tier_point_id,points,occurred_at",
        "user_id": f"eq.{user_id}",
        "occurred_at": f"gte.{start.isoformat()}",
        "and": f"(occurred_at.lt.{end.isoformat()})",
        "order": "occurred_at.asc,user_tier_point_id.asc",
        "limit": str(POINT_HISTORY_PAGE_SIZE),
    }
    events: list[dict[str, Any]] = []
    try:
        async with client_scope() as client:
            for offset in range(0, 10000, POINT_HISTORY_PAGE_SIZE):
                response = await client.get(
                    f"{settings.supabase_url.rstrip('/')}/rest/v1/user_tier_points",
                    headers=service_headers(settings),
                    params={**base_params, "offset": str(offset)},
                )
                if response.is_error:
                    raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                rows = response.json()
                if not isinstance(rows, list) or len(rows) > POINT_HISTORY_PAGE_SIZE or any(
                    not isinstance(row, dict) for row in rows
                ):
                    raise ValueError("Invalid tier point page")
                events.extend(rows)
                if len(rows) < POINT_HISTORY_PAGE_SIZE:
                    break
            else:
                raise ValueError("Tier point week exceeds supported page count")
        return summarize_week_points(events, target_date)
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from exc


async def read_progress(user_id: str, settings: Any) -> dict[str, Any]:
    try:
        async with client_scope() as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/user_habit_tier_progress",
                headers=service_headers(settings),
                json={"p_user_id": user_id},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from exc
    if response.is_error:
        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
    try:
        result = response.json()
    except ValueError:
        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
    required = {
        "policy_version", "points", "tier_code", "tier_name",
        "sublevel", "level_start_points", "next_level_points",
    }
    if not isinstance(result, dict) or not required <= result.keys():
        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
    return result


SOURCE_TABLES = {
    "meal_log": ("meal_logs", "meal_log_id", "status", "recorded", "created_at"),
    "recommended_workout_completed": (
        "exercise_sessions", "exercise_session_id", "status", "completed", "completed_at",
    ),
}
SUPPORTED_EVENTS = {*SOURCE_TABLES, "health_data_uploaded"}


async def award_completed_source(user_id: str, event_code: str, source_id: UUID,
                                 settings: Any) -> dict[str, Any]:
    """Verify the owned source, then submit one immutable, idempotent point event."""
    base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    headers = service_headers(settings)
    source_key = f"{event_code}:{source_id}"
    try:
        async with client_scope() as client:
            if event_code == "health_data_uploaded":
                source = None
                for table, id_column in (("health_checkups", "health_checkup_id"),
                                         ("body_compositions", "body_composition_id")):
                    response = await client.get(f"{base}/{table}", headers=headers, params={
                        "select": f"{id_column},uploaded_file_id,created_at",
                        id_column: f"eq.{source_id}", "user_id": f"eq.{user_id}", "limit": "1",
                    })
                    if response.is_error:
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                    try:
                        rows = response.json()
                    except ValueError:
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
                    if not isinstance(rows, list):
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                    if rows:
                        source = rows[0]
                        break
                if source is None:
                    raise HTTPException(404, detail={"code": "TIER_SOURCE_NOT_FOUND"})
                if not source.get("uploaded_file_id") or not source.get("created_at"):
                    raise HTTPException(409, detail={"code": "TIER_SOURCE_INCOMPLETE"})
                file_response = await client.get(f"{base}/upload_files", headers=headers, params={
                    "select": "processing_status",
                    "uploaded_file_id": f"eq.{source['uploaded_file_id']}",
                    "user_id": f"eq.{user_id}", "limit": "1",
                })
                if file_response.is_error:
                    raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                try:
                    file_rows = file_response.json()
                except ValueError:
                    raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
                if not isinstance(file_rows, list) or len(file_rows) != 1 or file_rows[0].get("processing_status") != "manually_confirmed":
                    raise HTTPException(409, detail={"code": "TIER_SOURCE_INCOMPLETE"})
                time_column = "created_at"
            else:
                table, id_column, status_column, required_status, time_column = SOURCE_TABLES[event_code]
                source_response = await client.get(f"{base}/{table}", headers=headers, params={
                    "select": ",".join((id_column, status_column, time_column,
                                        *(["exercise_recommendation_id", "total_duration_seconds"]
                                          if event_code == "recommended_workout_completed" else []))),
                    id_column: f"eq.{source_id}", "user_id": f"eq.{user_id}", "limit": "1",
                })
                if source_response.is_error:
                    raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                try:
                    source_rows = source_response.json()
                except ValueError:
                    raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
                if not isinstance(source_rows, list):
                    raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                if not source_rows:
                    raise HTTPException(404, detail={"code": "TIER_SOURCE_NOT_FOUND"})
                source = source_rows[0]
                if source.get(status_column) != required_status or not source.get(time_column):
                    raise HTTPException(409, detail={"code": "TIER_SOURCE_INCOMPLETE"})
                if event_code == "recommended_workout_completed" and not source.get("exercise_recommendation_id"):
                    raise HTTPException(409, detail={"code": "TIER_SOURCE_INCOMPLETE"})
                if event_code == "recommended_workout_completed":
                    recommendation_response = await client.get(
                        f"{base}/exercise_recommendations", headers=headers, params={
                            "select": "generator",
                            "exercise_recommendation_id": f"eq.{source['exercise_recommendation_id']}",
                            "user_id": f"eq.{user_id}", "limit": "1",
                        },
                    )
                    if recommendation_response.is_error:
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                    try:
                        recommendations = recommendation_response.json()
                    except ValueError:
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
                    if not isinstance(recommendations, list):
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                    if len(recommendations) != 1 or recommendations[0].get("generator") != "auto-fit-ai":
                        raise HTTPException(409, detail={"code": "TIER_SOURCE_INCOMPLETE"})
                    # The app rounds each item's elapsed time to minutes before storage.
                    # This excludes recorded zero-minute workouts, not every sub-minute attempt.
                    duration_seconds = source.get("total_duration_seconds")
                    if not isinstance(duration_seconds, int) or duration_seconds <= 0:
                        raise HTTPException(409, detail={"code": "TIER_SOURCE_INCOMPLETE"})
                    completed_set_response = await client.get(
                        f"{base}/exercise_logs", headers=headers, params={
                            "select": "exercise_log_id",
                            "exercise_session_id": f"eq.{source_id}",
                            "user_id": f"eq.{user_id}",
                            "completed": "eq.true",
                            "completed_sets": "gte.1",
                            "duration_minutes": "gte.1",
                            "limit": "1",
                        },
                    )
                    if completed_set_response.is_error:
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                    try:
                        completed_set_rows = completed_set_response.json()
                    except ValueError:
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
                    if not isinstance(completed_set_rows, list):
                        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
                    if not completed_set_rows:
                        raise HTTPException(409, detail={"code": "TIER_SOURCE_INCOMPLETE"})

            policy = await client.get(f"{base}/tier_habit_policy_versions", headers=headers,
                                      params={"select": "tier_habit_policy_version_id,published_at",
                                              "status": "eq.active", "limit": "1"})
            if policy.is_error:
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
            try:
                policy_rows = policy.json()
            except ValueError:
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
            if not isinstance(policy_rows, list) or len(policy_rows) != 1:
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
            rule = await client.get(f"{base}/tier_habit_point_rules", headers=headers,
                                    params={"select": "tier_habit_point_rule_id",
                                            "tier_habit_policy_version_id": f"eq.{policy_rows[0]['tier_habit_policy_version_id']}",
                                            "event_code": f"eq.{event_code}", "limit": "1"})
            if rule.is_error:
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
            try:
                rule_rows = rule.json()
            except ValueError:
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
            if not isinstance(rule_rows, list) or len(rule_rows) != 1:
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})

            inserted = await client.post(f"{base}/user_tier_points", headers={
                **headers, "Prefer": "resolution=ignore-duplicates,return=representation",
            }, params={"on_conflict": "user_id,event_code,source_key",
                       "select": "user_tier_point_id,points"}, json={
                "user_id": user_id, "tier_habit_point_rule_id": rule_rows[0]["tier_habit_point_rule_id"],
                "event_code": event_code, "source_key": source_key,
                "occurred_at": source[time_column],
            })
            if inserted.is_error:
                # The DB trigger remains the authority for policy dates and period caps.
                try:
                    error = inserted.json()
                except ValueError:
                    error = None
                if isinstance(error, dict) and error.get("code") == "23514" and error.get("message") == "Tier point period limit reached":
                    return {"awarded": False, "reason": "period_limit"}
                if isinstance(error, dict) and error.get("code") == "23514" and error.get("message") == "Tier points require an active rule and a current event":
                    return {"awarded": False, "reason": "outside_policy_period"}
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
            try:
                rows = inserted.json()
            except ValueError:
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from None
            if not isinstance(rows, list):
                raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"})
            return {"awarded": bool(rows), "reason": "awarded" if rows else "already_awarded"}
    except httpx.HTTPError as exc:
        raise HTTPException(502, detail={"code": "HABIT_TIER_UNAVAILABLE"}) from exc


def create_habit_tier_router(get_user: Any, get_settings: Any) -> APIRouter:
    router = APIRouter(prefix="/api/tier", tags=["Profile"])

    @router.get("/progress", response_model=TierProgressResponse)
    async def progress(
        user: Any = Depends(get_user),
        settings: Any = Depends(get_settings),
    ) -> TierProgressResponse:
        current = await read_progress(user.id, settings)
        today = datetime.now(KST).date()
        daily = await read_week_point_totals(user.id, settings, today)
        return TierProgressResponse(
            progress=current,
            today_points=daily[today],
            week=[TierDayPoints(date=day, points=points) for day, points in daily.items()],
            week_points=sum(daily.values()),
        )

    @router.post("/points/{event_code}/{source_id}")
    async def award_source(event_code: str, source_id: UUID,
                           user: Any = Depends(get_user),
                           settings: Any = Depends(get_settings)) -> dict[str, Any]:
        if event_code not in SUPPORTED_EVENTS:
            raise HTTPException(404, detail={"code": "TIER_EVENT_NOT_FOUND"})
        return await award_completed_source(user.id, event_code, source_id, settings)

    return router
