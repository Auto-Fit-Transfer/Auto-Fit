from pydantic import BaseModel, Field


class RAGDocumentMetadata(BaseModel):
    source_org: str

    title: str

    document_type: str

    published_year: int | None = None

    url: str | None = None

    verified: bool = True

    language: str = "ko"

    topic: str | None = None


class RAGDocument(BaseModel):
    content: str = Field(
        min_length=1,
    )

    metadata: RAGDocumentMetadata