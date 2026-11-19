import re

from pathlib import Path

import httpx
from pypdf import PdfReader

from app.rag.source_registry import (
    HEALTH_RAG_SOURCES,
)


OUTPUT_BASE_DIR = Path(
    "data/rag_sources"
)

TEMP_DIR = Path(
    "data/rag_temp"
)

REQUEST_TIMEOUT = 60.0


def is_pdf_source(
    source: dict,
) -> bool:
    return (
        source.get("source_type") == "pdf"
    )


def build_output_path(
    source_id: str,
    source: dict,
) -> Path:
    topic = source[
        "topic"
    ]

    directory = (
        OUTPUT_BASE_DIR
        / topic
    )

    directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    return (
        directory
        / f"{source_id}.txt"
    )


def download_pdf(
    url: str,
    source_id: str,
) -> Path:
    TEMP_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    pdf_path = (
        TEMP_DIR
        / f"{source_id}.pdf"
    )

    headers = {
        "User-Agent": (
            "Auto-Fit-Health-RAG/1.0 "
            "(educational project)"
        )
    }

    with httpx.Client(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
        headers=headers,
    ) as client:

        url = normalize_pdf_url(
            url
        )

        response = client.get(
            url
        )

        response.raise_for_status()

        content_type = response.headers.get(
            "content-type",
            "",
        ).lower()

        if (
            "pdf" not in content_type
            and not response.content.startswith(b"%PDF")
        ):
            raise ValueError(
                "다운로드 결과가 PDF가 아닙니다."
            )

        pdf_path.write_bytes(
            response.content
        )

    return pdf_path


def extract_pdf_text(
    pdf_path: Path,
) -> str:
    """
    PDF에서 텍스트를 추출한다.

    텍스트 기반 PDF만 처리한다.
    스캔 이미지 PDF는 별도 OCR이 필요하다.
    """

    reader = PdfReader(
        str(pdf_path)
    )

    pages: list[str] = []

    for page in reader.pages:

        text = page.extract_text()

        if text:
            cleaned = text.strip()

            if cleaned:
                pages.append(
                    cleaned
                )

    return "\n\n".join(
        pages
    )


def fetch_pdf_source(
    source_id: str,
    source: dict,
) -> Path:
    url = source.get(
        "url"
    )

    if not url:
        raise ValueError(
            "PDF URL이 없습니다."
        )

    pdf_path = download_pdf(
        url=url,
        source_id=source_id,
    )

    text = extract_pdf_text(
        pdf_path
    )

    if len(text) < 200:
        raise ValueError(
            "PDF에서 충분한 텍스트를 추출하지 못했습니다."
        )

    output_path = build_output_path(
        source_id,
        source,
    )

    output_path.write_text(
        text,
        encoding="utf-8",
    )

    return output_path

def normalize_pdf_url(
    url: str,
) -> str:
    """
    Google Drive 공유 링크면
    직접 다운로드 URL로 변환한다.
    """

    if "drive.google.com/file/d/" in url:
        match = re.search(
            r"/file/d/([^/]+)",
            url,
        )

        if match:
            file_id = match.group(1)

            return (
                "https://drive.google.com/"
                f"uc?export=download&id={file_id}"
            )

    return url


def main() -> None:
    print(
        "[START] Fetch PDF health sources",
        flush=True,
    )

    success = 0
    skipped = 0
    failed = 0

    for (
        source_id,
        source,
    ) in HEALTH_RAG_SOURCES.items():

        # 비활성화 소스는 무시
        if source.get(
            "enabled"
        ) is not True:
            continue

        # PDF 소스만 처리
        if source.get(
            "source_type"
        ) != "pdf":
            continue

        print(
            f"[PROCESS] {source_id}",
            flush=True,
        )

        url = source.get(
            "url"
        )

        # PDF 직접 URL이 아직 없으면 실패가 아니라 SKIP
        if not url:
            skipped += 1

            print(
                "[SKIP] PDF direct URL이 등록되지 않았습니다.",
                flush=True,
            )

            continue

        try:
            output_path = fetch_pdf_source(
                source_id,
                source,
            )

            success += 1

            print(
                f"[OK] {output_path}",
                flush=True,
            )

        except Exception as exc:
            failed += 1

            print(
                f"[FAIL] "
                f"{type(exc).__name__}: {exc}",
                flush=True,
            )

    print()
    print(
        "=== PDF Fetch summary ===",
        flush=True,
    )

    print(
        f"success: {success}",
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