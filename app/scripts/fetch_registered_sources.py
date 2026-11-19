from pathlib import Path
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.rag.source_registry import (
    HEALTH_RAG_SOURCES,
)


OUTPUT_BASE_DIR = Path(
    "data/rag_sources"
)

REQUEST_TIMEOUT = 30.0


def is_http_url(
    url: str | None,
) -> bool:
    if not url:
        return False

    parsed = urlparse(
        url
    )

    return parsed.scheme in {
        "http",
        "https",
    }


def is_pdf_source(
    source: dict,
) -> bool:
    """
    PDF 문서는 이번 HTML 수집기에서 제외한다.
    """

    source_type = source.get(
        "source_type"
    )

    if source_type == "pdf":
        return True

    url = source.get(
        "url",
        "",
    )

    return str(url).lower().endswith(
        ".pdf"
    )


def clean_html_text(
    html: str,
    content_selector: str | None = None,
) -> str:
    """
    HTML에서 RAG용 텍스트를 추출한다.

    content_selector가 지정되어 있으면 우선 사용하고,
    없거나 selector 결과가 너무 짧으면 전체 body에서 추출한다.
    """

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    # 실행/스타일 계열 제거
    for tag in soup(
        [
            "script",
            "style",
            "noscript",
            "svg",
            "iframe",
        ]
    ):
        tag.decompose()

    target = None

    if content_selector:
        target = soup.select_one(
            content_selector
        )

    # selector가 없거나 너무 작은 영역이면
    # 전체 body를 fallback으로 사용
    if target is None:
        target = (
            soup.body
            or soup
        )

    text = target.get_text(
        separator="\n",
        strip=True,
    )

    cleaned_lines: list[str] = []

    # 국가건강정보포털 공통 UI에서
    # 반복되는 짧은 메뉴 문구를 일부 제거
    ignored_exact_lines = {
        "본문으로 바로가기",
        "주메뉴 바로가기",
        "로그인",
        "사이트맵",
        "건강정보",
        "알림정보",
        "소개마당",
        "닫기",
        "검색",
    }

    previous_line: str | None = None

    for line in text.splitlines():

        cleaned = " ".join(
            line.split()
        )

        if not cleaned:
            continue

        if cleaned in ignored_exact_lines:
            continue

        # 같은 메뉴 문구가 연속 반복될 경우 제거
        if cleaned == previous_line:
            continue

        cleaned_lines.append(
            cleaned
        )

        previous_line = cleaned

    cleaned_text = "\n".join(
        cleaned_lines
    )

    return cleaned_text


def fetch_html(
    url: str,
) -> str:
    """
    공식 사이트 HTML을 가져온다.

    한국 웹사이트에서 잘못된 charset header가
    전달되는 경우가 있어 UTF-8을 우선 사용한다.
    """

    headers = {
        "User-Agent": (
            "Auto-Fit-Health-RAG/1.0 "
            "(educational project)"
        ),
        "Accept-Language": (
            "ko-KR,ko;q=0.9,en;q=0.8"
        ),
    }

    with httpx.Client(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
        headers=headers,
    ) as client:

        response = client.get(
            url
        )

        response.raise_for_status()

        raw = response.content

        # 1순위: UTF-8
        try:
            return raw.decode(
                "utf-8"
            )

        except UnicodeDecodeError:
            pass

        # 2순위: CP949
        try:
            return raw.decode(
                "cp949"
            )

        except UnicodeDecodeError:
            pass

        # 최후 fallback
        return raw.decode(
            "utf-8",
            errors="replace",
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


def fetch_source(
    source_id: str,
    source: dict,
) -> Path:
    """
    Registry 한 건을 다운로드하고
    정제한 뒤 txt 파일로 저장한다.
    """

    if source.get(
        "enabled"
    ) is not True:
        raise ValueError(
            "비활성화된 source입니다."
        )

    url = source.get(
        "url"
    )

    if not is_http_url(
        url
    ):
        raise ValueError(
            "유효한 URL이 없습니다."
        )

    if is_pdf_source(
        source
    ):
        raise ValueError(
            "PDF source는 HTML 수집기에서 처리하지 않습니다."
        )

    print(
        f"  URL: {url}",
        flush=True,
    )

    html = fetch_html(
        url
    )

    content_selector = (
        source.get(
            "content_selector"
        )
    )

    text = clean_html_text(
        html=html,
        content_selector=content_selector,
    )

    if len(text) < 100:
        raise ValueError(
            "추출된 본문이 너무 짧습니다."
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


def main() -> None:
    print(
        "[START] Fetch registered health sources",
        flush=True,
    )

    success = 0
    skipped = 0
    failed = 0

    for (
        source_id,
        source,
    ) in HEALTH_RAG_SOURCES.items():

        if source.get(
            "enabled"
        ) is not True:
            continue

        print(
            f"[PROCESS] {source_id}",
            flush=True,
        )

        # PDF는 별도 PDF 수집기에서 처리
        if is_pdf_source(
            source
        ):
            skipped += 1

            print(
                "[SKIP] PDF source",
                flush=True,
            )

            continue

        url = source.get(
            "url"
        )

        # HTML URL이 아직 없으면 실패가 아니라 SKIP
        if not url:
            skipped += 1

            print(
                "[SKIP] HTML URL이 등록되지 않았습니다.",
                flush=True,
            )

            continue

        try:
            output_path = fetch_source(
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
        "=== Fetch summary ===",
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