from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from fastapi.security import (
    HTTPAuthorizationCredentials,
)

from app.core.security import (
    security,
    verify_api_key,
)

from app.schemas.analysis import (
    AnalysisRequest,
    AnalysisResponse,
)

from app.graphs.analysis_graph import (
    analysis_graph,
)

from app.services.analysis_input_service import (
    analysis_input_service,
)


router = APIRouter(
    prefix="/analysis",
    tags=["analysis"],
)


# =========================================================
# Health Analysis
# =========================================================

@router.post(
    "",
    response_model=AnalysisResponse,
)
async def analyze_health(
    request: AnalysisRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> AnalysisResponse:
    """
    Backend에서 전달받은 건강 데이터를
    Privacy / Feature Selector를 거쳐
    LangGraph 분석 파이프라인으로 전달한다.
    """

    verify_api_key(
        credentials
    )

    try:
        # --------------------------------------------------
        # 1. 요청 데이터 dict 변환
        # --------------------------------------------------

        raw_payload = request.model_dump()

        # --------------------------------------------------
        # 2. 안전한 분석 입력 생성
        #
        # 내부적으로:
        # Privacy Filtering
        # -> FeatureSelectorService
        # -> rule_engine_input
        # -> rag_input
        #
        # 순서로 처리된다.
        # --------------------------------------------------

        safe_inputs = (
            analysis_input_service
            .build_inputs(
                raw_payload
            )
        )

        # --------------------------------------------------
        # 3. LangGraph 실행
        #
        # Graph Node에서는 더 이상 원본
        # body_data / health_data를 직접 사용하지 않고
        # 안전하게 만들어진 입력만 사용한다.
        # --------------------------------------------------

        graph_result = await analysis_graph.ainvoke(
            {
                "rule_engine_input": safe_inputs[
                    "rule_engine_input"
                ],

                "rag_input": safe_inputs[
                    "rag_input"
                ],

                "unsupported_fields": safe_inputs[
                    "unsupported_fields"
                ],

                "warnings": [],
            }
        )

        # --------------------------------------------------
        # 4. Rule Engine 결과
        # --------------------------------------------------

        rule_result = graph_result.get(
            "rule_engine_result",
            {},
        )

        body_analysis = rule_result.get(
            "body_analysis",
            {},
        )

        health_analysis = rule_result.get(
            "health_analysis",
            {},
        )

        # --------------------------------------------------
        # 5. RAG + LLM 최종 결과
        # --------------------------------------------------

        final_answer = graph_result.get(
            "final_answer",
            {},
        )

        # --------------------------------------------------
        # 6. Warning
        # --------------------------------------------------

        warnings = list(
            graph_result.get(
                "warnings",
                [],
            )
        )

        unsupported_fields = safe_inputs.get(
            "unsupported_fields",
            [],
        )

        if unsupported_fields:
            warnings.append(
                "일부 입력 필드는 현재 분석에서 사용되지 않았습니다."
            )

        # --------------------------------------------------
        # 7. 최종 응답
        # --------------------------------------------------

        return AnalysisResponse(
            user_id=None,

            body_analysis=(
                body_analysis
            ),

            health_analysis=(
                health_analysis
            ),

            final_answer=(
                final_answer
            ),

            warnings=warnings,

            analysis_version=(
                "langgraph-v1"
            ),
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Health analysis failed",
        )


# =========================================================
# Development Debug API
# =========================================================

@router.post(
    "/debug-inputs"
)
async def debug_analysis_inputs(
    request: AnalysisRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
):
    """
    개발 환경에서 Feature Selector 이후
    안전 입력을 확인하기 위한 API.

    raw 사용자 데이터 전체를 반환하지 않는다.
    """

    verify_api_key(
        credentials
    )

    try:
        raw_payload = (
            request.model_dump()
        )

        safe_inputs = (
            analysis_input_service
            .build_inputs(
                raw_payload
            )
        )

        return {
            "rule_engine_input": (
                safe_inputs[
                    "rule_engine_input"
                ]
            ),

            "rag_input": (
                safe_inputs[
                    "rag_input"
                ]
            ),

            "unsupported_fields": (
                safe_inputs[
                    "unsupported_fields"
                ]
            ),
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to prepare safe analysis inputs"
            ),
        )