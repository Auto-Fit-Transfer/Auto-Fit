"""Versioned voice guides reviewed against the purchased exercise catalog.

This module selects text only. It never falls back to AI-generated instructions
for a blocked or mismatched asset, and it does not generate or cache audio.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from backend.app.exercise_ai import CATALOG_PATH, gif_path_for_exercise, load_catalog


DATA_DIR = Path(__file__).resolve().parents[1] / "data/exercise_assets"
GUIDES_PATH = DATA_DIR / "exercise_guide_overrides.json"
EXCLUSIONS_PATH = DATA_DIR / "exercise_guide_excluded_keys.json"
_HEX_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_KEY = re.compile(r"ex_[0-9a-f]{8,64}\Z")
_SENTENCES = ("method", "caution", "focus")


class ExerciseGuideError(ValueError):
    """The reviewed guide source cannot be matched to this catalog."""


def _guide(value: Any) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) != set(_SENTENCES):
        raise ExerciseGuideError("Voice guide must have exactly three lines")
    if any(not isinstance(value[key], str) or not value[key].strip() for key in _SENTENCES):
        raise ExerciseGuideError("Voice guide has an empty line")
    return {key: value[key].strip() for key in _SENTENCES}


@lru_cache(maxsize=1)
def _primary_catalog_assets() -> tuple[dict[str, dict[str, str]], dict[tuple[str, str], str]]:
    """Index the same primary catalog assets used by GIF URL selection."""
    by_id: dict[str, dict[str, str]] = {}
    by_key_path: dict[tuple[str, str], str] = {}
    with CATALOG_PATH.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["mapping_status"] != "auto_mapped" or row["is_primary_asset"].lower() != "true":
                continue
            asset_id = row["asset_id"]
            key_path = (row["exercise_key"], row["relative_path"])
            if (not asset_id or not all(key_path) or asset_id in by_id
                    or key_path in by_key_path):
                raise ExerciseGuideError("Primary exercise assets are ambiguous")
            by_id[asset_id] = row
            by_key_path[key_path] = asset_id
    return by_id, by_key_path


@lru_cache(maxsize=1)
def load_exercise_guides() -> tuple[str, dict[str, dict[str, Any]], frozenset[str]]:
    """Validate v4 data, including every evidence asset, before serving a guide."""
    try:
        raw = GUIDES_PATH.read_bytes()
        source = json.loads(raw)
        exclusions = json.loads(EXCLUSIONS_PATH.read_text(encoding="utf-8"))
        catalog_version, catalog = load_catalog()
        if (source["schema_version"] != 1 or source["source_catalog_version"] != catalog_version
                or exclusions["schema_version"] != 1):
            raise ExerciseGuideError("Voice guide catalog version does not match")
        excluded = exclusions["excluded_keys"]
        if (not isinstance(excluded, list) or len(excluded) != 26
                or len(set(excluded)) != len(excluded)
                or any(not isinstance(key, str) or not _KEY.fullmatch(key) for key in excluded)):
            raise ExerciseGuideError("Voice guide exclusions are invalid")

        if any(key not in catalog for key in excluded):
            raise ExerciseGuideError("Voice guide exclusion has no catalog key")
        assets, _ = _primary_catalog_assets()
        entries: dict[str, dict[str, Any]] = {}
        statuses: dict[str, int] = {"visual_reviewed": 0, "asset_specific_guides": 0,
                                    "blocked_audio": 0}
        if not isinstance(source["entries"], list):
            raise ExerciseGuideError("Voice guide entries are invalid")
        for item in source["entries"]:
            key = item["exercise_key"]
            status = item["guide_status"]
            if (not isinstance(key, str) or not _KEY.fullmatch(key) or key not in catalog
                    or key in entries or key in excluded or status not in statuses):
                raise ExerciseGuideError("Voice guide key or status is invalid")
            evidence_ids: set[str] = set()
            evidence_paths: dict[str, str] = {}
            if not isinstance(item["evidence"], list):
                raise ExerciseGuideError("Voice guide evidence is invalid")
            for evidence in item["evidence"]:
                asset_id = evidence["asset_id"]
                row = assets.get(asset_id)
                frame_count = evidence["frame_count"]
                frames = evidence["reviewed_frame_indices"]
                if (asset_id in evidence_ids or evidence["relative_path"] in evidence_paths
                        or row is None or row["exercise_key"] != key
                        or row["relative_path"] != evidence["relative_path"]
                        or not _HEX_SHA256.fullmatch(evidence["sha256"])
                        or not isinstance(frame_count, int) or frame_count < 1
                        or not isinstance(frames, list) or not frames
                        or any(not isinstance(frame, int) or not 0 <= frame < frame_count
                               for frame in frames)):
                    raise ExerciseGuideError("Voice guide evidence does not match the catalog")
                evidence_ids.add(asset_id)
                evidence_paths[evidence["relative_path"]] = asset_id
            if not evidence_ids:
                raise ExerciseGuideError("Voice guide is missing evidence")
            selected: dict[str, Any] = {"status": status, "evidence_ids": frozenset(evidence_ids),
                                        "evidence_paths": evidence_paths}
            if status == "visual_reviewed":
                if item["asset_guides"] or not item["guide"]:
                    raise ExerciseGuideError("Common voice guide has the wrong shape")
                selected["guide"] = _guide(item["guide"])
            elif status == "asset_specific_guides":
                variants = item["asset_guides"]
                if item["guide"] is not None or len(variants) < 2:
                    raise ExerciseGuideError("Asset-specific guide has the wrong shape")
                selected["asset_guides"] = {variant["asset_id"]: _guide(variant["guide"])
                                            for variant in variants}
                if (len(selected["asset_guides"]) != len(variants)
                        or set(selected["asset_guides"]) != evidence_ids):
                    raise ExerciseGuideError("Asset-specific guide lacks a matched asset")
            elif item["guide"] is not None or item["asset_guides"]:
                raise ExerciseGuideError("Blocked guide contains spoken text")
            entries[key] = selected
            statuses[status] += 1
        if len(entries) != 3080 or statuses != source["counts"]:
            raise ExerciseGuideError("Voice guide counts do not match the reviewed source")
        return "sha256:" + hashlib.sha256(raw).hexdigest(), entries, frozenset(excluded)
    except ExerciseGuideError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError,
            IndexError, AttributeError, ValueError) as exc:
        raise ExerciseGuideError("Voice guide source is unavailable") from exc


@lru_cache(maxsize=1)
def voice_guide_source_available() -> bool:
    """Cache validation failure until restart, so bad data cannot cause parse storms."""
    try:
        load_exercise_guides()
    except ExerciseGuideError:
        return False
    return True


def select_exercise_guide(exercise_key: str | None, asset_id: str | None) -> dict[str, Any]:
    """Return a guide only for the exact GIF asset; preserve untouched legacy keys."""
    version, entries, excluded = load_exercise_guides()
    if not exercise_key or exercise_key not in load_catalog()[1]:
        return {"asset_id": None, "status": "unavailable", "guide": None, "version": version}
    if exercise_key in excluded:
        return {"asset_id": asset_id, "status": "blocked_audio", "guide": None, "version": version}
    entry = entries.get(exercise_key or "")
    if entry is None:
        return {"asset_id": asset_id, "status": "legacy", "guide": None, "version": version}
    if entry["status"] == "blocked_audio":
        return {"asset_id": asset_id, "status": "blocked_audio", "guide": None, "version": version}
    if asset_id not in entry["evidence_ids"]:
        return {"asset_id": asset_id, "status": "unavailable", "guide": None, "version": version}
    guide = (entry["guide"] if entry["status"] == "visual_reviewed"
             else entry["asset_guides"].get(asset_id))
    return {"asset_id": asset_id, "status": "ready" if guide else "unavailable",
            "guide": dict(guide) if guide else None, "version": version}


def select_exercise_guide_for_gif(exercise_key: str | None, location: str,
                                  gender: str) -> dict[str, Any]:
    """Use the same catalog GIF path that the exercise response will display."""
    load_exercise_guides()
    path = gif_path_for_exercise(exercise_key, location, gender) if exercise_key else None
    _, by_key_path = _primary_catalog_assets()
    asset_id = by_key_path.get((exercise_key, path)) if path else None
    return select_exercise_guide(exercise_key, asset_id)
