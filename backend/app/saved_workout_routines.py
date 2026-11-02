"""Owner-scoped saved workout and custom routine API for R7 E9-E11."""

from typing import Any, Callable, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from backend.app.http_client import client_scope


class RoutineItemInput(BaseModel):
    exercise_name: str = Field(min_length=1, max_length=160)
    sets: int | None = Field(default=None, ge=1, le=100)
    repetitions: int | None = Field(default=None, ge=1, le=10000)
    target_duration_seconds: int | None = Field(default=None, ge=1, le=86400)
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)
    instruction: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def validate_name(self):
        self.exercise_name = self.exercise_name.strip()
        if not self.exercise_name:
            raise ValueError("운동 이름을 입력해 주세요.")
        return self


class SaveRoutineInput(BaseModel):
    source_type: Literal["custom", "recommendation"]
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    source_recommendation_id: UUID | None = None
    items: list[RoutineItemInput] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_source(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("루틴 이름을 입력해 주세요.")
        if self.source_type == "custom" and (self.source_recommendation_id or not self.items):
            raise ValueError("직접 만든 루틴에는 하나 이상의 운동이 필요합니다.")
        if self.source_type == "recommendation" and (not self.source_recommendation_id or self.items):
            raise ValueError("추천 루틴 ID만 전달해 주세요.")
        return self


def _headers(settings: Any, *, representation: bool = False) -> dict[str, str]:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    if representation:
        headers["Prefer"] = "return=representation"
    return headers


async def _read(client: httpx.AsyncClient, settings: Any, table: str,
                columns: str, params: dict[str, str]) -> list[dict[str, Any]]:
    try:
        response = await client.get(f"{settings.supabase_url}/rest/v1/{table}",
                                    headers=_headers(settings),
                                    params={"select": columns, **params}, timeout=15)
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError("Invalid rows")
        return rows
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="저장한 운동을 불러오지 못했습니다.") from None


async def _insert(client: httpx.AsyncClient, settings: Any, table: str,
                  payload: Any) -> list[dict[str, Any]]:
    try:
        response = await client.post(f"{settings.supabase_url}/rest/v1/{table}",
                                     headers=_headers(settings, representation=True),
                                     json=payload, timeout=15)
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list) or not rows:
            raise ValueError("Missing inserted row")
        return rows
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 409:
            raise HTTPException(409, detail="이미 저장된 운동입니다.") from None
        raise HTTPException(502, detail="운동 루틴을 저장하지 못했습니다.") from None
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="운동 루틴을 저장하지 못했습니다.") from None


async def _delete(client: httpx.AsyncClient, settings: Any, table: str,
                  params: dict[str, str]) -> None:
    try:
        response = await client.delete(f"{settings.supabase_url}/rest/v1/{table}",
                                       headers=_headers(settings), params=params, timeout=15)
        response.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(502, detail="저장 실패 후 임시 루틴 정리가 필요합니다.") from None


ROUTINE_COLUMNS = ("user_workout_routine_id,source_recommendation_id,source_type,"
                   "name,description,status,created_at,updated_at")
ITEM_COLUMNS = ("user_workout_routine_item_id,user_workout_routine_id,sequence_order,"
                "exercise_type_id,exercise_name,target_duration_seconds,sets,"
                "repetitions,target_weight_kg,rest_seconds,instruction,demo_video_url")


async def list_saved_routines(user_id: str, settings: Any) -> list[dict[str, Any]]:
    async with client_scope() as client:
        routines = await _read(client, settings, "user_workout_routines", ROUTINE_COLUMNS,
                               {"user_id": f"eq.{user_id}", "status": "eq.active",
                                "order": "updated_at.desc", "limit": "100"})
        if not routines:
            return []
        ids = ",".join(str(UUID(row["user_workout_routine_id"])) for row in routines)
        items = await _read(client, settings, "user_workout_routine_items", ITEM_COLUMNS,
                            {"user_workout_routine_id": f"in.({ids})",
                             "order": "sequence_order.asc", "limit": "3000"})
    by_id = {row["user_workout_routine_id"]: [] for row in routines}
    for item in items:
        if item["user_workout_routine_id"] in by_id:
            by_id[item["user_workout_routine_id"]].append(item)
    return [{**row, "items": by_id[row["user_workout_routine_id"]]} for row in routines]


