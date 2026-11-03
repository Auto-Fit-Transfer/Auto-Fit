import asyncio
import copy
import json
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.ai_server import AIServerClient
from backend.app.exercise_ai import EXERCISE_TYPE_NAMES, ExerciseAIError, build_plan, build_request, gif_url_for_exercise, load_catalog


PREFERENCES = {"goal_type": "muscle_gain", "experience_level": "beginner"}
CONTEXT = {
    "available_minutes": 30,
    "location": "home",
    "available_equipment": [],
    "condition_level": "피곤해요",
    "discomfort_areas": ["오른쪽 무릎"],
}


def ai_response():
    version, catalog = load_catalog()
    selected = [
        (key, record) for key, record in catalog.items()
        if "home_training" in record.modes and "none" in record.home_equipment
    ][:2]
    assert len(selected) == 2
    return {
        "ok": True,
        "generator": "auto-fit-ai",
        "result": {
            "catalog_version": version,
            "summary": "무릎에 부담을 줄인 운동입니다.",
            "weekly_frequency": 3,
            "intensity": "낮음",
            "sessions": [
                {"name": "오늘의 홈트", "exercises": [
                    {
                        "exercise_key": key,
                        "name": f"운동 {index}",
                        "catalog_name_en": record.name_en,
                        "exercise_modes": ["home_training"],
                        "duration_minutes": 5,
                        "intensity": "낮음",
                        "instructions": ["천천히 수행하세요."],
                    }
                    for index, (key, record) in enumerate(selected)
                ]},
                {"name": "다음 운동", "exercises": [{
                    "exercise_key": selected[0][0],
                    "name": "다음 회차 운동",
                    "catalog_name_en": selected[0][1].name_en,
                    "exercise_modes": ["home_training"],
                    "duration_minutes": 5,
                }]},
            ],
            "cautions": ["통증이 생기면 중단하세요."],
            "sources": [],
        },
    }


def test_build_request_uses_only_available_user_choices():
    request = build_request(PREFERENCES, CONTEXT)
    assert request["goal_type"] == "muscle_gain"
    assert request["experience_level"] == "beginner"
    assert request["available_equipment"] == []
    assert request["condition_level"] == "피곤해요"
    assert request["daily_condition"] == "tired"
    assert request["has_discomfort"] is True
    assert request["discomfort_areas"] == ["오른쪽 무릎"]
    assert request["metric_statuses"] == {}
    assert request["preferred_training_types"] == []


def test_build_request_preserves_multiple_equipment_and_optional_condition():
    request = build_request({}, {
        **CONTEXT, "location": "gym", "available_equipment": ["dumbbell", "machine", "mat"],
        "condition_level": "보통", "discomfort_areas": [], "condition_note": "무릎 조심",
    })
    assert request["available_equipment"] == ["dumbbell", "machine", "mat"]
    assert request["condition_level"] == "보통"
    assert request["discomfort_areas"] == []
    assert request["condition_note"] == "무릎 조심"
    assert "goal_type" not in request


@pytest.mark.parametrize("condition, expected", [
    ("좋음", "good"), ("보통", "normal"), ("피곤해요", "tired"), ("안 좋아요", "poor"),
])
def test_build_request_preserves_each_condition(condition, expected):
    request = build_request(PREFERENCES, {**CONTEXT, "condition_level": condition})
    assert request["condition_level"] == condition
    assert request["daily_condition"] == expected


def test_build_request_rejects_stale_context_before_ai_call():
    with pytest.raises(ExerciseAIError, match="Stored exercise context"):
        build_request(PREFERENCES, {**CONTEXT, "condition_level": "normal"})


def test_build_plan_preserves_all_sessions_and_catalog_keys():
    response = ai_response()
    plan = build_plan(response, PREFERENCES, CONTEXT, "2026-11-03")
    assert plan["recommendation"]["generator"] == "auto-fit-ai"
    assert plan["recommendation"]["catalog_version"] == response["result"]["catalog_version"]
    assert plan["recommendation"]["total_duration_minutes"] == 10
    assert plan["recommendation"]["intensity"] == "low"
    assert len(plan["items"]) == 3
    assert [session["scheduled_date"] for session in plan["recommendation"]["plan_sessions"]] == [
        "2026-11-03", "2026-11-06"
    ]
    assert [item["plan_session_index"] for item in plan["items"]] == [1, 1, 2]
    assert plan["items"][0]["exercise_key"] == response["result"]["sessions"][0]["exercises"][0]["exercise_key"]
    assert all(item["execution_type"] == "time_based" for item in plan["items"])


