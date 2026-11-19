import logging
from typing import Any

from app.graphs.state import AnalysisGraphState
from app.rag.source_policy import is_allowed_source
from app.rag.vector_store import rag_vector_store
from app.services.topic_selector_service import (
    select_health_topics,
)


logger = logging.getLogger(
    __name__
)


# =========================================================
# RAG 검색 설정
# =========================================================

# 일반 topic당 검색 후보 수
CANDIDATES_PER_TOPIC = 8

# glucose의 각 status query당 검색 후보 수
CANDIDATES_PER_STATUS_QUERY = 5

# 최종적으로 LLM에 전달할 topic당 chunk 수
TOP_K_PER_TOPIC = 3

# Chroma distance 최대 허용값
MAX_DISTANCE = 1.2

MIN_RELEVANCE_SCORE = 0.45


# =========================================================
# Topic 기본 Query
# =========================================================

TOPIC_QUERY_MAP: dict[str, str] = {
    "obesity": (
        "비만 체중관리 생활습관 운동 식사 "
        "공식 임상 가이드라인"
    ),
    "blood_pressure": (
        "혈압 고혈압 생활습관 운동 식사 "
        "공식 임상 가이드라인"
    ),
    "glucose": (
        "공복혈당 HbA1c 당뇨병 전단계 "
        "혈당 관리 생활습관 운동 식사 "
        "공식 임상 가이드라인"
    ),
    "lipid": (
        "이상지질혈증 LDL HDL 중성지방 "
        "콜레스테롤 생활습관 운동 식사 "
        "공식 임상 가이드라인"
    ),
    "liver": (
        "간 건강 지방간 AST ALT 감마GTP "
        "생활습관 공식 건강 가이드라인"
    ),
    "kidney": (
        "신장 건강 만성콩팥병 크레아티닌 "
        "생활습관 공식 건강 가이드라인"
    ),
}


# =========================================================
# Glucose Status별 Query
# =========================================================

GLUCOSE_STATUS_QUERY_MAP: dict[str, str] = {
    "impaired_fasting_glucose": (
        "공복혈당장애 공복혈당 IFG "
        "당뇨병 전단계 진단 "
        "생활습관 식사 운동 관리"
    ),
    "prediabetes_range": (
        "당화혈색소 HbA1c "
        "당뇨병 전단계 진단 "
        "생활습관 식사 운동 관리"
    ),
}


# =========================================================
# Topic Keyword
# =========================================================

TOPIC_KEYWORDS: dict[str, set[str]] = {
    "obesity": {
        "비만",
        "체중",
        "BMI",
        "체중감량",
        "생활습관",
        "운동",
        "식사",
    },
    "blood_pressure": {
        "혈압",
        "고혈압",
        "수축기",
        "이완기",
        "나트륨",
        "운동",
        "생활습관",
    },
    "glucose": {
        "혈당",
        "공복혈당",
        "공복혈당장애",
        "당화혈색소",
        "HbA1c",
        "당뇨병",
        "당뇨병전단계",
        "식사",
        "운동",
    },
    "lipid": {
        "이상지질혈증",
        "콜레스테롤",
        "LDL",
        "HDL",
        "중성지방",
        "지질",
        "식사",
        "운동",
    },
    "liver": {
        "간",
        "지방간",
        "AST",
        "ALT",
        "감마GTP",
        "생활습관",
    },
    "kidney": {
        "신장",
        "콩팥",
        "만성콩팥병",
        "크레아티닌",
        "생활습관",
    },
}


# =========================================================
# Status Keyword
# =========================================================

STATUS_KEYWORDS: dict[str, set[str]] = {
    "impaired_fasting_glucose": {
        "공복혈당",
        "공복혈당장애",
        "IFG",
        "당뇨병전단계",
        "생활습관",
        "식사",
        "운동",
    },
    "prediabetes_range": {
        "당화혈색소",
        "HbA1c",
        "당뇨병전단계",
        "생활습관",
        "식사",
        "운동",
    },
}


GLUCOSE_NEGATIVE_KEYWORDS = {
    "임신",
    "임신부",
    "주산기",
    "태아",
    "1형당뇨병",
    "소아청소년",
    "저혈당",
    "인슐린펌프",
    "연속혈당측정",
}


GLUCOSE_PRIORITY_KEYWORDS = {
    "공복혈당장애",
    "IFG",
    "당뇨병전단계",
    "당화혈색소",
    "HbA1c",
}


