import json
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.graphs.state import AnalysisGraphState
from app.schemas.analysis import FinalAnswer


SYSTEM_INSTRUCTIONS = """
너는 Auto-Fit 헬스케어 애플리케이션의 AI 건강관리 도우미다.

반드시 제공된 분석 결과와 검증된 RAG 근거를 기반으로만 답변한다.

규칙:
- 의료 진단을 확정적으로 하지 않는다.
- 특정 질병이 있다고 단정하지 않는다.
- 건강 위험요인이나 관련 가능성 수준으로 설명한다.
- 운동과 식단은 일반적인 건강관리 목적의 추천만 제공한다.
- 검증된 RAG 근거가 없는 의학적 사실은 임의로 생성하지 않는다.
- 개인정보, 사용자 식별정보, 인증정보를 출력하거나 추론하지 않는다.
- 제공되지 않은 건강 수치를 추측하지 않는다.
- 출처는 실제 rag_context에 존재하는 자료만 사용한다.
- RAG 근거가 없으면 sources는 빈 배열로 반환한다.

- 사용자에게 "원본 검사 수치가 없다"고 표현하지 않는다.
- 외부 LLM 입력에는 개인정보 보호를 위해 원본 건강 수치를 전달하지 않고
  상태 분류만 제공받았다고 이해한다.
- 수치 기반 세부 판단이 필요한 경우
  "현재 AI 분석에는 상태 분류를 사용했으므로 세부 수치 평가는 의료진과 확인하세요."
  정도로 표현한다.
""".strip()


def _extract_safe_analysis(
    merged_analysis: dict[str, Any],
) -> dict[str, str]:
    """
    외부 LLM에는 원본 건강 수치를 전달하지 않고
    Rule Engine이 생성한 상태값만 전달한다.

    예:
    {
        "bmi": "underweight",
        "hdl": "low"
    }
    """

    metric_statuses = merged_analysis.get(
        "metric_statuses",
        {},
    )

    if not isinstance(metric_statuses, dict):
        return {}

    safe_statuses: dict[str, str] = {}

    for metric, status in metric_statuses.items():
        if not isinstance(metric, str):
            continue

        if not isinstance(status, str):
            continue

        safe_statuses[metric] = status

    return safe_statuses


def _extract_safe_rag_context(
    rag_context: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    검증된 RAG 결과에서 LLM에 필요한 정보만 전달한다.

    사용자 정보나 내부 메타데이터는 전달하지 않는다.
    """

    safe_context: list[dict[str, Any]] = []

    for item in rag_context:
        if not isinstance(item, dict):
            continue

        content = item.get("content")

        if not isinstance(content, str):
            continue

        # 불필요하게 긴 컨텍스트 전달 방지
        content = content[:2000]

        safe_context.append(
            {
                "content": content,
                "source_org": item.get("source_org"),
                "title": item.get("title"),
                "document_type": item.get("document_type"),
                "published_year": item.get("published_year"),
                "url": item.get("url"),
                "topic": item.get("topic"),
            }
        )

    return safe_context


def _build_llm_input(
    state: AnalysisGraphState,
) -> str:
    """
    OpenAI에는 최소화된 분석 상태와
    검증된 공식 RAG 컨텍스트만 전달한다.

    원본 건강검진 수치 및 사용자 식별정보는 전달하지 않는다.
    """

    merged_analysis = state.get(
        "merged_analysis",
        {},
    )

    rag_context = state.get(
        "rag_context",
        [],
    )

    safe_analysis = _extract_safe_analysis(
        merged_analysis
        if isinstance(merged_analysis, dict)
        else {}
    )

    safe_rag_context = _extract_safe_rag_context(
        rag_context
        if isinstance(rag_context, list)
        else []
    )

    payload = {
        "metric_statuses": safe_analysis,
        "rag_context": safe_rag_context,
    }

    return json.dumps(
        payload,
        ensure_ascii=False,
    )


def _get_openai_client() -> AsyncOpenAI:
    """
    OpenAI API Key가 존재할 때만 Client를 생성한다.
    """

    settings = get_settings()

    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured"
        )

    return AsyncOpenAI(
        api_key=settings.openai_api_key
    )


async def llm_node(
    state: AnalysisGraphState,
) -> AnalysisGraphState:
    """
    Rule Engine 결과와 검증된 RAG 근거를 이용하여
    구조화된 건강관리 안내를 생성한다.
    """

    settings = get_settings()

    warnings = state.get(
        "warnings",
        [],
    ).copy()

    rag_context = state.get(
        "rag_context",
        [],
    )

    if not settings.openai_api_key:
        warnings.append(
            "OPENAI_API_KEY가 설정되지 않았습니다."
        )

        return {
            "final_answer": {},
            "warnings": warnings,
        }

    if not rag_context:
        warning_message = (
            "검증된 RAG 근거가 없어 "
            "제한된 범위에서만 안내합니다."
        )

        if warning_message not in warnings:
            warnings.append(
                warning_message
            )

    prompt = _build_llm_input(
        state
    )

    try:
        client = _get_openai_client()

        response = await client.responses.parse(
            model=settings.openai_model,
            instructions=SYSTEM_INSTRUCTIONS,
            input=f"""
            아래 분석 상태와 검증된 RAG 근거만 이용하여
            사용자에게 제공할 건강관리 안내를 작성하세요.

            주의사항:
            - metric_statuses에 없는 건강 상태를 만들어내지 마세요.
            - 원본 검사 수치를 추측하지 마세요.
            - rag_context에 없는 출처를 만들어내지 마세요.
            - 확정적인 질병 진단을 하지 마세요.
            - 질병명보다는 건강 위험요인 중심으로 설명하세요.
            - 운동과 식단은 일반적인 건강관리 방향으로 안내하세요.
            - 검증된 RAG 근거가 없으면 sources는 빈 배열로 두세요.
            - "원본 검사 수치가 없다"는 표현은 사용하지 마세요.
            - 현재 입력은 개인정보 보호를 위해 원본 수치 대신 상태 분류만 전달된 것입니다.
            데이터:
            {prompt}
            """.strip(),
            text_format=FinalAnswer,
            max_output_tokens=1500,
        )

        parsed = response.output_parsed

        if parsed is None:
            warnings.append(
                "LLM 구조화 응답을 생성하지 못했습니다."
            )

            return {
                "final_answer": {},
                "warnings": warnings,
            }

        return {
            "final_answer": parsed.model_dump(),
            "warnings": warnings,
        }

    except Exception:
        warnings.append(
            "LLM 최종 분석을 수행하지 못했습니다."
        )

        return {
            "final_answer": {},
            "warnings": warnings,
        }