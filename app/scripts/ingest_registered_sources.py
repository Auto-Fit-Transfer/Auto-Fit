from pathlib import Path

from app.rag.document_schema import (
    RAGDocument,
    RAGDocumentMetadata,
)
from app.rag.rag_ingestion_service import (
    ingest_document,
)
from app.rag.source_registry import (
    HEALTH_RAG_SOURCES,
)


BASE_DIR = Path(
    "data/rag_sources"
)

# 너무 짧은 HTML 껍데기/메뉴 페이지가
# RAG에 들어가는 것을 방지
MIN_DOCUMENT_LENGTH = 1000


def find_source_config(
    source_id: str,
) -> dict | None:
    """
    source_id 기준으로 Registry 설정을 찾는다.
    """

    source_config = HEALTH_RAG_SOURCES.get(
        source_id
    )

    if source_config is None:
        return None

    if not isinstance(
        source_config,
        dict,
    ):
        return None

    if source_config.get(
        "enabled"
    ) is not True:
        return None

    return source_config


def load_text_file(
    file_path: Path,
) -> str:
    """
    UTF-8 / UTF-8 BOM 텍스트 파일을 읽는다.
    """

    return file_path.read_text(
        encoding="utf-8-sig"
    ).strip()


def validate_document_length(
    content: str,
    source_id: str,
) -> None:
    """
    비정상적으로 짧은 문서가
    Vector DB에 들어가는 것을 방지한다.
    """

    content_length = len(
        content
    )

    if content_length < MIN_DOCUMENT_LENGTH:
        raise ValueError(
            f"문서 본문이 너무 짧습니다: "
            f"source_id={source_id}, "
            f"length={content_length}, "
            f"minimum={MIN_DOCUMENT_LENGTH}"
        )


def build_document(
    file_path: Path,
) -> RAGDocument:
    """
    txt 파일명 → source_id
    폴더명 → topic

    Registry metadata와 결합하여
    RAGDocument를 생성한다.
    """

    source_id = file_path.stem

    source_config = find_source_config(
        source_id
    )

    if source_config is None:
        raise ValueError(
            "등록되지 않았거나 비활성화된 "
            f"source_id입니다: {source_id}"
        )

    directory_topic = (
        file_path.parent.name
    )

    registry_topic = (
        source_config.get(
            "topic"
        )
    )

    if not isinstance(
        registry_topic,
        str,
    ):
        raise ValueError(
            "Registry topic이 올바르지 않습니다: "
            f"{source_id}"
        )

    if directory_topic != registry_topic:
        raise ValueError(
            "파일의 topic 폴더와 Registry topic이 "
            "일치하지 않습니다. "
            f"folder={directory_topic}, "
            f"registry={registry_topic}"
        )

    content = load_text_file(
        file_path
    )

    if not content:
        raise ValueError(
            "문서 내용이 비어 있습니다."
        )

    validate_document_length(
        content=content,
        source_id=source_id,
    )

    metadata = RAGDocumentMetadata(
        source_org=source_config[
            "source_org"
        ],
        title=source_config[
            "title"
        ],
        document_type=source_config[
            "document_type"
        ],
        published_year=source_config.get(
            "published_year"
        ),

        # 사용자에게 보여줄 출처는
        # PDF 직접 다운로드 URL보다 공식 페이지 우선
        url=(
            source_config.get(
                "page_url"
            )
            or source_config.get(
                "url"
            )
        ),

        verified=source_config.get(
            "verified",
            False,
        ),
        language=source_config.get(
            "language",
            "ko",
        ),
        topic=registry_topic,
    )

    return RAGDocument(
        content=content,
        metadata=metadata,
    )


def find_source_files() -> list[Path]:
    """
    data/rag_sources 아래의 모든 txt 파일을 찾는다.
    """

    if not BASE_DIR.exists():
        return []

    return sorted(
        BASE_DIR.rglob(
            "*.txt"
        )
    )


def main() -> None:
    print(
        "[START] Registered Health RAG ingestion",
        flush=True,
    )

    files = find_source_files()

    print(
        f"[INFO] found source files: {len(files)}",
        flush=True,
    )

    if not files:
        print(
            "[INFO] 적재할 공식 RAG 문서가 없습니다.",
            flush=True,
        )
        return

    success = 0
    skipped = 0
    failed = 0
    total_chunks = 0

    for file_path in files:

        print(
            f"[PROCESS] {file_path}",
            flush=True,
        )

        source_id = (
            file_path.stem
        )

        # 예전 테스트 파일 등
        # Registry에 존재하지 않는 파일은 건너뜀
        if source_id not in HEALTH_RAG_SOURCES:
            skipped += 1

            print(
                "[SKIP] Registry에 없는 "
                f"source_id: {source_id}",
                flush=True,
            )

            continue

        source_config = HEALTH_RAG_SOURCES.get(
            source_id
        )

        if not isinstance(
            source_config,
            dict,
        ):
            skipped += 1

            print(
                "[SKIP] 잘못된 Registry 설정: "
                f"{source_id}",
                flush=True,
            )

            continue

        if source_config.get(
            "enabled"
        ) is not True:
            skipped += 1

            print(
                "[SKIP] 비활성화된 source: "
                f"{source_id}",
                flush=True,
            )

            continue

        try:
            # embedding 전에 먼저 길이를 보여준다.
            raw_content = load_text_file(
                file_path
            )

            print(
                f"[INFO] document length: "
                f"{len(raw_content)} chars",
                flush=True,
            )

            document = build_document(
                file_path
            )

            stored_count = ingest_document(
                document
            )

            success += 1
            total_chunks += stored_count

            print(
                f"[OK] {file_path} "
                f"-> {stored_count} chunks",
                flush=True,
            )

        except Exception as exc:
            failed += 1

            print(
                f"[FAIL] {file_path} "
                f"-> {type(exc).__name__}: {exc}",
                flush=True,
            )

    print()
    print(
        "=== Registered Health RAG summary ===",
        flush=True,
    )

    print(
        f"documents: {success}",
        flush=True,
    )

    print(
        f"chunks: {total_chunks}",
        flush=True,
    )

    print(
        f"skipped: {skipped}",
        flush=True,
    )

    print(
        f"failed: {failed}",
        flush=True,
    )


if __name__ == "__main__":
    main()