"""Six-month measurement history for the R7 health report."""

from __future__ import annotations

import asyncio
import calendar
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, HTTPException

from backend.app.account_deletion import service_headers
from backend.app.http_client import client_scope


def months_before(day: date, count: int) -> date:
    month_index = day.year * 12 + day.month - 1 - count
    year, month_zero = divmod(month_index, 12)
    month = month_zero + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


async def read_report(user_id: str, settings: Any) -> dict[str, Any]:
    start = months_before(datetime.now(ZoneInfo("Asia/Seoul")).date(), 6)
    base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    headers = service_headers(settings)

    async def get_rows(table: str, *, select: str, date_field: str,
                       id_field: str) -> list[dict[str, Any]]:
        all_rows: list[dict[str, Any]] = []
        try:
            async with client_scope() as client:
                while True:
                    response = await client.get(
                        f"{base}/{table}",
                        headers=headers,
                        params={
                            "select": select,
                            "user_id": f"eq.{user_id}",
                            date_field: f"gte.{start.isoformat()}",
                            "order": f"{date_field}.desc,{id_field}.desc",
                            "limit": "1000", "offset": str(len(all_rows)),
                        },
                    )
                    if response.is_error:
                        raise HTTPException(502, detail={"code": "HEALTH_REPORT_UNAVAILABLE"})
                    try:
                        rows = response.json()
                    except ValueError:
                        raise HTTPException(502, detail={"code": "HEALTH_REPORT_UNAVAILABLE"}) from None
                    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                        raise HTTPException(502, detail={"code": "HEALTH_REPORT_UNAVAILABLE"})
                    all_rows.extend(rows)
                    if len(rows) < 1000:
                        return all_rows
        except httpx.HTTPError as exc:
            raise HTTPException(502, detail={"code": "HEALTH_REPORT_UNAVAILABLE"}) from exc

    async def get_weight_target() -> Any:
        try:
            async with client_scope() as client:
                response = await client.get(
                    f"{base}/profiles", headers=headers,
                    params={"select": "target_weight", "user_id": f"eq.{user_id}", "limit": "1"},
                )
            if response.is_error:
                raise HTTPException(502, detail={"code": "HEALTH_REPORT_UNAVAILABLE"})
            rows = response.json()
            if not isinstance(rows, list) or len(rows) > 1 or any(not isinstance(row, dict) for row in rows):
                raise ValueError("invalid target response")
            return rows[0].get("target_weight") if rows else None
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(502, detail={"code": "HEALTH_REPORT_UNAVAILABLE"}) from exc

    body, checkups, target_weight = await asyncio.gather(
        get_rows(
            "body_compositions",
            select=(
                "body_composition_id,measured_at,weight_kg,skeletal_muscle_mass_kg,"
                "body_fat_percentage,bmi"
            ),
            date_field="measured_at",
            id_field="body_composition_id",
        ),
        get_rows(
            "health_checkups",
            select=(
                "health_checkup_id,checkup_date,weight_kg,bmi,systolic_bp,"
                "diastolic_bp,fasting_glucose,total_cholesterol"
            ),
            date_field="checkup_date",
            id_field="health_checkup_id",
        ),
        get_weight_target(),
    )
    return {"period_start": start.isoformat(), "body_compositions": body,
            "health_checkups": checkups, "target_weight_kg": target_weight}


def create_health_report_router(get_user: Any, get_settings: Any) -> APIRouter:
    router = APIRouter(prefix="/api/health-report", tags=["Profile"])

    @router.get("")
    async def report(
        user: Any = Depends(get_user),
        settings: Any = Depends(get_settings),
    ) -> dict[str, Any]:
        return await read_report(user.id, settings)

    return router
