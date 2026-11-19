"""Read only confirmed measurements and verified statuses for AI diet inputs."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
from fastapi import HTTPException

from backend.app.account_deletion import service_headers
from backend.app.analysis_popups import fetch_popup_data
from backend.app.http_client import client_scope


CHECKUP_FIELDS = "health_checkup_id,height_cm,weight_kg"
BODY_FIELDS = "body_composition_id,height_cm,weight_kg"
VALID_STATUSES = frozenset({"low", "normal", "caution", "high"})


async def fetch_latest_diet_measurements(
    user_id: str, settings: Any,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Query canonical, owner-scoped rows without uploaded files or OCR payloads."""
    headers = service_headers(settings)

    async with client_scope() as client:
        async def latest(table: str, fields: str, order: str) -> dict[str, Any] | None:
            try:
                response = await client.get(
                    f"{settings.supabase_url}/rest/v1/{table}",
                    headers=headers,
                    params={
                        "select": fields, "user_id": f"eq.{user_id}",
                        "order": order, "limit": "1",
                    },
                )
                response.raise_for_status()
                rows = response.json()
            except (httpx.HTTPError, ValueError):
                raise HTTPException(502, detail={"code": "DIET_HEALTH_CONTEXT_UNAVAILABLE"}) from None
            if not isinstance(rows, list) or len(rows) > 1 or any(not isinstance(row, dict) for row in rows):
                raise HTTPException(502, detail={"code": "DIET_HEALTH_CONTEXT_UNAVAILABLE"})
            return rows[0] if rows else None

        return await asyncio.gather(
            latest("health_checkups", CHECKUP_FIELDS,
                   "checkup_date.desc,created_at.desc,health_checkup_id.desc"),
            latest("body_compositions", BODY_FIELDS,
                   "measured_at.desc,created_at.desc,body_composition_id.desc"),
        )


def verified_metric_statuses(popup: Any, checkup: dict, body: dict) -> dict[str, str]:
    """Ignore a stale assessment or a metric without a verified criterion."""
    if (str(popup.health_checkup_id) != str(checkup["health_checkup_id"])
            or str(popup.body_composition_id) != str(body["body_composition_id"])):
        return {}
    return {
        metric.key: metric.status for metric in popup.metrics
        if metric.status in VALID_STATUSES and metric.criteria_id is not None
    }


async def fetch_diet_metric_statuses(
    user_id: str, settings: Any, checkup: dict | None, body: dict | None,
) -> dict[str, str]:
    if checkup is None or body is None:
        return {}
    try:
        popup = await fetch_popup_data(None, user_id, settings)
    except HTTPException as exc:
        if exc.status_code == 404:
            return {}
        raise
    return verified_metric_statuses(popup, checkup, body)
