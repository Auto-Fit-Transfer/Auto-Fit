from typing import Any

from app.services.feature_selector_service import (
    feature_selector_service,
)

class AnalysisInputService:

    # --------------------------------------------------
    # 일반 분석 입력 생성
    # --------------------------------------------------

    def build_inputs(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """
        FeatureSelectorService를 통해 생성된
        안전한 분석 입력값을 각 모듈별로 정리한다.

        현재 생성되는 입력:
        - rule_engine_input
        - rag_input
        - unsupported_fields

        개인정보 및 보안정보는 포함하지 않는다.
        """

        safe_inputs = (
            feature_selector_service
            .build_safe_analysis_inputs(
                payload
            )
        )

        return {
            "rule_engine_input": safe_inputs[
                "rule_engine_input"
            ],

            "rag_input": safe_inputs[
                "rag_input"
            ],

            "unsupported_fields": safe_inputs[
                "unsupported_fields"
            ],
        }

analysis_input_service = (
    AnalysisInputService()
)
