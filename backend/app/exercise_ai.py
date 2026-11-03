"""Validate and adapt the separate AI server's exercise plan for today's routine."""

from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data/exercise_assets/exercise_asset_catalog.csv"


class ExerciseAIError(ValueError):
    """The AI response cannot safely become a stored exercise routine."""


@dataclass(frozen=True)
class CatalogExercise:
    name_en: str
    training_type: str
    training_type_by_mode: tuple[tuple[str, str], ...]
    modes: frozenset[str]
    home_equipment: frozenset[str]
    gym_styles: frozenset[str]


@lru_cache(maxsize=1)
def load_catalog() -> tuple[str, dict[str, CatalogExercise]]:
    try:
        raw = CATALOG_PATH.read_bytes()
        normalized = raw.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        version = "sha256:" + hashlib.sha256(normalized).hexdigest()
        groups: dict[str, dict[str, Any]] = {}
        with CATALOG_PATH.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                if row["mapping_status"] != "auto_mapped" or row["is_primary_asset"].lower() != "true":
                    continue
                key = row["exercise_key"].strip()
                name = row["exercise_name_en"].strip()
                if not key or not name:
                    raise ExerciseAIError("Exercise catalog is invalid")
                training_type = row["recommended_training_type"].strip()
                group = groups.setdefault(key, {"name": name, "training_type": training_type,
                                                "training_type_by_mode": {}, "modes": set(),
                                                "equipment": set(), "styles": set()})
                mode = row["exercise_mode"].strip()
                group["modes"].add(mode)
                group["training_type_by_mode"].setdefault(mode, training_type)
                if mode == "home_training":
                    group["equipment"].add(row["home_equipment"].strip())
                elif mode == "gym":
                    group["styles"].add(row["gym_training_style"].strip())
        if not groups:
            raise ExerciseAIError("Exercise catalog is unavailable")
        return version, {
            key: CatalogExercise(value["name"], value["training_type"],
                                 tuple(value["training_type_by_mode"].items()), frozenset(value["modes"]),
                                 frozenset(value["equipment"]), frozenset(value["styles"]))
            for key, value in groups.items()
        }
    except (OSError, KeyError, UnicodeError) as exc:
        raise ExerciseAIError("Exercise catalog is unavailable") from exc


class AIExercise(BaseModel):
    exercise_key: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    catalog_name_en: str = Field(min_length=1, max_length=300)
    exercise_modes: list[Literal["gym", "home_training"]] = Field(min_length=1, max_length=2)
    duration_minutes: int = Field(ge=1, le=300)
    intensity: str | None = None
    instructions: list[str] = Field(default_factory=list, max_length=3)


