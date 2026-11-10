"""Server-owned exercise chat context, pending actions, and database operations."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException

from backend.app.ai_server import AIEndpoint, AIServerClient, AIServerConfig
from backend.app.http_client import client_scope


SESSION_FIELDS = (
    "exercise_session_id,exercise_recommendation_id,plan_session_id,status,"
    "started_at,completed_at,planned_item_count,completed_item_count,"
    "skipped_item_count,total_duration_seconds,total_calories_burned,"
    "completion_rate,created_at,updated_at"
)
ITEM_FIELDS = (
    "exercise_item_id,exercise_name,sequence_order,plan_session_id,"
    "duration_minutes,target_duration_seconds,sets,repetitions,intensity,"
    "target_weight_kg,calories_burned,instruction,execution_type,"
    "rest_seconds,demo_video_url,thumbnail_url"
)
PENDING_FIELDS = (
    "pending_action_id,user_id,chat_id,source_client_message_id,session_id,"
    "plan_session_id,exercise_item_id,session_version,payload,expires_at,"
    "consumed_at,decision,idempotency_key,result"
)
KNOWN_DB_ERRORS = {
    "PENDING_ACTION_NOT_FOUND": 404,
    "CHAT_NOT_FOUND": 404,
    "PENDING_ACTION_CONSUMED": 409,
    "PENDING_ACTION_EXPIRED": 409,
    "SESSION_VERSION_CONFLICT": 409,
    "SESSION_NOT_ACTIVE": 409,
    "SESSION_NOT_FOUND": 409,
    "PENDING_ACTION_ITEM_MISMATCH": 409,
    "PENDING_ACTION_PAYLOAD_MISMATCH": 409,
    "AI_ACTION_MISMATCH": 502,
}


class ExerciseChatStore:
    def __init__(self, url: str, headers: dict[str, str], user_id: str):
        self.url = url.rstrip("/")
        self.headers = headers
        self.user_id = user_id

    async def request(
        self, method: str, path: str, *,
        params: dict[str, str] | None = None, body: dict[str, Any] | None = None,
        representation: bool = False,
    ) -> Any:
        headers = dict(self.headers)
        if representation:
            headers["Prefer"] = "return=representation"
        try:
            async with client_scope() as client:
                response = await client.request(
                    method, f"{self.url}/rest/v1/{path}",
                    headers=headers, params=params, json=body,
                )
        except httpx.HTTPError:
            raise HTTPException(502, detail="Exercise chat data source unavailable") from None
        if not response.is_success:
            try:
                error = response.json()
            except ValueError:
                error = None
            message = error.get("message") if isinstance(error, dict) else None
            code = message if message in KNOWN_DB_ERRORS else "EXERCISE_CHAT_DATA_ERROR"
            raise HTTPException(KNOWN_DB_ERRORS.get(code, 502), detail=code)
        try:
            return response.json()
        except ValueError:
            raise HTTPException(502, detail="Invalid exercise chat data response") from None

    async def rpc(self, name: str, body: dict[str, Any]) -> dict[str, Any]:
        result = await self.request("POST", f"rpc/{name}", body=body)
        if not isinstance(result, dict):
            raise HTTPException(502, detail="Invalid exercise chat RPC response")
        return result

    async def active_snapshot(self) -> dict[str, Any] | None:
        sessions = await self.request("GET", "exercise_sessions", params={
            "select": SESSION_FIELDS,
            "user_id": f"eq.{self.user_id}",
            "status": "eq.in_progress",
            "plan_session_id": "not.is.null",
            "order": "started_at.desc",
            "limit": "2",
        })
        if not isinstance(sessions, list):
            raise HTTPException(502, detail="Invalid active exercise session response")
        if not sessions:
            return None
        if len(sessions) != 1:
            raise HTTPException(409, detail="Multiple active exercise sessions")
        session = sessions[0]
        session_id = session["exercise_session_id"]
        plan_id = session["plan_session_id"]
        items = await self.plan_items(session)
        logs = await self.request("GET", "exercise_logs", params={
            "select": "exercise_item_id",
            "user_id": f"eq.{self.user_id}",
            "exercise_session_id": f"eq.{session_id}",
        })
        if not isinstance(items, list) or not isinstance(logs, list):
            raise HTTPException(502, detail="Invalid exercise item response")
        recorded = {row.get("exercise_item_id") for row in logs}
        remaining = [item for item in items if item["exercise_item_id"] not in recorded]
        current = remaining[0] if remaining else None
        return {
            "session_id": session_id,
            "plan_session_id": plan_id,
            "status": session["status"],
            "current_exercise_item_id": current["exercise_item_id"] if current else None,
            "current_exercise_name": current["exercise_name"] if current else None,
            "remaining_exercise_item_ids": [item["exercise_item_id"] for item in remaining[1:]],
            "version": session["updated_at"],
        }

    async def plan_items(self, session: dict[str, Any]) -> list[dict[str, Any]]:
        rows = await self.request("GET", "exercise_items", params={
            "select": ITEM_FIELDS,
            "plan_session_id": f"eq.{session['plan_session_id']}",
            "exercise_recommendation_id": f"eq.{session['exercise_recommendation_id']}",
            "order": "sequence_order.asc",
        })
        if not isinstance(rows, list):
            raise HTTPException(502, detail="Invalid exercise plan item response")
        return rows

    async def latest_session_state(self) -> dict[str, Any] | None:
        sessions = await self.request("GET", "exercise_sessions", params={
            "select": SESSION_FIELDS,
            "user_id": f"eq.{self.user_id}",
            "order": "started_at.desc",
            "limit": "1",
        })
        if not isinstance(sessions, list):
            raise HTTPException(502, detail="Invalid exercise session response")
        if not sessions:
            return None
        session = sessions[0]
        items = await self.plan_items(session) if session.get("plan_session_id") else []
        return {"session": session, "items": items}

    async def pending(self, chat_id: UUID, pending_id: UUID) -> dict[str, Any]:
        rows = await self.request("GET", "exercise_chat_pending_actions", params={
            "select": PENDING_FIELDS,
            "user_id": f"eq.{self.user_id}",
            "chat_id": f"eq.{chat_id}",
            "pending_action_id": f"eq.{pending_id}",
            "limit": "1",
        })
        if not isinstance(rows, list) or not rows:
            raise HTTPException(404, detail="PENDING_ACTION_NOT_FOUND")
        return rows[0]

    async def record_stop_event(
        self, chat_id: UUID, event_key: UUID,
        snapshot: dict[str, Any] | None, event: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.rpc("record_exercise_chat_event", {
            "p_user_id": self.user_id,
            "p_chat_id": str(chat_id),
            "p_event_key": str(event_key),
            "p_session_id": snapshot["session_id"] if snapshot else None,
            "p_item_id": snapshot["current_exercise_item_id"] if snapshot else None,
            "p_symptom_type": event["symptom_type"],
            "p_severity": event.get("severity"),
            "p_body_areas": event["body_areas"],
        })

    async def stop_session(
        self, event_key: UUID, snapshot: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.rpc("stop_exercise_chat_session", {
            "p_user_id": self.user_id,
            "p_session_id": snapshot["session_id"],
            "p_plan_session_id": snapshot["plan_session_id"],
            "p_session_version": snapshot["version"],
            "p_event_key": str(event_key),
        })

    async def resolve_pending(
        self, chat_id: UUID, pending_id: UUID, idempotency_key: UUID,
        decision: str, ai_response: dict[str, Any], answer: dict[str, Any],
    ) -> dict[str, Any]:
        return await self.rpc("resolve_exercise_chat_pending_action", {
            "p_user_id": self.user_id,
            "p_chat_id": str(chat_id),
            "p_pending_action_id": str(pending_id),
            "p_idempotency_key": str(idempotency_key),
            "p_decision": decision,
            "p_ai_response": ai_response,
            "p_answer": answer,
        })


async def call_exercise_orchestrator(
    config: AIServerConfig, content: str,
    snapshot: dict[str, Any] | None,
    *, pending_action: dict[str, Any] | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    context = {"active_exercise_session": snapshot} if snapshot else {}
    return await AIServerClient(config).post(AIEndpoint.CHAT, {
        "content": content,
        "history": history or [],
        "context": context,
        "pending_action": pending_action,
    })