STATUS_QUERY_MAP: dict[str, str] = {
    # glucose
    "impaired_fasting_glucose": (
        "공복혈당장애 공복혈당 IFG "
        "당뇨병 전단계 진단 생활습관 식사 운동 관리"
    ),
    "prediabetes_range": (
        "당화혈색소 HbA1c "
        "당뇨병 전단계 진단 생활습관 식사 운동 관리"
    ),

    # blood pressure
    "prehypertension_stage_2": (
        "고혈압 전단계 혈압 상승 "
        "생활요법 체중조절 나트륨 제한 "
        "운동 건강한 식사 관리"
    ),

    # lipid
    "borderline_high": (
        "경계성 고콜레스테롤 LDL 콜레스테롤 "
        "이상지질혈증 생활습관 식사 운동 관리"
    ),
    "low": (
        "낮은 HDL 콜레스테롤 "
        "이상지질혈증 운동 생활습관 관리"
    ),
    "high": (
        "높은 중성지방 고중성지방혈증 "
        "이상지질혈증 식사 운동 생활습관 관리"
    ),

    # obesity
    "obesity_class_1": (
        "1단계 비만 BMI 체중감량 "
        "식사치료 운동치료 행동치료 생활습관 관리"
    ),
}


TOPIC_PRIORITY_KEYWORDS: dict[str, set[str]] = {
    "blood_pressure": {
        "생활요법",
        "체중조절",
        "소금",
        "나트륨",
        "운동",
        "식사",
    },

    "glucose": {
        "공복혈당장애",
        "IFG",
        "당뇨병전단계",
        "당화혈색소",
        "HbA1c",
    },

    "lipid": {
        "생활요법",
        "LDL",
        "HDL",
        "중성지방",
        "운동",
        "식사",
    },

    "obesity": {
        "체중감량",
        "식사치료",
        "운동치료",
        "행동치료",
        "생활습관",
    },
}


TOPIC_STATUS_METRICS: dict[
    str,
    tuple[str, ...],
] = {
    "blood_pressure": (
        "blood_pressure",
    ),
    "glucose": (
        "fasting_glucose",
        "hba1c",
    ),
    "lipid": (
        "total_cholesterol",
        "ldl",
        "hdl",
        "triglyceride",
    ),
    "obesity": (
        "bmi",
    ),
}


GLOBAL_NEGATIVE_KEYWORDS = {
    "목차",
    "권고 번호 제목 페이지",
}


# 기존 파일에서 두 번 선언되어 있었으며
# 실제 Python 실행 시 마지막 선언이 사용되고 있었음.
TOPIC_NEGATIVE_KEYWORDS: dict[
    str,
    set[str],
] = {
    "blood_pressure": {
        "임신",
        "임신부",
        "주산기",
        "약물치료",
        "난치성고혈압",
    },

    "glucose": {
        "임신",
        "임신부",
        "주산기",
        "1형당뇨병",
        "소아청소년",
        "저혈당",
        "인슐린펌프",
        "연속혈당측정",
    },

    "lipid": {
        "약물치료",
        "스타틴",
        "페노피브레이트",
        "icosapent",
        "가족성고콜레스테롤혈증",
        "HoFH",
    },

    "obesity": {
        "약물치료",
        "항비만약제",
        "수술치료",
        "비만수술",
        "소아청소년",
    },
}


# =========================================================
# Query 생성
# =========================================================

def _build_status_queries(
    topic: str,
    metric_statuses: dict[str, Any],
) -> list[str]:
    """
    topic에 해당하는 metric status를 확인하여
    status별 검색 query를 만든다.
    """

    metrics = TOPIC_STATUS_METRICS.get(
        topic,
        (),
    )

    queries: list[str] = []

    for metric in metrics:
        status = metric_statuses.get(
            metric
        )

        if not isinstance(
            status,
            str,
        ):
            continue

        query = STATUS_QUERY_MAP.get(
            status
        )

        if query:
            queries.append(
                query
            )

    return list(
        dict.fromkeys(
            queries
        )
    )


def _build_topic_queries(
    topic: str,
    metric_statuses: dict[str, Any],
) -> list[str]:
    """
    status query가 있으면 우선 사용하고,
    없으면 topic 기본 query를 사용한다.
    """

    status_queries = (
        _build_status_queries(
            topic=topic,
            metric_statuses=metric_statuses,
        )
    )

    if status_queries:
        return status_queries

    default_query = TOPIC_QUERY_MAP.get(
        topic
    )

    if not default_query:
        return []

    return [
        default_query
    ]


