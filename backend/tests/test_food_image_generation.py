import base64
import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from PIL import Image

from backend.app.food_image_generation import (
    FoodImageGenerationError,
    FoodImageSettings,
    build_generation_request,
    generate_missing_menu_images,
    get_food_image_settings,
    parse_generation_response,
    prepare_image_for_storage,
)


@pytest.fixture(autouse=True)
def isolate_food_image_environment(monkeypatch) -> None:
    monkeypatch.setenv("FOOD_IMAGE_ENABLED", "false")
    monkeypatch.setenv(
        "FOOD_IMAGE_URL",
        "https://lee-com.tailb6e4ed.ts.net/generate-food-image",
    )
    monkeypatch.delenv("FOOD_IMAGE_API_KEY", raising=False)
    monkeypatch.delenv("FOOD_IMAGE_FORMAT", raising=False)
    monkeypatch.delenv("FOOD_IMAGE_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("FOOD_IMAGE_MAX_ATTEMPTS", raising=False)


def png_image() -> bytes:
    from io import BytesIO

    output = BytesIO()
    Image.new("RGB", (1024, 1024), color=(230, 220, 190)).save(
        output, format="PNG"
    )
    return output.getvalue()


def success_payload(image_key: str = "foods:test") -> dict:
    return {
        "schema_version": "1.0",
        "request_id": image_key,
        "image_key": image_key,
        "status": "completed",
        "image": {
            "mime_type": "image/png",
            "width": 1024,
            "height": 1024,
            "base64": base64.b64encode(png_image()).decode(),
        },
        "generation": {
            "model_name": "autofit-menu-image-v1",
            "model_version": "1.0.0",
            "seed": 42,
            "prompt": "food prompt",
        },
        "metadata": {"generation_time_ms": 10, "safety_checked": True},
    }


def approved_label(image_key: str = "foods:test") -> dict:
    return {
        "image_key": image_key,
        "meal_type": "breakfast",
        "menu_name": "현미밥, 닭가슴살",
        "foods": [
            {"food_name": "현미밥", "quantity": 150, "unit": "g"},
            {"food_name": "닭가슴살", "quantity": 90, "unit": "g"},
        ],
        "food_tags": ["현미밥", "닭가슴살"],
        "quality_status": "approved",
        "labeler_note": None,
    }


def test_food_image_settings_are_disabled_and_webp_by_default(monkeypatch) -> None:
    monkeypatch.delenv("FOOD_IMAGE_ENABLED", raising=False)
    monkeypatch.delenv("FOOD_IMAGE_FORMAT", raising=False)
    monkeypatch.delenv("FOOD_IMAGE_API_KEY", raising=False)

    settings = get_food_image_settings()

    assert settings.enabled is False
    assert (settings.image_format, settings.width, settings.height) == ("webp", 512, 512)


def test_enabled_food_image_settings_require_api_key(monkeypatch) -> None:
    monkeypatch.setenv("FOOD_IMAGE_ENABLED", "true")
    monkeypatch.delenv("FOOD_IMAGE_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="FOOD_IMAGE_API_KEY"):
        get_food_image_settings()


def test_build_generation_request_matches_external_contract(monkeypatch) -> None:
    monkeypatch.setenv("FOOD_IMAGE_FORMAT", "webp")
    settings = get_food_image_settings()

    payload = build_generation_request(
        {
            "meal_type": "breakfast",
            "foods": [{"food_name": "현미밥", "quantity": 150, "unit": "g"}],
        },
        "foods:test",
        ["현미밥"],
        settings,
    )

    assert payload["request_id"] == payload["image_key"] == "foods:test"
    assert payload["foods"] == [{"food_name": "현미밥", "quantity": 150, "unit": "g"}]
    assert payload["visual_spec"] | {"format": "png", "width": 1024, "height": 1024} == payload["visual_spec"]


def test_parse_generation_response_validates_and_decodes_image(monkeypatch) -> None:
    monkeypatch.setenv("FOOD_IMAGE_FORMAT", "webp")
    settings = get_food_image_settings()

    image = parse_generation_response(
        success_payload(), image_key="foods:test", settings=settings
    )

    assert image.content == png_image()
    assert image.mime_type == "image/png"
    assert image.model_name == "autofit-menu-image-v1"


def test_prepare_image_for_storage_converts_png_to_512_webp(monkeypatch) -> None:
    settings = get_food_image_settings()
    parsed = parse_generation_response(
        success_payload(), image_key="foods:test", settings=settings
    )

    converted = prepare_image_for_storage(parsed, settings)

    assert converted.mime_type == "image/webp"
    assert converted.image_format == "webp"
    assert (converted.width, converted.height) == (512, 512)
    assert len(converted.content) <= 500 * 1024
    assert converted.content[:4] == b"RIFF"


def test_prepare_image_for_storage_keeps_png_when_configured(monkeypatch) -> None:
    monkeypatch.setenv("FOOD_IMAGE_FORMAT", "png")
    settings = get_food_image_settings()
    parsed = parse_generation_response(
        success_payload(), image_key="foods:test", settings=settings
    )

    stored = prepare_image_for_storage(parsed, settings)

    assert stored is parsed
    assert stored.mime_type == "image/png"
    assert (stored.width, stored.height) == (1024, 1024)


def test_parse_generation_response_rejects_changed_identifiers(monkeypatch) -> None:
    settings = get_food_image_settings()

    with pytest.raises(FoodImageGenerationError, match="identifiers"):
        parse_generation_response(
            success_payload("foods:other"), image_key="foods:test", settings=settings
        )


def test_parse_generation_response_preserves_retryable_failure(monkeypatch) -> None:
    settings = get_food_image_settings()
    payload = {
        "schema_version": "1.0",
        "request_id": "foods:test",
        "image_key": "foods:test",
        "status": "failed",
        "error": {
            "code": "TIMEOUT",
            "message": "generation timed out",
            "retryable": True,
        },
    }

    with pytest.raises(FoodImageGenerationError) as captured:
        parse_generation_response(payload, image_key="foods:test", settings=settings)

    assert captured.value.code == "TIMEOUT"
    assert captured.value.retryable is True


def test_parse_generation_response_accepts_labeled_alias(monkeypatch) -> None:
    settings = get_food_image_settings()
    payload = success_payload()
    payload["labels"] = approved_label()

    image = parse_generation_response(
        payload, image_key="foods:test", settings=settings
    )

    assert image.label is not None
    assert image.label.meal_type == "breakfast"
    assert image.label.food_tags == ["현미밥", "닭가슴살"]


def test_parse_generation_response_rejects_unapproved_label(monkeypatch) -> None:
    settings = get_food_image_settings()
    payload = success_payload()
    payload["label"] = {**approved_label(), "quality_status": "needs_review"}

    with pytest.raises(FoodImageGenerationError) as captured:
        parse_generation_response(
            payload, image_key="foods:test", settings=settings
        )

    assert captured.value.code == "UNAPPROVED_LABEL"


def enabled_settings() -> FoodImageSettings:
    return FoodImageSettings(
        enabled=True,
        url="https://image.example/generate-food-image",
        api_key="image-secret",
        image_format="webp",
        width=512,
        height=512,
        timeout_seconds=300,
        max_attempts=2,
    )


def pending_meal() -> dict:
    return {
        "meal_type": "breakfast",
        "foods": [{"food_name": "현미밥", "quantity": 150, "unit": "g"}],
        "menu_image_key": "foods:test",
        "image_generation_required": True,
        "image_generation_status": "pending",
    }


def test_generate_missing_menu_images_uploads_and_completes_cache() -> None:
    supabase_requests: list[httpx.Request] = []

    def supabase_handler(request: httpx.Request) -> httpx.Response:
        supabase_requests.append(request)
        if request.url.path.endswith("/rpc/claim_menu_image_generation"):
            return httpx.Response(200, json=True)
        if "/storage/v1/object/menu-images/generated/" in request.url.path:
            return httpx.Response(200, json={"Key": request.url.path})
        if request.method == "PATCH" and request.url.path.endswith("/menu_images"):
            return httpx.Response(204)
        raise AssertionError(f"unexpected Supabase request: {request.method} {request.url}")

    def model_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer image-secret"
        visual_spec = json.loads(request.content)["visual_spec"]
        assert visual_spec["format"] == "png"
        assert (visual_spec["width"], visual_spec["height"]) == (1024, 1024)
        payload = success_payload()
        payload["label"] = approved_label()
        return httpx.Response(200, json=payload)

    async def run():
        meal = pending_meal()
        async with (
            httpx.AsyncClient(transport=httpx.MockTransport(supabase_handler)) as supabase,
            httpx.AsyncClient(transport=httpx.MockTransport(model_handler)) as model,
        ):
            result = await generate_missing_menu_images(
                [meal],
                SimpleNamespace(
                    supabase_url="https://supabase.example",
                    supabase_service_role_key="service-secret",
                ),
                image_settings=enabled_settings(),
                model_client=model,
                supabase_client=supabase,
            )
        return result, meal

    result, meal = asyncio.run(run())

    assert result == {"completed": 1, "failed": 0, "skipped": 0}
    assert meal["image_generation_status"] == "completed"
    assert meal["image_generation_required"] is False
    upload = next(request for request in supabase_requests if request.method == "PUT")
    assert upload.headers["content-type"] == "image/webp"
    completed = [
        json.loads(request.content)
        for request in supabase_requests
        if request.method == "PATCH"
    ][0]
    assert completed["generation_status"] == "completed"
    assert completed["metadata"]["model_version"] == "1.0.0"
    assert completed["menu_name"] == "현미밥, 닭가슴살"
    assert completed["meal_type"] == "breakfast"
    assert completed["food_tags"] == ["현미밥", "닭가슴살", "재료:현미밥", "재료:닭가슴살"]
    assert completed["metadata"]["foods"][1]["food_name"] == "닭가슴살"
    assert completed["metadata"]["quality_status"] == "approved"


def test_generate_missing_menu_images_retries_retryable_failure_and_marks_failed() -> None:
    model_calls = 0
    cache_updates: list[dict] = []

    def supabase_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rpc/claim_menu_image_generation"):
            return httpx.Response(200, json=True)
        if request.method == "PATCH":
            cache_updates.append(json.loads(request.content))
            return httpx.Response(204)
        raise AssertionError(f"unexpected Supabase request: {request.method} {request.url}")

    def model_handler(request: httpx.Request) -> httpx.Response:
        nonlocal model_calls
        model_calls += 1
        return httpx.Response(200, json={
            "schema_version": "1.0",
            "request_id": "foods:test",
            "image_key": "foods:test",
            "status": "failed",
            "error": {
                "code": "TIMEOUT",
                "message": "generation timed out",
                "retryable": True,
            },
        })

    async def run():
        meal = pending_meal()
        async with (
            httpx.AsyncClient(transport=httpx.MockTransport(supabase_handler)) as supabase,
            httpx.AsyncClient(transport=httpx.MockTransport(model_handler)) as model,
        ):
            result = await generate_missing_menu_images(
                [meal],
                SimpleNamespace(
                    supabase_url="https://supabase.example",
                    supabase_service_role_key="service-secret",
                ),
                image_settings=enabled_settings(),
                model_client=model,
                supabase_client=supabase,
            )
        return result, meal

    result, meal = asyncio.run(run())

    assert model_calls == 2
    assert result == {"completed": 0, "failed": 1, "skipped": 0}
    assert meal["image_generation_status"] == "failed"
    assert cache_updates[-1]["generation_status"] == "failed"
    assert cache_updates[-1]["last_error"].startswith("TIMEOUT:")
    assert cache_updates[-1]["metadata"] == {
        "error_code": "TIMEOUT",
        "retryable": True,
    }


def test_generate_missing_menu_images_skips_when_cache_claim_is_lost() -> None:
    def supabase_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=False)

    def model_handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("model must not be called without a cache claim")

    async def run():
        async with (
            httpx.AsyncClient(transport=httpx.MockTransport(supabase_handler)) as supabase,
            httpx.AsyncClient(transport=httpx.MockTransport(model_handler)) as model,
        ):
            return await generate_missing_menu_images(
                [pending_meal()],
                SimpleNamespace(
                    supabase_url="https://supabase.example",
                    supabase_service_role_key="service-secret",
                ),
                image_settings=enabled_settings(),
                model_client=model,
                supabase_client=supabase,
            )

    assert asyncio.run(run()) == {"completed": 0, "failed": 0, "skipped": 1}
