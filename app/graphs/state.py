from typing import (
    Any,
    TypedDict,
)


class AnalysisState(
    TypedDict,
    total=False,
):
    """
    Auto-Fit 건강 분석 LangGraph State.

    중요:
    - 개인정보 원본 데이터는 Graph 전체에 불필요하게 유지하지 않는다.
    - FeatureSelectorService가 만든 안전 입력을 기준으로 사용한다.
    - LLM으로 전달될 분석 정보는 merged_analysis의
      metric_statuses 중심으로 제한한다.
    """

    # =====================================================
    # Graph Input
    # =====================================================

    # Rule Engine 전용 안전 입력
    rule_engine_input: dict[str, Any]

    # RAG 전용 안전 입력
    rag_input: dict[str, Any]

    # 현재 분석에서 지원하지 않는 입력 필드
    unsupported_fields: list[str]

    # =====================================================
    # Rule Engine
    # =====================================================

    rule_engine_result: dict[str, Any]

    # =====================================================
    # Merge
    # =====================================================

    # 예:
    #
    # {
    #     "metric_statuses": {
    #         "bmi": "obesity_class_1",
    #         "blood_pressure": "prehypertension_stage_2",
    #         "fasting_glucose": "impaired_fasting_glucose",
    #     },
    #     "unsupported_fields": []
    # }
    #
    merged_analysis: dict[str, Any]

    # =====================================================
    # RAG
    # =====================================================

    # RAG에서 검색된 공식 근거
    rag_context: list[dict[str, Any]]

    # =====================================================
    # LLM
    # =====================================================

    # Structured Output 결과
    final_answer: Any

    # =====================================================
    # Common
    # =====================================================

    warnings: list[str]

AnalysisGraphState = AnalysisState