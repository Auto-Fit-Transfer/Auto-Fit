"""Validated contract adapter for the external food image generation service."""

from __future__ import annotations

import base64
import binascii
import asyncio
import hashlib
import io
import os
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlsplit

import httpx
from PIL import Image
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from backend.app.http_client import client_scope
from backend.app.menu_image_dataset import (
    MAX_IMAGE_BYTES,
    SUPPORTED_IMAGE_SPECS,
    read_image_bytes_dimensions,
)


DEFAULT_FOOD_IMAGE_URL = (
    "https://lee-com.tailb6e4ed.ts.net/generate-food-image"
)


class FoodImageGenerationError(RuntimeError):
    def __init__(self, code: str, message: str, retryable: bool):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class FoodImageSettings:
    enabled: bool
    url: str
    api_key: str
    image_format: Literal["png", "webp"]
    width: int
    height: int
    timeout_seconds: float
    max_attempts: int


class GeneratedImage:
    def __init__(
        self,
        *,
        content: bytes,
        image_format: Literal["png", "webp"],
        mime_type: str,
        width: int,
        height: int,
        model_name: str,
        model_version: str,
        seed: int,
        prompt: str,
        metadata: dict[str, Any],
        label: "GeneratedImageLabel | None" = None,
    ):
        self.content = content
        self.image_format = image_format
        self.mime_type = mime_type
        self.width = width
        self.height = height
        self.model_name = model_name
        self.model_version = model_version
        self.seed = seed
        self.prompt = prompt
        self.metadata = metadata
        self.label = label


class ImagePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    mime_type: Literal["image/png", "image/webp"]
    width: int
    height: int
    base64_data: str = Field(alias="base64", min_length=1)


class GenerationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    model_name: str = Field(min_length=1, max_length=200)
    model_version: str = Field(min_length=1, max_length=100)
    seed: int
    prompt: str = Field(min_length=1, max_length=10000)