class AISession(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    exercises: list[AIExercise] = Field(min_length=1, max_length=4)


class AIResult(BaseModel):
    catalog_version: str
    summary: str = Field(min_length=1, max_length=1000)
    intensity: str
    sessions: list[AISession] = Field(min_length=1, max_length=3)
    cautions: list[str] = Field(default_factory=list, max_length=5)


class AIEnvelope(BaseModel):
    ok: Literal[True]
    generator: Literal["auto-fit-ai"]
    result: AIResult


def build_request(preferences: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Use only values the current screen actually collects; legacy AI inputs remain valid."""
    condition = str(context.get("condition_level") or "").strip().casefold()
    daily_condition = (
        "good" if condition in {"좋음", "good"}
        else "normal" if condition in {"보통", "normal"}
        else "tired" if condition in {"피곤해요", "안 좋아요", "tired", "bad"}
        else None
    )
    areas = context.get("discomfort_areas") or []
    request = {
        "metric_statuses": {},
        "goal_type": preferences["goal_type"],
        "experience_level": preferences["experience_level"],
        "available_minutes": context["available_minutes"],
        "location": context.get("location"),
        "preferred_training_types": [],
        "has_discomfort": bool(areas),
        "discomfort_areas": areas,
    }
    if daily_condition:
        request["daily_condition"] = daily_condition
    return request


def _intensity(value: str | None) -> str:
    normalized = (value or "").strip().casefold()
    if normalized in {"low", "light", "easy", "낮음", "저강도"}:
        return "low"
    if normalized in {"moderate", "normal", "medium", "보통", "중강도"}:
        return "moderate"
    if normalized in {"high", "hard", "높음", "고강도"}:
        return "high"
    raise ExerciseAIError("Exercise AI returned an invalid intensity")


EXERCISE_TYPE_NAMES = {
    "weight_training": "웨이트 트레이닝",
    "home_training": "홈트레이닝",
    "bodyweight": "맨몸 운동",
    "cardio": "유산소 운동",
    "stretching": "스트레칭",
    "functional_training": "기능성 운동",
}


def _check_equipment(item: CatalogExercise, context: dict[str, Any]) -> None:
    location = context.get("location")
    equipment = set(context.get("available_equipment") or [])
    if location == "gym":
        if "gym" not in item.modes:
            raise ExerciseAIError("Exercise AI returned an unavailable exercise mode")
        if item.gym_styles and item.gym_styles.isdisjoint({"", "any"}):
            allowed = ({"machine"} if "machine" in equipment else set()) | (
                {"free_weight"} if "dumbbell" in equipment else set()
            )
            if item.gym_styles.isdisjoint(allowed):
                raise ExerciseAIError("Exercise AI returned unavailable equipment")
    elif location in {"home", "outdoor"}:
        if "home_training" not in item.modes:
            raise ExerciseAIError("Exercise AI returned an unavailable exercise mode")
        allowed = {"", "none"} | ({"band"} if "band" in equipment else set()) | (
            {"dumbbell"} if "dumbbell" in equipment else set()
        ) | ({"other"} if "other" in equipment else set())
        if item.home_equipment.isdisjoint(allowed):
            raise ExerciseAIError("Exercise AI returned unavailable equipment")


def build_plan(response: dict[str, Any], preferences: dict[str, Any],
               context: dict[str, Any], recommendation_date: str) -> dict[str, Any]:
    try:
        parsed = AIEnvelope.model_validate(response)
    except ValidationError as exc:
        raise ExerciseAIError("Exercise AI response has an invalid structure") from exc

    catalog_version, catalog = load_catalog()
    if parsed.result.catalog_version != catalog_version:
        raise ExerciseAIError("Exercise AI catalog version does not match")

    # The app records one workout at a time. The first AI session is today's workout.
    session = parsed.result.sessions[0]
    if not session.name.strip() or not parsed.result.summary.strip():
        raise ExerciseAIError("Exercise AI response is missing text")
    seen: set[str] = set()
    items: list[dict[str, Any]] = []
    for exercise in session.exercises:
        record = catalog.get(exercise.exercise_key)
        location = context.get("location")
        expected_modes = (
            record.modes.intersection({"gym"}) if record and location == "gym"
            else record.modes.intersection({"home_training"}) if record and location == "home"
            else record.modes if record else frozenset()
        )
        if (record is None or record.name_en != exercise.catalog_name_en
                or set(exercise.exercise_modes) != expected_modes
                or exercise.exercise_key in seen):
            raise ExerciseAIError("Exercise AI returned an invalid catalog exercise")
        if (not exercise.name.strip()
                or any(not part.strip() or len(part) > 300 for part in exercise.instructions)):
            raise ExerciseAIError("Exercise AI returned invalid instructions")
        _check_equipment(record, context)
        training_type = dict(record.training_type_by_mode).get(
            "gym" if location == "gym" else "home_training" if location == "home" else "",
            record.training_type,
        )
        type_name = EXERCISE_TYPE_NAMES.get(training_type)
        if type_name is None:
            raise ExerciseAIError("Exercise AI returned an unknown training type")
        seen.add(exercise.exercise_key)
        items.append({
            "exercise_key": exercise.exercise_key,
            "exercise_type_name": type_name,
            "exercise_name": exercise.name.strip(),
            "duration_minutes": exercise.duration_minutes,
            "sets": None,
            "repetitions": None,
            "calories_burned": None,
            "intensity": _intensity(exercise.intensity or parsed.result.intensity),
            "instruction": " ".join(part.strip() for part in exercise.instructions if part.strip()),
            "execution_type": "time_based",
            "target_duration_seconds": exercise.duration_minutes * 60,
            "target_weight_kg": None,
            "rest_seconds": None,
        })

    total_minutes = sum(item["duration_minutes"] for item in items)
    if total_minutes > int(context["available_minutes"]):
        raise ExerciseAIError("Exercise AI exceeded the available time")
    return {
        "recommendation": {
            "generator": "auto-fit-ai",
            "catalog_version": catalog_version,
            "recommendation_date": recommendation_date,
            "goal": preferences["goal_type"],
            "total_duration_minutes": total_minutes,
            "intensity": _intensity(parsed.result.intensity),
            "recommendation_summary": session.name.strip(),
            "ai_reason": parsed.result.summary.strip(),
        },
        "items": items,
    }
