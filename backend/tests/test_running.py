from copy import deepcopy
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import running
from backend.app.running_ai import AIServerConfig, RunningAIClient


OWNER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
KEY = "synthetic-test-key-" + "x" * 32
COORD = {"latitude": 37.3948, "longitude": 127.1112}


def generated(*, within=True):
    return {
        "course_id": "generated-123", "name": "순환 코스", "source": {"source_type": "auto_generated", "provider": "Kakao"},
        "target_distance_km": 5, "distance_km": 5.2 if within else 6.2,
        "distance_error_km": .2 if within else 1.2,
        "distance_error_percent": 4 if within else 24,
        "within_tolerance": within, "estimated_duration_minutes": 33,
        "pace_source": "user", "start": COORD, "end": COORD,
        "waypoints": [COORD], "path": [COORD, COORD], "generation_seed": 2,
    }


@pytest.fixture
def harness(monkeypatch):
    state = {"reply": {"status": "matched", "candidates": [generated()]},
             "calls": [], "saved": [], "user": OWNER, "pace": 6.5}

    def get_user(authorization: str | None = Header(default=None)):
        if authorization != "Bearer test-owner":
            raise HTTPException(401)
        return SimpleNamespace(id=state["user"])

    def settings():
        return SimpleNamespace(supabase_url="https://db.example.invalid",
                               supabase_service_role_key=KEY)

    class FakeStore:
        def __init__(self, settings, user_id):
            self.user_id = user_id
            self.secret = settings.supabase_service_role_key

        async def pace(self):
            return state["pace"]

        async def set_pace(self, value):
            state["pace"] = value
            return {"pace_minutes_per_km": value}

        async def save(self, source_type, course_id, name, snapshot, favorite, selected):
            row = {"user_id": self.user_id, "source_type": source_type,
                   "source_course_id": course_id, "course_name": name,
                   "snapshot": deepcopy(snapshot), "is_favorite": favorite,
                   "is_selected": selected}
            state["saved"].append(row)
            return row

        async def list_saved(self, *, favorites_only=False):
            return [row for row in state["saved"] if row["user_id"] == self.user_id
                    and (not favorites_only or row["is_favorite"])]

        async def set_favorite(self, saved_id, favorite):
            raise NotImplementedError()

    class FakeAI:
        async def request(self, operation, **kwargs):
            state["calls"].append((operation, deepcopy(kwargs)))
            return deepcopy(state["reply"])

    monkeypatch.setattr(running, "RunningStore", FakeStore)
    app = FastAPI()
    app.include_router(running.create_running_router(get_user, settings))
    app.dependency_overrides[running.get_running_ai_client] = FakeAI
    with TestClient(app, headers={"Authorization": "Bearer test-owner"}) as client:
        yield client, state


def test_generate_uses_saved_pace_and_saves_full_path(harness):
    client, state = harness
    response = client.post("/api/running/routes/generate-loop", json={
        "start": COORD, "distance_option": "5km", "seed": 2,
    })
    assert response.status_code == 200, response.text
    assert state["calls"][0][1]["body"]["pace_minutes_per_km"] == 6.5
    candidate = response.json()["candidates"][0]
    token = candidate.pop("selection_token")
    saved = client.post("/api/running/saved-courses", json={
        "snapshot": candidate, "selection_token": token, "is_favorite": True,
    })
    assert saved.status_code == 201, saved.text
    assert saved.json()["snapshot"]["path"] == [COORD, COORD]
    assert saved.json()["snapshot"]["generation_seed"] == 2
    assert client.get("/api/running/saved-courses?favorites_only=true").json()["courses"]