def test_build_plan_uses_training_type_for_selected_mode():
    response = ai_response()
    _, catalog = load_catalog()
    key, record = next(
        (key, record) for key, record in catalog.items()
        if "home_training" in record.modes
        and "none" in record.home_equipment
        and dict(record.training_type_by_mode)["home_training"] != record.training_type
    )
    exercise = response["result"]["sessions"][0]["exercises"][0]
    exercise.update(exercise_key=key, catalog_name_en=record.name_en)
    plan = build_plan(response, PREFERENCES, CONTEXT, "2026-11-03")
    assert plan["items"][0]["exercise_type_name"] == EXERCISE_TYPE_NAMES[
        dict(record.training_type_by_mode)["home_training"]
    ]


@pytest.mark.parametrize("change", [
    lambda response: response["result"].update(catalog_version="sha256:wrong"),
    lambda response: response["result"]["sessions"][0]["exercises"][0].update(exercise_key="ex_unknown"),
    lambda response: response["result"]["sessions"][0]["exercises"][1].update(
        exercise_key=response["result"]["sessions"][0]["exercises"][0]["exercise_key"]),
    lambda response: response["result"]["sessions"][0]["exercises"][0].update(duration_minutes=31),
    lambda response: response["result"].update(sessions=[]),
])
def test_build_plan_rejects_invalid_ai_responses(change):
    response = copy.deepcopy(ai_response())
    change(response)
    with pytest.raises(ExerciseAIError):
        build_plan(response, PREFERENCES, CONTEXT, "2026-11-03")


def test_build_plan_rejects_exercise_requiring_unavailable_equipment():
    response = ai_response()
    _, catalog = load_catalog()
    key, record = next(
        (key, record) for key, record in catalog.items()
        if "home_training" in record.modes and record.home_equipment == frozenset({"band"})
    )
    exercise = response["result"]["sessions"][0]["exercises"][0]
    exercise.update(exercise_key=key, catalog_name_en=record.name_en)
    with pytest.raises(ExerciseAIError, match="equipment"):
        build_plan(response, PREFERENCES, CONTEXT, "2026-11-03")


@pytest.mark.parametrize("location", ["outdoor", "other"])
def test_build_plan_rejects_fixed_equipment_outside_home_or_gym(location):
    response = ai_response()
    _, catalog = load_catalog()
    key, record = next(
        (key, record) for key, record in catalog.items()
        if "home_training" in record.modes and record.home_equipment == frozenset({"other"})
    )
    exercise = response["result"]["sessions"][0]["exercises"][0]
    exercise.update(exercise_key=key, catalog_name_en=record.name_en)
    with pytest.raises(ExerciseAIError, match="equipment"):
        build_plan(response, PREFERENCES, {**CONTEXT, "location": location, "available_equipment": ["other"]}, "2026-11-03")


def test_gif_url_resolves_primary_asset_by_mode_and_gender():
    _, catalog = load_catalog()
    key, record = next(
        (key, record) for key, record in catalog.items()
        if ("gym", "female") in {(mode, gender) for mode, gender, _ in record.asset_paths}
    )
    expected_path = next(path for mode, gender, path in record.asset_paths
                         if mode == "gym" and gender == "female")
    url = gif_url_for_exercise(key, "gym", "female", "https://cdn.example.invalid/exercises")
    assert url.startswith("https://cdn.example.invalid/exercises/")
    assert expected_path.split("/")[0] in url
    assert " " not in url
    assert gif_url_for_exercise(key, "gym", "other", "https://cdn.example.invalid") is None
    with pytest.raises(ExerciseAIError):
        gif_url_for_exercise(key, "gym", "female", "http://cdn.example.invalid")


