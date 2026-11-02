import json
import struct
from pathlib import Path

import httpx

from backend.scripts.import_menu_image_dataset import import_dataset, service_headers


def write_label(
    tmp_path: Path,
    *,
    quality_status: str = "approved",
    image_format: str = "png",
) -> Path:
    images = tmp_path / "images"
    images.mkdir(exist_ok=True)
    suffix = "png" if image_format == "png" else "webp"
    image = images / f"menu_000001.{suffix}"
    if image_format == "png":
        image.write_bytes(
            b"\x89PNG\r\n\x1a\n" + struct.pack(">I4sII", 13, b"IHDR", 1024, 1024)
        )
        width = height = 1024
    else:
        image.write_bytes(
            b"RIFF"
            + struct.pack("<I", 22)
            + b"WEBPVP8X"
            + struct.pack("<I", 10)
            + b"\x00\x00\x00\x00"
            + (511).to_bytes(3, "little")
            + (511).to_bytes(3, "little")
        )
        width = height = 512
    label = {
        "image_id": "menu_000001",
        "image_path": f"images/menu_000001.{suffix}",
        "meal_type": "breakfast",
        "menu_name": "현미밥, 닭가슴살",
        "foods": [
            {"food_name": "현미밥", "quantity": 150, "unit": "g"},
            {"food_name": "닭가슴살", "quantity": 90, "unit": "g"},
        ],
        "food_tags": ["현미밥", "닭가슴살"],
        "width": width,
        "height": height,
        "format": image_format,
        "quality_status": quality_status,
        "labeler_note": None,
    }
    manifest = tmp_path / "labels.jsonl"
    manifest.write_text(json.dumps(label, ensure_ascii=False), encoding="utf-8")
    return manifest


def test_import_dataset_uploads_approved_images_and_upserts_cache(tmp_path: Path) -> None:
    manifest = write_label(tmp_path)
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200 if request.method == "PUT" else 201)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await import_dataset(
                manifest,
                "batch-20260930",
                "https://example.supabase.co",
                "service-secret",
                client=client,
            )

    import asyncio

    result = asyncio.run(run())

    assert result == {"validated": 1, "imported": 1, "skipped": 0}
    assert requests[0].url.path.endswith(
        "/storage/v1/object/menu-images/datasets/batch-20260930/menu_000001.png"
    )
    assert requests[0].headers["x-upsert"] == "true"
    assert requests[1].url.path == "/rest/v1/menu_images"
    [record] = json.loads(requests[1].content)
    assert record["image_key"] == "dataset:menu_000001"
    assert record["meal_type"] == "breakfast"
    assert record["metadata"]["quality_status"] == "approved"


def test_import_dataset_skips_unapproved_images(tmp_path: Path) -> None:
    manifest = write_label(tmp_path, quality_status="needs_review")

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await import_dataset(
                manifest,
                "batch-20260930",
                "https://example.supabase.co",
                "service-secret",
                client=client,
            )

    import asyncio

    assert asyncio.run(run()) == {"validated": 1, "imported": 0, "skipped": 1}


def test_import_dataset_uploads_webp_with_matching_path_and_content_type(tmp_path: Path) -> None:
    manifest = write_label(tmp_path, image_format="webp")
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200 if request.method == "PUT" else 201)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await import_dataset(
                manifest,
                "batch-webp",
                "https://example.supabase.co",
                "service-secret",
                client=client,
            )

    import asyncio

    assert asyncio.run(run())["imported"] == 1
    assert requests[0].url.path.endswith("/datasets/batch-webp/menu_000001.webp")
    assert requests[0].headers["content-type"] == "image/webp"
    [record] = json.loads(requests[1].content)
    assert record["storage_path"].endswith(".webp")
    assert record["metadata"]["format"] == "webp"


def test_import_service_headers_do_not_use_secret_key_as_bearer() -> None:
    assert service_headers("sb_secret_server") == {"apikey": "sb_secret_server"}
    assert service_headers("legacy-jwt")["Authorization"] == "Bearer legacy-jwt"
