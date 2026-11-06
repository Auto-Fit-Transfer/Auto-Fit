from dataclasses import dataclass

from app.services.diet_personalization_service import (
    PreparedDietContext,
)


# =========================================================
# Backend가 허용한 건강 지표 키
# =========================================================


ALLOWED_EVIDENCE_METRIC_KEYS = {
    "bmi",
    "weight_kg",
    "body_fat_mass_kg",
    "body_fat_percentage",
    "skeletal_muscle_mass_kg",
    "fasting_glucose",
    "systolic_bp",
    "diastolic_bp",
}


# =========================================================
# Validation Result
# =========================================================


@dataclass
class ValidatedInventoryUsage:
    used_items: list[str]
    used_inventory_item_ids: list[str]


# =========================================================
# Metric Validation
# =========================================================


def filter_metric_keys(
    keys: list[str],
) -> list[str]:
    """
    Backend가 지원하는 건강 지표 키만 통과시킨다.

    LLM이 허용되지 않은 metric key를 생성하더라도
    Backend 응답으로 전달하지 않는다.

    중복 key도 제거한다.
    """

    result: list[str] = []

    for key in keys:
        if (
            key in ALLOWED_EVIDENCE_METRIC_KEYS
            and key not in result
        ):
            result.append(
                key
            )

    return result


# =========================================================
# Inventory Validation
# =========================================================


def validate_inventory_usage(
    *,
    used_item_names: list[str],
    prepared: PreparedDietContext,
) -> ValidatedInventoryUsage:
    """
    LLM이 사용했다고 반환한 재료가
    실제 Backend 입력 inventory에 존재하는지 검증한다.

    중요:
    - LLM이 UUID를 직접 생성하지 않는다.
    - 실제 inventory에 존재하는 이름만 허용한다.
    - UUID는 서버가 원본 inventory에서 복원한다.
    - 존재하지 않는 허위 재료는 제거한다.
    """

    inventory_map: dict[
        str,
        tuple[str, str],
    ] = {}

    for item in prepared.available_items:
        normalized_name = (
            item.name
            .strip()
            .lower()
        )

        if not normalized_name:
            continue

        inventory_map[
            normalized_name
        ] = (
            item.name,
            item.inventory_item_id,
        )

    used_items: list[str] = []
    used_ids: list[str] = []

    for item_name in used_item_names:
        normalized_name = (
            item_name
            .strip()
            .lower()
        )

        if not normalized_name:
            continue

        matched = inventory_map.get(
            normalized_name
        )

        # 실제 inventory에 없는 재료는 제거
        if matched is None:
            continue

        actual_name, inventory_id = matched

        if actual_name not in used_items:
            used_items.append(
                actual_name
            )

        if inventory_id not in used_ids:
            used_ids.append(
                inventory_id
            )

    return ValidatedInventoryUsage(
        used_items=used_items,
        used_inventory_item_ids=used_ids,
    )


# =========================================================
# Expiring Soon Validation
# =========================================================


def validate_expiring_soon_items(
    prepared: PreparedDietContext,
) -> list[str]:
    """
    Backend 입력에서 실제로 expiring_soon 상태인
    재료만 반환한다.

    LLM이 임의로 유통기한 상태를 만들 수 없게 한다.
    """

    result: list[str] = []

    for item in prepared.expiring_soon_items:
        if item.name not in result:
            result.append(
                item.name
            )

    return result