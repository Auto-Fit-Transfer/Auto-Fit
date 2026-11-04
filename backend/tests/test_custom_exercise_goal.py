import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import main
from backend.tests.test_main import TEST_SETTINGS


@pytest.mark.parametrize("value", [None, "", " \n\t", "가" * 201])
def test_other_goal_requires_bounded_text(value):
    with pytest.raises(ValidationError):
        main.ExercisePreferencesRequest(
            goal_type="other", experience_level="beginner", custom_goal=value,
        )


def test_existing_goal_clears_custom_text():
    body = main.ExercisePreferencesRequest(
        goal_type="maintenance", experience_level="beginner", custom_goal="이전 목표",
    )
    assert body.custom_goal is None
    assert main.ExercisePreferencesRequest(
        goal_type="maintenance", experience_level="beginner",
    ).custom_goal is None


def test_custom_goal_api_roundtrip_and_clear(monkeypatch):
    stored = {}

    async def user():
        return main.AuthenticatedUser(id="owner")

    async def save(user_id, body, settings):
        assert user_id == "owner"
        stored.update(user_id=user_id, **body.model_dump())
        return stored.copy()

    async def fetch(user_id, settings):
        assert user_id == "owner"
        return stored.copy()

    monkeypatch.setattr(main, "upsert_exercise_preferences", save)
    monkeypatch.setattr(main, "fetch_exercise_preferences", fetch)
    main.app.dependency_overrides[main.get_current_user] = user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        client = TestClient(main.app)
        body = {"goal_type": "other", "experience_level": "beginner",
                "custom_goal": "  등산 준비  "}
        response = client.put("/api/exercise/preferences", json=body)
        assert response.status_code == 200
        assert response.json()["preferences"]["custom_goal"] == "등산 준비"
        assert client.get("/api/exercise/preferences").json()["preferences"] == stored
        assert client.put("/api/exercise/preferences", json={
            **body, "user_id": "victim",
        }).status_code == 422
        assert client.put("/api/exercise/preferences", json={
            **body, "custom_goal": "  ",
        }).status_code == 422
        assert client.put("/api/exercise/preferences", json={
            "goal_type": "endurance", "experience_level": "intermediate",
        }).json()["preferences"]["custom_goal"] is None
    finally:
        main.app.dependency_overrides.clear()


def test_custom_goal_storage_payload_and_select(monkeypatch):
    async def handle(request):
        assert "custom_goal" in request.url.params["select"]
        if request.method == "POST":
            assert json.loads(request.content) == {
                "user_id": "owner", "goal_type": "other",
                "experience_level": "beginner", "custom_goal": "등산 준비",
            }
        else:
            assert request.url.params["user_id"] == "eq.owner"
        return httpx.Response(200, json=[{"custom_goal": "등산 준비"}])

    original = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: original(
        **kwargs, transport=httpx.MockTransport(handle),
    ))
    body = main.ExercisePreferencesRequest(
        goal_type="other", experience_level="beginner", custom_goal="등산 준비",
    )
    assert asyncio.run(main.upsert_exercise_preferences("owner", body, TEST_SETTINGS))["custom_goal"] == "등산 준비"
    assert asyncio.run(main.fetch_exercise_preferences("owner", TEST_SETTINGS))["custom_goal"] == "등산 준비"


def test_other_goal_is_sent_to_ai():
    from backend.app.exercise_ai import build_request

    request = build_request(
        {"goal_type": "other", "experience_level": "beginner", "custom_goal": "등산 준비"},
        {
            "available_minutes": 30,
            "location": "home",
            "available_equipment": [],
            "condition_level": "좋음",
            "discomfort_areas": [],
        },
    )
    assert request["goal_type"] == "other"
    assert request["custom_goal"] == "등산 준비"


@pytest.mark.parametrize("custom_goal", [None, "", "   ", 123, "x" * 201])
def test_invalid_other_goal_cannot_reach_ai(custom_goal):
    from backend.app.exercise_ai import ExerciseAIError, build_request

    with pytest.raises(ExerciseAIError, match="Custom exercise goal is invalid"):
        build_request(
            {"goal_type": "other", "custom_goal": custom_goal},
            {"available_minutes": 30, "location": "home", "available_equipment": [],
             "condition_level": "좋음", "discomfort_areas": []},
        )
