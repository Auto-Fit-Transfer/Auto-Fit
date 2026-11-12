from __future__ import annotations

import argparse
import asyncio
import csv
import gzip
import hashlib
import json
import re
import xml.etree.ElementTree as ElementTree
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.core.config import get_settings
from app.services.durunubi_course_service import (
    DurunubiCourseService,
)
from app.services.food_catalog_service import (
    FoodCatalogService,
    PUBLIC_DATA_API_URL,
)
from app.services.local_specialty_service import NONGSARO_LOCAL_SPECIALTY_URL
from app.services.public_running_course_service import (
    PublicRunningCourseService,
)
from app.services.recipe_service import FOOD_SAFETY_RECIPE_BASE_URL


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SNAPSHOT_ROOT = PROJECT_ROOT / "data" / "external_source_data"
KST = ZoneInfo("Asia/Seoul")

PUBLIC_SOURCE_PAGES = {
    "food_nutrition": (
        "https://www.data.go.kr/data/15100064/standard.do"
    ),
    "official_recipes": (
        "https://www.foodsafetykorea.go.kr/api/openApiInfo.do"
        "?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10"
        "&start_idx=1&svc_no=COOKRCP01"
    ),
    "local_specialties": (
        "https://www.nongsaro.go.kr/portal/ps/psz/psza/"
        "contentMain.ps?menuId=PS00191"
    ),
    "public_running_courses": (
        "https://www.data.go.kr/data/15017321/standard.do"
    ),
    "durunubi": (
        "https://www.data.go.kr/data/15101974/openapi.do"
    ),
}


def _now_iso() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def _default_output_directory() -> Path:
    timestamp = datetime.now(KST).strftime("%Y%m%d_%H%M%S_KST")
    return DEFAULT_SNAPSHOT_ROOT / timestamp


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _atomic_write_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_bytes(content)
    temporary_path.replace(path)


def _write_json(path: Path, value: Any) -> None:
    content = json.dumps(
        value,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ).encode("utf-8")
    _atomic_write_bytes(path, content)


