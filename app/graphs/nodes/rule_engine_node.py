from typing import Any

from app.schemas.analysis import (
    BodyData,
    HealthData,
)

from app.services.rule_engine_service import (
    RuleEngineService,
)


rule_engine_service = RuleEngineService()


async def rule_engine_node(
    state: dict[str, Any],
) -> dict[str, Any]:
    """
    FeatureSelectorService가 생성한
    rule_engine_input만 사용하여 Rule Engine을 실행한다.

    원본 사용자 payload나 개인정보에는 직접 접근하지 않는다.
    """

    # =====================================================
    # 1. rule_engine_input 가져오기
    # =====================================================

    rule_engine_input = state.get(
        "rule_engine_input",
        {},
    )

    if not isinstance(
        rule_engine_input,
        dict,
    ):
        rule_engine_input = {}

    # =====================================================
    # 2. BodyData 복원
    # =====================================================

    body_raw = rule_engine_input.get(
        "body_data",
        {},
    )

    if not isinstance(
        body_raw,
        dict,
    ):
        body_raw = {}

    body_data = BodyData(
        **body_raw
    )

    # =====================================================
    # 3. HealthData 복원
    # =====================================================

    health_raw = rule_engine_input.get(
        "health_data",
        {},
    )

    if not isinstance(
        health_raw,
        dict,
    ):
        health_raw = {}

    health_data = HealthData(
        **health_raw
    )

    # =====================================================
    # 4. Rule Engine 실행
    # =====================================================

    body_analysis = (
        rule_engine_service
        .analyze_body(
            body_data
        )
    )

    health_analysis = (
        rule_engine_service
        .analyze_health(
            health_data
        )
    )

    # =====================================================
    # 5. 결과 반환
    # =====================================================

    return {
        "rule_engine_result": {
            "body_analysis": (
                body_analysis
            ),
            "health_analysis": (
                health_analysis
            ),
        }
    }