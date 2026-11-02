from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.schemas.recommendation import (
    ExerciseRecommendationRequest,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXERCISE_CATALOG_PATH = (
    PROJECT_ROOT
    / "data"
    / "exercise_assets"
    / "exercise_asset_catalog.csv"
)

CATALOG_CANDIDATE_LIMIT = 48

REQUIRED_COLUMNS = {
    "asset_id",
    "exercise_key",
    "gender",
    "exercise_mode",
    "recommended_training_type",
    "focus_area",
    "focus_area_detail",
    "gym_training_style",
    "home_equipment",
    "equipment_detail",
    "quiet_eligible",
    "sweaty_eligible",
    "exercise_name_en",
    "relative_path",
    "is_primary_asset",
    "mapping_status",
}


@dataclass(frozen=True, slots=True)
class ExerciseAnimationAssetRecord:
    asset_id: str
    gender: str
    exercise_mode: str
    animation_path: str

    def to_prompt_dict(self) -> dict[str, str]:
        return {
            "asset_id": self.asset_id,
            "gender": self.gender,
            "exercise_mode": self.exercise_mode,
            "animation_path": self.animation_path,
        }


@dataclass(frozen=True, slots=True)
class ExerciseCatalogRow:
    asset: ExerciseAnimationAssetRecord
    exercise_key: str
    exercise_name_en: str
    recommended_training_type: str
    focus_area: str
    focus_area_detail: str
    gym_training_style: str
    home_equipment: str
    equipment_detail: tuple[str, ...]
    quiet_eligible: bool | None
    sweaty_eligible: bool | None


@dataclass(frozen=True, slots=True)
class ExerciseCatalogCandidate:
    exercise_key: str
    exercise_name_en: str
    recommended_training_types: tuple[str, ...]
    focus_areas: tuple[str, ...]
    focus_area_details: tuple[str, ...]
    equipment_details: tuple[str, ...]
    assets: tuple[ExerciseAnimationAssetRecord, ...]

    def to_prompt_dict(self) -> dict:
        return {
            "exercise_key": self.exercise_key,
            "exercise_name_en": self.exercise_name_en,
            "recommended_training_types": list(
                self.recommended_training_types
            ),
            "focus_areas": list(self.focus_areas),
            "focus_area_details": list(
                self.focus_area_details
            ),
            "equipment_details": list(
                self.equipment_details
            ),
        }


def _parse_optional_bool(value: str) -> bool | None:
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise RuntimeError(
        "Exercise catalog contains an invalid boolean value."
    )


@lru_cache(maxsize=1)
def get_exercise_catalog_version() -> str:
    if not EXERCISE_CATALOG_PATH.is_file():
        raise RuntimeError(
            "Exercise catalog CSV is not available."
        )

    # Git checkout의 줄바꿈 정책이 다른 Windows/Linux 배포에서도
    # Backend와 같은 버전을 계산할 수 있도록 LF로 정규화한다.
    source = EXERCISE_CATALOG_PATH.read_bytes()
    normalized = source.replace(b"\r\n", b"\n").replace(
        b"\r",
        b"\n",
    )
    digest = hashlib.sha256(normalized)

    return f"sha256:{digest.hexdigest()}"


@lru_cache(maxsize=1)
def load_exercise_catalog() -> tuple[ExerciseCatalogRow, ...]:
    if not EXERCISE_CATALOG_PATH.is_file():
        raise RuntimeError(
            "Exercise catalog CSV is not available."
        )

    rows: list[ExerciseCatalogRow] = []
    asset_ids: set[str] = set()

    with EXERCISE_CATALOG_PATH.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)
        fieldnames = set(reader.fieldnames or [])
        missing_columns = REQUIRED_COLUMNS - fieldnames
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise RuntimeError(
                "Exercise catalog is missing required columns: "
                f"{missing}"
            )

        for source in reader:
            if source["mapping_status"] != "auto_mapped":
                continue
            if source["is_primary_asset"].lower() != "true":
                continue

            asset_id = source["asset_id"].strip()
            exercise_key = source["exercise_key"].strip()
            relative_path = source["relative_path"].strip()

            if not asset_id or not exercise_key or not relative_path:
                raise RuntimeError(
                    "Exercise catalog contains an incomplete asset row."
                )
            if asset_id in asset_ids:
                raise RuntimeError(
                    "Exercise catalog contains duplicate asset_id values."
                )
            asset_ids.add(asset_id)

            rows.append(
                ExerciseCatalogRow(
                    asset=ExerciseAnimationAssetRecord(
                        asset_id=asset_id,
                        gender=source["gender"].strip(),
                        exercise_mode=(
                            source["exercise_mode"].strip()
                        ),
                        animation_path=relative_path,
                    ),
                    exercise_key=exercise_key,
                    exercise_name_en=(
                        source["exercise_name_en"].strip()
                    ),
                    recommended_training_type=(
                        source[
                            "recommended_training_type"
                        ].strip()
                    ),
                    focus_area=source["focus_area"].strip(),
                    focus_area_detail=(
                        source["focus_area_detail"].strip()
                    ),
                    gym_training_style=(
                        source["gym_training_style"].strip()
                    ),
                    home_equipment=(
                        source["home_equipment"].strip()
                    ),
                    equipment_detail=tuple(
                        item
                        for item in source[
                            "equipment_detail"
                        ].split(";")
                        if item
                    ),
                    quiet_eligible=_parse_optional_bool(
                        source["quiet_eligible"]
                    ),
                    sweaty_eligible=_parse_optional_bool(
                        source["sweaty_eligible"]
                    ),
                )
            )

    if not rows:
        raise RuntimeError(
            "Exercise catalog does not contain usable assets."
        )

    return tuple(rows)


