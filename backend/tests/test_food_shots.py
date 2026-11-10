"""FoodShot transport and public API contract; no real AI or DB calls."""

import asyncio

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import food_shots, main
from backend.app.ai_server import AIEndpoint, AIServerClient, AIServerConfig, AIServerError
from backend.tests.test_main import TEST_SETTINGS


OWNER = "3388350b-2b51-4784-a258-7d7f505fa311"
KEY = "food-shot-test-key-" + "x" * 32
PNG = b"\x89PNG\r\n\x1a\nfood-image"


def result(*, source="openai_vision"):
    return {
        "ok": True, "generator": "auto-fit-ai", "status": "completed",
        "recognition_source": source, "nutrition_source": "official_food_catalog",
        "items": [{
            "name": "사과", "amount_g": 100, "amount_estimated": source == "openai_vision",
            "confidence": 0.9 if source == "openai_vision" else None,
            "alternative_names": [], "catalog_matched": True,
            "matched_food_code": "C001", "matched_food_name": "사과",
            "match_score": 1, "calories_kcal": 52, "carbohydrate_g": 14,
            "protein_g": 0.3, "fat_g": 0.2,
            "nutrition_source": "대한민국 전국통합식품영양성분정보",
            "requires_user_confirmation": True, "warnings": [],
        }],
        "total_nutrition": {"calories_kcal": 52, "carbohydrate_g": 14,
                            "protein_g": 0.3, "fat_g": 0.2},
        "nutrition_complete": True, "requires_user_confirmation": True,
        "message": "확인이 필요합니다.",
    }


def authorized(monkeypatch, ai_class):
    main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id=OWNER)
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(food_shots, "get_ai_server_config",
                        lambda: AIServerConfig("https://ai.example.invalid", KEY))
    monkeypatch.setattr(food_shots, "AIServerClient", ai_class)


def test_image_transport_sends_only_server_key_and_exact_multipart():
    def handle(request):
        assert str(request.url) == "https://ai.example.invalid/food-analysis/analyze"
        assert request.headers["authorization"] == f"Bearer {KEY}"
        assert "apikey" not in request.headers
        assert request.headers["content-type"].startswith("multipart/form-data;")
        assert b'name="image"' in request.content
        assert PNG in request.content
        return httpx.Response(200, json=result())

    client = AIServerClient(AIServerConfig("https://ai.example.invalid", KEY),
                            transport=httpx.MockTransport(handle))
    assert asyncio.run(client.analyze_food_image(PNG, "image/png"))["status"] == "completed"


def test_public_routes_require_user_auth():
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        client = TestClient(main.app)
        assert client.post("/api/diet/food-shots/analyze",
                           files={"file": ("food.png", PNG, "image/png")}).status_code == 401
        assert client.post("/api/diet/food-shots/recalculate",
                           json={"items": [{"name": "사과", "amount_g": 100}]}).status_code == 401
    finally:
        main.app.dependency_overrides.clear()


def test_analysis_and_recalculation_are_transient_and_validated(monkeypatch):
    calls = []

    class FakeAI:
        def __init__(self, config):
            assert config.api_key == KEY

        async def analyze_food_image(self, image, mime):
            calls.append(("analyze", image, mime))
            return result()

        async def post(self, endpoint, payload):
            calls.append(("recalculate", endpoint, payload))
            return result(source="user_input")

    async def check(self, bucket):
        calls.append(("quota", bucket, self.headers))

    authorized(monkeypatch, FakeAI)
    monkeypatch.setattr(food_shots.ChatRateLimiter, "check", check)
    try:
        client = TestClient(main.app)
        analyzed = client.post("/api/diet/food-shots/analyze",
                               files={"file": ("food.heic", PNG, "image/heic")})
        assert analyzed.status_code == 200
        assert analyzed.json()["requires_user_confirmation"] is True
        assert calls[0][0:2] == ("quota", "answers")
        assert calls[1] == ("analyze", PNG, "image/png")

        recalculated = client.post("/api/diet/food-shots/recalculate",
                                   json={"items": [{"name": " 사과 ", "amount_g": 100,
                                                    "matched_food_code": "C001"}]})
        assert recalculated.status_code == 200
        assert recalculated.json()["recognition_source"] == "user_input"
        assert recalculated.headers["cache-control"] == "no-store"
        assert calls[2][0:2] == ("quota", "requests")
        assert calls[3] == ("recalculate", AIEndpoint.FOOD_SHOT_RECALCULATE,
                            {"items": [{"name": "사과", "amount_g": 100.0,
                                        "matched_food_code": "C001"}]})
        assert food_shots.service_headers(type("Config", (), {
            "supabase_service_role_key": "sb_secret_test"
        })()) == {"apikey": "sb_secret_test"}
    finally:
        main.app.dependency_overrides.clear()


