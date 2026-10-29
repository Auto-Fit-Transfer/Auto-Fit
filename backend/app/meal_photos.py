"""Private, owner-scoped photos attached to persisted meal logs."""
from typing import Any
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from backend.app.diet_timing import logger, timed_http_client

BUCKET = "meal-photos"
MAX_BYTES = 5 * 1024 * 1024
URL_TTL = 3600


class MealPhotoResponse(BaseModel):
    meal_log_id: UUID
    image_storage_path: str
    image_url: str
    image_url_expires_in: int = URL_TTL


def headers(settings: Any) -> dict[str, str]:
    return {"apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}"}


async def read_photo(file: UploadFile) -> tuple[bytes, str, str]:
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "Meal photo must be at most 5 MiB")
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return content, "image/png", ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return content, "image/jpeg", ".jpg"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return content, "image/webp", ".webp"
    raise HTTPException(415, "Only JPEG, PNG and WebP photos are supported")


async def signed_photo(client: httpx.AsyncClient, path: str, settings: Any) -> dict[str, Any]:
    response = await client.post(
        f"{settings.supabase_url}/storage/v1/object/sign/{BUCKET}/{path}",
        headers=headers(settings), json={"expiresIn": URL_TTL},
    )
    if not response.is_success:
        logger.warning("[diet-photo] URL signing rejected upstream_status=%s", response.status_code)
        raise HTTPException(502, "Meal photo URL signing failed")
    try:
        payload = response.json()
        signed_url = payload.get("signedURL") if isinstance(payload, dict) else None
        if not isinstance(signed_url, str) or not signed_url.startswith("/") or signed_url.startswith("//"):
            raise ValueError("Invalid signed URL")
    except ValueError:
        logger.warning("[diet-photo] URL signing returned invalid response upstream_status=%s", response.status_code)
        raise HTTPException(502, "Meal photo URL signing failed") from None
    return {"image_storage_path": path,
            "image_url": f"{settings.supabase_url}/storage/v1{signed_url}",
            "image_url_expires_in": URL_TTL}


async def attach_photos(logs: list[dict[str, Any]], user_id: str, settings: Any, *, client=None) -> None:
    for log in logs:
        log.update(image_storage_path=None, image_url=None, image_url_expires_in=None)
    if not logs:
        return
    async with timed_http_client("meal_photos", client, timeout=20) as client:
        for log in logs:
            if path := log.get("photo_storage_path"):
                try:
                    log.update(await signed_photo(client, path, settings))
                except (HTTPException, httpx.RequestError):
                    # Optional media must not take down persisted dietary records.
                    # Uploads still use strict signing; never log private paths/errors.
                    logger.warning("[diet-photo] URL signing failed during meal log read")


async def upload_photo(meal_log_id: str, user_id: str, file: UploadFile, settings: Any) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        owned = await client.get(
            f"{settings.supabase_url}/rest/v1/meal_logs", headers=headers(settings),
            params={"select": "meal_log_id,photo_storage_path", "meal_log_id": f"eq.{meal_log_id}",
                    "user_id": f"eq.{user_id}", "status": "eq.recorded"},
        )
        if not owned.is_success:
            raise HTTPException(502, "Meal log ownership query failed")
        if not owned.json():
            raise HTTPException(404, "Meal log not found")
        if owned.json()[0].get("photo_storage_path"):
            raise HTTPException(409, "Meal photo already exists")
        content, mime, extension = await read_photo(file)
        path = f"{user_id}/{meal_log_id}/{uuid4()}{extension}"
        uploaded = await client.post(
            f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{path}",
            headers={**headers(settings), "Content-Type": mime}, content=content,
        )
        if not uploaded.is_success:
            raise HTTPException(502, "Meal photo upload failed")
        try:
            saved = await client.patch(
                f"{settings.supabase_url}/rest/v1/meal_logs",
                headers={**headers(settings), "Prefer": "return=representation"},
                params={"meal_log_id": f"eq.{meal_log_id}", "user_id": f"eq.{user_id}",
                        "status": "eq.recorded", "photo_storage_path": "is.null"},
                json={"photo_storage_path": path},
            )
            if not saved.is_success:
                raise HTTPException(409 if saved.status_code == 409 else 502,
                                    "Meal photo already exists" if saved.status_code == 409 else "Meal photo save failed")
            if not saved.json():
                raise HTTPException(409, "Meal photo already exists or record changed")
        except HTTPException:
            # A transport timeout can happen after the DB committed. Only remove
            # the object when the DB explicitly rejected the update.
            try:
                await client.delete(f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{path}",
                                    headers=headers(settings))
            except httpx.HTTPError:
                pass
            raise
        return {"meal_log_id": meal_log_id, **await signed_photo(client, path, settings)}


def create_meal_photos_router(current_user_dependency: Any, settings_dependency: Any) -> APIRouter:
    router = APIRouter(prefix="/api/diet/meal-logs", tags=["Diet"])

    @router.post("/{meal_log_id}/photo", status_code=201, response_model=MealPhotoResponse,
                 responses={404: {"description": "Record not found"},
                            409: {"description": "Photo already attached"},
                            413: {"description": "Photo exceeds 5 MiB"},
                            415: {"description": "Unsupported image format"}},
                 summary="Upload a photo for an existing meal log")
    async def post_photo(meal_log_id: UUID, file: UploadFile = File(...),
                         user: Any = Depends(current_user_dependency),
                         settings: Any = Depends(settings_dependency)) -> dict[str, Any]:
        try:
            return await upload_photo(str(meal_log_id), user.id, file, settings)
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Meal photo storage unavailable") from exc
        finally:
            await file.close()

    return router
