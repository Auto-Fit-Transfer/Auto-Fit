"""Validation and import-record helpers for labeled menu image datasets."""

from __future__ import annotations

import hashlib
import json
import re
import struct
from pathlib import Path, PurePosixPath
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


IMAGE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
WEBP_SIGNATURE = b"WEBP"
MAX_IMAGE_BYTES = {"png": 10 * 1024 * 1024, "webp": 500 * 1024}
SUPPORTED_IMAGE_SPECS = {("png", 1024, 1024), ("webp", 512, 512)}


class DatasetFood(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    food_name: str = Field(min_length=1, max_length=100)
    quantity: float | None = Field(default=None, gt=0, le=100000)
    unit: str | None = Field(default=None, min_length=1, max_length=20)


class MenuImageLabel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    image_id: str = Field(min_length=1, max_length=100)
    image_path: str = Field(min_length=1, max_length=500)
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    menu_name: str = Field(min_length=1, max_length=500)
    foods: list[DatasetFood] = Field(min_length=1, max_length=20)
    food_tags: list[str] = Field(min_length=1, max_length=50)
    width: int = Field(gt=0, le=4096)
    height: int = Field(gt=0, le=4096)
    format: Literal["png", "webp"]
    quality_status: Literal["approved", "rejected", "needs_review"]
    labeler_note: str | None = Field(default=None, max_length=1000)
    model_name: str | None = Field(default=None, max_length=200)
    model_version: str | None = Field(default=None, max_length=100)
    seed: int | None = None
    prompt: str | None = Field(default=None, max_length=10000)

    @field_validator("image_id")
    @classmethod
    def validate_image_id(cls, value: str) -> str:
        if not IMAGE_ID_PATTERN.fullmatch(value):
            raise ValueError("image_id may contain only letters, numbers, '_' and '-'")
        return value

    @field_validator("image_path")
    @classmethod
    def validate_image_path(cls, value: str) -> str:
        path = PurePosixPath(value)
        if path.is_absolute() or ".." in path.parts or path.suffix.casefold() not in {".png", ".webp"}:
            raise ValueError("image_path must be a relative PNG or WebP path without '..'")
        return path.as_posix()

    @field_validator("food_tags")
    @classmethod
    def normalize_food_tags(cls, values: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(tag.strip() for tag in values if tag.strip()))
        if not normalized:
            raise ValueError("food_tags must contain at least one non-empty tag")
        if any(len(tag) > 100 for tag in normalized):
            raise ValueError("food_tags entries must be at most 100 characters")
        return normalized

    @model_validator(mode="after")
    def require_matching_file_stem(self) -> "MenuImageLabel":
        if PurePosixPath(self.image_path).stem != self.image_id:
            raise ValueError("image_path filename must match image_id")
        suffix_format = PurePosixPath(self.image_path).suffix.lstrip(".").casefold()
        if suffix_format != self.format:
            raise ValueError("image_path extension must match format")
        if (self.format, self.width, self.height) not in SUPPORTED_IMAGE_SPECS:
            raise ValueError(
                "supported image specs are 1024x1024 PNG or 512x512 WebP"
            )
        return self


def read_image_bytes_dimensions(content: bytes, image_format: str) -> tuple[int, int]:
    size = len(content)
    maximum = MAX_IMAGE_BYTES[image_format]
    if size <= 0 or size > maximum:
        raise ValueError(
            f"{image_format.upper()} file size must be between 1 and {maximum} bytes"
        )
    header = content[:30]
    if image_format == "png":
        if len(header) < 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
            raise ValueError("image file is not a valid PNG header")
        return struct.unpack(">II", header[16:24])
    if len(header) < 30 or header[:4] != b"RIFF" or header[8:12] != WEBP_SIGNATURE:
        raise ValueError("image file is not a valid WebP header")
    chunk = header[12:16]
    if chunk == b"VP8X":
        return (
            int.from_bytes(header[24:27], "little") + 1,
            int.from_bytes(header[27:30], "little") + 1,
        )
    if chunk == b"VP8 " and header[23:26] == b"\x9d\x01\x2a":
        return (
            int.from_bytes(header[26:28], "little") & 0x3FFF,
            int.from_bytes(header[28:30], "little") & 0x3FFF,
        )
    if chunk == b"VP8L" and header[20:21] == b"\x2f":
        bits = int.from_bytes(header[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    raise ValueError("image file uses an unsupported WebP header")


def read_image_dimensions(path: Path, image_format: str) -> tuple[int, int]:
    return read_image_bytes_dimensions(path.read_bytes(), image_format)


def load_menu_image_labels(
    manifest_path: Path,
    dataset_root: Path | None = None,
) -> list[tuple[MenuImageLabel, Path]]:
    root = (dataset_root or manifest_path.parent).resolve()
    labels: list[tuple[MenuImageLabel, Path]] = []
    seen_ids: set[str] = set()
    seen_paths: set[Path] = set()
    with manifest_path.open(encoding="utf-8") as manifest:
        for line_number, raw_line in enumerate(manifest, start=1):
            if not raw_line.strip():
                continue
            try:
                raw = json.loads(raw_line)
                label = MenuImageLabel.model_validate(raw)
            except (json.JSONDecodeError, ValueError) as exc:
                raise ValueError(f"invalid label at line {line_number}: {exc}") from exc
            image_path = (root / label.image_path).resolve()
            if not image_path.is_relative_to(root):
                raise ValueError(f"image path escapes dataset root at line {line_number}")
            if label.image_id in seen_ids or image_path in seen_paths:
                raise ValueError(f"duplicate image id or path at line {line_number}")
            if not image_path.is_file():
                raise ValueError(f"image file is missing at line {line_number}")
            if read_image_dimensions(image_path, label.format) != (label.width, label.height):
                raise ValueError(f"image dimensions do not match label at line {line_number}")
            seen_ids.add(label.image_id)
            seen_paths.add(image_path)
            labels.append((label, image_path))
    if not labels:
        raise ValueError("labels.jsonl must contain at least one label")
    return labels


def build_menu_image_record(
    label: MenuImageLabel,
    image_bytes: bytes,
    storage_path: str,
) -> dict[str, Any]:
    ingredient_tags = [
        "재료:" + "".join(
            character
            for character in food.food_name.casefold()
            if character.isalnum()
        )
        for food in label.foods
    ]
    metadata = {
        "dataset_image_id": label.image_id,
        "quality_status": label.quality_status,
        "foods": [food.model_dump(mode="json") for food in label.foods],
        "sha256": hashlib.sha256(image_bytes).hexdigest(),
        "width": label.width,
        "height": label.height,
        "format": label.format,
        "model_version": label.model_version,
        "seed": label.seed,
        "labeler_note": label.labeler_note,
    }
    return {
        "image_key": f"dataset:{label.image_id}",
        "menu_name": label.menu_name,
        "food_tags": list(dict.fromkeys([*label.food_tags, *ingredient_tags])),
        "meal_type": label.meal_type,
        "storage_path": storage_path,
        "source_type": "generated",
        "generation_status": "completed",
        "model_name": label.model_name,
        "generation_prompt": label.prompt,
        "last_error": None,
        "metadata": metadata,
    }