def _csv_cell(value: Any) -> Any:
    if isinstance(value, (list, tuple, dict)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return value


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(
        dict.fromkeys(
            key
            for row in rows
            for key in row
        )
    )
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    with temporary_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(
            {
                key: _csv_cell(row.get(key))
                for key in fieldnames
            }
            for row in rows
        )
    temporary_path.replace(path)


def _file_metadata(snapshot_root: Path, path: Path) -> dict[str, Any]:
    content = path.read_bytes()
    return {
        "path": path.relative_to(snapshot_root).as_posix(),
        "bytes": len(content),
        "sha256": _sha256_bytes(content),
    }


def _decode_csv(content: bytes) -> str:
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise RuntimeError("COOKRCP01 CSV encoding is not supported.")


def _count_csv_rows(text: str) -> int:
    return sum(1 for _ in csv.DictReader(text.splitlines()))


def _verify_existing_source_data(source_root: Path) -> dict[str, Any]:
    manifest_path = source_root / "source_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    file_references: list[dict[str, Any]] = []
    for dataset in manifest.get("datasets", []):
        file_references.extend(dataset.get("files", []))
        file_references.extend(dataset.get("raw_page_files", []))

    for reference in file_references:
        path = source_root / reference["path"]
        content = path.read_bytes()
        if len(content) != reference["bytes"]:
            raise RuntimeError(f"File size mismatch: {reference['path']}")
        if _sha256_bytes(content) != reference["sha256"]:
            raise RuntimeError(f"SHA-256 mismatch: {reference['path']}")

    expected_counts = {
        dataset["dataset"]: dataset.get("record_count")
        for dataset in manifest.get("datasets", [])
        if dataset.get("record_count") is not None
    }
    actual_counts = {
        "전국통합식품영양성분정보표준데이터": len(
            json.loads(
                (
                    source_root
                    / "food_nutrition"
                    / "food_nutrition_source_full.json"
                ).read_text(encoding="utf-8")
            )
        ),
        "농촌진흥청 농사로 지역특산물": len(
            json.loads(
                (
                    source_root
                    / "local_specialties"
                    / "local_specialties_source_full.json"
                ).read_text(encoding="utf-8")
            )
        ),
        "전국길관광정보표준데이터": len(
            json.loads(
                (
                    source_root
                    / "public_running_courses"
                    / "public_running_courses_source_full.json"
                ).read_text(encoding="utf-8")
            )
        ),
    }
    recipe_content = gzip.decompress(
        (
            source_root
            / "official_recipes"
            / "COOKRCP01.csv.gz"
        ).read_bytes()
    )
    actual_counts[
        "식품안전나라 COOKRCP01 조리식품의 레시피 DB"
    ] = _count_csv_rows(_decode_csv(recipe_content))

    for dataset_name, actual_count in actual_counts.items():
        expected_count = expected_counts.get(dataset_name)
        if expected_count != actual_count:
            raise RuntimeError(
                f"Record count mismatch: {dataset_name} "
                f"expected={expected_count} actual={actual_count}"
            )

    settings = get_settings()
    secret_values = [
        value.encode("utf-8")
        for value in (
            settings.public_data_service_key,
            settings.food_safety_recipe_api_key,
            settings.nongsaro_api_key,
        )
        if value
    ]
    for path in source_root.rglob("*"):
        if not path.is_file():
            continue
        content = path.read_bytes()
        if any(secret in content for secret in secret_values):
            raise RuntimeError(
                "A configured API key was found in downloaded output."
            )

    files = [path for path in source_root.rglob("*") if path.is_file()]
    return {
        "verified_file_references": len(file_references),
        "record_counts": actual_counts,
        "secret_hits": 0,
        "total_files": len(files),
        "total_bytes": sum(path.stat().st_size for path in files),
    }


async def _download_food_nutrition(
    snapshot_root: Path,
) -> dict[str, Any]:
    settings = get_settings()
    service_key = settings.public_data_service_key
    if not service_key or not service_key.strip():
        raise RuntimeError("PUBLIC_DATA_SERVICE_KEY is not configured.")

    service = FoodCatalogService()
    raw_rows: list[dict[str, Any]] = []
    raw_page_files: list[dict[str, Any]] = []
    page_size = 1000
    page_no = 1
    directory = snapshot_root / "food_nutrition"
    async with httpx.AsyncClient(timeout=60.0) as client:
        while page_no <= 1000:
            response = await client.get(
                PUBLIC_DATA_API_URL,
                params={
                    "serviceKey": service_key.strip(),
                    "pageNo": page_no,
                    "numOfRows": page_size,
                    "type": "json",
                },
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise RuntimeError("Food API returned invalid JSON data.")

            page_path = directory / "raw_pages" / f"page_{page_no:04d}.json"
            _write_json(page_path, payload)
            raw_page_files.append(_file_metadata(snapshot_root, page_path))

            header = payload.get("header") or {}
            if header.get("resultCode") != "00":
                raise RuntimeError(
                    "Food API error: "
                    f"{header.get('resultMsg') or 'unknown error'}"
                )
            items_container = (payload.get("body") or {}).get("items") or {}
            items = (
                items_container.get("item") or []
                if isinstance(items_container, dict)
                else items_container
            )
            if isinstance(items, dict):
                items = [items]
            if not isinstance(items, list):
                raise RuntimeError("Food API returned invalid items.")
            valid_items = [item for item in items if isinstance(item, dict)]
            raw_rows.extend(valid_items)
            if len(valid_items) < page_size:
                break
            page_no += 1

    normalized_rows = [service.normalize_food(row) for row in raw_rows]

    raw_path = directory / "food_nutrition_source_full.json"
    raw_csv_path = directory / "food_nutrition_source_full.csv"
    normalized_json_path = directory / "food_nutrition_normalized.json"
    normalized_csv_path = directory / "food_nutrition_normalized.csv"
    _write_json(raw_path, raw_rows)
    _write_csv(raw_csv_path, raw_rows)
    _write_json(normalized_json_path, normalized_rows)
    _write_csv(normalized_csv_path, normalized_rows)

    return {
        "dataset": "전국통합식품영양성분정보표준데이터",
        "source": PUBLIC_SOURCE_PAGES["food_nutrition"],
        "status": "complete",
        "record_count": len(raw_rows),
        "downloaded_at": _now_iso(),
        "files": [
            _file_metadata(snapshot_root, raw_path),
            _file_metadata(snapshot_root, raw_csv_path),
            _file_metadata(snapshot_root, normalized_json_path),
            _file_metadata(snapshot_root, normalized_csv_path),
        ],
        "raw_page_files": raw_page_files,
    }


async def _download_official_recipes(
    snapshot_root: Path,
) -> dict[str, Any]:
    settings = get_settings()
    api_key = settings.food_safety_recipe_api_key
    if not api_key or not api_key.strip():
        raise RuntimeError("FOOD_SAFETY_RECIPE_API_KEY is not configured.")

    endpoint = (
        f"{FOOD_SAFETY_RECIPE_BASE_URL}/"
        f"{api_key.strip()}/COOKRCP01/file"
    )
    async with httpx.AsyncClient(
        timeout=120.0,
        follow_redirects=True,
    ) as client:
        response = await client.get(endpoint)
        response.raise_for_status()

    compressed = response.content
    if not compressed.startswith(b"\x1f\x8b"):
        raise RuntimeError("COOKRCP01 file endpoint did not return gzip data.")

    csv_bytes = gzip.decompress(compressed)
    csv_text = _decode_csv(csv_bytes)
    record_count = _count_csv_rows(csv_text)

    directory = snapshot_root / "official_recipes"
    gzip_path = directory / "COOKRCP01.csv.gz"
    csv_path = directory / "COOKRCP01.utf8.csv"
    _atomic_write_bytes(gzip_path, compressed)
    _atomic_write_bytes(csv_path, csv_text.encode("utf-8-sig"))

    return {
        "dataset": "식품안전나라 COOKRCP01 조리식품의 레시피 DB",
        "source": PUBLIC_SOURCE_PAGES["official_recipes"],
        "status": "complete",
        "record_count": record_count,
        "downloaded_at": _now_iso(),
        "notes": "이미지는 바이너리가 아니라 원본 데이터의 URL만 포함합니다.",
        "files": [
            _file_metadata(snapshot_root, gzip_path),
            _file_metadata(snapshot_root, csv_path),
        ],
    }


async def _download_local_specialties(
    snapshot_root: Path,
) -> dict[str, Any]:
    settings = get_settings()
    api_key = settings.nongsaro_api_key
    if not api_key or not api_key.strip():
        raise RuntimeError("NONGSARO_API_KEY is not configured.")

    rows: list[dict[str, Any]] = []
    raw_page_files: list[dict[str, Any]] = []
    page_no = 1
    page_size = 100
    total_count: int | None = None
    directory = snapshot_root / "local_specialties"

    async with httpx.AsyncClient(timeout=60.0) as client:
        while page_no <= 1000:
            response = await client.get(
                NONGSARO_LOCAL_SPECIALTY_URL,
                params={
                    "apiKey": api_key.strip(),
                    "pageNo": page_no,
                    "numOfRows": page_size,
                },
            )
            response.raise_for_status()
            content = response.content
            page_path = directory / "raw_pages" / f"page_{page_no:04d}.xml"
            _atomic_write_bytes(page_path, content)
            raw_page_files.append(_file_metadata(snapshot_root, page_path))

            root = ElementTree.fromstring(content)
            result_code = root.findtext("./header/resultCode")
            if result_code != "00":
                raise RuntimeError(
                    "Nongsaro API error: "
                    f"{root.findtext('./header/resultMsg') or result_code}"
                )
            items_element = root.find("./body/items")
            page_rows: list[dict[str, Any]] = []
            if items_element is not None:
                for item in items_element.findall("item"):
                    page_rows.append(
                        {
                            child.tag: (child.text or "").strip()
                            for child in list(item)
                        }
                    )
                total_text = items_element.findtext("totalCount")
                if total_text:
                    total_count = int(total_text)

            rows.extend(page_rows)
            if not page_rows:
                break
            if total_count is not None and len(rows) >= total_count:
                break
            if total_count is None and len(page_rows) < page_size:
                break
            page_no += 1

    json_path = directory / "local_specialties_source_full.json"
    csv_path = directory / "local_specialties_source_full.csv"
    _write_json(json_path, rows)
    _write_csv(csv_path, rows)

    return {
        "dataset": "농촌진흥청 농사로 지역특산물",
        "source": PUBLIC_SOURCE_PAGES["local_specialties"],
        "status": "complete",
        "record_count": len(rows),
        "downloaded_at": _now_iso(),
        "files": [
            _file_metadata(snapshot_root, json_path),
            _file_metadata(snapshot_root, csv_path),
        ],
        "raw_page_files": raw_page_files,
    }


async def _download_public_running_courses(
    snapshot_root: Path,
) -> dict[str, Any]:
    async with PublicRunningCourseService() as service:
        raw_rows: list[dict[str, Any]] = []
        page_no = 1
        total_count: int | None = None
        while page_no <= 100:
            page_rows, reported_total = await service.fetch_course_page(
                page_no=page_no,
                num_of_rows=1000,
            )
            raw_rows.extend(page_rows)
            if reported_total is not None:
                total_count = reported_total
            if not page_rows:
                break
            if total_count is not None and len(raw_rows) >= total_count:
                break
            if len(page_rows) < 1000:
                break
            page_no += 1

    records = [
        record
        for row in raw_rows
        if (record := PublicRunningCourseService.normalize_course(row))
        is not None
    ]

    rows = [asdict(record) for record in records]
    directory = snapshot_root / "public_running_courses"
    raw_json_path = directory / "public_running_courses_source_full.json"
    raw_csv_path = directory / "public_running_courses_source_full.csv"
    json_path = directory / "public_running_courses.json"
    csv_path = directory / "public_running_courses.csv"
    _write_json(raw_json_path, raw_rows)
    _write_csv(raw_csv_path, raw_rows)
    _write_json(json_path, rows)
    _write_csv(csv_path, rows)

    return {
        "dataset": "전국길관광정보표준데이터",
        "source": PUBLIC_SOURCE_PAGES["public_running_courses"],
        "status": "complete",
        "record_count": len(raw_rows),
        "normalized_record_count": len(rows),
        "downloaded_at": _now_iso(),
        "notes": "원천 표준데이터에는 전체 Polyline 좌표가 없습니다.",
        "files": [
            _file_metadata(snapshot_root, raw_json_path),
            _file_metadata(snapshot_root, raw_csv_path),
            _file_metadata(snapshot_root, json_path),
            _file_metadata(snapshot_root, csv_path),
        ],
    }


def _safe_course_file_name(course_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", course_id).strip("._")
    if not safe:
        raise RuntimeError("Durunubi course ID cannot be used as a file name.")
    return safe


async def _download_durunubi_gpx_file(
    *,
    client: httpx.AsyncClient,
    service: DurunubiCourseService,
    snapshot_root: Path,
    course_id: str,
    gpx_url: str,
    semaphore: asyncio.Semaphore,
) -> dict[str, Any]:
    async with semaphore:
        try:
            normalized_url = service._normalize_gpx_url(gpx_url)
            response = await client.get(normalized_url)
            response.raise_for_status()
            service._validate_gpx_url(str(response.url))
            if len(response.content) > service.gpx_max_bytes:
                raise RuntimeError("GPX file exceeds the configured size limit.")

            geometry = service.parse_gpx(
                response.content,
                max_points=service.gpx_max_points,
            )
            file_name = _safe_course_file_name(course_id) + ".gpx"
            path = snapshot_root / "durunubi" / "gpx" / file_name
            _atomic_write_bytes(path, response.content)
            return {
                "course_id": course_id,
                "status": "complete",
                "source_url": normalized_url,
                "path_points_after_validation": len(geometry.path),
                "original_point_count": geometry.original_point_count,
                "distance_km": geometry.distance_km,
                "file": _file_metadata(snapshot_root, path),
            }
        except Exception as exc:
            return {
                "course_id": course_id,
                "status": "failed",
                "error_type": type(exc).__name__,
                "message": str(exc),
            }


async def _download_durunubi(
    snapshot_root: Path,
    *,
    gpx_concurrency: int,
) -> dict[str, Any]:
    async with DurunubiCourseService() as service:
        raw_rows: list[dict[str, Any]] = []
        page_no = 1
        total_count: int | None = None
        while page_no <= 10:
            page_rows, reported_total = await service.fetch_course_page(
                page_no=page_no,
                num_of_rows=1000,
            )
            raw_rows.extend(page_rows)
            if reported_total is not None:
                total_count = reported_total
            if not page_rows:
                break
            if total_count is not None and len(raw_rows) >= total_count:
                break
            if len(page_rows) < 1000:
                break
            page_no += 1

        records = [
            record
            for row in raw_rows
            if (record := DurunubiCourseService.normalize_course(row))
            is not None
        ]
        rows = [asdict(record) for record in records]

        directory = snapshot_root / "durunubi"
        raw_json_path = directory / "durunubi_catalog_source_full.json"
        raw_csv_path = directory / "durunubi_catalog_source_full.csv"
        catalog_path = directory / "durunubi_catalog.json"
        _write_json(raw_json_path, raw_rows)
        _write_csv(raw_csv_path, raw_rows)
        _write_json(catalog_path, rows)

        semaphore = asyncio.Semaphore(gpx_concurrency)
        async with httpx.AsyncClient(
            timeout=service.timeout_seconds,
            follow_redirects=True,
        ) as client:
            gpx_results = await asyncio.gather(
                *(
                    _download_durunubi_gpx_file(
                        client=client,
                        service=service,
                        snapshot_root=snapshot_root,
                        course_id=record.course_id,
                        gpx_url=record.gpx_url,
                        semaphore=semaphore,
                    )
                    for record in records
                )
            )

    index_path = directory / "gpx_download_index.json"
    _write_json(index_path, gpx_results)
    completed = sum(
        item["status"] == "complete" for item in gpx_results
    )
    failed = len(gpx_results) - completed

    return {
        "dataset": "한국관광공사 두루누비 정보 서비스",
        "source": PUBLIC_SOURCE_PAGES["durunubi"],
        "status": "complete" if failed == 0 else "partial",
        "record_count": len(raw_rows),
        "normalized_record_count": len(rows),
        "gpx_completed": completed,
        "gpx_failed": failed,
        "downloaded_at": _now_iso(),
        "files": [
            _file_metadata(snapshot_root, raw_json_path),
            _file_metadata(snapshot_root, raw_csv_path),
            _file_metadata(snapshot_root, catalog_path),
            _file_metadata(snapshot_root, index_path),
        ],
    }


async def _run(args: argparse.Namespace) -> int:
    snapshot_root = args.output.resolve()
    if snapshot_root.exists():
        raise RuntimeError(
            f"Snapshot output directory already exists: {snapshot_root}"
        )
    snapshot_root.mkdir(parents=True)

    manifest: dict[str, Any] = {
        "schema_version": "1.0",
        "created_at": _now_iso(),
        "source_data_root": snapshot_root.name,
        "scope": (
            "각 제공기관이 현재 공개하는 전체 원천 레코드와 원본 응답 파일. "
            "과거 변경 이력 전체를 의미하지 않습니다."
        ),
        "excluded_services": [
            {
                "service": "Kakao Maps REST",
                "reason": "요청형 서비스이며 원천 데이터 전체 다운로드 대상이 아님",
            },
            {
                "service": "OpenAI",
                "reason": "호스팅 모델·학습 데이터는 다운로드 대상이 아님",
            },
        ],
        "datasets": [],
    }
    manifest_path = snapshot_root / "source_manifest.json"
    _write_json(manifest_path, manifest)

    downloaders = (
        ("food_nutrition", _download_food_nutrition(snapshot_root)),
        ("official_recipes", _download_official_recipes(snapshot_root)),
        ("local_specialties", _download_local_specialties(snapshot_root)),
        (
            "public_running_courses",
            _download_public_running_courses(snapshot_root),
        ),
        (
            "durunubi",
            _download_durunubi(
                snapshot_root,
                gpx_concurrency=args.gpx_concurrency,
            ),
        ),
    )

    exit_code = 0
    for name, downloader in downloaders:
        print(f"[START] {name}", flush=True)
        try:
            result = await downloader
            manifest["datasets"].append(result)
            if result.get("status") != "complete":
                exit_code = 2
            print(
                f"[DONE] {name}: status={result.get('status')} "
                f"records={result.get('record_count')}",
                flush=True,
            )
        except Exception as exc:
            exit_code = 2
            manifest["datasets"].append(
                {
                    "dataset": name,
                    "status": "failed",
                    "downloaded_at": _now_iso(),
                    "error_type": type(exc).__name__,
                    "message": str(exc),
                }
            )
            print(
                f"[FAILED] {name}: {type(exc).__name__}: {exc}",
                flush=True,
            )
        finally:
            _write_json(manifest_path, manifest)

    print(f"[MANIFEST] {manifest_path}", flush=True)
    return exit_code


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Download complete current source data from official providers "
            "used by Auto-Fit. Secrets are read from .env and are never "
            "written to output files."
        )
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_default_output_directory(),
        help="New output directory. Existing directories are rejected.",
    )
    parser.add_argument(
        "--gpx-concurrency",
        type=int,
        default=4,
        choices=range(1, 9),
        metavar="1..8",
        help="Maximum concurrent Durunubi GPX downloads.",
    )
    parser.add_argument(
        "--verify-existing",
        type=Path,
        default=None,
        help="Verify an existing source-data directory without downloading.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if args.verify_existing is not None:
        result = _verify_existing_source_data(
            args.verify_existing.resolve()
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