def test_gif_url_is_exposed_only_for_existing_https_object(monkeypatch):
    _, catalog = load_catalog()
    key, _ = next((key, record) for key, record in catalog.items()
                  if any(mode == "home_training" and gender == "male"
                         for mode, gender, _ in record.asset_paths))
    monkeypatch.setenv("EXERCISE_GIF_BASE_URL", "https://cdn.example.invalid/exercises")
    original_client = httpx.AsyncClient
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200 if len(seen) == 1 else 404)

    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(handler), **kwargs))
    result = {"items": [{"exercise_key": key}]}
    first = asyncio.run(main.attach_exercise_gif_urls(result, {"location": "home"}, {"gender": "male"}))
    assert first["items"][0]["demo_gif_url"].startswith("https://")
    assert seen[0].method == "HEAD"
    second = asyncio.run(main.attach_exercise_gif_urls(result, {"location": "home"}, {"gender": "male"}))
    assert second["items"][0]["demo_gif_url"] is None


def test_generate_api_calls_ai_and_saves_validated_items(monkeypatch):
    monkeypatch.setenv("EXERCISE_AI_ENABLED", "true")
    monkeypatch.setenv("AI_SERVER_ENABLED", "true")
    monkeypatch.setenv("AI_SERVER_BASE_URL", "https://ai.example.invalid")
    monkeypatch.setenv("AI_SERVER_API_KEY", "synthetic-test-key-" + "x" * 32)
    requested = []
    saved = []

    def handler(request):
        requested.append(request)
        assert request.url.path == "/recommend/exercise"
        assert request.headers["authorization"].startswith("Bearer synthetic-test-key-")
        payload = json.loads(request.content)
        assert payload["goal_type"] == "muscle_gain"
        assert payload["condition_level"] == "피곤해요"
        assert payload["available_equipment"] == []
        assert payload["condition_note"] is None
        return httpx.Response(200, json=ai_response())

    monkeypatch.setattr(main, "AIServerClient", lambda config: AIServerClient(
        config, transport=httpx.MockTransport(handler)))

    async def fake_user():
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_profile(_user_id, _settings):
        return {"activity_level": "light"}

    async def fake_preferences(_user_id, _settings):
        return PREFERENCES

    async def fake_context(_user_id, _settings):
        return {"exercise_recommendation_context_id": "context-123", **CONTEXT}

    async def fake_create(user_id, context_id, plan, _settings):
        saved.append(plan)
        assert user_id == "authenticated-user"
        assert context_id == "context-123"
        return {"recommendation": plan["recommendation"], "items": plan["items"]}

    async def unexpected_previous(_user_id, _settings):
        raise AssertionError("rules_v1 previous recommendation was consulted")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_service_role_key="server-only-test-key",
        frontend_origin="http://localhost:3000",
    )
    monkeypatch.setattr(main, "fetch_profile", fake_profile)
    monkeypatch.setattr(main, "fetch_exercise_preferences", fake_preferences)
    monkeypatch.setattr(main, "fetch_latest_unlinked_exercise_context", fake_context)
    monkeypatch.setattr(main, "fetch_latest_exercise_recommendation", unexpected_previous)
    monkeypatch.setattr(main, "create_exercise_recommendation", fake_create)
    try:
        response = TestClient(main.app).post("/api/exercise/recommendations/generate", json={})
        assert response.status_code == 200
        assert response.json()["generator"] == "auto-fit-ai"
        assert len(response.json()["result"]["items"]) == 3
        assert len(requested) == len(saved) == 1
    finally:
        main.app.dependency_overrides.clear()


def test_generate_api_rejects_invalid_ai_response_before_storage(monkeypatch):
    monkeypatch.setenv("EXERCISE_AI_ENABLED", "true")
    monkeypatch.setenv("AI_SERVER_ENABLED", "true")
    monkeypatch.setenv("AI_SERVER_BASE_URL", "https://ai.example.invalid")
    monkeypatch.setenv("AI_SERVER_API_KEY", "synthetic-test-key-" + "x" * 32)
    invalid = ai_response()
    invalid["result"]["catalog_version"] = "sha256:wrong"
    monkeypatch.setattr(main, "AIServerClient", lambda config: AIServerClient(
        config, transport=httpx.MockTransport(lambda _: httpx.Response(200, json=invalid))))

    async def fake_user():
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_profile(_user_id, _settings):
        return {}

    async def fake_preferences(_user_id, _settings):
        return PREFERENCES

    async def fake_context(_user_id, _settings):
        return {"exercise_recommendation_context_id": "context-123", **CONTEXT}

    async def forbidden_create(*_args):
        raise AssertionError("invalid AI response reached the database")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_service_role_key="server-only-test-key",
        frontend_origin="http://localhost:3000",
    )
    monkeypatch.setattr(main, "fetch_profile", fake_profile)
    monkeypatch.setattr(main, "fetch_exercise_preferences", fake_preferences)
    monkeypatch.setattr(main, "fetch_latest_unlinked_exercise_context", fake_context)
    monkeypatch.setattr(main, "create_exercise_recommendation", forbidden_create)
    try:
        response = TestClient(main.app).post("/api/exercise/recommendations/generate", json={})
        assert response.status_code == 502
        assert response.json()["detail"] == {"code": "AI_EXERCISE_INVALID_RESPONSE"}
    finally:
        main.app.dependency_overrides.clear()


