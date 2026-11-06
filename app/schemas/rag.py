from typing import Any

from pydantic import BaseModel, Field


class RAGDebugRequest(BaseModel):
    metric_statuses: dict[str, str] = Field(
        default_factory=dict
    )


class RAGDebugItem(BaseModel):
    content_preview: str
    source_org: str | None = None
    title: str | None = None
    topic: str | None = None
    chunk_index: int | None = None
    distance: float | None = None
    keyword_score: float | None = None
    relevance_score: float | None = None
    selected: bool = False


class RAGDebugTopicResult(BaseModel):
    topic: str
    query: str
    candidate_count: int
    selected_count: int
    results: list[RAGDebugItem] = Field(
        default_factory=list
    )


class RAGDebugResponse(BaseModel):
    topics: list[str] = Field(
        default_factory=list
    )
    results: dict[
        str,
        RAGDebugTopicResult,
    ] = Field(
        default_factory=dict
    )