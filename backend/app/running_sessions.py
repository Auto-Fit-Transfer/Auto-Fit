"""Foreground GPS running sessions for R7 E8.

Only the authenticated owner reaches these service-role writes. The server
derives distance from accepted coordinates; the client never submits distance.
"""

from datetime import date, datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any, Callable, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from backend.app.running import RunningStore


class StartFreeRun(BaseModel):
    target_distance_meters: int = Field(ge=1000, le=50000)
    target_duration_seconds: int = Field(ge=600, le=14400)
    region_name: str | None = Field(default=None, max_length=120)
    condition_level: Literal["good", "normal", "tired"] = "normal"
    intensity: Literal["light", "moderate", "hard"] = "light"
    discomfort_areas: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def clean_region(self):
        self.region_name = self.region_name.strip() or None if self.region_name else None
        return self


class StartSavedCourse(BaseModel):
    saved_course_id: UUID
    target_duration_seconds: int = Field(ge=600, le=14400)
    condition_level: Literal["good", "normal", "tired"] = "normal"
    intensity: Literal["light", "moderate", "hard"] = "light"
    discomfort_areas: list[str] = Field(default_factory=list, max_length=20)


class TrackPointInput(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_meters: float | None = Field(default=None, ge=0, le=10000)
    elapsed_seconds: int = Field(ge=0, le=86400)


class ElapsedInput(BaseModel):
    elapsed_seconds: int = Field(ge=0, le=86400)


SESSION_FIELDS = (
    "running_session_id,running_recommendation_id,status,started_at,paused_at,"
    "ended_at,saved_at,elapsed_seconds,distance_meters,average_pace_seconds_per_km,"
    "calories_burned,created_at,updated_at"
)
POINT_FIELDS = (
    "running_track_point_id,sequence_number,recorded_at,elapsed_seconds,"
    "cumulative_distance_meters,latitude,longitude,accuracy_meters"
)


def _one(rows: Any, code: int = 502) -> dict[str, Any]:
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise HTTPException(code, detail="러닝 기록을 처리하지 못했습니다.")
    return rows[0]


def _seconds_since(iso: str, now: datetime) -> int:
    try:
        started = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if started.tzinfo is None:
            raise ValueError()
        return max(0, int((now - started).total_seconds()))
    except (TypeError, ValueError):
        raise HTTPException(502, detail="러닝 시작 시각이 올바르지 않습니다.") from None


def _validate_elapsed(session: dict[str, Any], elapsed: int, now: datetime) -> None:
    if elapsed < int(session["elapsed_seconds"]):
        raise HTTPException(409, detail="운동 시간이 이전 기록보다 짧습니다.")
    if elapsed > _seconds_since(session["started_at"], now) + 5:
        raise HTTPException(422, detail="운동 시간이 실제 경과 시간보다 깁니다.")


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    part = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * radius * asin(min(1, sqrt(part)))


class RunningSessionService:
    def __init__(self, settings: Any, user_id: str):
        self.store = RunningStore(settings, user_id)
        self.user_id = user_id

    async def _owned(self, session_id: UUID) -> dict[str, Any]:
        rows = await self.store.request("GET", "running_sessions", params={
            "select": SESSION_FIELDS, "running_session_id": f"eq.{session_id}",
            "user_id": f"eq.{self.user_id}", "limit": "1",
        })
        if not rows:
            raise HTTPException(404, detail="러닝 기록을 찾지 못했습니다.")
        return _one(rows)

    async def _last_point(self, session_id: str) -> dict[str, Any] | None:
        rows = await self.store.request("GET", "running_track_points", params={
            "select": POINT_FIELDS, "running_session_id": f"eq.{session_id}",
            "order": "sequence_number.desc", "limit": "1",
        })
        if not isinstance(rows, list) or len(rows) > 1:
            raise HTTPException(502, detail="러닝 경로를 불러오지 못했습니다.")
        return rows[0] if rows else None

    async def _update(self, session_id: str, status: str, values: dict[str, Any]) -> dict[str, Any]:
        rows = await self.store.request("PATCH", "running_sessions", params={
            "select": SESSION_FIELDS, "running_session_id": f"eq.{session_id}",
            "user_id": f"eq.{self.user_id}", "status": f"eq.{status}",
        }, body=values)
        if not rows:
            raise HTTPException(409, detail="러닝 상태가 바뀌었습니다. 다시 불러와 주세요.")
        return _one(rows)

    async def active(self) -> dict[str, Any] | None:
        rows = await self.store.request("GET", "running_sessions", params={
            "select": SESSION_FIELDS, "user_id": f"eq.{self.user_id}",
            "status": "in.(in_progress,paused)", "order": "started_at.desc", "limit": "1",
        })
        if not isinstance(rows, list):
            raise HTTPException(502, detail="진행 중인 러닝을 확인하지 못했습니다.")
        return rows[0] if rows else None

    async def history(self, limit: int, from_date: date | None = None,
                      to_date: date | None = None) -> list[dict[str, Any]]:
        params = {
            "select": SESSION_FIELDS, "user_id": f"eq.{self.user_id}",
            "status": "eq.completed", "order": "ended_at.desc", "limit": str(limit),
        }
        if from_date:
            params["started_at"] = f"gte.{from_date.isoformat()}T00:00:00+00:00"
        if to_date:
            end = f"{(to_date + timedelta(days=1)).isoformat()}T00:00:00+00:00"
            if from_date:
                params["and"] = f"(started_at.lt.{end})"
            else:
                params["started_at"] = f"lt.{end}"
        rows = await self.store.request("GET", "running_sessions", params=params)
        if not isinstance(rows, list):
            raise HTTPException(502, detail="러닝 기록을 불러오지 못했습니다.")
        return rows

    async def start(self, body: StartFreeRun) -> dict[str, Any]:
        if await self.active():
            raise HTTPException(409, detail="진행 중인 러닝이 있습니다. 먼저 이어서 하거나 종료해 주세요.")
        distance = body.target_distance_meters
        label = f"자유 러닝 {distance / 1000:g}km"
        course = _one(await self.store.request("POST", "running_custom_courses", body={
            "user_id": self.user_id, "name": label,
            "description": "사용자가 직접 설정한 자유 러닝. 예정 경로 없음.",
            "region_name": body.region_name, "distance_meters": distance,
            "estimated_duration_seconds": body.target_duration_seconds,
        }))
        course_id = course["running_custom_course_id"]
        recommendation_id = None
        try:
            recommendation = _one(await self.store.request("POST", "running_recommendations", body={
                "user_id": self.user_id, "running_custom_course_id": course_id,
                "condition_level": body.condition_level,
                "target_duration_seconds": body.target_duration_seconds,
                "intensity": body.intensity, "location_type": "outdoor",
                "discomfort_areas": body.discomfort_areas,
                "course_name_snapshot": label,
                "target_distance_meters": distance,
                "recommendation_reason": "사용자가 직접 설정한 자유 러닝",
            }))
            recommendation_id = recommendation["running_recommendation_id"]
            session = _one(await self.store.request("POST", "running_sessions", body={
                "user_id": self.user_id, "running_recommendation_id": recommendation_id,
                "status": "in_progress",
            }))
            return session
        except HTTPException:
            # Each PostgREST write is its own transaction. Remove only rows
            # created by this request, in child-to-parent order.
            if recommendation_id:
                await self.store.request("DELETE", "running_recommendations", params={
                    "running_recommendation_id": f"eq.{recommendation_id}",
                    "user_id": f"eq.{self.user_id}",
                })
            await self.store.request("DELETE", "running_custom_courses", params={
                "running_custom_course_id": f"eq.{course_id}", "user_id": f"eq.{self.user_id}",
            })
            raise

    async def start_saved(self, body: StartSavedCourse) -> dict[str, Any]:
        if await self.active():
            raise HTTPException(409, detail="진행 중인 러닝이 있습니다. 먼저 이어서 하거나 종료해 주세요.")
        rows = await self.store.request("GET", "running_saved_courses", params={
            "select": "running_saved_course_id,course_name,snapshot",
            "running_saved_course_id": f"eq.{body.saved_course_id}",
            "user_id": f"eq.{self.user_id}", "limit": "1",
        })
        if not rows:
            raise HTTPException(404, detail="저장한 코스를 찾지 못했습니다.")
        saved = _one(rows)
        snapshot = saved.get("snapshot")
        if not isinstance(snapshot, dict):
            raise HTTPException(502, detail="저장한 코스 정보가 올바르지 않습니다.")
        path = snapshot.get("path")
        if not isinstance(path, list) or len(path) < 2:
            raise HTTPException(409, detail="경로 좌표가 없는 코스는 시작할 수 없습니다.")
        distance_km = snapshot.get("distance_km")
        if (isinstance(distance_km, bool) or not isinstance(distance_km, (int, float))
                or not 0 < distance_km <= 100):
            raise HTTPException(409, detail="코스 거리를 확인할 수 없습니다.")
        distance = round(distance_km * 1000)
        label = str(saved["course_name"]).strip()[:120]
        if not label:
            raise HTTPException(502, detail="저장한 코스 이름이 올바르지 않습니다.")
        recommendation = _one(await self.store.request("POST", "running_recommendations", body={
            "user_id": self.user_id, "running_saved_course_id": str(body.saved_course_id),
            "condition_level": body.condition_level,
            "target_duration_seconds": body.target_duration_seconds,
            "intensity": body.intensity, "location_type": "outdoor",
            "discomfort_areas": body.discomfort_areas,
            "course_name_snapshot": label,
            "target_distance_meters": distance,
            "recommendation_reason": "사용자가 저장한 코스를 선택함",
        }))
        recommendation_id = recommendation["running_recommendation_id"]
        try:
            return _one(await self.store.request("POST", "running_sessions", body={
                "user_id": self.user_id, "running_recommendation_id": recommendation_id,
                "status": "in_progress",
            }))
        except HTTPException:
            await self.store.request("DELETE", "running_recommendations", params={
                "running_recommendation_id": f"eq.{recommendation_id}",
                "user_id": f"eq.{self.user_id}",
            })
            raise

    async def append_point(self, session_id: UUID, body: TrackPointInput) -> dict[str, Any]:
        session = await self._owned(session_id)
        if session["status"] != "in_progress":
            raise HTTPException(409, detail="일시정지 또는 종료된 러닝에는 위치를 추가할 수 없습니다.")
        now = datetime.now(timezone.utc)
        _validate_elapsed(session, body.elapsed_seconds, now)
        if body.accuracy_meters is None or body.accuracy_meters > 50:
            return {"accepted": False, "reason": "low_accuracy", "session": session}
        last = await self._last_point(str(session_id))
        if last:
            step = _distance_meters(float(last["latitude"]), float(last["longitude"]),
                                    body.latitude, body.longitude)
            delta_time = (now - datetime.fromisoformat(
                last["recorded_at"].replace("Z", "+00:00"))).total_seconds()
            if step < 3:
                return {"accepted": False, "reason": "small_movement", "session": session}
            if delta_time <= 0 or step / delta_time > 12:
                return {"accepted": False, "reason": "gps_jump", "session": session}
            sequence = int(last["sequence_number"]) + 1
            cumulative = round(float(last["cumulative_distance_meters"]) + step, 2)
        else:
            sequence = 0
            cumulative = 0.0
        point = _one(await self.store.request("POST", "running_track_points", body={
            "running_session_id": str(session_id), "sequence_number": sequence,
            "recorded_at": now.isoformat(), "elapsed_seconds": body.elapsed_seconds,
            "cumulative_distance_meters": cumulative, "latitude": body.latitude,
            "longitude": body.longitude, "accuracy_meters": body.accuracy_meters,
        }))
        updated = await self._update(str(session_id), "in_progress", {
            "elapsed_seconds": body.elapsed_seconds,
            "distance_meters": cumulative,
        })
        return {"accepted": True, "point": point, "session": updated}

    async def pause(self, session_id: UUID, elapsed: int) -> dict[str, Any]:
        session = await self._owned(session_id)
        if session["status"] == "paused":
            return session
        if session["status"] != "in_progress":
            raise HTTPException(409, detail="종료된 러닝은 일시정지할 수 없습니다.")
        now = datetime.now(timezone.utc)
        _validate_elapsed(session, elapsed, now)
        return await self._update(str(session_id), "in_progress", {
            "status": "paused", "paused_at": now.isoformat(),
            "elapsed_seconds": elapsed,
        })

    async def resume(self, session_id: UUID) -> dict[str, Any]:
        session = await self._owned(session_id)
        if session["status"] == "in_progress":
            return session
        if session["status"] != "paused":
            raise HTTPException(409, detail="종료된 러닝은 다시 시작할 수 없습니다.")
        return await self._update(str(session_id), "paused", {
            "status": "in_progress", "paused_at": None,
        })

    async def complete(self, session_id: UUID, elapsed: int) -> dict[str, Any]:
        session = await self._owned(session_id)
        if session["status"] == "completed":
            return session
        if session["status"] not in {"paused", "in_progress"}:
            raise HTTPException(409, detail="이 러닝은 저장할 수 없습니다.")
        now = datetime.now(timezone.utc)
        if session["status"] == "paused":
            elapsed = int(session["elapsed_seconds"])
        else:
            _validate_elapsed(session, elapsed, now)
        last = await self._last_point(str(session_id))
        distance = float(last["cumulative_distance_meters"]) if last else 0.0
        return await self._update(str(session_id), session["status"], {
            "status": "completed", "paused_at": None,
            "ended_at": now.isoformat(), "saved_at": now.isoformat(),
            "elapsed_seconds": elapsed, "distance_meters": distance,
        })

    async def detail(self, session_id: UUID) -> dict[str, Any]:
        session = await self._owned(session_id)
        points = await self.store.request("GET", "running_track_points", params={
            "select": POINT_FIELDS, "running_session_id": f"eq.{session_id}",
            "order": "sequence_number.asc", "limit": "2000",
        })
        if not isinstance(points, list):
            raise HTTPException(502, detail="러닝 경로를 불러오지 못했습니다.")
        planned_course = None
        recommendations = await self.store.request("GET", "running_recommendations", params={
            "select": "running_saved_course_id,course_name_snapshot,target_distance_meters",
            "running_recommendation_id": f"eq.{session['running_recommendation_id']}",
            "user_id": f"eq.{self.user_id}", "limit": "1",
        })
        if not isinstance(recommendations, list) or len(recommendations) != 1:
            raise HTTPException(502, detail="러닝 코스 정보를 불러오지 못했습니다.")
        recommendation = recommendations[0]
        saved_id = recommendation.get("running_saved_course_id")
        if saved_id:
            saved_rows = await self.store.request("GET", "running_saved_courses", params={
                "select": "snapshot", "running_saved_course_id": f"eq.{saved_id}",
                "user_id": f"eq.{self.user_id}", "limit": "1",
            })
            if not isinstance(saved_rows, list) or len(saved_rows) != 1:
                raise HTTPException(502, detail="저장한 코스 경로를 불러오지 못했습니다.")
            snapshot = saved_rows[0].get("snapshot")
            path = snapshot.get("path") if isinstance(snapshot, dict) else None
            if not isinstance(path, list):
                raise HTTPException(502, detail="저장한 코스 경로가 올바르지 않습니다.")
            planned_course = {"name": recommendation["course_name_snapshot"],
                              "path": path,
                              "target_distance_meters": recommendation["target_distance_meters"]}
        return {"session": session, "points": points, "planned_course": planned_course}


def create_running_sessions_router(current_user_dependency: Callable,
                                   settings_dependency: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/running/sessions", tags=["Running"])

    def service(user: Any = Depends(current_user_dependency),
                settings: Any = Depends(settings_dependency)):
        return RunningSessionService(settings, user.id)

    @router.get("/active", summary="진행 중인 본인 러닝 조회")
    async def active(svc: RunningSessionService = Depends(service)):
        return {"session": await svc.active()}

    @router.get("/history", summary="완료한 본인 러닝 기록 조회")
    async def history(limit: int = 30, from_date: date | None = None,
                      to_date: date | None = None,
                      svc: RunningSessionService = Depends(service)):
        if limit < 1 or limit > 1000:
            raise HTTPException(422, detail="조회 개수는 1~1000개여야 합니다.")
        if from_date and to_date and (from_date > to_date or (to_date - from_date).days > 366):
            raise HTTPException(422, detail="러닝 기록 기간은 최대 367일입니다.")
        return {"sessions": await svc.history(limit, from_date, to_date)}

    @router.post("", status_code=201, summary="자유 러닝 시작")
    async def start(body: StartFreeRun, svc: RunningSessionService = Depends(service)):
        return {"session": await svc.start(body)}

    @router.post("/from-saved-course", status_code=201, summary="본인 저장 코스로 러닝 시작")
    async def start_saved(body: StartSavedCourse, svc: RunningSessionService = Depends(service)):
        return {"session": await svc.start_saved(body)}

    @router.get("/{session_id}", summary="본인 러닝 기록과 경로 조회")
    async def detail(session_id: UUID, svc: RunningSessionService = Depends(service)):
        return await svc.detail(session_id)

    @router.post("/{session_id}/points", summary="GPS 좌표 추가")
    async def point(session_id: UUID, body: TrackPointInput,
                    svc: RunningSessionService = Depends(service)):
        return await svc.append_point(session_id, body)

    @router.post("/{session_id}/pause", summary="러닝 일시정지")
    async def pause(session_id: UUID, body: ElapsedInput,
                    svc: RunningSessionService = Depends(service)):
        return {"session": await svc.pause(session_id, body.elapsed_seconds)}

    @router.post("/{session_id}/resume", summary="러닝 재개")
    async def resume(session_id: UUID, svc: RunningSessionService = Depends(service)):
        return {"session": await svc.resume(session_id)}

    @router.post("/{session_id}/complete", summary="러닝 완료 및 저장")
    async def complete(session_id: UUID, body: ElapsedInput,
                       svc: RunningSessionService = Depends(service)):
        return {"session": await svc.complete(session_id, body.elapsed_seconds)}

    return router
