from typing import Any


NORMAL_STATUSES = {
    None,
    "normal",
    "optimal",
    "desirable",
    "collected",
}


def build_exercise_safety_tags(
    metric_statuses: dict[str, Any],
) -> list[str]:
    """
    Rule Engine의 상태값을
    외부 LLM에 전달 가능한 일반화된 운동 안전 tag로 변환한다.

    원본 건강 수치는 사용하지 않는다.
    """

    tags: set[str] = set()

    # --------------------------------------------------
    # 체중
    # --------------------------------------------------

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

    # --------------------------------------------------
    # 혈압
    # --------------------------------------------------

    blood_pressure_status = (
        metric_statuses.get(
            "blood_pressure"
        )
    )

    if blood_pressure_status not in (
        NORMAL_STATUSES
    ):
        tags.add(
            "blood_pressure_caution"
        )

    # --------------------------------------------------
    # 혈당
    # --------------------------------------------------

    fasting_glucose_status = (
        metric_statuses.get(
            "fasting_glucose"
        )
    )

    hba1c_status = metric_statuses.get(
        "hba1c"
    )

    if (
        fasting_glucose_status
        not in NORMAL_STATUSES
        or hba1c_status
        not in NORMAL_STATUSES
    ):
        tags.add(
            "glucose_management"
        )

    # --------------------------------------------------
    # 지질
    # --------------------------------------------------

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

    return sorted(
        tags
    )