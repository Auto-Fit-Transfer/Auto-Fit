"""R7 E8 owner scope, GPS distance, pause and completion."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import running_sessions

OWNER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
SESSION = "00000000-0000-4000-8000-000000000010"
COURSE = "00000000-0000-4000-8000-000000000011"
RECOMMENDATION = "00000000-0000-4000-8000-000000000012"
START = datetime.now(timezone.utc) - timedelta(minutes=1)


class FakeStore:
    instances = []
    fail_recommendation = False

    def __init__(self, _settings, user_id):
        self.user_id = user_id
        self.calls = []
        self.course = None
        self.recommendation = None
        self.session = None
        self.saved = None
        self.points = []
        FakeStore.instances.append(self)

    async def request(self, method, table, *, params=None, body=None, prefer=None):
        self.calls.append((method, table, params, body))
        if method == "GET" and table == "running_sessions":
            if self.session is None or params["user_id"] != f"eq.{self.session['user_id']}":
                return []
            if "running_session_id" in params and params["running_session_id"] != f"eq.{SESSION}":
                return []
            if "status" in params and params["status"].startswith("eq.") and params["status"] != f"eq.{self.session['status']}":
                return []
            if params.get("status") == "in.(in_progress,paused)" and self.session["status"] not in ("in_progress", "paused"):
                return []
            return [self.session.copy()]
        if method == "GET" and table == "running_saved_courses":
            if self.saved is None or params["user_id"] != f"eq.{self.saved['user_id']}":
                return []
            if params["running_saved_course_id"] != f"eq.{self.saved['running_saved_course_id']}":
                return []
            return [self.saved.copy()]
        if method == "GET" and table == "running_recommendations":
            if self.recommendation is None or params["user_id"] != f"eq.{self.recommendation['user_id']}":
                return []
            return [self.recommendation.copy()]
        if method == "GET" and table == "running_track_points":
            if params["order"] == "sequence_number.desc":
                return [self.points[-1].copy()] if self.points else []
            return [row.copy() for row in self.points]
        if method == "POST" and table == "running_custom_courses":
            self.course = {**body, "running_custom_course_id": COURSE}
            return [self.course.copy()]
        if method == "POST" and table == "running_recommendations":
            if self.fail_recommendation:
                raise HTTPException(502, detail="save failed")
            self.recommendation = {**body, "running_recommendation_id": RECOMMENDATION}
            return [self.recommendation.copy()]
        if method == "POST" and table == "running_sessions":
            self.session = {**body, "running_session_id": SESSION, "started_at": START.isoformat(),
                            "paused_at": None, "ended_at": None, "saved_at": None,
                            "elapsed_seconds": 0, "distance_meters": 0,
                            "average_pace_seconds_per_km": None, "calories_burned": 0}
            return [self.session.copy()]
        if method == "POST" and table == "running_track_points":
            row = {**body, "running_track_point_id": str(UUID(int=31))}
            # Simulate normal two-second GPS sampling without sleeping.
            if self.points:
                row["recorded_at"] = datetime.now(timezone.utc).isoformat()
            else:
                row["recorded_at"] = (datetime.now(timezone.utc) - timedelta(seconds=2)).isoformat()
            self.points.append(row)
            return [row.copy()]
        if method == "PATCH" and table == "running_sessions":
            if params["user_id"] != f"eq.{OWNER}" or params["status"] != f"eq.{self.session['status']}":
                return []
            self.session.update(body)
            return [self.session.copy()]
        if method == "DELETE" and table == "running_custom_courses":
            self.course = None
            return []
        if method == "DELETE" and table == "running_recommendations":
            self.recommendation = None
            return []
        raise AssertionError((method, table, params, body))


def harness(monkeypatch):
    FakeStore.instances = []
    FakeStore.fail_recommendation = False
    monkeypatch.setattr(running_sessions, "RunningStore", FakeStore)

    def get_user(authorization: str | None = Header(default=None)):
        if authorization != "Bearer owner-token":
            raise HTTPException(401)
        return SimpleNamespace(id=OWNER)

    def settings():
        return SimpleNamespace()

    app = FastAPI()
    app.include_router(running_sessions.create_running_sessions_router(get_user, settings))
    return TestClient(app, headers={"Authorization": "Bearer owner-token"})


def start(client):
    response = client.post("/api/running/sessions", json={
        "target_distance_meters": 5000, "target_duration_seconds": 1800,
        "intensity": "light", "condition_level": "normal",
    })
    assert response.status_code == 201, response.text
    return response


def test_owner_scoped_free_run_and_active_guard(monkeypatch):
    client = harness(monkeypatch)
    assert client.get("/api/running/sessions/history").status_code == 200
    response = start(client)
    store = FakeStore.instances[-1]
    assert store.course["user_id"] == OWNER
    assert store.recommendation["user_id"] == OWNER
    assert response.json()["session"]["user_id"] == OWNER
    # The in-memory fake is per request; use the same service to verify
    # ownership filters and the active guard directly.
    svc = running_sessions.RunningSessionService(SimpleNamespace(), OWNER)
    svc.store = store
    import asyncio
    assert asyncio.run(svc.active())["running_session_id"] == SESSION
    try:
        asyncio.run(svc.start(running_sessions.StartFreeRun(
            target_distance_meters=5000, target_duration_seconds=1800)))
        assert False, "active run should be rejected"
    except HTTPException as error:
        assert error.status_code == 409
    assert asyncio.run(svc.detail(UUID(SESSION)))["session"]["user_id"] == OWNER
    assert all(call[2]["user_id"] == f"eq.{OWNER}" for call in store.calls
               if call[0] == "GET" and call[1] == "running_sessions")


def test_gps_distance_filters_bad_accuracy_and_saves_result(monkeypatch):
    client = harness(monkeypatch)
    start(client)
    store = FakeStore.instances[-1]
    svc = running_sessions.RunningSessionService(SimpleNamespace(), OWNER)
    svc.store = store
    import asyncio
    first = asyncio.run(svc.append_point(UUID(SESSION), running_sessions.TrackPointInput(
        latitude=37.0, longitude=127.0, accuracy_meters=8, elapsed_seconds=3)))
    assert first["accepted"] and first["session"]["distance_meters"] == 0
    weak = asyncio.run(svc.append_point(UUID(SESSION), running_sessions.TrackPointInput(
        latitude=37.0001, longitude=127.0, accuracy_meters=80, elapsed_seconds=4)))
    assert not weak["accepted"] and len(store.points) == 1
    second = asyncio.run(svc.append_point(UUID(SESSION), running_sessions.TrackPointInput(
        latitude=37.0001, longitude=127.0, accuracy_meters=8, elapsed_seconds=5)))
    assert second["accepted"] and 10 < second["session"]["distance_meters"] < 12
    paused = asyncio.run(svc.pause(UUID(SESSION), 8))
    assert paused["status"] == "paused"
    assert asyncio.run(svc.resume(UUID(SESSION)))["status"] == "in_progress"
    saved = asyncio.run(svc.complete(UUID(SESSION), 10))
    assert saved["status"] == "completed"
    assert saved["distance_meters"] == second["session"]["distance_meters"]
    assert saved["saved_at"] and saved["ended_at"]
    assert asyncio.run(svc.active()) is None
    assert asyncio.run(svc.history(30))[0]["running_session_id"] == SESSION
    history_call = next(call for call in reversed(store.calls)
                        if call[0] == "GET" and call[1] == "running_sessions")
    assert history_call[2]["user_id"] == f"eq.{OWNER}"
    assert history_call[2]["status"] == "eq.completed"


def test_other_user_and_invalid_time_are_rejected(monkeypatch):
    client = harness(monkeypatch)
    start(client)
    store = FakeStore.instances[-1]
    import asyncio
    other = running_sessions.RunningSessionService(SimpleNamespace(), OTHER)
    other.store = store
    try:
        asyncio.run(other.detail(UUID(SESSION)))
        assert False, "other owner should not read session"
    except HTTPException as error:
        assert error.status_code == 404
    owner = running_sessions.RunningSessionService(SimpleNamespace(), OWNER)
    owner.store = store
    try:
        asyncio.run(owner.pause(UUID(SESSION), 7200))
        assert False, "elapsed time cannot exceed wall time"
    except HTTPException as error:
        assert error.status_code == 422
    assert client.get("/api/running/sessions/active", headers={"Authorization": ""}).status_code == 401


def test_start_failure_removes_temporary_course(monkeypatch):
    harness(monkeypatch)
    store = FakeStore(SimpleNamespace(), OWNER)
    store.fail_recommendation = True
    svc = running_sessions.RunningSessionService(SimpleNamespace(), OWNER)
    svc.store = store
    import asyncio
    try:
        asyncio.run(svc.start(running_sessions.StartFreeRun(
            target_distance_meters=5000, target_duration_seconds=1800)))
        assert False, "failed recommendation should not leave a course"
    except HTTPException as error:
        assert error.status_code == 502
    assert store.course is None


def test_history_date_range_is_bounded_and_owner_scoped(monkeypatch):
    client = harness(monkeypatch)
    response = client.get("/api/running/sessions/history?from_date=2026-10-01&to_date=2026-10-29")
    assert response.status_code == 200
    store = FakeStore.instances[-1]
    params = store.calls[-1][2]
    assert params["user_id"] == f"eq.{OWNER}"
    assert params["status"] == "eq.completed"
    assert params["started_at"] == "gte.2026-10-01T00:00:00+00:00"
    assert params["and"] == "(started_at.lt.2026-10-30T00:00:00+00:00)"
    assert client.get("/api/running/sessions/history?from_date=2026-10-29&to_date=2026-10-01").status_code == 422
    assert client.get("/api/running/sessions/history?from_date=2025-01-01&to_date=2026-10-29").status_code == 422


def test_saved_course_run_links_only_owned_valid_route(monkeypatch):
    harness(monkeypatch)
    store = FakeStore(SimpleNamespace(), OWNER)
    saved_id = str(UUID(int=40))
    store.saved = {
        "running_saved_course_id": saved_id, "user_id": OWNER,
        "course_name": "강변 코스", "snapshot": {
            "distance_km": 5.2,
            "path": [{"latitude": 37.1, "longitude": 127.1},
                     {"latitude": 37.2, "longitude": 127.2}],
        },
    }
    import asyncio
    body = running_sessions.StartSavedCourse(saved_course_id=UUID(saved_id),
                                            target_duration_seconds=1800)
    other = running_sessions.RunningSessionService(SimpleNamespace(), OTHER)
    other.store = store
    try:
        asyncio.run(other.start_saved(body))
        assert False, "other owner must not start saved course"
    except HTTPException as error:
        assert error.status_code == 404
    owner = running_sessions.RunningSessionService(SimpleNamespace(), OWNER)
    owner.store = store
    store.saved["snapshot"]["path"] = []
    try:
        asyncio.run(owner.start_saved(body))
        assert False, "course without route must not start"
    except HTTPException as error:
        assert error.status_code == 409
    store.saved["snapshot"]["path"] = [
        {"latitude": 37.1, "longitude": 127.1},
        {"latitude": 37.2, "longitude": 127.2},
    ]
    session = asyncio.run(owner.start_saved(body))
    assert session["running_recommendation_id"] == RECOMMENDATION
    assert store.recommendation["running_saved_course_id"] == saved_id
    assert store.recommendation["target_distance_meters"] == 5200
    assert store.course is None
    detail = asyncio.run(owner.detail(UUID(SESSION)))
    assert detail["planned_course"]["name"] == "강변 코스"
    assert len(detail["planned_course"]["path"]) == 2
    assert [call[2]["user_id"] for call in store.calls
            if call[0] == "GET" and call[1] == "running_saved_courses"] == [
                f"eq.{OTHER}", f"eq.{OWNER}", f"eq.{OWNER}", f"eq.{OWNER}"]