# =========================================================
# Source 검증
# =========================================================

def _is_valid_result(
    item: dict[str, Any],
) -> bool:
    """
    검색된 Vector DB 결과가
    허용된 공식 출처인지 재검증한다.
    """

    try:
        return is_allowed_source(
            source_org=str(
                item.get(
                    "source_org",
                    "",
                )
            ),
            document_type=str(
                item.get(
                    "document_type",
                    "",
                )
            ),
            verified=bool(
                item.get(
                    "verified",
                    False,
                )
            ),
        )

    except Exception:
        return False


# =========================================================
# Distance Threshold
# =========================================================

def _passes_distance_threshold(
    item: dict[str, Any],
) -> bool:
    """
    검색 결과의 distance가 너무 크면 제외한다.
    """

    distance = item.get(
        "distance"
    )

    if distance is None:
        return False

    try:
        return (
            float(distance)
            <= MAX_DISTANCE
        )

    except (
        TypeError,
        ValueError,
    ):
        return False


# =========================================================
# Keyword Score
# =========================================================

def _calculate_keyword_score(
    content: str,
    topic: str,
    metric_statuses: dict[str, Any] | None = None,
) -> float:
    """
    topic keyword + 실제 status keyword를
    함께 사용해 keyword 점수를 계산한다.
    """

    keywords = set(
        TOPIC_KEYWORDS.get(
            topic,
            set(),
        )
    )

    if (
        topic == "glucose"
        and metric_statuses
    ):
        for metric in (
            "fasting_glucose",
            "hba1c",
        ):
            status = metric_statuses.get(
                metric
            )

            if not isinstance(
                status,
                str,
            ):
                continue

            keywords.update(
                STATUS_KEYWORDS.get(
                    status,
                    set(),
                )
            )

    if not keywords:
        return 0.0

    normalized_content = (
        content
        .replace(" ", "")
        .lower()
    )

    matched = 0

    for keyword in keywords:
        normalized_keyword = (
            keyword
            .replace(" ", "")
            .lower()
        )

        if (
            normalized_keyword
            in normalized_content
        ):
            matched += 1

    return matched / len(
        keywords
    )


# =========================================================
# Negative Penalty
# =========================================================

def _calculate_negative_penalty(
    content: str,
    topic: str,
) -> float:
    normalized_content = (
        content
        .replace(" ", "")
        .lower()
    )

    keywords = set(
        GLOBAL_NEGATIVE_KEYWORDS
    )

    keywords.update(
        TOPIC_NEGATIVE_KEYWORDS.get(
            topic,
            set(),
        )
    )

    matched = 0

    for keyword in keywords:
        normalized_keyword = (
            keyword
            .replace(" ", "")
            .lower()
        )

        if (
            normalized_keyword
            in normalized_content
        ):
            matched += 1

    return min(
        matched * 0.12,
        0.45,
    )


# =========================================================
# Priority Boost
# =========================================================

def _calculate_priority_boost(
    content: str,
    topic: str,
) -> float:
    keywords = TOPIC_PRIORITY_KEYWORDS.get(
        topic,
        set(),
    )

    if not keywords:
        return 0.0

    normalized = (
        content
        .replace(" ", "")
        .lower()
    )

    matched = 0

    for keyword in keywords:
        normalized_keyword = (
            keyword
            .replace(" ", "")
            .lower()
        )

        if (
            normalized_keyword
            in normalized
        ):
            matched += 1

    return min(
        matched * 0.05,
        0.25,
    )


# =========================================================
# Relevance Score
# =========================================================

def _calculate_relevance_score(
    item: dict[str, Any],
    topic: str,
    metric_statuses: dict[str, Any] | None = None,
) -> float:
    """
    Vector similarity와 keyword score를 결합한다.

    높은 값일수록 관련성이 높다.
    """

    distance = float(
        item.get(
            "distance",
            MAX_DISTANCE,
        )
    )

    vector_score = (
        1.0
        / (
            1.0
            + distance
        )
    )

    content = str(
        item.get(
            "content",
            "",
        )
    )

    keyword_score = (
        _calculate_keyword_score(
            content=content,
            topic=topic,
            metric_statuses=metric_statuses,
        )
    )

    negative_penalty = (
        _calculate_negative_penalty(
            content=content,
            topic=topic,
        )
    )

    priority_boost = (
        _calculate_priority_boost(
            content=content,
            topic=topic,
        )
    )

    score = (
        vector_score * 0.6
        + keyword_score * 0.4
        + priority_boost
        - negative_penalty
    )

    return max(
        score,
        0.0,
    )


