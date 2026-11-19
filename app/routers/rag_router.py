from fastapi import (
    APIRouter,
    Depends,
    Query,
)

from app.core.security import (
    verify_ai_server_key,
)
from app.rag.vector_store import (
    rag_vector_store,
)

from app.graphs.nodes.rag_node import (
    debug_rag_search,
)
from app.schemas.rag import (
    RAGDebugRequest,
    RAGDebugResponse,
)

router = APIRouter(
    prefix="/rag",
    tags=["RAG"],
)


@router.get(
    "/test-search",
    dependencies=[
        Depends(
            verify_ai_server_key
        )
    ],
)
def test_search(
    query: str = Query(
        ...,
        min_length=1,
    ),
    topic: str | None = Query(
        default=None,
    ),
    n_results: int = Query(
        default=3,
        ge=1,
        le=10,
    ),
):
    """
    RAG Vector DB 검색 테스트.

    topic을 지정하면 해당 topic의
    문서만 검색한다.
    """

    results = rag_vector_store.search(
        query=query,
        n_results=n_results,
        topic=topic,
    )

    return {
        "query": query,
        "topic": topic,
        "count": len(results),
        "results": results,
    }

@router.post(
    "/debug-analysis-search",
    response_model=RAGDebugResponse,
    dependencies=[
        Depends(
            verify_ai_server_key
        )
    ],
)
def debug_analysis_search(
    request: RAGDebugRequest,
) -> RAGDebugResponse:
    """
    Rule Engine status를 기반으로
    topic 선택 + RAG 후보 + reranking 결과를 확인한다.

    개발/튜닝 전용 endpoint.
    """

    result = debug_rag_search(
        metric_statuses=(
            request.metric_statuses
        )
    )

    return RAGDebugResponse(
        **result
    )