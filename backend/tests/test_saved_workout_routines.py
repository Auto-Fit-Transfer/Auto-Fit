"""Saved routines require owner scope and clean partial PostgREST writes."""

from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import saved_workout_routines as routines

OWNER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
RECOMMENDATION = "00000000-0000-4000-8000-000000000010"
ROUTINE = "00000000-0000-4000-8000-000000000020"
ITEM = "00000000-0000-4000-8000-000000000030"


def make_client(monkeypatch, *, fail_items=False):
    requests = []
    parents = []
    children = []

    def handler(request):
        requests.append(request)
        table = request.url.path.rsplit("/", 1)[-1]
        if request.method == "GET":
            if table == "exercise_recommendations":
                return httpx.Response(200, json=[{"exercise_recommendation_id": RECOMMENDATION}]
                                      if request.url.params.get("user_id") == f"eq.{OWNER}" else [])
            if table == "exercise_items":
                return httpx.Response(200, json=[{"exercise_name": "스쿼트", "sequence_order": 1}])
            if table == "user_workout_routines":
                return httpx.Response(200, json=parents if request.url.params.get("user_id") == f"eq.{OWNER}" else [])
            if table == "user_workout_routine_items":
                return httpx.Response(200, json=children)
        if request.method == "POST" and table == "user_workout_routines":
            row = {**__import__("json").loads(request.content), "user_workout_routine_id": ROUTINE,
                   "status": "active", "created_at": "2026-10-29T00:00:00Z",
                   "updated_at": "2026-10-29T00:00:00Z"}
            parents.append(row)
            return httpx.Response(201, json=[row])
        if request.method == "POST" and table == "user_workout_routine_items":
            if fail_items:
                return httpx.Response(400, json={"message": "failed"})
            values = __import__("json").loads(request.content)
            children.extend({**value, "user_workout_routine_item_id": ITEM} for value in values)
            return httpx.Response(201, json=children)
        if request.method == "DELETE":
            if table == "user_workout_routine_items":
                children.clear()
            if table == "user_workout_routines":
                parents.clear()
            return httpx.Response(204)
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    @asynccontextmanager
    async def fake_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(routines, "client_scope", fake_scope)

    def get_user(authorization: str | None = Header(default=None)):
        if authorization != "Bearer owner-token":
            raise HTTPException(401)
        return SimpleNamespace(id=OWNER)

    def settings():
        return SimpleNamespace(supabase_url="https://db.example.invalid",
                               supabase_service_role_key="test-service-key")

    app = FastAPI()
    app.include_router(routines.create_saved_workout_router(get_user, settings))
    return TestClient(app, headers={"Authorization": "Bearer owner-token"}), requests, parents, children


def test_custom_create_and_list_scope_owner(monkeypatch):
    client, requests, parents, _ = make_client(monkeypatch)
    created = client.post("/api/exercise/saved-routines", json={
        "source_type": "custom", "name": "내 루틴",
        "items": [{"exercise_name": "스쿼트", "sets": 3, "repetitions": 10}],
    })
    assert created.status_code == 201, created.text
    assert parents[0]["user_id"] == OWNER
    listed = client.get("/api/exercise/saved-routines")
    assert listed.status_code == 200
    assert listed.json()["routines"][0]["items"][0]["exercise_name"] == "스쿼트"
    parent_read = next(request for request in requests if request.method == "GET"
                       and request.url.path.endswith("user_workout_routines"))
    assert parent_read.url.params["user_id"] == f"eq.{OWNER}"


def test_recommendation_requires_ownership_and_existing_save_is_rejected(monkeypatch):
    client, requests, _, _ = make_client(monkeypatch)
    payload = {"source_type": "recommendation", "name": "추천 운동",
               "source_recommendation_id": RECOMMENDATION}
    assert client.post("/api/exercise/saved-routines", json=payload).status_code == 201
    assert client.post("/api/exercise/saved-routines", json=payload).status_code == 409
    source_read = next(request for request in requests if request.url.path.endswith("exercise_recommendations"))
    assert source_read.url.params["user_id"] == f"eq.{OWNER}"
    assert source_read.url.params["exercise_recommendation_id"] == f"eq.{RECOMMENDATION}"


def test_invalid_input_does_not_write_and_partial_failure_cleans_parent(monkeypatch):
    client, requests, parents, children = make_client(monkeypatch, fail_items=True)
    assert client.post("/api/exercise/saved-routines", json={
        "source_type": "custom", "name": " ", "items": [],
    }).status_code == 422
    assert not requests
    failed = client.post("/api/exercise/saved-routines", json={
        "source_type": "custom", "name": "내 루틴",
        "items": [{"exercise_name": "스쿼트", "sets": 3, "repetitions": 10}],
    })
    assert failed.status_code == 502
    assert not parents and not children
    deletes = [request for request in requests if request.method == "DELETE"]
    assert [request.url.path.rsplit("/", 1)[-1] for request in deletes] == [
        "user_workout_routine_items", "user_workout_routines"]
    assert deletes[-1].url.params["user_id"] == f"eq.{OWNER}"


def test_requires_authentication(monkeypatch):
    client, requests, _, _ = make_client(monkeypatch)
    assert client.get("/api/exercise/saved-routines", headers={"Authorization": ""}).status_code == 401
    assert not requests
