"""Validate and adapt the separate AI server's exercise plan for today's routine."""

from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote, urlsplit

from pydantic import BaseModel, Field, ValidationError


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data/exercise_assets/exercise_asset_catalog.csv"


class ExerciseAIError(ValueError):
    """The AI response cannot safely become a stored exercise routine."""

    def __init__(self, message: str, *, reason_codes: tuple[str, ...] = ("unknown",)):
        super().__init__(message)
        self.reason_codes = reason_codes


def _structure_reasons(error: ValidationError) -> tuple[str, ...]:
    """Classify schema failures without retaining AI values or validation context."""
    reasons: set[str] = set()
    for issue in error.errors(include_input=False, include_context=False, include_url=False):
        path = issue["loc"]
        field = path[-1] if path else None
        if field == "duration_minutes" and "exercises" in path:
            reasons.add("duration_minutes_missing" if issue["type"] == "missing"
                        else "duration_minutes_invalid")
        elif field == "sessions":
            reasons.add("session_count_invalid")
        elif field == "exercises":
            reasons.add("exercise_count_invalid")
        elif field == "intensity":
            reasons.add("intensity_invalid")
        else:
            reasons.add("response_structure_invalid")
    return tuple(sorted(reasons)) or ("response_structure_invalid",)


@dataclass(frozen=True)
class CatalogExercise:
    name_en: str
    training_type: str
    training_type_by_mode: tuple[tuple[str, str], ...]
    modes: frozenset[str]
    home_equipment: frozenset[str]
    gym_styles: frozenset[str]
    asset_paths: tuple[tuple[str, str, str], ...]


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
                    raise ExerciseAIError("Exercise catalog is invalid", reason_codes=("catalog_unavailable",))
                training_type = row["recommended_training_type"].strip()
                group = groups.setdefault(key, {"name": name, "training_type": training_type,
                                                "training_type_by_mode": {}, "modes": set(),
                                                "equipment": set(), "styles": set(), "assets": {}})
                mode = row["exercise_mode"].strip()
                group["modes"].add(mode)
                group["assets"].setdefault((mode, row["gender"].strip()), row["relative_path"].strip())
                group["training_type_by_mode"].setdefault(mode, training_type)
                if mode == "home_training":
                    group["equipment"].add(row["home_equipment"].strip())
                elif mode == "gym":
                    group["styles"].add(row["gym_training_style"].strip())
        if not groups:
            raise ExerciseAIError("Exercise catalog is unavailable", reason_codes=("catalog_unavailable",))
        return version, {
            key: CatalogExercise(value["name"], value["training_type"],
                                 tuple(value["training_type_by_mode"].items()), frozenset(value["modes"]),
                                 frozenset(value["equipment"]), frozenset(value["styles"]),
                                 tuple((mode, gender, path) for (mode, gender), path in value["assets"].items()))
            for key, value in groups.items()
        }
    except (OSError, KeyError, UnicodeError) as exc:
        raise ExerciseAIError("Exercise catalog is unavailable", reason_codes=("catalog_unavailable",)) from exc


def gif_url_for_exercise(exercise_key: str, location: str, gender: str,
                         base_url: str) -> str | None:
    """Resolve only a primary CSV asset under a trusted public HTTPS prefix."""
    try:
        parsed = urlsplit(base_url)
        port = parsed.port
    except ValueError:
        raise ExerciseAIError("Exercise GIF base URL must be HTTPS") from None
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or port == 0 or parsed.query or parsed.fragment
            or any(char.isspace() for char in base_url)):
        raise ExerciseAIError("Exercise GIF base URL must be HTTPS")
    _, catalog = load_catalog()
    record = catalog.get(exercise_key)
    if record is None:
        return None
    mode = "gym" if location == "gym" else "home_training"
    for asset_mode, asset_gender, path in record.asset_paths:
        if asset_mode == mode and asset_gender == gender:
            parts = Path(path).parts
            if not path or path.startswith("/") or any(part in {"..", "."} for part in parts):
                raise ExerciseAIError("Exercise GIF catalog path is invalid")
            return base_url.rstrip("/") + "/" + quote(path, safe="/")
    return None


