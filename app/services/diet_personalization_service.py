from dataclasses import dataclass

from app.schemas.health_analysis import (
    DietContextInput,
    InventoryItemInput,
)


@dataclass
class PreparedDietContext:
    """
    LLM에 전달하기 전 정리된 냉장고 context.
    """

    captured_at: str | None

    available_items: list[InventoryItemInput]

    allowed_inventory_ids: set[str]

    expiring_soon_items: list[InventoryItemInput]

    allergy_excluded_items: list[InventoryItemInput]

    allergies: list[str]


def _normalize_text(
    value: str | None,
) -> str:
    if value is None:
        return ""

    return value.strip().lower()


def _has_allergy_conflict(
    item: InventoryItemInput,
    allergies: list[str],
) -> bool:
    """
    MVP용 보수적 문자열 기반 알레르기 충돌 검사.

    현재 Backend가 재료명과 알레르기 문자열을 보내므로
    재료명에 알레르기명이 포함되는 경우 제외한다.

    예:
    item.name = "우유"
    allergies = ["우유"]
    -> True

    향후 식품/알레르기 ontology가 생기면
    별도 매핑 테이블로 교체할 수 있다.
    """

    item_name = _normalize_text(
        item.name
    )

    if not item_name:
        return False

    for allergy in allergies:
        allergy_name = _normalize_text(
            allergy
        )

        if not allergy_name:
            continue

        if allergy_name in item_name:
            return True

    return False


def _freshness_priority(
    item: InventoryItemInput,
) -> int:
    """
    expiring_soon 재료를 가장 먼저 배치한다.
    """

    if item.freshness_status == "expiring_soon":
        return 0

    if item.freshness_status == "fresh":
        return 1

    return 2


def prepare_diet_context(
    diet_context: DietContextInput | None,
) -> PreparedDietContext:
    """
    Backend diet_context를 LLM에 전달하기 전에 정리한다.

    Backend에서 이미:
    - 유통기한 지난 재료
    - quantity <= 0
    - 사용 불가 재료
    - 이름 없는 재료

    를 제외한다고 계약되어 있으므로
    여기서는 그 결과를 신뢰하되,
    알레르기 충돌은 모델 서버에서 다시 방어한다.
    """

    if diet_context is None:
        return PreparedDietContext(
            captured_at=None,
            available_items=[],
            allowed_inventory_ids=set(),
            expiring_soon_items=[],
            allergy_excluded_items=[],
            allergies=[],
        )

    allergies = [
        allergy.strip()
        for allergy in diet_context.allergies
        if allergy
        and allergy.strip()
    ]

    available_items: list[InventoryItemInput] = []

    allergy_excluded_items: list[InventoryItemInput] = []

    for item in diet_context.inventory:
        if _has_allergy_conflict(
            item=item,
            allergies=allergies,
        ):
            allergy_excluded_items.append(
                item
            )
            continue

        available_items.append(
            item
        )

    # 유통기한 임박 재료 우선
    available_items.sort(
        key=_freshness_priority
    )

    expiring_soon_items = [
        item
        for item in available_items
        if item.freshness_status == "expiring_soon"
    ]

    allowed_inventory_ids = {
        item.inventory_item_id
        for item in available_items
    }

    return PreparedDietContext(
        captured_at=diet_context.captured_at,
        available_items=available_items,
        allowed_inventory_ids=allowed_inventory_ids,
        expiring_soon_items=expiring_soon_items,
        allergy_excluded_items=allergy_excluded_items,
        allergies=allergies,
    )