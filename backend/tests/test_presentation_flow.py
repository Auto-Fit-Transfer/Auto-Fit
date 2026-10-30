from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.chat_storage import ChatStore
from backend.tests.test_main import TEST_SETTINGS


def test_presentation_flow_from_profile_to_progress(monkeypatch) -> None:
    user_id = "presentation-user"
    chat_id = str(uuid4())
    client_message_id = str(uuid4())
    context_id = str(uuid4())
    recommendation_id = str(uuid4())
    session_id = str(uuid4())
    state = {
        "profile": {
            "user_id": user_id,
            "name": "발표 사용자",
            "activity_level": "sedentary",
            "onboarding_completed_at": "2026-09-10T00:00:00Z",
        },
        "preferences": None,
        "context": None,
        "recommendation": None,
        "session": None,
        "logs": [],
    }

    async def current_user():
        return main.AuthenticatedUser(id=user_id, email="demo@example.com")

    async def fetch_profile(request_user_id, settings):
        assert request_user_id == user_id and settings == TEST_SETTINGS
        return state["profile"]

    async def update_profile(request_user_id, updates, settings):
        assert request_user_id == user_id and settings == TEST_SETTINGS
        state["profile"].update(updates)
        return state["profile"]

    async def fetch_preferences(request_user_id, settings):
        assert request_user_id == user_id and settings == TEST_SETTINGS
        return state["preferences"]

    async def save_preferences(request_user_id, body, settings):
        state["preferences"] = {
            "user_id": request_user_id,
            **body.model_dump(),
        }
        return state["preferences"]

    async def save_context(request_user_id, body, settings):
        state["context"] = {
            "exercise_recommendation_context_id": context_id,
            "exercise_recommendation_id": None,
            "user_id": request_user_id,
            **body.model_dump(),
        }
        return state["context"]

    async def fetch_unlinked_context(request_user_id, settings):
        context = state["context"]
        if context and context["exercise_recommendation_id"] is None:
            return context
        return None

    async def create_recommendation(request_user_id, context_id, plan, settings):
        assert request_user_id == user_id and context_id == state["context"][
            "exercise_recommendation_context_id"
        ]
        items = [
            {**item, "exercise_item_id": str(uuid4())}
            for item in plan["items"]
        ]
        state["recommendation"] = {
            "recommendation": {
                **plan["recommendation"],
                "exercise_recommendation_id": recommendation_id,
                "user_id": request_user_id,
                "status": "active",
            },
            "items": items,
        }
        state["context"]["exercise_recommendation_id"] = recommendation_id
        return state["recommendation"]

    async def fetch_recommendation(request_user_id, settings):
        assert request_user_id == user_id
        return state["recommendation"]

    async def exercise_rpc(name, payload, settings):
        assert payload["p_user_id"] == user_id
        if name == "start_exercise_session":
            state["session"] = {
                "exercise_session_id": session_id,
                "status": "in_progress",
                "started_at": datetime.now(UTC).isoformat(),
                "completed_at": None,
                "planned_item_count": len(state["recommendation"]["items"]),
                "completed_item_count": 0,
                "skipped_item_count": 0,
                "total_duration_seconds": 0,
                "total_calories_burned": 0,
            }
            return {"session": state["session"], "items": state["recommendation"]["items"]}
        if name == "record_exercise_item_result":
            log = {
                "exercise_item_id": payload["p_item_id"],
                "completed": payload["p_completed"],
                "duration_minutes": payload["p_duration_minutes"],
            }
            state["logs"].append(log)
            state["session"]["completed_item_count"] += 1
            state["session"]["total_duration_seconds"] += payload["p_duration_minutes"] * 60
            return {"session": state["session"], "log": log}
        state["session"].update({
            "status": "completed",
            "completed_at": datetime.now(UTC).isoformat(),
        })
        state["recommendation"]["recommendation"]["status"] = "completed"
        return {"session": state["session"], "logs": state["logs"]}

    async def completed_sessions(request_user_id, settings):
        return [state["session"]] if state["session"]["status"] == "completed" else []

    async def exchange(self, request_chat_id, request_id, content, answer=None):
        assert self.user_id == user_id and str(request_chat_id) == chat_id
        if answer is None:
            return None
        return {"is_replay": False, "assistant_message": answer}

    main.app.dependency_overrides[main.get_current_user] = current_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_profile", fetch_profile)
    monkeypatch.setattr(main, "update_profile", update_profile)
    monkeypatch.setattr(main, "fetch_exercise_preferences", fetch_preferences)
    monkeypatch.setattr(main, "upsert_exercise_preferences", save_preferences)
    monkeypatch.setattr(main, "create_exercise_context", save_context)
    monkeypatch.setattr(main, "fetch_latest_unlinked_exercise_context", fetch_unlinked_context)
    monkeypatch.setattr(main, "create_exercise_recommendation", create_recommendation)
    monkeypatch.setattr(main, "fetch_latest_exercise_recommendation", fetch_recommendation)
    monkeypatch.setattr(main, "call_exercise_session_rpc", exercise_rpc)
    monkeypatch.setattr(main, "fetch_completed_exercise_sessions", completed_sessions)
    monkeypatch.setattr(ChatStore, "exchange", exchange)

    try:
        client = TestClient(main.app)
        saved_profile = client.patch(
            "/api/profile", json={"nickname": "오토핏 데모"}
        )
        assert saved_profile.status_code == 200
        profile = client.get("/api/profile").json()
        assert profile["profile"]["user_id"] == user_id
        assert profile["profile"]["nickname"] == "오토핏 데모"
        assert profile["exercise_preferences"] is None

        assert client.put("/api/exercise/preferences", json={
            "goal_type": "maintenance", "experience_level": "beginner",
        }).status_code == 200
        assert client.post("/api/exercise/recommendation-contexts", json={
            "available_minutes": 30,
            "location": "home",
            "available_equipment": ["mat"],
            "condition_level": "좋음",
            "discomfort_areas": [],
        }).status_code == 200

        chat = client.post(f"/api/chats/{chat_id}/messages", json={
            "client_message_id": client_message_id,
            "content": "오늘 운동 루틴 만들어줘",
        })
        assert chat.status_code == 201
        assert chat.json()["assistant_message"]["evidence"][0][
            "exercise_recommendation_id"
        ] == recommendation_id

        routine = client.get("/api/exercise/recommendations/latest").json()["result"]
        assert routine["recommendation"]["intensity"] == "low"
        started = client.post("/api/exercise/sessions/start", json={}).json()["result"]
        for item in started["items"]:
            result = client.post(
                f"/api/exercise/sessions/{session_id}/items/{item['exercise_item_id']}",
                json={
                    "completed": True,
                    "skipped": False,
                    "duration_minutes": item["duration_minutes"],
                },
            )
            assert result.status_code == 200

        completed = client.post(
            f"/api/exercise/sessions/{session_id}/complete", json={}
        )
        assert completed.json()["result"]["session"]["status"] == "completed"
        summary = client.get("/api/exercise/summary").json()["summary"]
        assert summary["recent_7_days"]["workout_count"] == 1
        assert summary["recent_7_days"]["exercise_count"] == 3
        assert summary["cumulative"]["duration_minutes"] == 30
    finally:
        main.app.dependency_overrides.clear()
