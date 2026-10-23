from typing import Any


NORMAL_STATUSES = {
    None,
    "normal",
    "optimal",
    "desirable",
    "collected",
}


def build_diet_safety_tags(
    metric_statuses: dict[str, Any],
) -> list[str]:
    """
    Rule Engine의 상태값을
    외부 LLM용 일반화 식단 관리 tag로 변환한다.

    원본 검사 수치는 사용하지 않는다.
    """

    tags: set[str] = set()

    # =====================================================
    # BMI / 체중
    # =====================================================

    bmi_status = metric_statuses.get(
        "bmi"
    )

    if bmi_status in {
        "overweight",
        "obesity_class_1",
        "obesity_class_2",
        "obesity_class_3",
    }:
        tags.add(
            "weight_management"
        )

    # =====================================================
    # 혈압
    # =====================================================

    blood_pressure_status = metric_statuses.get(
        "blood_pressure"
    )

    if blood_pressure_status not in NORMAL_STATUSES:
        tags.add(
            "sodium_caution"
        )

    # =====================================================
    # 혈당
    # =====================================================

    fasting_glucose_status = metric_statuses.get(
        "fasting_glucose"
    )

    hba1c_status = metric_statuses.get(
        "hba1c"
    )

    if (
        fasting_glucose_status not in NORMAL_STATUSES
        or hba1c_status not in NORMAL_STATUSES
    ):
        tags.add(
            "glucose_management"
        )

    # =====================================================
    # 혈중지질
    # =====================================================

    lipid_metrics = (
        "total_cholesterol",
        "ldl",
        "hdl",
        "triglyceride",
    )

    for metric in lipid_metrics:
        status = metric_statuses.get(
            metric
        )

        if status not in NORMAL_STATUSES:
            tags.add(
                "lipid_management"
            )
            break

    # =====================================================
    # 체지방률
    #
    # 현재 collected라면 판단하지 않는다.
    # 향후 Rule Engine 상태가 추가되면 사용 가능하다.
    # =====================================================

    body_fat_status = metric_statuses.get(
        "body_fat_percentage"
    )

    if body_fat_status in {
        "high",
        "very_high",
    }:
        tags.add(
            "body_fat_management"
        )

    # =====================================================
    # 골격근량
    # =====================================================

    muscle_status = metric_statuses.get(
        "skeletal_muscle_mass_kg"
    )

    if muscle_status in {
        "low",
        "very_low",
    }:
        tags.add(
            "muscle_mass_support"
        )

    return sorted(tags)