def test_rejects_unsupported_oversized_and_invalid_requests(monkeypatch):
    class UnexpectedAI:
        def __init__(self, config):
            pass

        async def analyze_food_image(self, image, mime):
            raise AssertionError("invalid file must not reach AI")

    async def check(self, bucket):
        pass

    authorized(monkeypatch, UnexpectedAI)
    monkeypatch.setattr(food_shots.ChatRateLimiter, "check", check)
    monkeypatch.setattr(food_shots, "MAX_IMAGE_BYTES", 10)
    try:
        client = TestClient(main.app)
        assert client.post("/api/diet/food-shots/analyze",
                           files={"file": ("food.heic", b"HEIC", "image/heic")}).status_code == 415
        assert client.post("/api/diet/food-shots/analyze",
                           files={"file": ("food.png", PNG, "image/png")}).status_code == 413
        for body in ({"items": []}, {"items": [{"name": "", "amount_g": 100}]},
                     {"items": [{"name": "사과", "amount_g": -1}]},
                     {"items": [{"name": "사과", "amount_g": 1}] * 21}):
            assert client.post("/api/diet/food-shots/recalculate", json=body).status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_ai_failure_and_incomplete_success_are_safe(monkeypatch):
    class FakeAI:
        def __init__(self, config):
            pass

        async def analyze_food_image(self, image, mime):
            raise AIServerError("AI_TIMEOUT")

        async def post(self, endpoint, payload):
            bad = result(source="user_input")
            bad["requires_user_confirmation"] = False
            return bad

    async def check(self, bucket):
        pass

    authorized(monkeypatch, FakeAI)
    monkeypatch.setattr(food_shots.ChatRateLimiter, "check", check)
    try:
        client = TestClient(main.app)
        failure = client.post("/api/diet/food-shots/analyze",
                              files={"file": ("food.png", PNG, "image/png")})
        assert failure.status_code == 503
        assert failure.headers["retry-after"] == "30"
        invalid = client.post("/api/diet/food-shots/recalculate",
                              json={"items": [{"name": "사과", "amount_g": 100}]})
        assert invalid.status_code == 502
        assert invalid.json()["detail"]["code"] == "FOOD_SHOT_INVALID_RESPONSE"
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize("status,expected,code", [
    (413, 413, "FOOD_SHOT_TOO_LARGE"),
    (415, 415, "UNSUPPORTED_IMAGE_TYPE"),
    (422, 422, "FOOD_SHOT_INPUT_REJECTED"),
    (503, 503, "AI_UNAVAILABLE"),
])
def test_upstream_food_image_error_statuses_are_safe(status, expected, code):
    def handle(request):
        return httpx.Response(status, text="private provider response",
                              headers={"Retry-After": "12"})

    client = AIServerClient(AIServerConfig("https://ai.example.invalid", KEY),
                            transport=httpx.MockTransport(handle))
    with pytest.raises(AIServerError) as caught:
        asyncio.run(client.analyze_food_image(PNG, "image/png"))
    public = food_shots.ai_failure(caught.value)
    assert public.status_code == expected
    assert public.detail == {"code": code}
    assert "private" not in str(public.detail)
    if status == 503:
        assert public.headers["Retry-After"] == "12"


@pytest.mark.parametrize("source,estimated,confidence", [
    ("openai_vision", False, None),
    ("user_input", True, None),
    ("user_input", False, 0.9),
])
def test_recalculation_rejects_wrong_response_provenance(source, estimated, confidence):
    bad = result(source="user_input")
    bad["recognition_source"] = source
    bad["items"][0]["amount_estimated"] = estimated
    bad["items"][0]["confidence"] = confidence
    with pytest.raises(HTTPException) as caught:
        food_shots.validate_ai_result(bad, "user_input")
    assert caught.value.status_code == 502


def test_analysis_rejects_recalculation_response():
    with pytest.raises(HTTPException) as caught:
        food_shots.validate_ai_result(result(source="user_input"), "openai_vision")
    assert caught.value.status_code == 502


def test_ai_contract_allows_twenty_recalculation_items():
    payload = result(source="user_input")
    payload["items"] = payload["items"] * 20
    assert len(food_shots.validate_ai_result(payload, "user_input").items) == 20
