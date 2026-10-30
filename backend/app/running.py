"""Authenticated running API and lossless AI-course selection snapshots."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from backend.app.http_client import client_scope
from backend.app.running_ai import AIServerError, RunningAIClient, get_ai_server_config


DistanceOption = Literal["3km", "5km", "10km", "custom"]


def fail(code: str, status: int = 502):
    raise HTTPException(status, detail={"code": code})


class Coordinate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PreviewRequest(BaseModel):
    start: Coordinate
    end: Coordinate
    waypoints: list[Coordinate] = Field(default_factory=list, max_length=25)
    pace_minutes_per_km: float | None = Field(default=None, ge=2, le=20)


class GenerateRequest(BaseModel):
    start: Coordinate
    distance_option: DistanceOption = "5km"
    custom_distance_km: float | None = Field(default=None, gt=0, le=100)
    pace_minutes_per_km: float | None = Field(default=None, ge=2, le=20)
    candidate_count: int = Field(default=3, ge=1, le=3)
    seed: int | None = Field(default=None, ge=0, le=2147483647)

    @model_validator(mode="after")
    def validate_custom_distance(self):
        if (self.distance_option == "custom") != (self.custom_distance_km is not None):
            raise ValueError("custom_distance_km is required only for custom distance")
        return self


class PaceRequest(BaseModel):
    pace_minutes_per_km: float = Field(ge=2, le=20)


class SaveCourseRequest(BaseModel):
    snapshot: dict[str, Any]
    selection_token: str = Field(min_length=1, max_length=100)
    preview: dict[str, Any] | None = None
    preview_token: str | None = Field(default=None, max_length=100)
    accept_distance_error: bool = False
    is_favorite: bool = False
    is_selected: bool = True


class FavoriteRequest(BaseModel):
    is_favorite: bool


def _canonical(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode()


def selection_token(secret: str, user_id: str, operation: str, snapshot: dict,
                    issued_at: int | None = None) -> str:
    stamp = int(time.time()) if issued_at is None else issued_at
    message = b"\0".join((user_id.encode(), operation.encode(), str(stamp).encode(), _canonical(snapshot)))
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"{stamp}.{digest}"


def verify_token(secret: str, user_id: str, operation: str, snapshot: dict, token: str):
    try:
        stamp_text, digest = token.split(".", 1)
        stamp = int(stamp_text)
        if stamp < time.time() - 1800 or stamp > time.time() + 60:
            raise ValueError()
        expected = selection_token(secret, user_id, operation, snapshot, stamp)
        if not hmac.compare_digest(token, expected):
            raise ValueError()
    except (TypeError, ValueError):
        fail("RUNNING_SELECTION_EXPIRED_OR_INVALID", 409)


def _course_parts(snapshot: dict) -> tuple[str, str, str]:
    source = snapshot.get("source")
    source_type = source.get("source_type") if isinstance(source, dict) else snapshot.get("source_type")
    course_id = snapshot.get("course_id")
    name = snapshot.get("course_name", snapshot.get("name"))
    if source_type not in {"official_metadata", "official_gpx", "auto_generated"}:
        fail("AI_INVALID_RESPONSE")
    if not isinstance(course_id, str) or not 1 <= len(course_id.strip()) <= 200:
        fail("AI_INVALID_RESPONSE")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 200:
        fail("AI_INVALID_RESPONSE")
    return source_type, course_id, name


def _check_path(path: Any, *, required: bool):
    if not isinstance(path, list) or len(path) > 10000 or (required and not path):
        fail("RUNNING_ROUTE_MISSING", 422)
    for point in path:
        try:
            Coordinate.model_validate(point)
        except Exception:
            fail("RUNNING_ROUTE_INVALID", 422)


def _sign_courses(result: dict, user_id: str, secret: str, *, operation: str) -> dict:
    status = result.get("status")
    allowed = {"matched", "generation_required"} if operation == "recommend" else {"matched", "best_effort", "unavailable"}
    if status not in allowed:
        fail("AI_INVALID_RESPONSE")
    key = "courses" if operation == "recommend" else "candidates"
    candidates = result.get(key)
    if not isinstance(candidates, list) or (status == "matched" and not candidates):
        fail("AI_INVALID_RESPONSE")
    if status in {"generation_required", "unavailable"} and candidates:
        fail("AI_INVALID_RESPONSE")
    signed = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            fail("AI_INVALID_RESPONSE")
        _course_parts(candidate)
        signed.append({**candidate, "selection_token": selection_token(secret, user_id, operation, candidate)}
                      if operation == "generate" else candidate)
    return {**result, key: signed}


class RunningStore:
    def __init__(self, settings, user_id: str):
        self.url = settings.supabase_url.rstrip("/")
        self.user_id = user_id
        key = settings.supabase_service_role_key
        self.secret = key
        self.headers = {"apikey": key, "Prefer": "return=representation"}
        if not key.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {key}"

    async def request(self, method: str, path: str, *, params=None, body=None, prefer=None):
        headers = {**self.headers, **({"Prefer": prefer} if prefer else {})}
        try:
            async with client_scope() as client:
                response = await client.request(method, f"{self.url}/rest/v1/{path}",
                                                headers=headers, params=params, json=body)
            if response.is_error:
                fail("RUNNING_STORAGE_ERROR")
            return response.json()
        except (httpx.HTTPError, ValueError):
            fail("RUNNING_STORAGE_ERROR")

    async def pace(self) -> float | None:
        rows = await self.request("GET", "running_pace_preferences", params={
            "select": "pace_minutes_per_km", "user_id": f"eq.{self.user_id}", "limit": "1",
        })
        if not isinstance(rows, list) or len(rows) > 1:
            fail("RUNNING_STORAGE_ERROR")
        return float(rows[0]["pace_minutes_per_km"]) if rows else None

    async def set_pace(self, value: float) -> dict:
        rows = await self.request("POST", "running_pace_preferences",
                                  params={"on_conflict": "user_id"},
                                  body={"user_id": self.user_id, "pace_minutes_per_km": value},
                                  prefer="resolution=merge-duplicates,return=representation")
        if not isinstance(rows, list) or len(rows) != 1:
            fail("RUNNING_STORAGE_ERROR")
        return rows[0]

    async def save(self, source_type: str, course_id: str, name: str,
                   snapshot: dict, favorite: bool, selected: bool) -> dict:
        row = await self.request("POST", "rpc/save_running_course", body={
            "p_user_id": self.user_id, "p_source_type": source_type,
            "p_source_course_id": course_id, "p_course_name": name,
            "p_snapshot": snapshot, "p_is_favorite": favorite,
            "p_is_selected": selected,
        })
        if not isinstance(row, dict) or row.get("user_id") != self.user_id:
            fail("RUNNING_STORAGE_ERROR")
        return row

    async def list_saved(self, *, favorites_only: bool = False) -> list[dict]:
        params = {"select": "*", "user_id": f"eq.{self.user_id}",
                  "order": "updated_at.desc", "limit": "100"}
        if favorites_only:
            params["is_favorite"] = "eq.true"
        rows = await self.request("GET", "running_saved_courses", params=params)
        if not isinstance(rows, list):
            fail("RUNNING_STORAGE_ERROR")
        return rows

    async def set_favorite(self, saved_id: UUID, favorite: bool) -> dict:
        row = await self.request("POST", "rpc/set_running_saved_course_favorite", body={
            "p_user_id": self.user_id, "p_saved_course_id": str(saved_id),
            "p_is_favorite": favorite,
        })
        if not isinstance(row, dict) or row.get("user_id") != self.user_id:
            fail("RUNNING_COURSE_NOT_FOUND", 404)
        return row


def get_running_ai_client():
    try:
        config = get_ai_server_config()
    except ValueError:
        fail("AI_CONFIGURATION_ERROR", 503)
    if config is None:
        fail("AI_DISABLED", 503)
    return RunningAIClient(config)


async def call_ai(client: RunningAIClient, operation: str, **kwargs) -> dict:
    try:
        return await client.request(operation, **kwargs)
    except AIServerError as exc:
        status = {"AI_COURSE_NOT_FOUND": 404, "AI_INPUT_REJECTED": 422,
                  "AI_UNAVAILABLE": 503, "AI_TIMEOUT": 503,
                  "AI_CONNECTION_ERROR": 503, "AI_UPSTREAM_ERROR": 502,
                  "AI_AUTH_FAILED": 503}.get(exc.code, 502)
        fail(exc.code, status)


def create_running_router(get_user, get_settings):
    router = APIRouter(prefix="/api/running", tags=["Running"])

    def store_dependency(user=Depends(get_user), settings=Depends(get_settings)):
        return RunningStore(settings, user.id)

    @router.get("/places/search")
    async def places(query: str = Query(min_length=2, max_length=100),
                     limit: int = Query(default=10, ge=1, le=20),
                     store=Depends(store_dependency), ai=Depends(get_running_ai_client)):
        return await call_ai(ai, "places", params={"query": query, "limit": limit})

    @router.get("/courses/recommend")
    async def recommend(distance_option: DistanceOption = "5km",
                        custom_distance_km: float | None = Query(default=None, gt=0, le=100),
                        region: str | None = Query(default=None, min_length=1, max_length=120),
                        latitude: float | None = Query(default=None, ge=-90, le=90),
                        longitude: float | None = Query(default=None, ge=-180, le=180),
                        pace_minutes_per_km: float | None = Query(default=None, ge=2, le=20),
                        limit: int = Query(default=10, ge=1, le=20),
                        store=Depends(store_dependency), ai=Depends(get_running_ai_client)):
        if (latitude is None) != (longitude is None) or (latitude is None and not region):
            fail("RUNNING_LOCATION_REQUIRED", 422)
        if (distance_option == "custom") != (custom_distance_km is not None):
            fail("RUNNING_DISTANCE_INVALID", 422)
        pace = pace_minutes_per_km if pace_minutes_per_km is not None else await store.pace()
        params = {"distance_option": distance_option, "limit": limit}
        for key, value in {"region": region, "latitude": latitude, "longitude": longitude,
                           "custom_distance_km": custom_distance_km,
                           "pace_minutes_per_km": pace}.items():
            if value is not None:
                params[key] = value
        result = await call_ai(ai, "recommend", params=params)
        return _sign_courses(result, store.user_id, store.secret, operation="recommend")

    @router.get("/courses/{course_id}")
    async def detail(course_id: str, pace_minutes_per_km: float | None = Query(default=None, ge=2, le=20),
                     store=Depends(store_dependency), ai=Depends(get_running_ai_client)):
        if not 1 <= len(course_id) <= 200 or course_id.startswith("generated-"):
            fail("RUNNING_COURSE_ID_INVALID", 422)
        pace = pace_minutes_per_km if pace_minutes_per_km is not None else await store.pace()
        result = await call_ai(ai, "detail", course_id=course_id,
                               params={"pace_minutes_per_km": pace} if pace is not None else None)
        course = result.get("course", result)
        if not isinstance(course, dict) or _course_parts(course)[1] != course_id:
            fail("AI_INVALID_RESPONSE")
        token = selection_token(store.secret, store.user_id, "detail", course)
        if "course" in result:
            return {**result, "course": {**course, "selection_token": token}}
        return {**result, "selection_token": token}

    @router.post("/routes/preview")
    async def preview(body: PreviewRequest, store=Depends(store_dependency),
                      ai=Depends(get_running_ai_client)):
        payload = body.model_dump(exclude_none=True)
        if body.pace_minutes_per_km is None:
            pace = await store.pace()
            if pace is not None:
                payload["pace_minutes_per_km"] = pace
        result = await call_ai(ai, "preview", body=payload)
        _check_path(result.get("path"), required=True)
        return {**result, "preview_token": selection_token(store.secret, store.user_id, "preview", result)}

    @router.post("/routes/generate-loop")
    async def generate(body: GenerateRequest, store=Depends(store_dependency),
                       ai=Depends(get_running_ai_client)):
        payload = body.model_dump(exclude_none=True)
        if body.pace_minutes_per_km is None:
            pace = await store.pace()
            if pace is not None:
                payload["pace_minutes_per_km"] = pace
        result = await call_ai(ai, "generate", body=payload)
        signed = _sign_courses(result, store.user_id, store.secret, operation="generate")
        for candidate in signed["candidates"]:
            if _course_parts(candidate)[0] != "auto_generated":
                fail("AI_INVALID_RESPONSE")
            _check_path(candidate.get("path"), required=True)
        return signed

    @router.get("/pace")
    async def get_pace(store=Depends(store_dependency)):
        value = await store.pace()
        return {"pace_minutes_per_km": value, "pace_source": "user" if value is not None else "default"}

    @router.put("/pace")
    async def put_pace(body: PaceRequest, store=Depends(store_dependency)):
        row = await store.set_pace(body.pace_minutes_per_km)
        return {"pace_minutes_per_km": float(row["pace_minutes_per_km"]), "pace_source": "user"}

    @router.get("/saved-courses")
    async def saved_courses(favorites_only: bool = False, store=Depends(store_dependency)):
        return {"courses": await store.list_saved(favorites_only=favorites_only)}

    @router.post("/saved-courses", status_code=201)
    async def save_course(body: SaveCourseRequest, store=Depends(store_dependency)):
        snapshot = body.snapshot.copy()
        snapshot.pop("selection_token", None)
        source_type, course_id, name = _course_parts(snapshot)
        operation = "generate" if source_type == "auto_generated" else "detail"
        verify_token(store.secret, store.user_id, operation, snapshot, body.selection_token)
        if source_type in {"auto_generated", "official_gpx"}:
            _check_path(snapshot.get("path"), required=True)
        if source_type == "auto_generated":
            if not isinstance(snapshot.get("within_tolerance"), bool):
                fail("AI_INVALID_RESPONSE")
            if not snapshot["within_tolerance"] and not body.accept_distance_error:
                fail("RUNNING_DISTANCE_ACCEPTANCE_REQUIRED", 409)
        if body.preview is not None:
            if source_type != "official_metadata" or body.preview_token is None:
                fail("RUNNING_PREVIEW_INVALID", 422)
            preview_data = body.preview.copy()
            preview_data.pop("preview_token", None)
            verify_token(store.secret, store.user_id, "preview", preview_data, body.preview_token)
            _check_path(preview_data.get("path"), required=True)
            distance = preview_data.get("distance_km")
            if isinstance(distance, bool) or not isinstance(distance, (int, float)) or distance <= 0:
                fail("RUNNING_PREVIEW_INVALID", 422)
            snapshot = {**snapshot, "path": preview_data["path"],
                        "verified_route_preview": preview_data,
                        "distance_km": distance, "route_validated": True}
        elif source_type == "official_metadata" and snapshot.get("requires_route_validation") is True:
            fail("RUNNING_PREVIEW_REQUIRED", 409)
        if source_type == "official_metadata":
            _check_path(snapshot.get("path", []), required=False)
        row = await store.save(source_type, course_id, name, snapshot,
                               body.is_favorite, body.is_selected)
        return row

    @router.patch("/saved-courses/{saved_id}/favorite")
    async def favorite(saved_id: UUID, body: FavoriteRequest, store=Depends(store_dependency)):
        return await store.set_favorite(saved_id, body.is_favorite)

    return router
