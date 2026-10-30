"""Authenticated mileage summary and history backed by the community RPCs."""

from __future__ import annotations

import base64
import binascii
import json
from datetime import datetime
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from backend.app.account_deletion import service_headers
from backend.app.http_client import client_scope


class MileageStore:
    def __init__(self, settings: Any, user_id: str):
        self.url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc"
        self.headers = service_headers(settings)
        self.user_id = str(UUID(user_id))

    async def rpc(self, function: str, body: dict[str, Any]) -> Any:
        try:
            async with client_scope() as client:
                response = await client.post(
                    f"{self.url}/{function}", headers=self.headers, json=body,
                )
            if response.is_error:
                raise ValueError("Community RPC failed")
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(502, detail={"code": "COMMUNITY_MILEAGE_UNAVAILABLE"}) from exc

    async def summary(self) -> dict[str, Any]:
        summary = await self.rpc("community_sync_mileage", {"p_user_id": self.user_id})
        if not isinstance(summary, dict) or not {"balance", "earned_today", "rules"} <= summary.keys():
            raise HTTPException(502, detail={"code": "COMMUNITY_MILEAGE_UNAVAILABLE"})
        return summary

    async def history(self, *, limit: int, before_created_at: datetime | None,
                      before_id: UUID | None) -> dict[str, Any]:
        history = await self.rpc("community_mileage_history", {
            "p_user_id": self.user_id,
            "p_before_created_at": before_created_at.isoformat() if before_created_at else None,
            "p_before_id": str(before_id) if before_id else None,
            "p_limit": limit + 1,
        })
        if not isinstance(history, list) or any(
            not isinstance(entry, dict) or not {"entry_id", "amount", "reason", "created_at"} <= entry.keys()
            for entry in history
        ):
            raise HTTPException(502, detail={"code": "COMMUNITY_MILEAGE_UNAVAILABLE"})
        entries = history[:limit]
        last = entries[-1] if len(history) > limit else None
        cursor = encode_cursor(last["created_at"], last["entry_id"]) if last else None
        return {"items": entries, "next_cursor": cursor}


def encode_cursor(created_at: str, entry_id: str) -> str:
    payload = json.dumps(["mileage", created_at, entry_id]).encode()
    return base64.urlsafe_b64encode(payload).decode()


def decode_cursor(cursor: str | None) -> tuple[datetime | None, UUID | None]:
    if cursor is None:
        return None, None
    try:
        scope, created_at, entry_id = json.loads(base64.b64decode(cursor, altchars=b"-_", validate=True))
        if scope != "mileage":
            raise ValueError("Cursor scope mismatch")
        moment = datetime.fromisoformat(created_at)
        if moment.tzinfo is None:
            raise ValueError("Cursor timestamp must have a timezone")
        return moment, UUID(entry_id)
    except (binascii.Error, UnicodeError, ValueError, TypeError) as exc:
        raise HTTPException(422, detail={"code": "COMMUNITY_INVALID_CURSOR"}) from exc


def create_community_mileage_router(get_user: Any, get_settings: Any) -> APIRouter:
    router = APIRouter(prefix="/api/community/mileage", tags=["Community"])

    def get_store(user: Any = Depends(get_user), settings: Any = Depends(get_settings)) -> MileageStore:
        return MileageStore(settings, user.id)

    @router.get("", summary="My mileage balance and rules")
    async def my_mileage(store: MileageStore = Depends(get_store)) -> dict[str, Any]:
        return await store.summary()

    @router.get("/history", summary="My mileage earned and spent history")
    async def my_mileage_history(
        limit: int = Query(default=20, ge=1, le=50),
        cursor: str | None = Query(default=None, max_length=300),
        store: MileageStore = Depends(get_store),
    ) -> dict[str, Any]:
        before_created_at, before_id = decode_cursor(cursor)
        return await store.history(limit=limit, before_created_at=before_created_at, before_id=before_id)

    return router
