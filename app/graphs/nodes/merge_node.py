from typing import Any


async def merge_node(
    state: dict[str, Any],
) -> dict[str, Any]:
    """
    Rule Engine 결과를 통합하여
    RAG / LLM에서 사용할 metric_statuses를 생성한다.

    raw 건강 수치는 merged_analysis에 포함하지 않는다.
    """

    # =====================================================
    # 1. Rule Engine 결과
    # =====================================================

    rule_engine_result = state.get(
        "rule_engine_result",
        {},
    )

    if not isinstance(
        rule_engine_result,
        dict,
    ):
        rule_engine_result = {}

    # =====================================================
    # 2. Body / Health 분석 결과
    # =====================================================

    body_analysis = rule_engine_result.get(
        "body_analysis",
        {},
    )

    health_analysis = rule_engine_result.get(
        "health_analysis",
        {},
    )

    if not isinstance(
        body_analysis,
        dict,
    ):
        body_analysis = {}

    if not isinstance(
        health_analysis,
        dict,
    ):
        health_analysis = {}

    # =====================================================
    # 3. metric_statuses 생성
    # =====================================================

    metric_statuses: dict[str, str] = {}

    for metric, result in body_analysis.items():
        status = _extract_status(
            result
        )

        if status is not None:
            metric_statuses[
                metric
            ] = status

    for metric, result in health_analysis.items():
        status = _extract_status(
            result
        )

        if status is not None:
            metric_statuses[
                metric
            ] = status

    # =====================================================
    # 4. 지원하지 않는 필드
    # =====================================================

    unsupported_fields = state.get(
        "unsupported_fields",
        [],
    )

    if not isinstance(
        unsupported_fields,
        list,
    ):
        unsupported_fields = []

    # =====================================================
    # 5. merged_analysis
    # =====================================================

    merged_analysis = {
        "metric_statuses": (
            metric_statuses
        ),
        "unsupported_fields": (
            unsupported_fields
        ),
    }

    return {
        "merged_analysis": (
            merged_analysis
        )
    }


def _extract_status(
    result: Any,
) -> str | None:
    """
    MetricResult Pydantic 객체 또는
    dict 형태 모두 지원한다.
    """

    if result is None:
        return None

    # -----------------------------------------------------
    # Pydantic MetricResult
    # -----------------------------------------------------

    status = getattr(
        result,
        "status",
        None,
    )

    if isinstance(
        status,
        str,
    ):
        return status

    # -----------------------------------------------------
    # dict
    # -----------------------------------------------------

    if isinstance(
        result,
        dict,
    ):
        status = result.get(
            "status"
        )

        if isinstance(
            status,
            str,
        ):
            return status

    return None