def test_start_api_uses_selected_ai_plan_session(monkeypatch):
    selected_id = "10000000-0000-4000-8000-000000000002"

    async def fake_user():
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_latest(_user_id, _settings):
        return {
            "recommendation": {
                "exercise_recommendation_id": "20000000-0000-4000-8000-000000000001",
                "generator": "auto-fit-ai",
                "status": "active",
            },
            "plan_sessions": [
                {"exercise_plan_session_id": "10000000-0000-4000-8000-000000000001", "status": "completed"},
                {"exercise_plan_session_id": selected_id, "status": "planned"},
            ],
            "items": [],
        }

    async def fake_rpc(name, payload, _settings):
        assert name == "start_exercise_plan_session"
        assert payload["p_user_id"] == "authenticated-user"
        assert payload["p_plan_session_id"] == selected_id
        return {"session": {"plan_session_id": selected_id}, "items": []}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_service_role_key="server-only-test-key",
        frontend_origin="http://localhost:3000",
    )
    monkeypatch.setattr(main, "fetch_latest_exercise_recommendation", fake_latest)
    monkeypatch.setattr(main, "call_exercise_session_rpc", fake_rpc)
    try:
        response = TestClient(main.app).post(
            "/api/exercise/sessions/start", json={"plan_session_id": selected_id}
        )
        assert response.status_code == 200
        assert response.json()["result"]["session"]["plan_session_id"] == selected_id
        automatic = TestClient(main.app).post("/api/exercise/sessions/start", json={})
        assert automatic.status_code == 200
    finally:
        main.app.dependency_overrides.clear()


def test_latest_api_returns_dated_ai_sessions_and_status(monkeypatch):
    plan_id = "10000000-0000-4000-8000-000000000001"
    recommendation_id = "20000000-0000-4000-8000-000000000001"

    class FakeClient:
        async def get(self, url, *, headers, params):
            assert headers
            if url.endswith("/exercise_recommendations"):
                assert "generator,catalog_version" in params["select"]
                rows = [{"exercise_recommendation_id": recommendation_id,
                         "generator": "auto-fit-ai", "status": "active"}]
            elif url.endswith("/exercise_items"):
                rows = [{"exercise_item_id": "30000000-0000-4000-8000-000000000001",
                         "plan_session_id": plan_id, "exercise_name": "스쿼트"}]
            elif url.endswith("/exercise_plan_sessions"):
                rows = [{"exercise_plan_session_id": plan_id,
                         "exercise_recommendation_id": recommendation_id,
                         "session_index": 1, "scheduled_date": "2026-11-03",
                         "name": "첫날", "duration_minutes": 10}]
            elif url.endswith("/exercise_sessions"):
                rows = [{"plan_session_id": plan_id, "status": "completed"}]
            else:
                raise AssertionError(url)
            return httpx.Response(200, json=rows, request=httpx.Request("GET", url))

    @asynccontextmanager
    async def fake_scope():
        yield FakeClient()

    async def fake_user():
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_service_role_key="server-only-test-key",
        frontend_origin="http://localhost:3000",
    )
    monkeypatch.setattr(main, "client_scope", fake_scope)
    try:
        response = TestClient(main.app).get("/api/exercise/recommendations/latest")
        assert response.status_code == 200
        assert response.json()["generator"] == "auto-fit-ai"
        result = response.json()["result"]
        assert result["plan_sessions"][0]["status"] == "completed"
        assert result["items"][0]["plan_session_id"] == plan_id
    finally:
        main.app.dependency_overrides.clear()
