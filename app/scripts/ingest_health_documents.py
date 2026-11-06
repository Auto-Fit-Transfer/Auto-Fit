import json
from pathlib import Path

from app.rag.document_schema import (
    RAGDocument,
    RAGDocumentMetadata,
)
from app.rag.rag_ingestion_service import (
    ingest_document,
)


BASE_DIR = Path(
    "data/rag_documents"
)


ALLOWED_TOPICS = {
    "obesity",
    "blood_pressure",
    "glucose",
    "lipid",
    "liver",
    "kidney",
    "exercise",
    "nutrition",
}


def load_json_document(
    file_path: Path,
) -> RAGDocument:
    """
    JSON 파일을 읽어서 RAGDocument로 변환한다.
    """

    with file_path.open(
        "r",
        encoding="utf-8-sig",
    ) as file:
        raw = json.load(file)

    content = raw.get(
        "content",
        "",
    )

    metadata_raw = raw.get(
        "metadata",
        {},
    )

    topic = metadata_raw.get(
        "topic"
    )

    if topic not in ALLOWED_TOPICS:
        raise ValueError(
            f"허용되지 않은 topic입니다: {topic}"
        )

    metadata = RAGDocumentMetadata(
        source_org=metadata_raw[
            "source_org"
        ],
        title=metadata_raw[
            "title"
        ],
        document_type=metadata_raw[
            "document_type"
        ],
        published_year=metadata_raw.get(
            "published_year"
        ),
        url=metadata_raw.get(
            "url"
        ),
        verified=metadata_raw.get(
            "verified",
            False,
        ),
        language=metadata_raw.get(
            "language",
            "ko",
        ),
        topic=topic,
    )

    return RAGDocument(
        content=content,
        metadata=metadata,
    )


def find_document_files() -> list[Path]:
    """
    data/rag_documents 아래의 JSON 파일 목록을 반환한다.
    """

    if not BASE_DIR.exists():
        return []

    return sorted(
        BASE_DIR.rglob(
            "*.json"
        )
    )


def ingest_file(
    file_path: Path,
) -> int:
    """
    문서 하나를 읽어서 Vector DB에 적재한다.
    """

    document = load_json_document(
        file_path
    )

    return ingest_document(
        document
    )


def main() -> None:
    print(
        "[START] Health RAG ingestion",
        flush=True,
    )

    files = find_document_files()

    print(
        f"[INFO] found documents: {len(files)}",
        flush=True,
    )

    if not files:
        print(
            "[INFO] 적재할 RAG 문서가 없습니다.",
            flush=True,
        )
        return

    total_documents = 0
    total_chunks = 0
    failed_documents = 0

    for file_path in files:
        print(
            f"[PROCESS] {file_path}",
            flush=True,
        )

        try:
            stored_count = ingest_file(
                file_path
            )

            total_documents += 1
            total_chunks += stored_count

            print(
                f"[OK] {file_path} -> "
                f"{stored_count} chunks",
                flush=True,
            )

        except Exception as exc:
            failed_documents += 1

            print(
                f"[FAIL] {file_path} -> "
                f"{type(exc).__name__}: {exc}",
                flush=True,
            )

    print(
        "\n=== Health RAG ingestion summary ===",
        flush=True,
    )

    print(
        f"documents: {total_documents}",
        flush=True,
    )

    print(
        f"chunks: {total_chunks}",
        flush=True,
    )

    print(
        f"failed: {failed_documents}",
        flush=True,
    )


if __name__ == "__main__":
    main()