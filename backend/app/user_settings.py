"""Authenticated R7 health goal and display preference APIs."""

from __future__ import annotations

from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.app.account_deletion import service_headers
from backend.app.http_client import client_scope


class DisplayPreferencesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    theme_mode: Literal["system", "light", "dark"] = "system"
    font_size_step: int = Field(default=3, ge=1, le=5)
    simple_mode_enabled: bool = False


class HealthGoalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal_type: Literal["fat_loss", "muscle_gain", "fitness", "maintenance", "other"]
    goal_text: str | None = Field(default=None, max_length=200)

    @field_validator("goal_text", mode="before")
    @classmethod
    def strip_detail(cls, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        return value.strip() or None

    @model_validator(mode="after")
    def require_other_detail(self) -> "HealthGoalInput":
        if self.goal_type == "other" and not self.goal_text:
            raise ValueError("다른 목표는 설명을 입력해 주세요.")
        return self


class NotificationPreferencesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    diet_enabled: bool = True
    exercise_enabled: bool = True
    health_report_enabled: bool = True
    community_enabled: bool = False
    push_enabled: bool = True
    foreground_push_enabled: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: str | None = Field(default="23:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    quiet_hours_end: str | None = Field(default="07:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def require_quiet_hours(self) -> "NotificationPreferencesInput":
        if self.quiet_hours_enabled and (not self.quiet_hours_start or not self.quiet_hours_end
                                         or self.quiet_hours_start == self.quiet_hours_end):
            raise ValueError("방해 금지 시작·종료 시간을 다르게 입력해 주세요.")
        return self


class UserSettingsStore:
    def __init__(self, settings: Any, user_id: str):
        self.base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        self.headers = service_headers(settings)
        self.user_id = user_id

    async def request(self, method: str, table: str, *,
                      params: dict[str, str] | None = None,
                      payload: dict[str, Any] | None = None,
                      write: bool = False) -> list[dict[str, Any]]:
        headers = dict(self.headers)
        if write:
            headers["Prefer"] = "return=representation"
            if table in ("user_app_preferences", "notification_settings") and method == "POST":
                headers["Prefer"] += ",resolution=merge-duplicates"
        try:
            async with client_scope() as client:
                response = await client.request(
                    method, f"{self.base}/{table}", headers=headers, params=params, json=payload,
                )
        except httpx.HTTPError as exc:
            raise HTTPException(502, detail={"code": "USER_SETTINGS_UNAVAILABLE"}) from exc
        if response.is_error:
            raise HTTPException(
                409 if response.status_code == 409 else 502,
                detail={"code": "USER_SETTINGS_CONFLICT" if response.status_code == 409 else "USER_SETTINGS_UNAVAILABLE"},
            )
        try:
            rows = response.json()
        except ValueError:
            raise HTTPException(502, detail={"code": "USER_SETTINGS_UNAVAILABLE"}) from None
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise HTTPException(502, detail={"code": "USER_SETTINGS_UNAVAILABLE"})
        return rows

    async def get_preferences(self) -> dict[str, Any]:
        rows = await self.request("GET", "user_app_preferences", params={
            "select": "theme_mode,font_size_step,simple_mode_enabled",
            "user_id": f"eq.{self.user_id}", "limit": "1",
        })
        return rows[0] if rows else DisplayPreferencesInput().model_dump()

    async def put_preferences(self, body: DisplayPreferencesInput) -> dict[str, Any]:
        rows = await self.request("POST", "user_app_preferences", params={
            "on_conflict": "user_id",
            "select": "theme_mode,font_size_step,simple_mode_enabled",
        }, payload={"user_id": self.user_id, **body.model_dump()}, write=True)
        if len(rows) != 1:
            raise HTTPException(502, detail={"code": "USER_SETTINGS_UNAVAILABLE"})
        return rows[0]

    async def get_notification_preferences(self) -> dict[str, Any]:
        select = ",".join(NotificationPreferencesInput.model_fields)
        rows = await self.request("GET", "notification_settings", params={
            "select": select, "user_id": f"eq.{self.user_id}", "limit": "1",
        })
        return rows[0] if rows else NotificationPreferencesInput().model_dump()

    async def put_notification_preferences(self, body: NotificationPreferencesInput) -> dict[str, Any]:
        rows = await self.request("POST", "notification_settings", params={
            "on_conflict": "user_id", "select": ",".join(NotificationPreferencesInput.model_fields),
        }, payload={"user_id": self.user_id, **body.model_dump()}, write=True)
        if len(rows) != 1:
            raise HTTPException(502, detail={"code": "USER_SETTINGS_UNAVAILABLE"})
        return rows[0]

    async def get_health_goal(self) -> dict[str, Any] | None:
        rows = await self.request("GET", "user_health_goals", params={
            "select": "user_health_goal_id,goal_type,goal_text,target_date,updated_at",
            "user_id": f"eq.{self.user_id}", "status": "eq.active", "limit": "1",
        })
        return rows[0] if rows else None

    async def put_health_goal(self, body: HealthGoalInput) -> dict[str, Any]:
        values = body.model_dump()
        select = "user_health_goal_id,goal_type,goal_text,target_date,updated_at"
        rows = await self.request("PATCH", "user_health_goals", params={
            "user_id": f"eq.{self.user_id}", "status": "eq.active", "select": select,
        }, payload=values, write=True)
        if rows:
            if len(rows) != 1:
                raise HTTPException(502, detail={"code": "USER_SETTINGS_UNAVAILABLE"})
            return rows[0]
        rows = await self.request("POST", "user_health_goals", params={
            "select": select,
        }, payload={"user_id": self.user_id, "status": "active", **values}, write=True)
        if len(rows) != 1:
            raise HTTPException(502, detail={"code": "USER_SETTINGS_UNAVAILABLE"})
        return rows[0]


def create_user_settings_router(get_user: Any, get_settings: Any) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["Profile"])

    def get_store(user: Any = Depends(get_user),
                  settings: Any = Depends(get_settings)) -> UserSettingsStore:
        return UserSettingsStore(settings, user.id)

    @router.get("/app/preferences")
    async def get_preferences(store: UserSettingsStore = Depends(get_store)) -> dict[str, Any]:
        return {"preferences": await store.get_preferences()}

    @router.put("/app/preferences")
    async def put_preferences(body: DisplayPreferencesInput,
                              store: UserSettingsStore = Depends(get_store)) -> dict[str, Any]:
        return {"preferences": await store.put_preferences(body)}

    @router.get("/notifications/preferences")
    async def get_notification_preferences(store: UserSettingsStore = Depends(get_store)) -> dict[str, Any]:
        return {"preferences": await store.get_notification_preferences()}

    @router.put("/notifications/preferences")
    async def put_notification_preferences(body: NotificationPreferencesInput,
                                           store: UserSettingsStore = Depends(get_store)) -> dict[str, Any]:
        return {"preferences": await store.put_notification_preferences(body)}

    @router.get("/health/goals/active")
    async def get_health_goal(store: UserSettingsStore = Depends(get_store)) -> dict[str, Any]:
        return {"goal": await store.get_health_goal()}

    @router.put("/health/goals/active")
    async def put_health_goal(body: HealthGoalInput,
                              store: UserSettingsStore = Depends(get_store)) -> dict[str, Any]:
        return {"goal": await store.put_health_goal(body)}

    return router