def test_best_effort_requires_explicit_acceptance(harness):
    client, state = harness
    state["reply"] = {"status": "best_effort", "candidates": [generated(within=False)]}
    candidate = client.post("/api/running/routes/generate-loop", json={"start": COORD}).json()["candidates"][0]
    token = candidate.pop("selection_token")
    payload = {"snapshot": candidate, "selection_token": token}
    rejected = client.post("/api/running/saved-courses", json=payload)
    assert rejected.status_code == 409
    assert state["saved"] == []
    accepted = client.post("/api/running/saved-courses", json={**payload, "accept_distance_error": True})
    assert accepted.status_code == 201
    assert accepted.json()["snapshot"]["distance_error_percent"] == 24


def test_tampered_or_other_user_candidate_cannot_save(harness):
    client, state = harness
    candidate = client.post("/api/running/routes/generate-loop", json={"start": COORD}).json()["candidates"][0]
    token = candidate.pop("selection_token")
    candidate["distance_km"] = 1
    assert client.post("/api/running/saved-courses", json={"snapshot": candidate,
                        "selection_token": token}).status_code == 409
    candidate["distance_km"] = 5.2
    state["user"] = OTHER
    assert client.post("/api/running/saved-courses", json={"snapshot": candidate,
                        "selection_token": token}).status_code == 409
    assert state["saved"] == []


def test_unavailable_and_generation_required_are_not_candidates(harness):
    client, state = harness
    state["reply"] = {"status": "unavailable", "candidates": []}
    response = client.post("/api/running/routes/generate-loop", json={"start": COORD})
    assert response.status_code == 200 and response.json()["candidates"] == []
    state["reply"] = {"status": "generation_required", "courses": [], "generation_recommended": True}
    response = client.get("/api/running/courses/recommend?region=성남시")
    assert response.status_code == 200 and response.json()["status"] == "generation_required"


def test_official_metadata_needs_signed_route_preview(harness):
    client, state = harness
    course = {"course_id": "official-123", "name": "공식 코스", "region": "성남시",
              "source": {"source_type": "official_metadata", "provider": "public-data"},
              "path": [], "requires_route_validation": True}
    state["reply"] = {"course": course}
    detail = client.get("/api/running/courses/official-123")
    assert detail.status_code == 200, detail.text
    signed = detail.json()["course"]
    token = signed.pop("selection_token")
    payload = {"snapshot": signed, "selection_token": token}
    assert client.post("/api/running/saved-courses", json=payload).status_code == 409
    state["reply"] = {"distance_km": 5.1, "path": [COORD, COORD]}
    preview = client.post("/api/running/routes/preview", json={
        "start": COORD, "end": COORD, "waypoints": [COORD],
    })
    assert preview.status_code == 200, preview.text
    route = preview.json()
    preview_token = route.pop("preview_token")
    saved = client.post("/api/running/saved-courses", json={
        **payload, "preview": route, "preview_token": preview_token,
    })
    assert saved.status_code == 201, saved.text
    assert saved.json()["snapshot"]["path"] == [COORD, COORD]
    assert saved.json()["snapshot"]["verified_route_preview"]["distance_km"] == 5.1


def test_auth_and_input_validation(harness):
    client, state = harness
    assert client.get("/api/running/pace", headers={"Authorization": ""}).status_code == 401
    assert client.get("/api/running/courses/recommend?latitude=37").status_code == 422
    assert client.post("/api/running/routes/generate-loop", json={"start": COORD,
                       "distance_option": "custom"}).status_code == 422
    assert state["calls"] == []


def test_running_transport_keeps_key_server_side_and_encodes_detail_id():
    def handler(request):
        assert request.headers["authorization"] == f"Bearer {KEY}"
        assert request.method == "GET"
        assert request.url.raw_path.split(b"?", 1)[0] == b"/running/courses/a%2Fb"
        assert request.url.params["pace_minutes_per_km"] == "6.5"
        return httpx.Response(200, json={"course_id": "a/b"})

    client = RunningAIClient(AIServerConfig("https://ai.example.invalid", KEY),
                             transport=httpx.MockTransport(handler))
    import asyncio
    assert asyncio.run(client.request("detail", course_id="a/b",
                                      params={"pace_minutes_per_km": 6.5})) == {"course_id": "a/b"}