class AIExercise(BaseModel):
    exercise_key: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    catalog_name_en: str = Field(min_length=1, max_length=300)
    exercise_modes: list[Literal["gym", "home_training"]] = Field(min_length=1, max_length=2)
    duration_minutes: int = Field(ge=1, le=300)
    sets: int | None = Field(default=None, ge=1, le=20)
    repetitions: int | None = Field(default=None, ge=1, le=10000)
    intensity: str | None = None
    instructions: list[str] = Field(default_factory=list, max_length=3)


class AISession(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    focus: str | None = Field(default=None, max_length=200)
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


class AIRequestContext(BaseModel):
    available_minutes: Literal[30, 45, 60, 90, 120]
    location: Literal["gym", "home", "outdoor", "other"]
    available_equipment: list[Literal["machine", "band", "dumbbell", "mat", "other"]] = Field(max_length=5)
    condition_level: Literal["좋음", "보통", "피곤해요", "안 좋아요"]
    discomfort_areas: list[str] = Field(max_length=1)
    condition_note: str | None = Field(max_length=500)


def build_request(preferences: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Forward screen choices and the compatibility fields used by the deployed AI API."""
    request = {
        "available_minutes": context.get("available_minutes"),
        "location": context.get("location"),
        "available_equipment": context.get("available_equipment") or [],
        "condition_level": context.get("condition_level"),
        "discomfort_areas": context.get("discomfort_areas") or [],
        "condition_note": context.get("condition_note") or None,
    }
    try:
        AIRequestContext.model_validate(request)
    except ValidationError as exc:
        raise ExerciseAIError("Stored exercise context does not match the AI contract") from exc
    request.update({
        "metric_statuses": {},
        "preferred_training_types": [],
        "daily_condition": {
            "좋음": "good", "보통": "normal", "피곤해요": "tired", "안 좋아요": "poor",
        }[request["condition_level"]],
        "has_discomfort": bool(request["discomfort_areas"]),
    })
    for field in ("goal_type", "experience_level"):
        if preferences.get(field) is not None:
            request[field] = preferences[field]
    return request


def _intensity(value: str | None) -> str:
    normalized = (value or "").strip().casefold()
    if normalized in {"low", "light", "easy", "낮음", "저강도"}:
        return "low"
    if normalized in {"moderate", "normal", "medium", "보통", "중강도"}:
        return "moderate"
    if normalized in {"high", "hard", "높음", "고강도"}:
        return "high"
    raise ExerciseAIError("Exercise AI returned an invalid intensity", reason_codes=("intensity_invalid",))


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
            raise ExerciseAIError("Exercise AI returned an unavailable exercise mode", reason_codes=("exercise_mode_unavailable",))
        if item.gym_styles and item.gym_styles.isdisjoint({"", "any"}):
            allowed = ({"machine"} if "machine" in equipment else set()) | (
                {"free_weight"} if "dumbbell" in equipment else set()
            )
            if item.gym_styles.isdisjoint(allowed):
                raise ExerciseAIError("Exercise AI returned unavailable equipment", reason_codes=("equipment_unavailable",))
    elif location in {"home", "outdoor", "other"}:
        if "home_training" not in item.modes:
            raise ExerciseAIError("Exercise AI returned an unavailable exercise mode", reason_codes=("exercise_mode_unavailable",))
        allowed = {"", "none"} | ({"band"} if "band" in equipment else set()) | (
            {"dumbbell"} if "dumbbell" in equipment else set()
        ) | ({"other"} if "other" in equipment and location == "home" else set())
        if item.home_equipment.isdisjoint(allowed):
            raise ExerciseAIError("Exercise AI returned unavailable equipment", reason_codes=("equipment_unavailable",))


def build_plan(response: dict[str, Any], preferences: dict[str, Any],
               context: dict[str, Any], recommendation_date: str) -> dict[str, Any]:
    try:
        parsed = AIEnvelope.model_validate(response)
    except ValidationError as exc:
        raise ExerciseAIError("Exercise AI response has an invalid structure",
                              reason_codes=_structure_reasons(exc)) from exc

    catalog_version, catalog = load_catalog()
    if parsed.result.catalog_version != catalog_version:
        raise ExerciseAIError("Exercise AI catalog version does not match", reason_codes=("catalog_version_mismatch",))

    if not parsed.result.summary.strip():
        raise ExerciseAIError("Exercise AI response is missing text", reason_codes=("response_text_missing",))
    start_date = date.fromisoformat(recommendation_date)
    target_minutes = int(context["available_minutes"])
    plan_sessions: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    for session_index, session in enumerate(parsed.result.sessions, start=1):
        if not session.name.strip():
            raise ExerciseAIError("Exercise AI response is missing text", reason_codes=("response_text_missing",))
        seen: set[str] = set()
        session_minutes = 0
        for exercise in session.exercises:
            record = catalog.get(exercise.exercise_key)
            location = context.get("location")
            expected_modes = (
                record.modes.intersection({"gym"}) if record and location == "gym"
                else record.modes.intersection({"home_training"}) if record and location in {"home", "outdoor", "other"}
                else record.modes if record else frozenset()
            )
            if (record is None or record.name_en != exercise.catalog_name_en
                    or set(exercise.exercise_modes) != expected_modes
                    or exercise.exercise_key in seen):
                raise ExerciseAIError("Exercise AI returned an invalid catalog exercise", reason_codes=("catalog_exercise_invalid",))
            if (not exercise.name.strip()
                    or any(not part.strip() or len(part) > 300 for part in exercise.instructions)):
                raise ExerciseAIError("Exercise AI returned invalid instructions", reason_codes=("instructions_invalid",))
            _check_equipment(record, context)
            training_type = dict(record.training_type_by_mode).get(
                "gym" if location == "gym" else "home_training",
                record.training_type,
            )
            type_name = EXERCISE_TYPE_NAMES.get(training_type)
            if type_name is None:
                raise ExerciseAIError("Exercise AI returned an unknown training type", reason_codes=("training_type_unknown",))
            if (exercise.sets is None) != (exercise.repetitions is None):
                raise ExerciseAIError("Exercise AI returned an incomplete prescription", reason_codes=("prescription_incomplete",))
            count_based = exercise.sets is not None
            seen.add(exercise.exercise_key)
            session_minutes += exercise.duration_minutes
            items.append({
                "plan_session_index": session_index,
                "exercise_key": exercise.exercise_key,
                "exercise_type_name": type_name,
                "exercise_name": exercise.name.strip(),
                "duration_minutes": exercise.duration_minutes,
                "sets": exercise.sets,
                "repetitions": exercise.repetitions,
                "calories_burned": None,
                "intensity": _intensity(exercise.intensity or parsed.result.intensity),
                "instruction": " ".join(part.strip() for part in exercise.instructions if part.strip()),
                "execution_type": "count_based" if count_based else "time_based",
                "target_duration_seconds": None if count_based else exercise.duration_minutes * 60,
                "target_weight_kg": None,
                "rest_seconds": None,
            })
        if session_minutes < target_minutes:
            raise ExerciseAIError("Exercise AI session is shorter than the target", reason_codes=("session_duration_short",))
        if session_minutes > target_minutes + 5:
            raise ExerciseAIError("Exercise AI exceeded the available time", reason_codes=("session_duration_exceeded",))
        plan_sessions.append({
            "session_index": session_index,
            "scheduled_date": (start_date + timedelta(days=(session_index - 1) * 7 // len(parsed.result.sessions))).isoformat(),
            "name": session.name.strip(),
            "focus": session.focus.strip() if session.focus else None,
            "duration_minutes": session_minutes,
        })

    return {
        "recommendation": {
            "generator": "auto-fit-ai",
            "catalog_version": catalog_version,
            "recommendation_date": recommendation_date,
            "goal": preferences["goal_type"],
            "total_duration_minutes": plan_sessions[0]["duration_minutes"],
            "intensity": _intensity(parsed.result.intensity),
            "recommendation_summary": plan_sessions[0]["name"],
            "ai_reason": parsed.result.summary.strip(),
            "plan_sessions": plan_sessions,
        },
        "items": items,
    }