class GeneratedLabelFood(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    food_name: str = Field(min_length=1, max_length=100)
    quantity: float | int | None = Field(default=None, gt=0, le=100000)
    unit: str | None = Field(default=None, min_length=1, max_length=20)


class GeneratedImageLabel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    image_key: str | None = Field(default=None, min_length=1, max_length=200)
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    menu_name: str = Field(min_length=1, max_length=500)
    foods: list[GeneratedLabelFood] = Field(min_length=1, max_length=20)
    food_tags: list[str] = Field(min_length=1, max_length=50)
    quality_status: Literal["approved", "rejected", "needs_review"]
    labeler_note: str | None = Field(default=None, max_length=1000)


class SuccessPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["1.0"]
    request_id: str
    image_key: str
    status: Literal["completed"]
    image: ImagePayload
    generation: GenerationPayload
    metadata: dict[str, Any]
    label: GeneratedImageLabel | None = Field(
        default=None,
        validation_alias=AliasChoices("label", "labels", "labeling"),
    )


class ErrorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    code: Literal[
        "INVALID_INPUT",
        "UNSAFE_REQUEST",
        "GENERATION_FAILED",
        "TIMEOUT",
        "RATE_LIMITED",
        "INTERNAL_ERROR",
    ]
    message: str = Field(min_length=1, max_length=1000)
    retryable: bool


class FailurePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["1.0"]
    request_id: str
    image_key: str
    status: Literal["failed"]
    error: ErrorPayload


RESPONSE_ADAPTER = TypeAdapter(SuccessPayload | FailurePayload)
GENERATION_SEMAPHORE = asyncio.Semaphore(1)


def _environment_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip().casefold()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be a boolean")


def get_food_image_settings() -> FoodImageSettings:
    enabled = _environment_bool("FOOD_IMAGE_ENABLED")
    url = os.getenv("FOOD_IMAGE_URL", DEFAULT_FOOD_IMAGE_URL).strip()
    api_key = os.getenv("FOOD_IMAGE_API_KEY", "").strip()
    image_format = os.getenv("FOOD_IMAGE_FORMAT", "webp").strip().casefold()
    if image_format not in {"png", "webp"}:
        raise RuntimeError("FOOD_IMAGE_FORMAT must be png or webp")
    width, height = (1024, 1024) if image_format == "png" else (512, 512)
    try:
        timeout_seconds = float(os.getenv("FOOD_IMAGE_TIMEOUT_SECONDS", "300"))
        max_attempts = int(os.getenv("FOOD_IMAGE_MAX_ATTEMPTS", "2"))
    except ValueError as exc:
        raise RuntimeError("Food image timeout and attempts must be numeric") from exc
    parsed_url = urlsplit(url)
    if parsed_url.scheme != "https" or not parsed_url.netloc:
        raise RuntimeError("FOOD_IMAGE_URL must be an HTTPS URL")
    if not 30 <= timeout_seconds <= 1200:
        raise RuntimeError("FOOD_IMAGE_TIMEOUT_SECONDS must be between 30 and 1200")
    if not 1 <= max_attempts <= 3:
        raise RuntimeError("FOOD_IMAGE_MAX_ATTEMPTS must be between 1 and 3")
    if enabled and not api_key:
        raise RuntimeError("FOOD_IMAGE_API_KEY is required when food images are enabled")
    return FoodImageSettings(
        enabled=enabled,
        url=url,
        api_key=api_key,
        image_format=image_format,
        width=width,
        height=height,
        timeout_seconds=timeout_seconds,
        max_attempts=max_attempts,
    )


def build_generation_request(
    meal: dict[str, Any],
    image_key: str,
    food_tags: list[str],
    settings: FoodImageSettings,
) -> dict[str, Any]:
    foods = []
    for food in meal.get("foods") or []:
        food_name = str(food.get("food_name") or "").strip()
        unit = str(food.get("unit") or "").strip()
        quantity = food.get("quantity")
        if not food_name or not unit or quantity is None:
            raise FoodImageGenerationError(
                "INVALID_INPUT", "Food image input is missing food details", False
            )
        foods.append({
            "food_name": food_name,
            "quantity": quantity,
            "unit": unit,
        })
    return {
        "schema_version": "1.0",
        "request_id": image_key,
        "image_key": image_key,
        "menu_name": ", ".join(food["food_name"] for food in foods)[:300],
        "meal_type": meal["meal_type"],
        "foods": foods,
        "food_tags": food_tags[:30],
        "visual_spec": {
            "style": "realistic_food_photography",
            "composition": "single_meal",
            "camera_view": "three_quarter",
            "background": "clean_neutral",
            "people": False,
            "text": False,
            "logo": False,
            "width": 1024,
            "height": 1024,
            "format": "png",
        },
    }


def parse_generation_response(
    payload: Any,
    *,
    image_key: str,
    settings: FoodImageSettings,
) -> GeneratedImage:
    try:
        response = RESPONSE_ADAPTER.validate_python(payload)
    except ValidationError as exc:
        raise FoodImageGenerationError(
            "INVALID_RESPONSE", "Food image server returned an invalid response", False
        ) from exc
    if response.request_id != image_key or response.image_key != image_key:
        raise FoodImageGenerationError(
            "INVALID_RESPONSE", "Food image response changed request identifiers", False
        )
    if isinstance(response, FailurePayload):
        raise FoodImageGenerationError(
            response.error.code,
            response.error.message,
            response.error.retryable,
        )
    if response.image.mime_type != "image/png":
        raise FoodImageGenerationError(
            "INVALID_RESPONSE", "Food image response changed output format", False
        )
    label = response.label
    if label is None:
        label_candidate = response.metadata.get("label")
        if label_candidate is None and {
            "meal_type", "menu_name", "foods", "food_tags", "quality_status"
        } <= response.metadata.keys():
            label_candidate = response.metadata
        if label_candidate is not None:
            try:
                label = GeneratedImageLabel.model_validate(label_candidate)
            except ValidationError as exc:
                raise FoodImageGenerationError(
                    "INVALID_RESPONSE", "Food image label is invalid", False
                ) from exc
    if label is not None:
        if label.image_key is not None and label.image_key != image_key:
            raise FoodImageGenerationError(
                "INVALID_RESPONSE", "Food image label changed image_key", False
            )
        if label.quality_status != "approved":
            raise FoodImageGenerationError(
                "UNAPPROVED_LABEL", "Food image label was not approved", False
            )
    try:
        content = base64.b64decode(response.image.base64_data, validate=True)
        dimensions = read_image_bytes_dimensions(content, "png")
    except (binascii.Error, ValueError) as exc:
        raise FoodImageGenerationError(
            "INVALID_RESPONSE", "Food image response contained an invalid image", False
        ) from exc
    expected_dimensions = (1024, 1024)
    if dimensions != expected_dimensions or (
        response.image.width,
        response.image.height,
    ) != expected_dimensions:
        raise FoodImageGenerationError(
            "INVALID_RESPONSE", "Food image response changed output dimensions", False
        )
    if len(content) > MAX_IMAGE_BYTES["png"]:
        raise FoodImageGenerationError(
            "INVALID_RESPONSE", "Food image response exceeded the size limit", False
        )
    return GeneratedImage(
        content=content,
        image_format="png",
        mime_type="image/png",
        width=1024,
        height=1024,
        model_name=response.generation.model_name,
        model_version=response.generation.model_version,
        seed=response.generation.seed,
        prompt=response.generation.prompt,
        metadata=response.metadata,
        label=label,
    )


def prepare_image_for_storage(
    image: GeneratedImage,
    settings: FoodImageSettings,
) -> GeneratedImage:
    if settings.image_format == "png":
        return image
    try:
        with Image.open(io.BytesIO(image.content)) as source:
            source.load()
            converted = source.convert("RGB").resize(
                (settings.width, settings.height),
                Image.Resampling.LANCZOS,
            )
            content = b""
            for quality in (80, 70, 60, 50):
                output = io.BytesIO()
                converted.save(output, format="WEBP", quality=quality, method=6)
                content = output.getvalue()
                if len(content) <= MAX_IMAGE_BYTES["webp"]:
                    break
    except (OSError, ValueError) as exc:
        raise FoodImageGenerationError(
            "IMAGE_CONVERSION_FAILED", "Generated PNG could not be converted", False
        ) from exc
    if not content or len(content) > MAX_IMAGE_BYTES["webp"]:
        raise FoodImageGenerationError(
            "IMAGE_CONVERSION_FAILED", "Generated WebP exceeded the size limit", False
        )
    if read_image_bytes_dimensions(content, "webp") != (
        settings.width,
        settings.height,
    ):
        raise FoodImageGenerationError(
            "IMAGE_CONVERSION_FAILED", "Generated WebP dimensions are invalid", False
        )
    return GeneratedImage(
        content=content,
        image_format="webp",
        mime_type="image/webp",
        width=settings.width,
        height=settings.height,
        model_name=image.model_name,
        model_version=image.model_version,
        seed=image.seed,
        prompt=image.prompt,
        metadata={**image.metadata, "source_format": "png"},
        label=image.label,
    )


def _supabase_headers(
    settings: Any,
    *,
    content_type: str | None = None,
    prefer: str | None = None,
) -> dict[str, str]:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    if content_type:
        headers["Content-Type"] = content_type
    if prefer:
        headers["Prefer"] = prefer
    return headers


async def _claim_generation(
    image_key: str,
    settings: Any,
    client: httpx.AsyncClient | None = None,
) -> bool:
    async with client_scope(client) as request_client:
        response = await request_client.post(
            f"{settings.supabase_url}/rest/v1/rpc/claim_menu_image_generation",
            headers=_supabase_headers(settings, content_type="application/json"),
            json={"p_image_key": image_key},
        )
    if not response.is_success:
        raise FoodImageGenerationError(
            "CACHE_CLAIM_FAILED", "Food image cache claim failed", True
        )
    return response.json() is True


async def _update_cache(
    image_key: str,
    updates: dict[str, Any],
    settings: Any,
    client: httpx.AsyncClient | None = None,
) -> None:
    async with client_scope(client) as request_client:
        response = await request_client.patch(
            f"{settings.supabase_url}/rest/v1/menu_images",
            headers=_supabase_headers(settings, content_type="application/json"),
            params={"image_key": f"eq.{image_key}"},
            json=updates,
        )
    if not response.is_success:
        raise FoodImageGenerationError(
            "CACHE_UPDATE_FAILED", "Food image cache update failed", True
        )


async def _request_image(
    payload: dict[str, Any],
    settings: FoodImageSettings,
    *,
    client: httpx.AsyncClient,
) -> GeneratedImage:
    last_error: FoodImageGenerationError | None = None
    for attempt in range(settings.max_attempts):
        try:
            response = await client.post(
                settings.url,
                headers={
                    "Authorization": f"Bearer {settings.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if not response.is_success:
                retryable = response.status_code == 429 or response.status_code >= 500
                raise FoodImageGenerationError(
                    "UPSTREAM_HTTP_ERROR",
                    f"Food image server returned HTTP {response.status_code}",
                    retryable,
                )
            maximum_response_bytes = (
                MAX_IMAGE_BYTES["png"] * 4 // 3 + 200_000
            )
            if len(response.content) > maximum_response_bytes:
                raise FoodImageGenerationError(
                    "INVALID_RESPONSE",
                    "Food image server response exceeded the size limit",
                    False,
                )
            try:
                body = response.json()
            except ValueError as exc:
                raise FoodImageGenerationError(
                    "INVALID_RESPONSE",
                    "Food image server returned invalid JSON",
                    False,
                ) from exc
            return parse_generation_response(
                body,
                image_key=payload["image_key"],
                settings=settings,
            )
        except httpx.RequestError as exc:
            last_error = FoodImageGenerationError(
                "UPSTREAM_UNAVAILABLE", "Food image server is unavailable", True
            )
            if attempt + 1 >= settings.max_attempts:
                raise last_error from exc
        except FoodImageGenerationError as exc:
            last_error = exc
            if not exc.retryable or attempt + 1 >= settings.max_attempts:
                raise
    raise last_error or FoodImageGenerationError(
        "GENERATION_FAILED", "Food image generation failed", False
    )


async def _store_generated_image(
    image_key: str,
    image: GeneratedImage,
    settings: Any,
    client: httpx.AsyncClient | None = None,
) -> str:
    digest = hashlib.sha256(image_key.encode()).hexdigest()[:32]
    storage_path = f"generated/{digest}.{image.image_format}"
    async with client_scope(client) as request_client:
        response = await request_client.put(
            f"{settings.supabase_url}/storage/v1/object/menu-images/{storage_path}",
            headers={
                **_supabase_headers(settings, content_type=image.mime_type),
                "x-upsert": "true",
            },
            content=image.content,
        )
    if not response.is_success:
        raise FoodImageGenerationError(
            "STORAGE_UPLOAD_FAILED", "Generated food image upload failed", True
        )
    return storage_path


async def generate_missing_menu_images(
    meals: list[dict[str, Any]],
    supabase_settings: Any,
    *,
    image_settings: FoodImageSettings | None = None,
    model_client: httpx.AsyncClient | None = None,
    supabase_client: httpx.AsyncClient | None = None,
) -> dict[str, int]:
    config = image_settings or get_food_image_settings()
    if not config.enabled:
        return {"completed": 0, "failed": 0, "skipped": len(meals)}
    completed = failed = skipped = 0
    seen: set[str] = set()
    owned_client = model_client is None
    client = model_client or httpx.AsyncClient(
        timeout=config.timeout_seconds,
        trust_env=False,
    )
    try:
        for meal in meals:
            image_key = str(meal.get("menu_image_key") or "")
            if (
                not image_key
                or image_key in seen
                or not meal.get("image_generation_required")
            ):
                skipped += 1
                continue
            seen.add(image_key)
            async with GENERATION_SEMAPHORE:
                claimed = False
                try:
                    if not await _claim_generation(
                        image_key, supabase_settings, supabase_client
                    ):
                        skipped += 1
                        continue
                    claimed = True
                    food_names = [
                        str(food.get("food_name") or "")
                        for food in meal.get("foods") or []
                    ]
                    food_tags = sorted({
                        tag
                        for tag in meal.get("food_tags") or []
                        if isinstance(tag, str) and tag.strip()
                    })
                    if not food_tags:
                        food_tags = [
                            "재료:" + "".join(
                                character
                                for character in name.casefold()
                                if character.isalnum()
                            )
                            for name in food_names
                            if name.strip()
                        ]
                    payload = build_generation_request(
                        meal, image_key, food_tags, config
                    )
                    image = prepare_image_for_storage(
                        await _request_image(payload, config, client=client),
                        config,
                    )
                    if image.label is not None and image.label.meal_type != meal.get(
                        "meal_type"
                    ):
                        raise FoodImageGenerationError(
                            "INVALID_RESPONSE",
                            "Food image label changed meal_type",
                            False,
                        )
                    storage_path = await _store_generated_image(
                        image_key, image, supabase_settings, supabase_client
                    )
                    metadata = {
                        **image.metadata,
                        "model_version": image.model_version,
                        "seed": image.seed,
                        "width": image.width,
                        "height": image.height,
                        "format": image.image_format,
                    }
                    cache_updates: dict[str, Any] = {
                        "storage_path": storage_path,
                        "source_type": "generated",
                        "generation_status": "completed",
                        "model_name": image.model_name,
                        "generation_prompt": image.prompt,
                        "last_error": None,
                    }
                    if image.label is not None:
                        label_foods = [
                            food.model_dump(mode="json") for food in image.label.foods
                        ]
                        ingredient_tags = [
                            "재료:"
                            + "".join(
                                character
                                for character in food.food_name.casefold()
                                if character.isalnum()
                            )
                            for food in image.label.foods
                        ]
                        label_tags = list(dict.fromkeys([
                            *(
                                tag.strip()
                                for tag in image.label.food_tags
                                if tag.strip()
                            ),
                            *ingredient_tags,
                        ]))
                        metadata.update({
                            "foods": label_foods,
                            "meal_type": image.label.meal_type,
                            "quality_status": image.label.quality_status,
                            "labeler_note": image.label.labeler_note,
                        })
                        cache_updates.update({
                            "menu_name": image.label.menu_name,
                            "food_tags": label_tags,
                            "meal_type": image.label.meal_type,
                        })
                    cache_updates["metadata"] = metadata
                    await _update_cache(
                        image_key,
                        cache_updates,
                        supabase_settings,
                        supabase_client,
                    )
                    meal.update({
                        "image_storage_path": storage_path,
                        "image_source": "generated",
                        "image_generation_status": "completed",
                        "image_generation_required": False,
                    })
                    completed += 1
                except FoodImageGenerationError as exc:
                    failed += 1
                    meal["image_generation_status"] = "failed"
                    meal["image_generation_required"] = True
                    if claimed:
                        try:
                            await _update_cache(
                                image_key,
                            {
                                "generation_status": "failed",
                                "last_error": f"{exc.code}: {str(exc)}"[:1000],
                                "metadata": {
                                    "error_code": exc.code,
                                    "retryable": exc.retryable,
                                },
                            },
                                supabase_settings,
                                supabase_client,
                            )
                        except FoodImageGenerationError:
                            pass
    finally:
        if owned_client:
            await client.aclose()
    return {"completed": completed, "failed": failed, "skipped": skipped}
