from langgraph.graph import (
    END,
    START,
    StateGraph,
)

from app.graphs.state import AnalysisGraphState

from app.graphs.nodes.rule_engine_node import (
    rule_engine_node,
)
from app.graphs.nodes.merge_node import (
    merge_node,
)
from app.graphs.nodes.rag_node import (
    rag_node,
)
from app.graphs.nodes.llm_node import (
    llm_node,
)


# =========================================================
# 기존 전체 분석 Graph
# =========================================================


def build_analysis_graph():
    graph = StateGraph(
        AnalysisGraphState
    )

    graph.add_node(
        "rule_engine",
        rule_engine_node,
    )

    graph.add_node(
        "merge",
        merge_node,
    )

    graph.add_node(
        "rag",
        rag_node,
    )

    graph.add_node(
        "llm",
        llm_node,
    )

    graph.add_edge(
        START,
        "rule_engine",
    )

    graph.add_edge(
        "rule_engine",
        "merge",
    )

    graph.add_edge(
        "merge",
        "rag",
    )

    graph.add_edge(
        "rag",
        "llm",
    )

    graph.add_edge(
        "llm",
        END,
    )

    return graph.compile()


analysis_graph = build_analysis_graph()


# =========================================================
# Backend /health-analysis 전용 Context Graph
# =========================================================


def build_analysis_context_graph():
    """
    Backend용 종합 분석에서 사용하는 graph.

    Rule Engine -> Merge -> RAG까지만 수행한다.

    기존 llm_node는 실행하지 않고
    health_analysis_service에서 Backend 전용
    structured output LLM을 한 번만 호출한다.
    """

    graph = StateGraph(
        AnalysisGraphState
    )

    graph.add_node(
        "rule_engine",
        rule_engine_node,
    )

    graph.add_node(
        "merge",
        merge_node,
    )

    graph.add_node(
        "rag",
        rag_node,
    )

    graph.add_edge(
        START,
        "rule_engine",
    )

    graph.add_edge(
        "rule_engine",
        "merge",
    )

    graph.add_edge(
        "merge",
        "rag",
    )

    graph.add_edge(
        "rag",
        END,
    )

    return graph.compile()


analysis_context_graph = (
    build_analysis_context_graph()
)