def _inferred_mode(
    request: ExerciseRecommendationRequest,
) -> str | None:
    if request.exercise_mode is not None:
        return request.exercise_mode

    location = (request.location or "").strip().lower()
    if location in {"gym", "fitness_center", "헬스장"}:
        return "gym"
    if location in {"home", "indoor", "집", "실내"}:
        return "home_training"
    return None


def _matches_request(
    row: ExerciseCatalogRow,
    request: ExerciseRecommendationRequest,
) -> bool:
    mode = _inferred_mode(request)
    if mode is not None and row.asset.exercise_mode != mode:
        return False

    if (
        request.preferred_training_types
        and row.recommended_training_type
        not in request.preferred_training_types
    ):
        return False

    if mode == "gym" and request.gym_preferences is not None:
        preferences = request.gym_preferences
        if (
            preferences.training_style
            in {"machine", "free_weight"}
            and row.gym_training_style
            != preferences.training_style
        ):
            return False
        if (
            preferences.focus_area
            in {"upper_body", "lower_body", "full_body", "other"}
            and row.focus_area != preferences.focus_area
        ):
            return False

    if (
        mode == "home_training"
        and request.home_training_preferences is not None
    ):
        preferences = request.home_training_preferences
        if row.home_equipment != preferences.equipment:
            return False
        if (
            preferences.workout_style == "quiet"
            and row.quiet_eligible is not True
        ):
            return False
        if (
            preferences.workout_style == "sweaty"
            and row.sweaty_eligible is not True
        ):
            return False

    return True


def _request_signature(
    request: ExerciseRecommendationRequest,
) -> str:
    return request.model_dump_json(
        exclude_none=True,
        exclude_unset=False,
    )


def select_exercise_candidates(
    request: ExerciseRecommendationRequest,
    *,
    limit: int = CATALOG_CANDIDATE_LIMIT,
) -> tuple[ExerciseCatalogCandidate, ...]:
    matched_rows = [
        row
        for row in load_exercise_catalog()
        if _matches_request(row, request)
    ]

    if not matched_rows:
        raise RuntimeError(
            "No exercise catalog item matches the requested conditions."
        )

    grouped: dict[str, list[ExerciseCatalogRow]] = {}
    for row in matched_rows:
        grouped.setdefault(row.exercise_key, []).append(row)

    candidates: list[ExerciseCatalogCandidate] = []
    for exercise_key, group in grouped.items():
        first = group[0]
        assets = tuple(
            sorted(
                (row.asset for row in group),
                key=lambda asset: (
                    asset.gender,
                    asset.asset_id,
                ),
            )
        )
        candidates.append(
            ExerciseCatalogCandidate(
                exercise_key=exercise_key,
                exercise_name_en=first.exercise_name_en,
                recommended_training_types=tuple(
                    sorted(
                        {
                            row.recommended_training_type
                            for row in group
                        }
                    )
                ),
                focus_areas=tuple(
                    sorted({row.focus_area for row in group})
                ),
                focus_area_details=tuple(
                    sorted(
                        {
                            row.focus_area_detail
                            for row in group
                        }
                    )
                ),
                equipment_details=tuple(
                    sorted(
                        {
                            detail
                            for row in group
                            for detail in row.equipment_detail
                        }
                    )
                ),
                assets=assets,
            )
        )

    signature = _request_signature(request)
    candidates.sort(
        key=lambda candidate: hashlib.sha256(
            (
                signature
                + "|"
                + candidate.exercise_key
            ).encode("utf-8")
        ).hexdigest()
    )

    return tuple(candidates[:limit])


def candidates_by_key(
    candidates: tuple[ExerciseCatalogCandidate, ...],
) -> dict[str, ExerciseCatalogCandidate]:
    return {
        candidate.exercise_key: candidate
        for candidate in candidates
    }
