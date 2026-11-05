"""Validate and optionally import a labeled menu image dataset into Supabase."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from pathlib import Path
from urllib.parse import quote

import httpx

from backend.app.menu_image_dataset import (
    build_menu_image_record,
    load_menu_image_labels,
)


DATASET_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$")


def service_headers(service_key: str, *, prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": service_key,
    }
    if not service_key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {service_key}"
    if prefer:
        headers["Prefer"] = prefer
    return headers


async def import_dataset(
    manifest_path: Path,
    dataset_name: str,
    supabase_url: str,
    service_key: str,
    *,
    client: httpx.AsyncClient,
) -> dict[str, int]:
    if not DATASET_NAME_PATTERN.fullmatch(dataset_name):
        raise ValueError("dataset name may contain only letters, numbers, '_' and '-'")
    labels = load_menu_image_labels(manifest_path)
    approved = [(label, path) for label, path in labels if label.quality_status == "approved"]
    records = []
    for label, image_path in approved:
        image_bytes = image_path.read_bytes()
        storage_path = f"datasets/{dataset_name}/{label.image_id}.{label.format}"
        content_type = "image/png" if label.format == "png" else "image/webp"
        upload = await client.put(
            f"{supabase_url}/storage/v1/object/menu-images/{quote(storage_path, safe='/')}",
            headers={
                **service_headers(service_key),
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            content=image_bytes,
        )
        upload.raise_for_status()
        records.append(build_menu_image_record(label, image_bytes, storage_path))

    if records:
        upsert = await client.post(
            f"{supabase_url}/rest/v1/menu_images",
            params={"on_conflict": "image_key"},
            headers={
                **service_headers(
                    service_key,
                    prefer="resolution=merge-duplicates,return=minimal",
                ),
                "Content-Type": "application/json",
            },
            json=records,
        )
        upsert.raise_for_status()
    return {
        "validated": len(labels),
        "imported": len(records),
        "skipped": len(labels) - len(records),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate labels.jsonl and import approved menu images."
    )
    parser.add_argument("manifest", type=Path, help="Path to labels.jsonl")
    parser.add_argument(
        "--dataset-name",
        required=True,
        help="Stable batch name used in Storage paths",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Upload images and upsert cache records; otherwise validate only",
    )
    return parser.parse_args()


async def async_main() -> int:
    args = parse_args()
    labels = load_menu_image_labels(args.manifest)
    approved = sum(label.quality_status == "approved" for label, _ in labels)
    if not args.apply:
        print(json.dumps({
            "validated": len(labels),
            "approved": approved,
            "skipped": len(labels) - approved,
            "applied": False,
        }, ensure_ascii=False))
        return 0

    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --apply"
        )
    async with httpx.AsyncClient(timeout=120) as client:
        result = await import_dataset(
            args.manifest,
            args.dataset_name,
            supabase_url,
            service_key,
            client=client,
        )
    print(json.dumps({**result, "applied": True}, ensure_ascii=False))
    return 0


def main() -> int:
    return asyncio.run(async_main())


if __name__ == "__main__":
    raise SystemExit(main())
