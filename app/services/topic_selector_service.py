from typing import Any


# metric 이름 → health topic 매핑
METRIC_TOPIC_MAP: dict[str, str] = {
    "bmi": "obesity",
    "body_fat_percentage": "obesity",
    "waist_hip_ratio": "obesity",

    "blood_pressure": "blood_pressure",

    "fasting_glucose": "glucose",
    "hba1c": "glucose",

    "total_cholesterol": "lipid",
    "ldl": "lipid",
    "hdl": "lipid",
    "triglyceride": "lipid",

    "ast": "liver",
    "alt": "liver",
    "gamma_gtp": "liver",

    "creatinine": "kidney",
}


# 단순 수집 상태는 RAG 검색 대상으로 사용하지 않음
IGNORED_STATUSES = {
    "normal",
    "optimal",
    "desirable",
    "collected",
}


def select_health_topics(
    metric_statuses: dict[str, Any],
) -> list[str]:
    """
    Rule Engine의 metric_statuses를 기반으로
    검색해야 할 건강 topic을 선택한다.

    사용자 원본 수치나 식별정보는 사용하지 않는다.
    """

    topics: set[str] = set()

    for metric, status in metric_statuses.items():

        if not isinstance(metric, str):
            continue

        if not isinstance(status, str):
            continue

        if status in IGNORED_STATUSES:
            continue

        topic = METRIC_TOPIC_MAP.get(metric)

        if topic:
            topics.add(topic)

    return sorted(topics)