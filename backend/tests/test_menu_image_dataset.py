import json
import struct
from pathlib import Path

import pytest

from backend.app.menu_image_dataset import (
    build_menu_image_record,
    load_menu_image_labels,
)


def png_header(width: int = 1024, height: int = 1024) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I4sII", 13, b"IHDR", width, height)


def webp_header(width: int = 512, height: int = 512) -> bytes:
    return (
        b"RIFF"
        + struct.pack("<I", 22)
        + b"WEBPVP8X"
        + struct.pack("<I", 10)
        + b"\x00\x00\x00\x00"
        + (width - 1).to_bytes(3, "little")
        + (height - 1).to_bytes(3, "little")
    )


def valid_label(**updates):
    value = {
        "image_id": "menu_000001",
        "image_path": "images/menu_000001.png",
        "meal_type": "breakfast",
        "menu_name": "현미밥, 닭가슴살, 브로콜리",
        "foods": [
            {"food_name": "현미밥", "quantity": 150, "unit": "g"},
            {"food_name": "닭가슴살", "quantity": 90, "unit": "g"},
        ],
        "food_tags": ["현미밥", "닭가슴살", "채소"],
        "width": 1024,
        "height": 1024,
        "format": "png",
        "quality_status": "approved",
        "labeler_note": None,
    }
    value.update(updates)
    return value


def write_dataset(tmp_path: Path, labels: list[dict], dimensions=(1024, 1024)) -> Path:
    images = tmp_path / "images"
    images.mkdir()
    for label in labels:
        header = (
            png_header(*dimensions)
            if label["format"] == "png"
            else webp_header(*dimensions)
        )
        (images / Path(label["image_path"]).name).write_bytes(header)
    manifest = tmp_path / "labels.jsonl"
    manifest.write_text(
        "\n".join(json.dumps(label, ensure_ascii=False) for label in labels),
        encoding="utf-8",
    )
    return manifest


def test_load_menu_image_labels_validates_png_and_builds_cache_record(tmp_path: Path) -> None:
    manifest = write_dataset(tmp_path, [valid_label()])

    [(label, image_path)] = load_menu_image_labels(manifest)
    record = build_menu_image_record(
        label,
        image_path.read_bytes(),
        "datasets/batch-1/menu_000001.png",
    )

    assert record["image_key"] == "dataset:menu_000001"
    assert record["meal_type"] == "breakfast"
    assert record["generation_status"] == "completed"
    assert "재료:현미밥" in record["food_tags"]
    assert record["metadata"]["quality_status"] == "approved"
    assert len(record["metadata"]["sha256"]) == 64


def test_load_menu_image_labels_rejects_path_traversal(tmp_path: Path) -> None:
    manifest = tmp_path / "labels.jsonl"
    manifest.write_text(
        json.dumps(valid_label(image_path="../menu_000001.png"), ensure_ascii=False),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="relative PNG or WebP path"):
        load_menu_image_labels(manifest)


def test_load_menu_image_labels_rejects_dimension_mismatch(tmp_path: Path) -> None:
    manifest = write_dataset(tmp_path, [valid_label()], dimensions=(512, 512))

    with pytest.raises(ValueError, match="dimensions do not match"):
        load_menu_image_labels(manifest)


def test_load_menu_image_labels_rejects_duplicate_ids(tmp_path: Path) -> None:
    first = valid_label()
    second = valid_label(image_path="images/menu_000001.png")
    manifest = write_dataset(tmp_path, [first, second])

    with pytest.raises(ValueError, match="duplicate image id or path"):
        load_menu_image_labels(manifest)


def test_load_menu_image_labels_accepts_512_webp(tmp_path: Path) -> None:
    label = valid_label(
        image_path="images/menu_000001.webp",
        width=512,
        height=512,
        format="webp",
    )
    manifest = write_dataset(tmp_path, [label], dimensions=(512, 512))

    [(loaded, image_path)] = load_menu_image_labels(manifest)
    record = build_menu_image_record(
        loaded,
        image_path.read_bytes(),
        "datasets/batch-1/menu_000001.webp",
    )

    assert loaded.format == "webp"
    assert record["metadata"]["format"] == "webp"


def test_load_menu_image_labels_rejects_unsupported_format_size_pair(tmp_path: Path) -> None:
    manifest = tmp_path / "labels.jsonl"
    manifest.write_text(
        json.dumps(valid_label(width=512, height=512), ensure_ascii=False),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="1024x1024 PNG or 512x512 WebP"):
        load_menu_image_labels(manifest)
