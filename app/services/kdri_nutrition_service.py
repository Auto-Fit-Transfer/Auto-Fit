"""2025 KDRI 요약 데이터 기반의 결정론적 식단 목표 계산.

KDRI 요약표는 연령·성별 집단의 에너지 필요추정량과
다량영양소 적정 범위를 제공한다. 개인의 키·몸무게·활동량을
반영한 처방 공식은 아니므로, 이 모듈은 해당 값을 추정하지 않는다.

후보 정렬에 필요한 단일 목표값은 KDRI 범위 안에서 정의한
Auto-Fit MVP 정책을 사용한다. 이 정책값은 공식 KDRI 수치와
명확히 구분할 수 있도록 버전과 함께 반환한다.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal


KDRI_REFERENCE_STANDARD = "KDRI_2025"
AUTOFIT_KDRI_TARGET_POLICY_VERSION = "autofit_kdri_balanced_v1"

# 성인 KDRI 에너지적정비율 범위 안에서 선택한 Auto-Fit MVP 기준.
AUTOFIT_MACRO_ENERGY_RATIOS = {
    "carbohydrate": 0.55,
    "protein": 0.20,
    "fat": 0.25,
}

# 아침/점심/저녁 각 30%, 간식 10%로 하루 목표를 분배한다.
AUTOFIT_MAIN_MEAL_DAILY_SHARE = 0.30
AUTOFIT_SNACK_DAILY_SHARE = 0.10

_KDRI_DATA_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "nutrition_reference"
    / "kdri_2025_summary_ko.json"
)


@lru_cache(maxsize=1)
def load_kdri_2025_reference() -> dict[str, Any]:
    """저장소의 검증된 KDRI JSON을 프로세스당 한 번만 읽는다."""

    try:
        payload = json.loads(
            _KDRI_DATA_PATH.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            "KDRI 2025 영양 기준 데이터를 불러오지 못했습니다."
        ) from exc

    if not isinstance(payload, dict):
        raise RuntimeError("KDRI 2025 영양 기준 형식이 올바르지 않습니다.")

    if not isinstance(payload.get("population_groups"), dict):
        raise RuntimeError("KDRI 2025 인구집단 정보가 없습니다.")

    if not isinstance(payload.get("recommendations"), dict):
        raise RuntimeError("KDRI 2025 영양 권고 정보가 없습니다.")

    return payload


def resolve_kdri_adult_group_id(
    *,
    age_years: int,
    sex: Literal["male", "female"] | str,
) -> str:
    """성인 나이와 성별에 맞는 KDRI 집단 ID를 반환한다."""

    try:
        normalized_age = int(age_years)
    except (TypeError, ValueError) as exc:
        raise ValueError("age_years must be an integer.") from exc

    normalized_sex = str(sex).strip().lower()
    if normalized_sex not in {"male", "female"}:
        raise ValueError("sex must be male or female.")

    # Auto-Fit MVP는 성인용 식단 서비스다. 미성년자 식단은 별도
    # 보호자 동의와 성장기 정책 없이 성인 정책으로 계산하지 않는다.
    if normalized_age < 19 or normalized_age > 120:
        raise ValueError("KDRI diet target supports ages 19 through 120.")

    groups = load_kdri_2025_reference()["population_groups"]

    for group_id, raw_group in groups.items():
        if not isinstance(raw_group, dict):
            continue
        if raw_group.get("life_stage") != "adult":
            continue
        if raw_group.get("sex") != normalized_sex:
            continue

        raw_age = raw_group.get("age")
        if not isinstance(raw_age, dict) or raw_age.get("unit") != "year":
            continue

        minimum = raw_age.get("min_inclusive")
        maximum = raw_age.get("max_inclusive")
        if minimum is None:
            continue
        if normalized_age < int(minimum):
            continue
        if maximum is not None and normalized_age > int(maximum):
            continue

        return str(group_id)

    raise RuntimeError("나이와 성별에 맞는 KDRI 성인 기준을 찾지 못했습니다.")


def _round_nutrition_target(
    daily_target: dict[str, float],
    *,
    share: float,
) -> dict[str, float]:
    return {
        key: round(float(value) * share, 1)
        for key, value in daily_target.items()
    }


@lru_cache(maxsize=32)
def calculate_kdri_diet_targets(
    *,
    age_years: int,
    sex: Literal["male", "female"] | str,
) -> dict[str, Any]:
    """KDRI 집단 기준과 Auto-Fit 정책으로 하루·끼니 목표를 만든다."""

    group_id = resolve_kdri_adult_group_id(
        age_years=age_years,
        sex=sex,
    )
    payload = load_kdri_2025_reference()
    recommendation = payload["recommendations"].get(group_id)

    if not isinstance(recommendation, dict):
        raise RuntimeError("선택된 KDRI 집단의 영양 권고값이 없습니다.")

    raw_energy = recommendation.get("energy")
    if not isinstance(raw_energy, dict):
        raise RuntimeError("선택된 KDRI 집단의 에너지 기준이 없습니다.")

    try:
        energy_kcal = float(raw_energy["eer"])
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("KDRI 에너지 필요추정량이 올바르지 않습니다.") from exc

    if energy_kcal <= 0:
        raise RuntimeError("KDRI 에너지 필요추정량이 올바르지 않습니다.")

    raw_protein = recommendation.get("protein")
    protein_rni = 0.0
    if isinstance(raw_protein, dict) and raw_protein.get("rni") is not None:
        try:
            protein_rni = max(0.0, float(raw_protein["rni"]))
        except (TypeError, ValueError):
            protein_rni = 0.0

    carbohydrate_g = (
        energy_kcal * AUTOFIT_MACRO_ENERGY_RATIOS["carbohydrate"] / 4.0
    )
    protein_g = max(
        energy_kcal * AUTOFIT_MACRO_ENERGY_RATIOS["protein"] / 4.0,
        protein_rni,
    )
    fat_g = energy_kcal * AUTOFIT_MACRO_ENERGY_RATIOS["fat"] / 9.0

    daily_target = {
        "calories_kcal": round(energy_kcal, 1),
        "protein_g": round(protein_g, 1),
        "fat_g": round(fat_g, 1),
        "carbohydrate_g": round(carbohydrate_g, 1),
    }

    return {
        "reference_standard": KDRI_REFERENCE_STANDARD,
        "reference_group_id": group_id,
        "target_source": "kdri",
        "policy_version": AUTOFIT_KDRI_TARGET_POLICY_VERSION,
        "daily_target": daily_target,
        "meal_target": _round_nutrition_target(
            daily_target,
            share=AUTOFIT_MAIN_MEAL_DAILY_SHARE,
        ),
        "snack_target": _round_nutrition_target(
            daily_target,
            share=AUTOFIT_SNACK_DAILY_SHARE,
        ),
        "macro_energy_percent": {
            key: int(round(value * 100))
            for key, value in AUTOFIT_MACRO_ENERGY_RATIOS.items()
        },
        "meal_daily_share_percent": int(
            round(AUTOFIT_MAIN_MEAL_DAILY_SHARE * 100)
        ),
        "snack_daily_share_percent": int(
            round(AUTOFIT_SNACK_DAILY_SHARE * 100)
        ),
        "protein_rni_g": protein_rni or None,
        "height_weight_personalized": False,
    }