# =========================================================
# Candidate 중복 제거
# =========================================================

def _deduplicate_candidates(
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    multi-query 검색으로 같은 chunk가 여러 번
    검색되는 경우 중복을 제거한다.

    동일 chunk가 여러 query에서 검색되면
    distance가 더 작은 결과를 유지한다.
    """

    deduplicated: dict[
        tuple[str, str, int | None],
        dict[str, Any],
    ] = {}

    for item in candidates:
        key = (
            str(
                item.get(
                    "source_org"
                )
            ),
            str(
                item.get(
                    "title"
                )
            ),
            item.get(
                "chunk_index"
            ),
        )

        existing = (
            deduplicated.get(
                key
            )
        )

        if existing is None:
            deduplicated[
                key
            ] = item
            continue

        try:
            current_distance = float(
                item.get(
                    "distance",
                    999.0,
                )
            )

            existing_distance = float(
                existing.get(
                    "distance",
                    999.0,
                )
            )

            if (
                current_distance
                < existing_distance
            ):
                deduplicated[
                    key
                ] = item

        except (
            TypeError,
            ValueError,
        ):
            continue

    return list(
        deduplicated.values()
    )


# =========================================================
# Reranking
# =========================================================

def _rerank_results(
    results: list[dict[str, Any]],
    topic: str,
    metric_statuses: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    후보를 공식 출처 검증 + distance filtering +
    status-aware relevance 기준으로 재정렬한다.
    """

    scored_results: list[
        dict[str, Any]
    ] = []

    for item in results:

        if not _is_valid_result(
            item
        ):
            continue

        if not _passes_distance_threshold(
            item
        ):
            continue

        relevance_score = (
            _calculate_relevance_score(
                item=item,
                topic=topic,
                metric_statuses=metric_statuses,
            )
        )

        if (
            relevance_score
            < MIN_RELEVANCE_SCORE
        ):
            continue

        scored_results.append(
            {
                **item,
                "relevance_score": (
                    relevance_score
                ),
            }
        )

    scored_results.sort(
        key=lambda item: item[
            "relevance_score"
        ],
        reverse=True,
    )

    return scored_results[
        :TOP_K_PER_TOPIC
    ]


# =========================================================
# Topic 검색
# =========================================================

def _search_topic(
    topic: str,
    metric_statuses: dict[str, Any],
) -> tuple[
    list[str],
    list[dict[str, Any]],
]:
    """
    topic에 필요한 query를 실행한다.

    glucose:
        status별 multiple vector search

    그 외:
        topic 기본 query 한 번

    반환:
        실행한 query 목록
        중복 제거된 후보 목록
    """

    queries = (
        _build_topic_queries(
            topic=topic,
            metric_statuses=metric_statuses,
        )
    )

    all_candidates: list[
        dict[str, Any]
    ] = []

    for query in queries:

        if topic == "glucose":
            n_results = (
                CANDIDATES_PER_STATUS_QUERY
            )
        else:
            n_results = (
                CANDIDATES_PER_TOPIC
            )

        results = (
            rag_vector_store.search(
                query=query,
                n_results=n_results,
                topic=topic,
            )
        )

        all_candidates.extend(
            results
        )

    deduplicated = (
        _deduplicate_candidates(
            all_candidates
        )
    )

    return (
        queries,
        deduplicated,
    )


# =========================================================
# LangGraph RAG Node
# =========================================================

async def rag_node(
    state: AnalysisGraphState,
) -> AnalysisGraphState:
    """
    Rule Engine 상태를 기반으로

    topic 선택
    → status별 query 생성
    → topic-filtered vector search
    → 후보 병합
    → dedup
    → reranking
    → LLM RAG context 생성
    """

    warnings = state.get(
        "warnings",
        [],
    ).copy()

    merged_analysis = state.get(
        "merged_analysis",
        {},
    )

    metric_statuses = (
        merged_analysis.get(
            "metric_statuses",
            {},
        )
    )

    if not isinstance(
        metric_statuses,
        dict,
    ):
        metric_statuses = {}

    topics = select_health_topics(
        metric_statuses
    )

    if not topics:
        warnings.append(
            "RAG 검색 대상 건강 주제가 없습니다."
        )

        return {
            "rag_context": [],
            "warnings": warnings,
        }

    rag_context: list[
        dict[str, Any]
    ] = []

    seen_chunks: set[
        tuple[
            str,
            str,
            int | None,
        ]
    ] = set()

    try:

        for topic in topics:

            _, candidates = (
                _search_topic(
                    topic=topic,
                    metric_statuses=metric_statuses,
                )
            )

            results = (
                _rerank_results(
                    results=candidates,
                    topic=topic,
                    metric_statuses=metric_statuses,
                )
            )

            for item in results:

                source_org = item.get(
                    "source_org"
                )

                title = item.get(
                    "title"
                )

                chunk_index = item.get(
                    "chunk_index"
                )

                dedup_key = (
                    str(source_org),
                    str(title),
                    chunk_index,
                )

                if (
                    dedup_key
                    in seen_chunks
                ):
                    continue

                seen_chunks.add(
                    dedup_key
                )

                rag_context.append(
                    {
                        "topic": topic,
                        "content": item.get(
                            "content",
                            "",
                        ),
                        "source_org": (
                            source_org
                        ),
                        "title": title,
                        "document_type": (
                            item.get(
                                "document_type"
                            )
                        ),
                        "published_year": (
                            item.get(
                                "published_year"
                            )
                        ),
                        "url": item.get(
                            "url"
                        ),
                        "distance": (
                            item.get(
                                "distance"
                            )
                        ),
                        "relevance_score": (
                            item.get(
                                "relevance_score"
                            )
                        ),
                    }
                )

    except Exception:
        logger.exception(
            "RAG search failed"
        )

        warnings.append(
            "RAG 검색 중 오류가 발생했습니다."
        )

        return {
            "rag_context": [],
            "warnings": warnings,
        }

    if not rag_context:
        warnings.append(
            "검증된 공식 RAG 근거를 찾지 못했습니다."
        )

    return {
        "rag_context": rag_context,
        "warnings": warnings,
    }


# =========================================================
# Debug Search
# =========================================================

def debug_rag_search(
    metric_statuses: dict[str, Any],
) -> dict[str, Any]:
    """
    RAG 검색 품질 확인용 디버그 함수.

    원본 검사 수치가 아니라
    Rule Engine status만 사용한다.
    """

    topics = select_health_topics(
        metric_statuses
    )

    debug_results: dict[
        str,
        Any,
    ] = {}

    for topic in topics:

        queries, candidates = (
            _search_topic(
                topic=topic,
                metric_statuses=metric_statuses,
            )
        )

        selected_results = (
            _rerank_results(
                results=candidates,
                topic=topic,
                metric_statuses=metric_statuses,
            )
        )

        selected_keys = {
            (
                str(
                    item.get(
                        "source_org"
                    )
                ),
                str(
                    item.get(
                        "title"
                    )
                ),
                item.get(
                    "chunk_index"
                ),
            )
            for item in selected_results
        }

        debug_items: list[
            dict[str, Any]
        ] = []

        for item in candidates:

            content = str(
                item.get(
                    "content",
                    "",
                )
            )

            keyword_score = (
                _calculate_keyword_score(
                    content=content,
                    topic=topic,
                    metric_statuses=metric_statuses,
                )
            )

            relevance_score = (
                _calculate_relevance_score(
                    item=item,
                    topic=topic,
                    metric_statuses=metric_statuses,
                )
            )

            key = (
                str(
                    item.get(
                        "source_org"
                    )
                ),
                str(
                    item.get(
                        "title"
                    )
                ),
                item.get(
                    "chunk_index"
                ),
            )

            debug_items.append(
                {
                    "content_preview": (
                        content[:300]
                    ),
                    "source_org": (
                        item.get(
                            "source_org"
                        )
                    ),
                    "title": (
                        item.get(
                            "title"
                        )
                    ),
                    "topic": (
                        item.get(
                            "topic"
                        )
                    ),
                    "chunk_index": (
                        item.get(
                            "chunk_index"
                        )
                    ),
                    "distance": (
                        item.get(
                            "distance"
                        )
                    ),
                    "keyword_score": (
                        keyword_score
                    ),
                    "relevance_score": (
                        relevance_score
                    ),
                    "selected": (
                        key
                        in selected_keys
                    ),
                }
            )

        # 기존 schema의 query: str 구조를 유지하기 위해
        # 여러 query는 구분자로 합쳐서 표시
        debug_query = (
            " || ".join(
                queries
            )
        )

        debug_results[
            topic
        ] = {
            "topic": topic,
            "query": debug_query,
            "candidate_count": len(
                candidates
            ),
            "selected_count": len(
                selected_results
            ),
            "results": debug_items,
        }

    return {
        "topics": topics,
        "results": debug_results,
    }
