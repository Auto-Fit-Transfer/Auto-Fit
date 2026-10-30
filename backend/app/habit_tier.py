"""Read the authenticated user's cumulative R8 habit tier."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException

from backend.app.account_deletion import service_headers
from backend.app.http_client import client_scope


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
                                        *(["exercise_recommendation_id"] if event_code == "recommended_workout_completed" else []))),
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

    @router.get("/progress")
    async def progress(
        user: Any = Depends(get_user),
        settings: Any = Depends(get_settings),
    ) -> dict[str, Any]:
        return {"progress": await read_progress(user.id, settings)}

    @router.post("/points/{event_code}/{source_id}")
    async def award_source(event_code: str, source_id: UUID,
                           user: Any = Depends(get_user),
                           settings: Any = Depends(get_settings)) -> dict[str, Any]:
        if event_code not in SUPPORTED_EVENTS:
            raise HTTPException(404, detail={"code": "TIER_EVENT_NOT_FOUND"})
        return await award_completed_source(user.id, event_code, source_id, settings)

    return router