async def save_routine(user_id: str, settings: Any,
                       input: SaveRoutineInput) -> dict[str, Any]:
    async with client_scope() as client:
        source_id = str(input.source_recommendation_id) if input.source_recommendation_id else None
        if source_id:
            owned = await _read(client, settings, "exercise_recommendations",
                                "exercise_recommendation_id",
                                {"exercise_recommendation_id": f"eq.{source_id}",
                                 "user_id": f"eq.{user_id}", "limit": "1"})
            if not owned:
                raise HTTPException(404, detail="추천 운동을 찾지 못했습니다.")
            existing = await _read(client, settings, "user_workout_routines", ROUTINE_COLUMNS,
                                   {"user_id": f"eq.{user_id}",
                                    "source_recommendation_id": f"eq.{source_id}", "limit": "1"})
            if existing:
                raise HTTPException(409, detail="이미 저장한 추천 운동입니다.")
            source_items = await _read(client, settings, "exercise_items",
                                       "exercise_type_id,exercise_name,sequence_order,"
                                       "target_duration_seconds,sets,repetitions,"
                                       "target_weight_kg,rest_seconds,instruction,demo_video_url",
                                       {"exercise_recommendation_id": f"eq.{source_id}",
                                        "order": "sequence_order.asc", "limit": "31"})
            if not source_items:
                raise HTTPException(422, detail="추천 운동에 저장할 항목이 없습니다.")
            if len(source_items) > 30:
                raise HTTPException(422, detail="추천 운동은 최대 30개 항목까지 저장할 수 있습니다.")
            items = [{"sequence_order": index, "exercise_type_id": row.get("exercise_type_id"),
                      "exercise_name": row["exercise_name"],
                      "target_duration_seconds": row.get("target_duration_seconds"),
                      "sets": row.get("sets"), "repetitions": row.get("repetitions"),
                      "target_weight_kg": row.get("target_weight_kg"),
                      "rest_seconds": row.get("rest_seconds"),
                      "instruction": row.get("instruction") or "",
                      "demo_video_url": row.get("demo_video_url")}
                     for index, row in enumerate(source_items, 1)]
        else:
            items = [{"sequence_order": index, **item.model_dump()}
                     for index, item in enumerate(input.items, 1)]

        parent = (await _insert(client, settings, "user_workout_routines", {
            "user_id": user_id, "source_type": input.source_type,
            "source_recommendation_id": source_id,
            "name": input.name, "description": input.description,
        }))[0]
        routine_id = str(UUID(parent["user_workout_routine_id"]))
        try:
            saved_items = await _insert(client, settings, "user_workout_routine_items", [
                {"user_workout_routine_id": routine_id, **item} for item in items
            ])
        except HTTPException:
            # PostgREST does not make these two requests one transaction.
            await _delete(client, settings, "user_workout_routine_items",
                          {"user_workout_routine_id": f"eq.{routine_id}"})
            await _delete(client, settings, "user_workout_routines",
                          {"user_workout_routine_id": f"eq.{routine_id}",
                           "user_id": f"eq.{user_id}"})
            raise
        return {**{key: parent.get(key) for key in ROUTINE_COLUMNS.split(",")},
                "items": saved_items}


def create_saved_workout_router(current_user_dependency: Callable,
                                settings_dependency: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/exercise/saved-routines", tags=["Exercise"])

    @router.get("", summary="본인이 저장한 운동 조회")
    async def get_routines(user: Any = Depends(current_user_dependency),
                           settings: Any = Depends(settings_dependency)):
        return {"routines": await list_saved_routines(user.id, settings)}

    @router.post("", status_code=201, summary="추천 운동 또는 직접 만든 루틴 저장")
    async def post_routine(input: SaveRoutineInput,
                           user: Any = Depends(current_user_dependency),
                           settings: Any = Depends(settings_dependency)):
        return {"routine": await save_routine(user.id, settings, input)}

    return router
