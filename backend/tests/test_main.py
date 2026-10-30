import asyncio
import httpx
import json
from datetime import date
from fastapi.testclient import TestClient

from backend.app import main


TEST_SETTINGS = main.Settings(
    supabase_url="https://example.supabase.co",
    supabase_publishable_key="sb_publishable_test",
    supabase_service_role_key="server-only-test-key",
    frontend_origin="http://localhost:3000",
)


def test_health() -> None:
    client = TestClient(main.app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_recommended_food_names_preserve_details_and_add_display_names() -> None:
    foods = main.normalize_recommended_foods([
        {"food_name": "닭가슴살 샐러드 (저염 소스)", "quantity": 1, "unit": "개(중간)"},
        {"food_name": "현미밥(잡곡 30%)", "quantity": 100, "unit": "g"},
        {"food_name": "두부（구이）", "quantity": 1, "unit": "개"},
        {"food_name": "연어 샐러드(소스(별도))", "quantity": 120, "unit": "g"},
    ])

    assert [food["display_name"] for food in foods] == [
        "닭가슴살 샐러드",
        "현미밥",
        "두부",
        "연어 샐러드",
    ]
    assert [food["food_name"] for food in foods] == [
        "닭가슴살 샐러드 (저염 소스)",
        "현미밥(잡곡 30%)",
        "두부（구이）",
        "연어 샐러드(소스(별도))",
    ]
    assert [food["display_unit"] for food in foods] == ["개", "g", "개", "g"]


def test_daily_diet_refresh_requires_configured_token(monkeypatch) -> None:
    monkeypatch.delenv("DIET_REFRESH_CRON_TOKEN", raising=False)

    response = TestClient(main.app).post("/internal/diet-refresh")

    assert response.status_code == 503


def test_daily_diet_refresh_rejects_invalid_token(monkeypatch) -> None:
    monkeypatch.setenv("DIET_REFRESH_CRON_TOKEN", "expected-token")

    response = TestClient(main.app).post(
        "/internal/diet-refresh",
        headers={"X-Cron-Token": "wrong-token"},
    )

    assert response.status_code == 401


def test_daily_diet_refresh_runs_with_valid_token(monkeypatch) -> None:
    from backend.app import diet_refresh

    monkeypatch.setenv("DIET_REFRESH_CRON_TOKEN", "expected-token")

    async def fake_refresh() -> tuple[int, int]:
        return 12, 0

    monkeypatch.setattr(diet_refresh, "refresh_daily_diets", fake_refresh)

    response = TestClient(main.app).post(
        "/internal/diet-refresh",
        headers={"X-Cron-Token": "expected-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "succeeded": 12, "failed": 0}


def test_roundtrip_returns_message_and_profile(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="user-123", email="user@example.com")

    async def fake_profile(user_id: str, settings: main.Settings):
        assert user_id == "user-123"
        assert settings == TEST_SETTINGS
        return {"user_id": user_id, "name": "테스트 사용자"}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_profile", fake_profile)

    try:
        client = TestClient(main.app)
        response = client.post(
            "/api/test/roundtrip",
            json={"message": "Auto-Fit 연결 테스트"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        assert payload["message"] == "Auto-Fit 연결 테스트"
        assert payload["profile"]["user_id"] == "user-123"
    finally:
        main.app.dependency_overrides.clear()


def test_roundtrip_rejects_empty_message() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="user-123")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.post("/api/test/roundtrip", json={"message": ""})
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_secret_key_is_only_sent_as_apikey() -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        supabase_service_role_key="sb_secret_server_test",
        frontend_origin="http://localhost:3000",
    )
    headers = main.service_headers(settings)
    assert headers == {"apikey": "sb_secret_server_test"}


def test_profile_update_uses_authenticated_user_id(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_update(user_id: str, updates: dict, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert updates == {"nickname": "새 닉네임"}
        assert settings == TEST_SETTINGS
        return {"user_id": user_id, **updates}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "update_profile", fake_update)

    try:
        client = TestClient(main.app)
        response = client.patch("/api/profile", json={"nickname": " 새 닉네임 "})
        assert response.status_code == 200
        assert response.json()["profile"] == {
            "user_id": "authenticated-user",
            "nickname": "새 닉네임",
        }
    finally:
        main.app.dependency_overrides.clear()


def test_profile_update_rejects_client_supplied_user_id() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.patch(
            "/api/profile",
            json={"nickname": "공격 시도", "user_id": "another-user"},
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_profile_get_uses_authenticated_user_id(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_profile(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        return {
            "user_id": user_id,
            "name": "테스트 사용자",
            "onboarding_completed_at": None,
        }

    async def fake_preferences(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        return {"goal_type": "maintenance", "experience_level": "beginner"}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_profile", fake_profile)
    monkeypatch.setattr(main, "fetch_exercise_preferences", fake_preferences)

    try:
        client = TestClient(main.app)
        response = client.get("/api/profile")
        assert response.status_code == 200
        assert response.json()["profile"]["user_id"] == "authenticated-user"
        assert response.json()["exercise_preferences"]["goal_type"] == "maintenance"
    finally:
        main.app.dependency_overrides.clear()


def test_profile_update_rejects_empty_payload() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.patch("/api/profile", json={})
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_allergy_save_uses_authenticated_user_id(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_replace(
        user_id: str,
        selection: main.AllergySelectionRequest,
        settings: main.Settings,
    ):
        assert user_id == "authenticated-user"
        assert [str(value) for value in selection.allergy_type_ids] == [
            "687d6d0f-a5bc-48f8-b924-3536744f21d2"
        ]
        assert selection.custom_names == ["토마토"]
        assert settings == TEST_SETTINGS
        return [{"allergy_type_id": str(selection.allergy_type_ids[0])}]

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "replace_user_allergies", fake_replace)

    try:
        client = TestClient(main.app)
        response = client.put(
            "/api/allergies",
            json={
                "allergy_type_ids": ["687d6d0f-a5bc-48f8-b924-3536744f21d2"],
                "custom_names": [" 토마토 ", "토마토"],
            },
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True
    finally:
        main.app.dependency_overrides.clear()


def test_allergy_save_rejects_client_supplied_user_id() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.put(
            "/api/allergies",
            json={
                "allergy_type_ids": [],
                "custom_names": [],
                "user_id": "another-user",
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_allergy_save_rejects_blank_custom_name() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.put(
            "/api/allergies",
            json={"allergy_type_ids": [], "custom_names": ["   "]},
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_onboarding_completion_uses_authenticated_user_id(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_profile(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        return {
            "user_id": user_id,
            "name": "테스트 사용자",
            "birth_date": "1990-01-01",
            "gender": "other",
            "onboarding_completed_at": None,
        }

    async def fake_update(user_id: str, updates: dict, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        assert set(updates) == {"onboarding_completed_at"}
        assert updates["onboarding_completed_at"].endswith("+00:00")
        return {
            "user_id": user_id,
            "onboarding_completed_at": updates["onboarding_completed_at"],
        }

    async def fake_preferences(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        return {"goal_type": "weight_loss", "experience_level": "beginner"}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_profile", fake_profile)
    monkeypatch.setattr(main, "update_profile", fake_update)
    monkeypatch.setattr(main, "fetch_exercise_preferences", fake_preferences)

    try:
        client = TestClient(main.app)
        response = client.post("/api/onboarding/complete", json={})
        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert response.json()["already_completed"] is False
    finally:
        main.app.dependency_overrides.clear()


def test_onboarding_completion_requires_exercise_preferences(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_profile(user_id: str, settings: main.Settings):
        return {
            "user_id": user_id,
            "name": "테스트 사용자",
            "birth_date": "1990-01-01",
            "gender": "female",
            "onboarding_completed_at": None,
        }

    async def fake_preferences(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        return None

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_profile", fake_profile)
    monkeypatch.setattr(main, "fetch_exercise_preferences", fake_preferences)

    try:
        response = TestClient(main.app).post("/api/onboarding/complete", json={})
        assert response.status_code == 409
        assert response.json()["detail"]["fields"] == ["exercise_preferences"]
    finally:
        main.app.dependency_overrides.clear()


def test_onboarding_status_uses_authenticated_user_and_completion_timestamp(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    profile = {"onboarding_completed_at": None}

    async def fake_profile(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        return profile

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_profile", fake_profile)

    try:
        client = TestClient(main.app)
        assert client.get("/api/onboarding/status").json() == {"completed": False}
        profile["onboarding_completed_at"] = "2026-09-22T00:00:00Z"
        assert client.get("/api/onboarding/status").json() == {"completed": True}
    finally:
        main.app.dependency_overrides.clear()


def test_onboarding_status_returns_false_for_missing_profile(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def missing_profile(user_id: str, settings: main.Settings):
        raise main.HTTPException(status_code=404, detail="Profile was not created for this user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_profile", missing_profile)

    try:
        response = TestClient(main.app).get("/api/onboarding/status")
        assert response.status_code == 200
        assert response.json() == {"completed": False}
    finally:
        main.app.dependency_overrides.clear()


def test_onboarding_status_requires_authentication() -> None:
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).get("/api/onboarding/status")
        assert response.status_code == 401
    finally:
        main.app.dependency_overrides.clear()


def test_onboarding_completion_rejects_missing_required_profile_fields(
    monkeypatch,
) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_profile(user_id: str, settings: main.Settings):
        return {
            "user_id": user_id,
            "name": "테스트 사용자",
            "birth_date": None,
            "gender": None,
            "onboarding_completed_at": None,
        }

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_profile", fake_profile)

    try:
        client = TestClient(main.app)
        response = client.post("/api/onboarding/complete", json={})
        assert response.status_code == 409
        assert response.json()["detail"]["fields"] == ["birth_date", "gender"]
    finally:
        main.app.dependency_overrides.clear()


def test_onboarding_completion_rejects_client_supplied_user_id() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.post(
            "/api/onboarding/complete",
            json={"user_id": "another-user"},
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_preferences_save_uses_authenticated_user_id(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_upsert(
        user_id: str,
        preferences: main.ExercisePreferencesRequest,
        settings: main.Settings,
    ):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        assert preferences.goal_type == "rehabilitation"
        assert preferences.experience_level == "beginner"
        return {"user_id": user_id, **preferences.model_dump()}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "upsert_exercise_preferences", fake_upsert)

    try:
        client = TestClient(main.app)
        response = client.put(
            "/api/exercise/preferences",
            json={"goal_type": "rehabilitation", "experience_level": "beginner"},
        )
        assert response.status_code == 200
        assert response.json()["preferences"]["user_id"] == "authenticated-user"
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_preferences_rejects_client_supplied_user_id() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.put(
            "/api/exercise/preferences",
            json={
                "goal_type": "maintenance",
                "experience_level": "advanced",
                "user_id": "another-user",
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_preferences_rejects_unknown_goal() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.put(
            "/api/exercise/preferences",
            json={"goal_type": "invalid", "experience_level": "beginner"},
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_context_save_uses_authenticated_user_id(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_create(
        user_id: str,
        context: main.ExerciseRecommendationContextRequest,
        settings: main.Settings,
    ):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        assert context.available_minutes == 60
        assert context.location == "gym"
        assert context.available_equipment == ["machine", "mat"]
        assert context.condition_level == "normal"
        assert context.discomfort_areas == ["허리"]
        assert context.condition_note is None
        return {"user_id": user_id, **context.model_dump()}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "create_exercise_context", fake_create)

    try:
        client = TestClient(main.app)
        response = client.post(
            "/api/exercise/recommendation-contexts",
            json={
                "available_minutes": 60,
                "location": "gym",
                "available_equipment": ["machine", "mat", "machine"],
                "condition_level": " normal ",
                "discomfort_areas": [" 허리 ", "허리"],
                "condition_note": "   ",
            },
        )
        assert response.status_code == 200
        assert response.json()["context"]["user_id"] == "authenticated-user"
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_context_rejects_client_supplied_user_id() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.post(
            "/api/exercise/recommendation-contexts",
            json={
                "available_minutes": 30,
                "location": "home",
                "available_equipment": [],
                "condition_level": "good",
                "discomfort_areas": [],
                "user_id": "another-user",
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_context_rejects_unknown_equipment_and_blank_area() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        invalid_equipment = client.post(
            "/api/exercise/recommendation-contexts",
            json={
                "available_minutes": 30,
                "location": "home",
                "available_equipment": ["treadmill"],
                "condition_level": "good",
                "discomfort_areas": [],
            },
        )
        blank_area = client.post(
            "/api/exercise/recommendation-contexts",
            json={
                "available_minutes": 30,
                "location": "home",
                "available_equipment": [],
                "condition_level": "good",
                "discomfort_areas": ["   "],
            },
        )
        assert invalid_equipment.status_code == 422
        assert blank_area.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_latest_exercise_context_uses_authenticated_user_id(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        return {"user_id": user_id, "available_minutes": 45}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_latest_exercise_context", fake_fetch)

    try:
        client = TestClient(main.app)
        response = client.get("/api/exercise/recommendation-contexts/latest")
        assert response.status_code == 200
        assert response.json()["context"]["available_minutes"] == 45
    finally:
        main.app.dependency_overrides.clear()


def test_build_exercise_recommendation_plan_uses_context_and_preferences() -> None:
    plan = main.build_exercise_recommendation_plan(
        {"goal_type": "muscle_gain", "experience_level": "advanced"},
        {
            "available_minutes": 60,
            "available_equipment": ["machine", "mat"],
            "condition_level": "보통",
            "discomfort_areas": ["허리"],
        },
    )

    assert plan["recommendation"]["intensity"] == "low"
    assert plan["recommendation"]["total_duration_minutes"] == 60
    assert sum(item["duration_minutes"] for item in plan["items"]) == 60
    assert plan["items"][1]["exercise_type_name"] == "웨이트 트레이닝"
    assert plan["items"][1]["sets"] == 2


def test_build_exercise_recommendation_plan_uses_profile_activity_level() -> None:
    plan = main.build_exercise_recommendation_plan(
        {"goal_type": "maintenance", "experience_level": "beginner"},
        {
            "available_minutes": 30,
            "available_equipment": [],
            "condition_level": "좋음",
            "discomfort_areas": [],
        },
        {"activity_level": "sedentary"},
    )

    assert plan["recommendation"]["intensity"] == "low"
    assert "활동 수준" in plan["recommendation"]["ai_reason"]


def test_generate_exercise_recommendation_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_preferences(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        return {"goal_type": "maintenance", "experience_level": "beginner"}

    async def fake_profile(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        return {"user_id": user_id, "activity_level": "light"}

    async def fake_context(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        return {
            "exercise_recommendation_context_id": "context-123",
            "available_minutes": 30,
            "available_equipment": [],
            "condition_level": "좋음",
            "discomfort_areas": [],
        }

    async def fake_create(
        user_id: str,
        context_id: str,
        plan: dict,
        settings: main.Settings,
    ):
        assert user_id == "authenticated-user"
        assert context_id == "context-123"
        assert plan["recommendation"]["goal"] == "maintenance"
        assert plan["recommendation"]["intensity"] == "low"
        assert settings == TEST_SETTINGS
        return {"recommendation": {"user_id": user_id}, "items": plan["items"]}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_exercise_preferences", fake_preferences)
    monkeypatch.setattr(main, "fetch_profile", fake_profile)
    monkeypatch.setattr(main, "fetch_latest_unlinked_exercise_context", fake_context)
    monkeypatch.setattr(main, "create_exercise_recommendation", fake_create)

    try:
        client = TestClient(main.app)
        response = client.post("/api/exercise/recommendations/generate", json={})
        assert response.status_code == 200
        assert response.json()["generator"] == "rules_v1"
        assert len(response.json()["result"]["items"]) == 3
    finally:
        main.app.dependency_overrides.clear()


def test_generate_exercise_recommendation_requires_preferences(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_preferences(user_id: str, settings: main.Settings):
        return None

    async def fake_profile(user_id: str, settings: main.Settings):
        return {"user_id": user_id, "activity_level": "moderate"}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_exercise_preferences", fake_preferences)
    monkeypatch.setattr(main, "fetch_profile", fake_profile)

    try:
        client = TestClient(main.app)
        response = client.post("/api/exercise/recommendations/generate", json={})
        assert response.status_code == 409
    finally:
        main.app.dependency_overrides.clear()


def test_generate_exercise_recommendation_rejects_client_user_id() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS

    try:
        client = TestClient(main.app)
        response = client.post(
            "/api/exercise/recommendations/generate",
            json={"user_id": "another-user"},
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_latest_exercise_recommendation_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        return {
            "recommendation": {"user_id": user_id},
            "items": [{"exercise_name": "빠르게 걷기"}],
        }

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_latest_exercise_recommendation", fake_fetch)

    try:
        client = TestClient(main.app)
        response = client.get("/api/exercise/recommendations/latest")
        assert response.status_code == 200
        assert response.json()["result"]["items"][0]["exercise_name"] == "빠르게 걷기"
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_item_result_requires_one_terminal_state() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).post(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/items/00000000-0000-0000-0000-000000000002",
            json={"completed": True, "skipped": True},
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_item_result_requires_skip_reason() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).post(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/items/00000000-0000-0000-0000-000000000002",
            json={"completed": False, "skipped": True},
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_start_exercise_session_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_latest(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        return {
            "recommendation": {
                "exercise_recommendation_id": "recommendation-123",
                "status": "active",
            },
            "items": [],
        }

    async def fake_rpc(name: str, payload: dict, settings: main.Settings):
        assert name == "start_exercise_session"
        assert payload == {
            "p_user_id": "authenticated-user",
            "p_recommendation_id": "recommendation-123",
        }
        return {"session": {"user_id": payload["p_user_id"]}, "items": []}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_latest_exercise_recommendation", fake_latest)
    monkeypatch.setattr(main, "call_exercise_session_rpc", fake_rpc)
    try:
        response = TestClient(main.app).post("/api/exercise/sessions/start", json={})
        assert response.status_code == 200
        assert response.json()["result"]["session"]["user_id"] == "authenticated-user"
    finally:
        main.app.dependency_overrides.clear()


def test_record_exercise_item_result_uses_path_ids_and_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_rpc(name: str, payload: dict, settings: main.Settings):
        assert name == "record_exercise_item_result"
        assert payload["p_user_id"] == "authenticated-user"
        assert payload["p_session_id"] == "00000000-0000-0000-0000-000000000001"
        assert payload["p_item_id"] == "00000000-0000-0000-0000-000000000002"
        assert payload["p_completed"] is True
        assert payload["p_skipped"] is False
        return {"log": {"completed": True}}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "call_exercise_session_rpc", fake_rpc)
    try:
        response = TestClient(main.app).post(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/items/00000000-0000-0000-0000-000000000002",
            json={"completed": True, "skipped": False, "duration_minutes": 10},
        )
        assert response.status_code == 200
        assert response.json()["result"]["log"]["completed"] is True
    finally:
        main.app.dependency_overrides.clear()


def test_complete_exercise_session_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_rpc(name: str, payload: dict, settings: main.Settings):
        assert name == "complete_exercise_session"
        assert payload["p_user_id"] == "authenticated-user"
        return {"session": {"status": "completed"}, "logs": []}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "call_exercise_session_rpc", fake_rpc)
    try:
        response = TestClient(main.app).post(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/complete",
            json={},
        )
        assert response.status_code == 200
        assert response.json()["result"]["session"]["status"] == "completed"
    finally:
        main.app.dependency_overrides.clear()


def test_latest_exercise_session_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        return {"session": {"status": "completed"}, "logs": [{"completed": True}]}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_latest_exercise_session", fake_fetch)
    try:
        response = TestClient(main.app).get("/api/exercise/sessions/latest")
        assert response.status_code == 200
        assert response.json()["result"]["logs"][0]["completed"] is True
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_discomfort_rejects_invalid_severity() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).post(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/discomfort",
            json={
                "symptom_type": "pain",
                "severity": 11,
                "body_areas": ["허리"],
                "action_taken": "adjust",
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_record_exercise_discomfort_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_rpc(name: str, payload: dict, settings: main.Settings):
        assert name == "record_exercise_discomfort"
        assert payload["p_user_id"] == "authenticated-user"
        assert payload["p_session_id"] == "00000000-0000-0000-0000-000000000001"
        assert payload["p_item_id"] == "00000000-0000-0000-0000-000000000002"
        assert payload["p_body_areas"] == ["허리"]
        assert payload["p_action_taken"] == "adjust"
        return {"discomfort": {"severity": 6}, "adjusted_items": [{"intensity": "low"}]}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "call_exercise_session_rpc", fake_rpc)
    try:
        response = TestClient(main.app).post(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/discomfort",
            json={
                "exercise_item_id": "00000000-0000-0000-0000-000000000002",
                "symptom_type": "pain",
                "severity": 6,
                "body_areas": [" 허리 ", "허리"],
                "detail": " 조금 아픔 ",
                "action_taken": "adjust",
            },
        )
        assert response.status_code == 200
        assert len(response.json()["result"]["adjusted_items"]) == 1
    finally:
        main.app.dependency_overrides.clear()


def test_record_exercise_discomfort_rejects_client_user_id() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).post(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/discomfort",
            json={
                "user_id": "another-user",
                "symptom_type": "fatigue",
                "severity": 5,
                "body_areas": [],
                "action_taken": "continue",
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_get_exercise_discomfort_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id: str, session_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert session_id == "00000000-0000-0000-0000-000000000001"
        return [{"symptom_type": "fatigue", "severity": 4}]

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_exercise_discomfort_logs", fake_fetch)
    try:
        response = TestClient(main.app).get(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/discomfort"
        )
        assert response.status_code == 200
        assert response.json()["logs"][0]["severity"] == 4
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_feedback_rejects_invalid_difficulty() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).put(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/feedback",
            json={
                "perceived_difficulty": 6,
                "post_condition": "good",
                "uncomfortable_areas": [],
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_save_exercise_feedback_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_save(user_id, session_id, body, settings):
        assert user_id == "authenticated-user"
        assert session_id == "00000000-0000-0000-0000-000000000001"
        assert body.uncomfortable_areas == ["허리"]
        assert body.note == "운동 완료"
        assert settings == TEST_SETTINGS
        return {"perceived_difficulty": 3, "post_condition": "good"}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "save_exercise_session_feedback", fake_save)
    try:
        response = TestClient(main.app).put(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/feedback",
            json={
                "perceived_difficulty": 3,
                "post_condition": "good",
                "uncomfortable_areas": [" 허리 ", "허리"],
                "note": " 운동 완료 ",
            },
        )
        assert response.status_code == 200
        assert response.json()["feedback"]["post_condition"] == "good"
    finally:
        main.app.dependency_overrides.clear()


def test_save_exercise_feedback_rejects_client_user_id() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).put(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/feedback",
            json={
                "user_id": "another-user",
                "perceived_difficulty": 3,
                "post_condition": "normal",
                "uncomfortable_areas": [],
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_get_exercise_feedback_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id, session_id, settings):
        assert user_id == "authenticated-user"
        assert session_id == "00000000-0000-0000-0000-000000000001"
        return {"perceived_difficulty": 2, "post_condition": "very_good"}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_exercise_session_feedback", fake_fetch)
    try:
        response = TestClient(main.app).get(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/feedback"
        )
        assert response.status_code == 200
        assert response.json()["feedback"]["post_condition"] == "very_good"
    finally:
        main.app.dependency_overrides.clear()


def test_build_exercise_analysis_adjusts_high_difficulty_and_discomfort() -> None:
    analysis = main.build_exercise_session_analysis(
        {
            "session": {
                "status": "completed",
                "completion_rate": "100.00",
                "total_duration_seconds": 1800,
                "total_calories_burned": "150.00",
            },
            "logs": [],
            "feedback": {
                "perceived_difficulty": 5,
                "post_condition": "bad",
                "uncomfortable_areas": ["허리"],
            },
        }
    )
    assert analysis["generator"] == "rules_v1"
    assert analysis["metrics"]["duration_minutes"] == 30
    assert analysis["feedback_summary"]["difficulty"] == "매우 어려움"
    assert "다음 운동 강도를 한 단계 낮춤" in analysis["next_session_adjustments"]
    assert analysis["safety_notice"] is not None


def test_get_exercise_analysis_requires_feedback(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_result(user_id, session_id, settings):
        return {
            "session": {
                "status": "completed",
                "completion_rate": 100,
                "total_duration_seconds": 1800,
                "total_calories_burned": 150,
            },
            "logs": [],
            "feedback": None,
        }

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_exercise_session_result", fake_result)
    try:
        response = TestClient(main.app).get(
            "/api/exercise/sessions/00000000-0000-0000-0000-000000000001/analysis"
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "Exercise session feedback is required"
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_goal_rejects_invalid_frequency() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).put(
            "/api/exercise/goals/active",
            json={
                "goal_type": "rehabilitation",
                "weekly_frequency": 8,
                "weekly_duration_minutes": 120,
                "goal_period_weeks": 8,
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_save_exercise_goal_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_save(user_id, body, settings):
        assert user_id == "authenticated-user"
        assert body.goal_type == "rehabilitation"
        assert body.weekly_frequency == 3
        assert settings == TEST_SETTINGS
        return {"user_id": user_id, **body.model_dump(mode="json")}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "save_active_exercise_goal", fake_save)
    try:
        response = TestClient(main.app).put(
            "/api/exercise/goals/active",
            json={
                "goal_type": "rehabilitation",
                "weekly_frequency": 3,
                "weekly_duration_minutes": 120,
                "goal_period_weeks": 8,
                "user_id": "another-user",
            },
        )
        assert response.status_code == 422

        response = TestClient(main.app).put(
            "/api/exercise/goals/active",
            json={
                "goal_type": "rehabilitation",
                "weekly_frequency": 3,
                "weekly_duration_minutes": 120,
                "goal_period_weeks": 8,
            },
        )
        assert response.status_code == 200
        assert response.json()["goal"]["user_id"] == "authenticated-user"
    finally:
        main.app.dependency_overrides.clear()


def test_get_active_exercise_goal_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id, settings):
        assert user_id == "authenticated-user"
        return {"goal_type": "maintenance"}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_active_exercise_goal", fake_fetch)
    try:
        response = TestClient(main.app).get("/api/exercise/goals/active")
        assert response.status_code == 200
        assert response.json()["goal"]["goal_type"] == "maintenance"
    finally:
        main.app.dependency_overrides.clear()


def test_exercise_history_rejects_invalid_range() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).get(
            "/api/exercise/history?from_date=2026-09-02&to_date=2026-09-01"
        )
        assert response.status_code == 422
        response = TestClient(main.app).get(
            "/api/exercise/history?from_date=2025-01-01&to_date=2026-09-01"
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_get_exercise_history_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id, from_date, to_date, settings):
        assert user_id == "authenticated-user"
        assert from_date.isoformat() == "2026-09-01"
        assert to_date.isoformat() == "2026-09-03"
        return [{"session": {"exercise_session_id": "session-1"}, "logs": []}]

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_exercise_history", fake_fetch)
    try:
        response = TestClient(main.app).get(
            "/api/exercise/history?from_date=2026-09-01&to_date=2026-09-03"
        )
        assert response.status_code == 200
        assert response.json()["count"] == 1
    finally:
        main.app.dependency_overrides.clear()


def test_build_exercise_progress_aggregates_real_session_fields() -> None:
    goal = {"weekly_frequency": 3, "weekly_duration_minutes": 120}
    history = [
        {
            "session": {
                "started_at": "2026-08-24T10:00:00+00:00",
                "completed_item_count": 2,
                "total_duration_seconds": 1800,
                "total_calories_burned": 150,
            },
            "logs": [
                {
                    "exercise_item_id": "item-1",
                    "duration_minutes": 20,
                    "completed": True,
                },
                {
                    "exercise_item_id": "item-2",
                    "duration_minutes": 10,
                    "completed": True,
                },
            ],
        },
        {
            "session": {
                "started_at": "2026-08-25T10:00:00Z",
                "completed_item_count": 1,
                "total_duration_seconds": 1200,
                "total_calories_burned": "100.5",
            },
            "logs": [
                {
                    "exercise_item_id": "item-1",
                    "duration_minutes": 20,
                    "completed": True,
                }
            ],
        },
    ]

    result = main.build_exercise_progress(
        goal,
        history,
        {"item-1": "유산소", "item-2": "유연성"},
        main.date(2026, 8, 24),
        main.date(2026, 8, 30),
    )

    assert result["summary"]["workout_count"] == 2
    assert result["summary"]["exercise_count"] == 3
    assert result["summary"]["duration_minutes"] == 50
    assert result["summary"]["calories_burned"] == 250.5
    assert result["summary"]["target_workout_count"] == 3
    assert result["weekly_trend"][0]["workout_count"] == 2
    assert result["category_distribution"][0]["category"] == "유산소"
    assert result["category_distribution"][0]["percentage"] == 80
    assert result["achievements"]["longest_workout_streak_days"] == 2


def test_exercise_progress_range_uses_calendar_boundaries() -> None:
    today = main.date(2026, 9, 3)
    assert main.exercise_progress_range("week", today)[0] == main.date(2026, 8, 31)
    assert main.exercise_progress_range("month", today)[0] == main.date(2026, 9, 1)
    assert main.exercise_progress_range("three_months", today)[0] == main.date(2026, 7, 1)


def test_get_exercise_progress_combines_goal_history_and_categories(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_goal(user_id, settings):
        return {"weekly_frequency": 3, "weekly_duration_minutes": 120}

    async def fake_history(user_id, from_date, to_date, settings):
        return []

    async def fake_categories(history, settings):
        assert history == []
        return {}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_active_exercise_goal", fake_goal)
    monkeypatch.setattr(main, "fetch_exercise_history", fake_history)
    monkeypatch.setattr(main, "fetch_exercise_category_map", fake_categories)
    try:
        response = TestClient(main.app).get("/api/exercise/progress?period=month")
        assert response.status_code == 200
        assert response.json()["progress"]["summary"]["workout_count"] == 0
    finally:
        main.app.dependency_overrides.clear()


def test_build_exercise_summary_returns_recent_and_cumulative_totals() -> None:
    sessions = [
        {
            "completed_at": "2026-09-10T01:00:00Z",
            "started_at": "2026-09-10T00:30:00Z",
            "completed_item_count": 3,
            "total_duration_seconds": 1800,
            "total_calories_burned": 150.5,
        },
        {
            "completed_at": "2026-09-03T01:00:00Z",
            "started_at": "2026-09-03T00:30:00Z",
            "completed_item_count": 2,
            "total_duration_seconds": 1200,
            "total_calories_burned": 90,
        },
    ]

    summary = main.build_exercise_summary(sessions, main.date(2026, 9, 10))

    assert summary["recent_7_days"]["period"]["from"] == "2026-09-04"
    assert summary["recent_7_days"]["workout_count"] == 1
    assert summary["recent_7_days"]["duration_minutes"] == 30
    assert summary["cumulative"]["workout_count"] == 2
    assert summary["cumulative"]["exercise_count"] == 5
    assert summary["cumulative"]["calories_burned"] == 240.5


def test_get_exercise_summary_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_sessions(user_id: str, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        return []

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_completed_exercise_sessions", fake_sessions)
    try:
        response = TestClient(main.app).get("/api/exercise/summary")
        assert response.status_code == 200
        assert response.json()["summary"]["recent_7_days"]["workout_count"] == 0
        assert response.json()["summary"]["cumulative"]["workout_count"] == 0
    finally:
        main.app.dependency_overrides.clear()


def test_food_inventory_rejects_invalid_date_order() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).post(
            "/api/diet/inventory",
            json={
                "name": "브로콜리",
                "purchased_on": "2026-09-03",
                "expires_on": "2026-09-02",
            },
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_create_food_inventory_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_create(user_id, body, settings):
        assert user_id == "authenticated-user"
        assert body.name == "브로콜리"
        assert str(body.quantity) == "2"
        return {"user_id": user_id, "custom_name": body.name}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "create_food_inventory_item", fake_create)
    try:
        response = TestClient(main.app).post(
            "/api/diet/inventory",
            json={"name": " 브로콜리 ", "quantity": 2, "unit": "개"},
        )
        assert response.status_code == 201
        assert response.json()["item"]["user_id"] == "authenticated-user"

        rejected = TestClient(main.app).post(
            "/api/diet/inventory",
            json={"name": "브로콜리", "user_id": "another-user"},
        )
        assert rejected.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_inventory_freshness_uses_explicit_reference_date() -> None:
    reference = main.date(2026, 9, 16)

    assert main.inventory_freshness(None, reference) == "unknown"
    assert main.inventory_freshness(main.date(2026, 9, 15), reference) == "expired"
    assert main.inventory_freshness(main.date(2026, 9, 19), reference) == "expiring_soon"
    assert main.inventory_freshness(main.date(2026, 9, 20), reference) == "fresh"


def test_update_food_inventory_item_scopes_user_and_active(monkeypatch) -> None:
    original = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PATCH"
        assert request.url.path == "/rest/v1/user_food_inventory"
        assert request.url.params["user_food_inventory_id"] == "eq.inventory-1"
        assert request.url.params["user_id"] == "eq.authenticated-user"
        assert request.url.params["is_available"] == "eq.true"
        assert request.headers["Prefer"] == "return=representation"
        assert request.content == b'{"quantity":"2"}'
        return httpx.Response(
            200,
            json=[
                {
                    "user_food_inventory_id": "inventory-1",
                    "user_id": "authenticated-user",
                    "quantity": 2,
                    "is_available": True,
                }
            ],
        )

    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **kwargs: original(
            transport=httpx.MockTransport(handler),
            **kwargs,
        ),
    )

    body = main.FoodInventoryUpdateRequest(quantity=2)
    result = main.asyncio.run(
        main.update_food_inventory_item(
            "authenticated-user",
            "inventory-1",
            body,
            TEST_SETTINGS,
        )
    )

    assert result["user_food_inventory_id"] == "inventory-1"


def test_delete_food_inventory_item_is_idempotent_and_scoped(monkeypatch) -> None:
    original = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PATCH"
        assert request.url.params["user_food_inventory_id"] == "eq.inventory-1"
        assert request.url.params["user_id"] == "eq.authenticated-user"
        assert request.url.params["is_available"] == "eq.true"
        assert request.content == b'{"is_available":false}'
        return httpx.Response(200, json=[])

    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **kwargs: original(
            transport=httpx.MockTransport(handler),
            **kwargs,
        ),
    )

    main.asyncio.run(
        main.delete_food_inventory_item(
            "authenticated-user",
            "inventory-1",
            TEST_SETTINGS,
        )
    )


def test_patch_and_delete_inventory_use_authenticated_user(monkeypatch) -> None:
    inventory_id = "11111111-1111-1111-1111-111111111111"

    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_update(user_id, received_id, body, settings):
        assert user_id == "authenticated-user"
        assert received_id == inventory_id
        assert body.name == "두부"
        assert settings == TEST_SETTINGS
        return {"user_food_inventory_id": received_id, "custom_name": body.name}

    async def fake_delete(user_id, received_id, settings):
        assert user_id == "authenticated-user"
        assert received_id == inventory_id
        assert settings == TEST_SETTINGS

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "update_food_inventory_item", fake_update)
    monkeypatch.setattr(main, "delete_food_inventory_item", fake_delete)
    try:
        client = TestClient(main.app)
        updated = client.patch(
            f"/api/diet/inventory/{inventory_id}",
            json={"name": " 두부 "},
        )
        assert updated.status_code == 200
        assert updated.json()["item"]["custom_name"] == "두부"

        rejected = client.patch(
            f"/api/diet/inventory/{inventory_id}",
            json={"user_id": "another-user"},
        )
        assert rejected.status_code == 422

        deleted = client.delete(f"/api/diet/inventory/{inventory_id}")
        assert deleted.status_code == 204
        assert deleted.content == b""
    finally:
        main.app.dependency_overrides.clear()


def test_build_diet_plan_reflects_inventory_and_excludes_allergens() -> None:
    result = main.build_diet_recommendation_plan(
        [{"custom_name": "브로콜리"}],
        ["대두", "우유", "견과류", "생선"],
    )
    food_names = {
        food["food_name"]
        for meal in result["meals"]
        for food in meal["foods"]
    }
    assert len(result["meals"]) == 4
    assert "냉장고 반영: 브로콜리" in result["meals"][0]["recommendation_note"]
    assert not {"두부구이", "그릭요거트", "호두", "연어구이"} & food_names
    assert "알레르기 제외 식재료" in result["recommendation"]["ai_reason"]


def test_usable_food_inventory_recomputes_freshness_and_excludes_invalid_rows() -> None:
    result = main.usable_food_inventory(
        [
            {"custom_name": "두부", "quantity": "1", "expires_on": "2026-09-30", "is_available": True},
            {"custom_name": "우유", "quantity": "1", "expires_on": "2026-09-27", "is_available": True},
            {"custom_name": "달걀", "quantity": "0", "expires_on": "2026-10-01", "is_available": True},
            {"custom_name": "브로콜리", "quantity": "1", "expires_on": "2026-10-01", "is_available": False},
        ],
        date(2026, 9, 28),
    )

    assert [row["custom_name"] for row in result] == ["두부"]
    assert result[0]["freshness_status"] == "expiring_soon"


def test_diet_plan_marks_only_inventory_that_is_present_in_actual_meals() -> None:
    result = main.build_diet_recommendation_plan([
        {"custom_name": "브로콜리", "quantity": "200", "unit": "g", "is_available": True},
        {"custom_name": "오이", "quantity": "1", "unit": "개", "is_available": True},
    ])

    notes = [meal["recommendation_note"] for meal in result["meals"]]
    assert any("냉장고 사용: 브로콜리" in note for note in notes)
    assert all("냉장고 사용: 오이" not in note for note in notes)
    assert "실제 메뉴에 반영된 냉장고 재료: 브로콜리" in result["recommendation"]["ai_reason"]


def test_daily_diet_plan_uses_inventory_in_final_mixed_meals(monkeypatch) -> None:
    async def fake_model(prompt: str) -> str:
        payload = json.loads(prompt.rsplit("\n", 1)[-1])
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "냉장고 활용 AI 추천",
                        "foods": [{
                            "food_name": "브로콜리 볶음",
                            "quantity": 200,
                            "unit": "g",
                            "calories": slot["target_calories"],
                            "carbohydrates": 30,
                            "protein": 15,
                            "fat": 8,
                        }],
                    }
                    for slot in payload["slots"]
                ]
            },
            ensure_ascii=False,
        )

    monkeypatch.setattr(main, "request_model", fake_model)
    result = asyncio.run(
        main.build_daily_diet_recommendation_plan(
            "user-1",
            [{"custom_name": "브로콜리", "quantity": "1", "is_available": True}],
            [],
            [{
                "food_item_id": "food-1",
                "name": "현미밥",
                "serving_size": 100,
                "serving_unit": "g",
                "calories": 200,
                "carbohydrates": 40,
                "protein": 4,
                "fat": 1,
                "source_type": "reference",
            }],
            date(2026, 9, 29),
        )
    )

    assert main.find_used_inventory_names(result["meals"], ["브로콜리"]) == ["브로콜리"]
    assert "실제 메뉴에 반영된 냉장고 재료: 브로콜리" in result["recommendation"]["ai_reason"]
    assert any("냉장고 사용: 브로콜리" in meal["recommendation_note"] for meal in result["meals"])
    assert any(
        ingredient["name"] == "브로콜리"
        for meal in result["meals"]
        for ingredient in meal["used_ingredients"]
    )


def test_daily_diet_plan_resolves_catalog_linked_inventory(monkeypatch) -> None:
    async def fake_model(prompt: str) -> str:
        payload = json.loads(prompt.rsplit("\n", 1)[-1])
        return json.dumps(
            {
                "meals": [
                    {
                        "meal_type": slot["meal_type"],
                        "meal_order": slot["meal_order"],
                        "recommendation_note": "연결 재료 활용",
                        "foods": [{
                            "food_name": "두부 샐러드",
                            "quantity": 200,
                            "unit": "g",
                            "calories": slot["target_calories"],
                            "carbohydrates": 20,
                            "protein": 25,
                            "fat": 10,
                        }],
                    }
                    for slot in payload["slots"]
                ]
            },
            ensure_ascii=False,
        )

    monkeypatch.setattr(main, "request_model", fake_model)
    result = asyncio.run(
        main.build_daily_diet_recommendation_plan(
            "user-2",
            [{"food_item_id": "food-tofu", "custom_name": None, "quantity": "1", "is_available": True}],
            [],
            [{
                "food_item_id": "food-tofu",
                "name": "두부",
                "serving_size": 100,
                "serving_unit": "g",
                "calories": 100,
                "carbohydrates": 5,
                "protein": 10,
                "fat": 5,
                "source_type": "reference",
            }],
            date(2026, 9, 29),
        )
    )

    assert "실제 메뉴에 반영된 냉장고 재료: 두부" in result["recommendation"]["ai_reason"]


def test_extract_menu_tags_normalizes_food_names() -> None:
    tags = set(main.extract_menu_tags(["현미 밥", "구운 닭가슴살", "브로콜리"]))

    assert {"현미밥", "닭가슴살", "채소"} <= tags
    assert "재료:현미밥" in tags
    assert "재료:구운닭가슴살" in tags


def test_build_menu_image_key_is_order_independent() -> None:
    first = main.build_menu_image_key(["닭가슴살", "현미밥", "채소"])
    second = main.build_menu_image_key(["채소", "닭가슴살", "현미밥"])

    assert first == second
    assert first.startswith("foods:")


def test_select_cached_menu_image_uses_food_composition() -> None:
    images = [
        {
            "image_key": "catalog:01",
            "food_tags": ["닭가슴살", "현미밥", "도시락"],
            "storage_path": "menus/01.png",
            "generation_status": "completed",
        },
        {
            "image_key": "catalog:07",
            "food_tags": ["두부", "채소", "도시락"],
            "storage_path": "menus/07.png",
            "generation_status": "completed",
        },
    ]

    selected = main.select_cached_menu_image(
        main.extract_menu_tags(["두부구이", "브로콜리"]), images
    )

    assert selected is not None
    assert selected["image_key"] == "catalog:07"


def test_select_cached_menu_image_prefers_meal_type_and_exact_food_labels() -> None:
    images = [
        {
            "image_key": "dataset:dinner",
            "food_tags": ["닭가슴살", "현미밥", "채소"],
            "storage_path": "dataset/dinner.png",
            "generation_status": "completed",
            "meal_type": "dinner",
            "metadata": {
                "quality_status": "approved",
                "foods": [{"food_name": "닭가슴살"}, {"food_name": "현미밥"}],
            },
        },
        {
            "image_key": "dataset:breakfast",
            "food_tags": ["닭가슴살", "현미밥", "채소"],
            "storage_path": "dataset/breakfast.png",
            "generation_status": "completed",
            "meal_type": "breakfast",
            "metadata": {
                "quality_status": "approved",
                "foods": [
                    {"food_name": "닭가슴살"},
                    {"food_name": "현미밥"},
                    {"food_name": "브로콜리"},
                ],
            },
        },
    ]

    selected = main.select_cached_menu_image(
        main.extract_menu_tags(["닭가슴살", "현미밥", "브로콜리"]),
        images,
        meal_type="breakfast",
        food_names=["닭가슴살", "현미밥", "브로콜리"],
    )

    assert selected is not None
    assert selected["image_key"] == "dataset:breakfast"


def test_select_cached_menu_image_rejects_unapproved_dataset_image() -> None:
    selected = main.select_cached_menu_image(
        ["닭가슴살", "현미밥"],
        [
            {
                "image_key": "dataset:review",
                "food_tags": ["닭가슴살", "현미밥"],
                "storage_path": "dataset/review.png",
                "generation_status": "completed",
                "metadata": {"quality_status": "needs_review"},
            }
        ],
    )

    assert selected is None


def test_assign_menu_images_marks_cache_miss_pending(monkeypatch) -> None:
    original = httpx.AsyncClient
    claimed_payload = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal claimed_payload
        if request.method == "GET":
            return httpx.Response(200, json=[])
        assert request.url.path == "/rest/v1/rpc/claim_menu_image"
        claimed_payload = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "image_key": claimed_payload["p_image_key"],
                "menu_name": claimed_payload["p_menu_name"],
                "food_tags": claimed_payload["p_food_tags"],
                "storage_path": None,
                "source_type": "generated",
                "generation_status": "pending",
            },
        )

    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    meals = [{"foods": [{"food_name": "새로운 건강식"}]}]

    main.asyncio.run(main.assign_menu_images(meals, TEST_SETTINGS))

    assert claimed_payload is not None
    assert claimed_payload["p_food_tags"] == ["재료:새로운건강식"]
    assert claimed_payload["p_meal_type"] is None
    assert meals[0]["menu_image_key"].startswith("foods:")
    assert meals[0]["image_storage_path"] is None
    assert meals[0]["image_generation_status"] == "pending"
    assert meals[0]["image_generation_required"] is True


def test_assign_menu_images_reads_all_catalog_pages(monkeypatch) -> None:
    original = httpx.AsyncClient
    offsets: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            offsets.append(request.url.params["offset"])
            if request.url.params["offset"] == "0":
                return httpx.Response(
                    200,
                    json=[{
                        "image_key": f"catalog:{index:04d}",
                        "food_tags": [],
                        "storage_path": f"menus/{index:04d}.png",
                        "generation_status": "completed",
                    } for index in range(1000)],
                )
            return httpx.Response(200, json=[])
        return httpx.Response(
            200,
            json={
                "image_key": "foods:new",
                "storage_path": None,
                "generation_status": "pending",
            },
        )

    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )

    main.asyncio.run(main.assign_menu_images(
        [{"meal_type": "lunch", "foods": [{"food_name": "새 메뉴"}]}],
        TEST_SETTINGS,
    ))

    assert offsets == ["0", "1000"]


def test_fetch_diet_recommendation_filters_user_and_date(monkeypatch) -> None:
    original = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/rest/v1/diet_recommendations"
        assert request.url.params["user_id"] == "eq.authenticated-user"
        assert request.url.params["recommendation_date"] == "eq.2026-09-16"
        assert request.url.params["order"] == "created_at.desc"
        assert request.url.params["limit"] == "1"
        assert "status" not in request.url.params
        return httpx.Response(200, json=[])

    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **kwargs: original(
            transport=httpx.MockTransport(handler),
            **kwargs,
        ),
    )

    result = main.asyncio.run(
        main.fetch_diet_recommendation(
            "authenticated-user",
            TEST_SETTINGS,
            main.date(2026, 9, 16),
        )
    )

    assert result is None


def test_get_diet_recommendation_by_date_uses_authenticated_user(
    monkeypatch,
) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id, settings, recommendation_date, *, client=None):
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        assert recommendation_date == main.date(2026, 9, 16)
        return {
            "recommendation": {
                "diet_recommendation_id": "recommendation-1",
                "recommendation_date": "2026-09-16",
            },
            "meals": [],
        }

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_diet_recommendation", fake_fetch)
    try:
        client = TestClient(main.app)
        response = client.get("/api/diet/recommendations?date=2026-09-16")
        assert response.status_code == 200
        assert response.json()["result"]["recommendation"][
            "diet_recommendation_id"
        ] == "recommendation-1"

        missing = client.get("/api/diet/recommendations")
        assert missing.status_code == 422

        invalid = client.get("/api/diet/recommendations?date=09-16-2026")
        assert invalid.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_generate_diet_recommendation_uses_user_data(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_inventory(user_id, settings):
        assert user_id == "authenticated-user"
        return [{"custom_name": "브로콜리"}]

    async def fake_catalog(settings):
        return [{"allergy_type_id": "allergy-1", "name": "우유"}]

    async def fake_allergies(user_id, settings):
        return [{"allergy_type_id": "allergy-1", "custom_name": None}]

    async def fake_food_catalog(settings):
        return [{"food_item_id": "food-1", "name": "현미밥", "calories": 200}]

    async def fake_daily_plan(user_id, inventory, allergy_names, food_catalog, target_date=None):
        assert user_id == "authenticated-user"
        assert inventory == [{"custom_name": "브로콜리"}]
        assert allergy_names == ["우유"]
        assert food_catalog[0]["name"] == "현미밥"
        plan = main.build_diet_recommendation_plan(inventory, allergy_names)
        for index, meal in enumerate(plan["meals"]):
            meal["source_type"] = "ai_generated" if index < 2 else "db_catalog"
        return plan

    async def fake_create(user_id, plan, settings):
        assert user_id == "authenticated-user"
        assert "그릭요거트" not in {
            food["food_name"] for meal in plan["meals"] for food in meal["foods"]
        }
        return {"diet_recommendation_id": "recommendation-1"}

    async def fake_assign(meals, settings):
        assert settings == TEST_SETTINGS
        for meal in meals:
            meal["menu_image_key"] = "catalog:test"
            meal["image_storage_path"] = "menus/test.png"

    async def fake_generate_images(meals, settings):
        assert settings == TEST_SETTINGS
        return {"completed": 0, "failed": 0, "skipped": len(meals)}

    async def fake_latest(user_id, settings):
        return {"recommendation": {"diet_recommendation_id": "recommendation-1"}}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_food_inventory", fake_inventory)
    monkeypatch.setattr(main, "fetch_allergy_catalog", fake_catalog)
    monkeypatch.setattr(main, "fetch_user_allergies", fake_allergies)
    monkeypatch.setattr(main, "fetch_food_catalog", fake_food_catalog)
    monkeypatch.setattr(main, "build_daily_diet_recommendation_plan", fake_daily_plan)
    monkeypatch.setattr(main, "assign_menu_images", fake_assign)
    monkeypatch.setattr(main, "generate_missing_menu_images", fake_generate_images)
    monkeypatch.setattr(main, "create_diet_recommendation", fake_create)
    monkeypatch.setattr(main, "fetch_latest_diet_recommendation", fake_latest)
    try:
        response = TestClient(main.app).post(
            "/api/diet/recommendations/generate", json={}
        )
        assert response.status_code == 200
        assert response.json()["generator"] == "mixed_ai_v1"
    finally:
        main.app.dependency_overrides.clear()


def test_build_regenerated_meal_preserves_slot_and_changes_representative() -> None:
    current_meal = {
        "diet_meal_id": "meal-1",
        "meal_type": "breakfast",
        "meal_order": 1,
        "recommended_calories": 400,
        "status": "recommended",
        "foods": [{"food_name": "현미밥"}],
    }

    result = main.build_regenerated_meal(current_meal, [], [])

    assert result["meal_type"] == "breakfast"
    assert result["meal_order"] == 1
    assert result["foods"][0]["food_name"] != "현미밥"
    assert all(isinstance(food["quantity"], int) for food in result["foods"])
    assert abs(result["recommended_calories"] - 400) < 0.1


def test_regenerate_diet_meal_calls_owner_scoped_rpc(monkeypatch) -> None:
    original = httpx.AsyncClient
    replacement = {
        "meal_type": "lunch",
        "meal_order": 2,
        "recommended_calories": 480,
        "recommendation_note": "다른 점심",
        "source_type": "ai_generated",
        "foods": [
            {
                "food_name": "고구마",
                "quantity": 200,
                "unit": "g",
                "calories": 480,
                "carbohydrates": 80,
                "protein": 10,
                "fat": 5,
            }
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/rest/v1/rpc/replace_diet_meal"
        payload = json.loads(request.content)
        assert payload == {
            "p_user_id": "authenticated-user",
            "p_diet_meal_id": "meal-1",
            "p_meal": replacement,
        }
        return httpx.Response(
            200,
            json={
                "diet_meal_id": "meal-1",
                "image_storage_path": "menus/07.png",
                "source_type": "ai_generated",
                "foods": [{**replacement["foods"][0], "quantity": 197.92}],
            },
        )

    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **kwargs: original(
            transport=httpx.MockTransport(handler),
            **kwargs,
        ),
    )

    result = main.asyncio.run(
        main.regenerate_diet_meal(
            "authenticated-user",
            "meal-1",
            replacement,
            TEST_SETTINGS,
        )
    )

    assert result["diet_meal_id"] == "meal-1"
    assert result["source_type"] == "ai_generated"
    assert result["foods"][0]["quantity"] == 198
    assert result["image_url"] == (
        "https://example.supabase.co/storage/v1/object/public/"
        "menu-images/menus/07.png"
    )


def test_regenerate_recommended_diet_meal_uses_authenticated_user(
    monkeypatch,
) -> None:
    meal_id = "11111111-1111-1111-1111-111111111111"

    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_context(user_id, received_id, settings):
        assert user_id == "authenticated-user"
        assert received_id == meal_id
        return {
            "recommendation": {"status": "active"},
            "meal": {
                "diet_meal_id": meal_id,
                "meal_type": "lunch",
                "meal_order": 2,
                "recommended_calories": 480,
                "status": "recommended",
                "foods": [{"food_name": "현미밥"}],
            },
        }

    async def fake_inventory(user_id, settings):
        assert user_id == "authenticated-user"
        return [
            {
                "user_food_inventory_id": "inventory-1",
                "custom_name": "두부",
                "quantity": 1,
                "unit": "모",
                "is_available": True,
            }
        ]

    async def fake_catalog(settings):
        return []

    async def fake_allergies(user_id, settings):
        assert user_id == "authenticated-user"
        return []

    async def fake_food_catalog(settings):
        return []

    async def fake_generate(current, allergies, model, inventory_names):
        assert current["meal_type"] == "lunch"
        assert allergies == []
        assert inventory_names == ["두부"]
        return {
            "meal_type": "lunch",
            "meal_order": 2,
            "recommended_calories": 480,
            "recommendation_note": "AI 재추천",
            "source_type": "ai_generated",
            "foods": [
                {
                    "food_name": "두부 스테이크",
                    "quantity": 200,
                    "unit": "g",
                    "calories": 480,
                    "carbohydrates": 20,
                    "protein": 35,
                    "fat": 25,
                }
            ],
        }

    async def fake_regenerate(user_id, received_id, replacement, settings):
        assert user_id == "authenticated-user"
        assert received_id == meal_id
        assert replacement["meal_type"] == "lunch"
        assert replacement["source_type"] == "ai_generated"
        assert replacement["foods"][0]["food_name"] == "두부 스테이크"
        assert replacement["used_ingredients"] == [{
            "user_food_inventory_id": "inventory-1",
            "name": "두부",
            "matched_food_name": "두부 스테이크",
            "quantity": 1,
            "unit": "모",
        }]
        return {"diet_meal_id": received_id, **replacement}

    async def fake_assign(meals, settings):
        assert settings == TEST_SETTINGS
        meals[0]["menu_image_key"] = "catalog:05"
        meals[0]["image_storage_path"] = "menus/05.png"
        meals[0]["image_source"] = "seeded"
        meals[0]["image_generation_status"] = "completed"
        meals[0]["image_generation_required"] = False

    async def fake_generate_images(meals, settings):
        assert settings == TEST_SETTINGS
        assert meals[0]["image_generation_required"] is False
        return {"completed": 0, "failed": 0, "skipped": 1}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_diet_meal_context", fake_context)
    monkeypatch.setattr(main, "fetch_food_inventory", fake_inventory)
    monkeypatch.setattr(main, "fetch_allergy_catalog", fake_catalog)
    monkeypatch.setattr(main, "fetch_user_allergies", fake_allergies)
    monkeypatch.setattr(main, "fetch_food_catalog", fake_food_catalog)
    monkeypatch.setattr(main, "generate_regenerated_meal", fake_generate)
    monkeypatch.setattr(main, "assign_menu_images", fake_assign)
    monkeypatch.setattr(main, "generate_missing_menu_images", fake_generate_images)
    monkeypatch.setattr(main, "regenerate_diet_meal", fake_regenerate)
    try:
        response = TestClient(main.app).post(
            f"/api/diet/meals/{meal_id}/regenerate",
            json={},
        )
        assert response.status_code == 200
        assert response.json()["generator"] == "ai_v1"
        assert response.json()["meal"]["diet_meal_id"] == meal_id
        assert response.json()["meal"]["source_type"] == "ai_generated"
        assert response.json()["used_ingredients"] == [
            {
                "user_food_inventory_id": "inventory-1",
                "name": "두부",
                "matched_food_name": "두부 스테이크",
                "quantity": 1,
                "unit": "모",
            }
        ]
    finally:
        main.app.dependency_overrides.clear()


def test_regenerate_openapi_exposes_inventory_usage_contract() -> None:
    operation = main.app.openapi()["paths"][
        "/api/diet/meals/{diet_meal_id}/regenerate"
    ]["post"]
    response_schema = operation["responses"]["200"]["content"][
        "application/json"
    ]["schema"]

    assert response_schema["$ref"].endswith("/RegenerateDietMealResponse")
    used_schema = main.app.openapi()["components"]["schemas"][
        "UsedInventoryIngredientResponse"
    ]
    assert {
        "user_food_inventory_id",
        "name",
        "matched_food_name",
        "quantity",
        "unit",
    } <= used_schema["properties"].keys()


def test_regenerate_recommended_diet_meal_rejects_finished_meal(
    monkeypatch,
) -> None:
    meal_id = "11111111-1111-1111-1111-111111111111"

    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_context(user_id, received_id, settings):
        return {
            "recommendation": {"status": "active"},
            "meal": {"status": "completed"},
        }

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_diet_meal_context", fake_context)
    try:
        response = TestClient(main.app).post(
            f"/api/diet/meals/{meal_id}/regenerate",
            json={},
        )
        assert response.status_code == 409
    finally:
        main.app.dependency_overrides.clear()


def test_changed_meal_requires_actual_items() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).post(
            "/api/diet/meals/11111111-1111-1111-1111-111111111111/feedback",
            json={"feedback_type": "different_food"},
        )
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_record_meal_feedback_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_record(user_id, meal_id, body, settings):
        assert user_id == "authenticated-user"
        assert meal_id == "11111111-1111-1111-1111-111111111111"
        assert body.feedback_type == "eaten"
        return {"feedback": {"feedback_type": "eaten"}}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "record_recommended_meal", fake_record)
    try:
        response = TestClient(main.app).post(
            "/api/diet/meals/11111111-1111-1111-1111-111111111111/feedback",
            json={"feedback_type": "eaten"},
        )
        assert response.status_code == 200
        assert response.json()["result"]["feedback"]["feedback_type"] == "eaten"
    finally:
        main.app.dependency_overrides.clear()


def test_patch_diet_feedback_contract(monkeypatch) -> None:
    async def fake_user():
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_update(user_id, meal_id, body, settings):
        assert user_id == "authenticated-user"
        assert meal_id == "11111111-1111-1111-1111-111111111111"
        assert body.eaten_at is None
        return {"feedback": {"feedback_type": body.feedback_type}, "meal_log": None}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "update_recommended_meal", fake_update)
    try:
        client = TestClient(main.app)
        url = "/api/diet/meals/11111111-1111-1111-1111-111111111111/feedback"
        response = client.patch(url, json={"feedback_type": "skipped"})
        assert response.status_code == 200
        assert response.json()["result"]["feedback"]["feedback_type"] == "skipped"
        for body in [{}, {"feedback_type": "different_food"},
                     {"feedback_type": "invalid"},
                     {"feedback_type": "eaten", "user_id": "other"},
                     {"feedback_type": "skipped", "actual_items": [{"food_name": "밥", "quantity": 1, "unit": "g"}]}]:
            assert client.patch(url, json=body).status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_patch_feedback_rpc_payload_and_missing(monkeypatch) -> None:
    original = httpx.AsyncClient

    def handler(request):
        assert request.url.path == "/rest/v1/rpc/update_recommended_meal"
        assert json.loads(request.content) == {
            "p_user_id": "authenticated-user", "p_diet_meal_id": "meal-id",
            "p_feedback_type": "skipped", "p_eaten_at": None, "p_actual_items": [],
        }
        return httpx.Response(400, json={"code": "P0002"})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs:
                        original(transport=httpx.MockTransport(handler), **kwargs))
    import asyncio
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.update_recommended_meal(
            "authenticated-user", "meal-id",
            main.DietMealFeedbackUpdateRequest(feedback_type="skipped"), TEST_SETTINGS))
    assert error.value.status_code == 404


def test_fetch_meal_logs_uses_kst_date_boundaries(monkeypatch) -> None:
    original = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/rest/v1/meal_logs"
        assert request.url.params["user_id"] == "eq.authenticated-user"
        assert request.url.params["eaten_at"] == "gte.2026-09-15T15:00:00+00:00"
        assert request.url.params["and"] == (
            "(eaten_at.lt.2026-09-16T15:00:00+00:00)"
        )
        return httpx.Response(200, json=[])

    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **kwargs: original(
            transport=httpx.MockTransport(handler),
            **kwargs,
        ),
    )

    result = main.asyncio.run(
        main.fetch_meal_logs(
            "authenticated-user",
            main.date(2026, 9, 16),
            main.date(2026, 9, 16),
            TEST_SETTINGS,
        )
    )

    assert result == []


def test_build_daily_nutrition_summary_reports_unknown_items() -> None:
    recommendation = {
        "recommendation": {
            "target_calories": "1650",
            "target_carbohydrates": "210",
            "target_protein": "85",
            "target_fat": "45",
        }
    }
    logs = [
        {
            "items": [
                {
                    "calories": "500",
                    "carbohydrates": "60",
                    "protein": "30",
                    "fat": "15",
                },
                {
                    "calories": 200,
                    "carbohydrates": 25,
                    "protein": 10,
                    "fat": None,
                },
            ]
        }
    ]

    summary = main.build_daily_nutrition_summary(
        main.date(2026, 9, 16),
        recommendation,
        logs,
    )

    assert summary["date"] == "2026-09-16"
    assert summary["has_recommendation"] is True
    assert summary["has_unknown_items"] is True
    assert summary["calories"] == {
        "consumed": 700.0,
        "target": 1650.0,
        "unit": "kcal",
    }
    assert summary["carbohydrates"]["consumed"] == 85.0
    assert summary["protein"]["consumed"] == 40.0
    assert summary["fat"]["consumed"] == 15.0


def test_get_diet_nutrition_summary_uses_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_recommendation(user_id, settings, recommendation_date, *, client=None, include_details=True):
        assert include_details is False
        assert user_id == "authenticated-user"
        assert settings == TEST_SETTINGS
        assert recommendation_date == main.date(2026, 9, 16)
        return None

    async def fake_logs(user_id, from_date, to_date, settings, *, client=None, include_photos=True):
        assert include_photos is False
        assert user_id == "authenticated-user"
        assert from_date == main.date(2026, 9, 16)
        assert to_date == main.date(2026, 9, 16)
        assert settings == TEST_SETTINGS
        return []

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_diet_recommendation", fake_recommendation)
    monkeypatch.setattr(main, "fetch_meal_logs", fake_logs)
    try:
        client = TestClient(main.app)
        response = client.get("/api/diet/nutrition-summary?date=2026-09-16")
        assert response.status_code == 200
        assert response.json()["summary"] == {
            "date": "2026-09-16",
            "has_recommendation": False,
            "has_unknown_items": False,
            "calories": {"consumed": 0.0, "target": None, "unit": "kcal"},
            "carbohydrates": {"consumed": 0.0, "target": None, "unit": "g"},
            "protein": {"consumed": 0.0, "target": None, "unit": "g"},
            "fat": {"consumed": 0.0, "target": None, "unit": "g"},
        }

        missing = client.get("/api/diet/nutrition-summary")
        assert missing.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_meal_logs_validate_range_and_use_authenticated_user(monkeypatch) -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_fetch(user_id, from_date, to_date, settings, *, client=None):
        assert user_id == "authenticated-user"
        assert from_date.isoformat() == "2026-09-01"
        assert to_date.isoformat() == "2026-09-03"
        return [{"meal_log_id": "log-1", "items": []}]

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "fetch_meal_logs", fake_fetch)
    try:
        client = TestClient(main.app)
        invalid = client.get(
            "/api/diet/meal-logs?from_date=2026-09-03&to_date=2026-09-01"
        )
        assert invalid.status_code == 422
        response = client.get(
            "/api/diet/meal-logs?from_date=2026-09-01&to_date=2026-09-03"
        )
        assert response.status_code == 200
        assert response.json()["count"] == 1
    finally:
        main.app.dependency_overrides.clear()
