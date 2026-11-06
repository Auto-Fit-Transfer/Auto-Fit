from __future__ import annotations

import asyncio
import html
import re
import time
import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings
from app.schemas.running import GeoCoordinate
from app.utils.coordinates import haversine_distance_km


DURUNUBI_COURSE_API_URL = (
    "https://apis.data.go.kr/B551011/Durunubi/courseList"
)
DURUNUBI_DATASET_NAME = "한국관광공사 두루누비 정보 서비스"
DURUNUBI_PROVIDER_NAME = "한국관광공사"
DURUNUBI_ALLOWED_GPX_HOSTS = {
    "durunubi.kr",
    "www.durunubi.kr",
}


class DurunubiConfigurationError(RuntimeError):
    """Raised when credentials required by Durunubi are unavailable."""


class DurunubiProviderError(RuntimeError):
    """Raised when Durunubi rejects or cannot process a request."""


@dataclass(frozen=True, slots=True)
class DurunubiCourseRecord:
    course_id: str
    route_id: str | None
    name: str
    distance_km: float
    duration_minutes: float | None
    difficulty: str
    is_loop: bool
    description: str | None
    summary: str | None
    tourism_points: str | None
    traveler_info: str | None
    region: str
    gpx_url: str
    modified_at: str | None


@dataclass(frozen=True, slots=True)
class DurunubiGeometry:
    path: tuple[GeoCoordinate, ...]
    distance_km: float
    original_point_count: int


_COURSE_CACHE: list[DurunubiCourseRecord] | None = None
_COURSE_CACHE_LOADED_AT = 0.0
_COURSE_CACHE_LOCK = asyncio.Lock()
_GEOMETRY_CACHE: dict[str, DurunubiGeometry] = {}
_GEOMETRY_INFLIGHT: dict[str, asyncio.Task[DurunubiGeometry]] = {}
_GEOMETRY_LOCK = asyncio.Lock()


class DurunubiCourseService:
    def __init__(
        self,
        service_key: str | None = None,
        timeout_seconds: float | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        settings = get_settings()
        self.service_key = (
            service_key
            if service_key is not None
            else settings.public_data_service_key
        )
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.running_public_data_timeout_seconds
        )
        self.cache_ttl_seconds = (
            settings.running_durunubi_cache_ttl_seconds
        )
        self.gpx_max_bytes = settings.running_gpx_max_bytes
        self.gpx_max_points = settings.running_gpx_max_points
        self._client = client
        self._owns_client = client is None

    async def __aenter__(self) -> "DurunubiCourseService":
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout_seconds,
                follow_redirects=True,
            )
        return self

    async def __aexit__(
        self,
        exc_type: object,
        exc: object,
        traceback: object,
    ) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError(
                "DurunubiCourseService must be used as an async "
                "context manager."
            )
        return self._client

    def _service_key(self) -> str:
        if not self.service_key or not self.service_key.strip():
            raise DurunubiConfigurationError(
                "PUBLIC_DATA_SERVICE_KEY is not configured."
            )
        return self.service_key.strip()

    async def fetch_course_page(
        self,
        page_no: int,
        num_of_rows: int = 1000,
    ) -> tuple[list[dict[str, Any]], int | None]:
        params = {
            "serviceKey": self._service_key(),
            "pageNo": page_no,
            "numOfRows": min(max(num_of_rows, 1), 1000),
            "MobileOS": "ETC",
            "MobileApp": "AutoFit",
            "_type": "json",
            "brdDiv": "DNWW",
        }

        try:
            response = await self._get_client().get(
                DURUNUBI_COURSE_API_URL,
                params=params,
            )
            response.raise_for_status()
        except httpx.TimeoutException:
            raise DurunubiProviderError(
                "Durunubi course request timed out."
            ) from None
        except httpx.HTTPStatusError as exc:
            raise DurunubiProviderError(
                "Durunubi course API rejected the request "
                f"with HTTP {exc.response.status_code}."
            ) from None
        except httpx.HTTPError:
            raise DurunubiProviderError(
                "Durunubi course request failed."
            ) from None

        try:
            payload = response.json()
        except ValueError:
            raise DurunubiProviderError(
                "Durunubi course API returned non-JSON data."
            ) from None

        if not isinstance(payload, dict):
            raise DurunubiProviderError(
                "Durunubi course API returned invalid data."
            )

        return self.parse_course_page_payload(payload)

    @staticmethod
    def parse_course_page_payload(
        payload: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], int | None]:
        response_root = payload.get("response")
        root = (
            response_root
            if isinstance(response_root, dict)
            else payload
        )
        header = root.get("header") or {}
        result_code = str(header.get("resultCode") or "")

        if result_code not in {"0000", "00"}:
            result_message = header.get("resultMsg") or "unknown error"
            raise DurunubiProviderError(
                f"Durunubi course API error: {result_message}"
            )

        body = root.get("body") or {}
        items_container = body.get("items") or []
        if isinstance(items_container, dict):
            items = items_container.get("item") or []
        else:
            items = items_container

        if isinstance(items, dict):
            items = [items]
        if not isinstance(items, list):
            raise DurunubiProviderError(
                "Durunubi course API returned invalid items."
            )

        valid_items = [
            item for item in items if isinstance(item, dict)
        ]
        total_count_raw = body.get("totalCount")
        try:
            total_count = (
                int(total_count_raw)
                if total_count_raw is not None
                else None
            )
        except (TypeError, ValueError):
            total_count = None

        return valid_items, total_count

    async def fetch_all_courses(
        self,
        force_refresh: bool = False,
    ) -> list[DurunubiCourseRecord]:
        global _COURSE_CACHE
        global _COURSE_CACHE_LOADED_AT

        now = time.monotonic()
        cache_is_fresh = (
            _COURSE_CACHE is not None
            and now - _COURSE_CACHE_LOADED_AT
            < self.cache_ttl_seconds
        )
        if cache_is_fresh and not force_refresh:
            return list(_COURSE_CACHE or [])

        async with _COURSE_CACHE_LOCK:
            now = time.monotonic()
            cache_is_fresh = (
                _COURSE_CACHE is not None
                and now - _COURSE_CACHE_LOADED_AT
                < self.cache_ttl_seconds
            )
            if cache_is_fresh and not force_refresh:
                return list(_COURSE_CACHE or [])

            raw_items: list[dict[str, Any]] = []
            page_no = 1
            page_size = 1000
            total_count: int | None = None

            while page_no <= 10:
                items, reported_total = await self.fetch_course_page(
                    page_no=page_no,
                    num_of_rows=page_size,
                )
                raw_items.extend(items)
                if reported_total is not None:
                    total_count = reported_total

                if not items:
                    break
                if total_count is not None and len(raw_items) >= total_count:
                    break
                if len(items) < page_size:
                    break
                page_no += 1

            normalized = [
                record
                for item in raw_items
                if (record := self.normalize_course(item)) is not None
            ]
            _COURSE_CACHE = normalized
            _COURSE_CACHE_LOADED_AT = time.monotonic()
            return list(normalized)

    async def get_course(
        self,
        course_id: str,
    ) -> DurunubiCourseRecord | None:
        courses = await self.fetch_all_courses()
        normalized_id = course_id.removeprefix("durunubi-")
        return next(
            (
                course
                for course in courses
                if course.course_id == normalized_id
            ),
            None,
        )

    async def get_geometry(
        self,
        course: DurunubiCourseRecord,
    ) -> DurunubiGeometry:
        cached = _GEOMETRY_CACHE.get(course.course_id)
        if cached is not None:
            return cached

        async with _GEOMETRY_LOCK:
            cached = _GEOMETRY_CACHE.get(course.course_id)
            if cached is not None:
                return cached

            task = _GEOMETRY_INFLIGHT.get(course.course_id)
            if task is None:
                task = asyncio.create_task(
                    self._fetch_and_parse_gpx(course.gpx_url)
                )
                _GEOMETRY_INFLIGHT[course.course_id] = task

        try:
            geometry = await task
        finally:
            async with _GEOMETRY_LOCK:
                if _GEOMETRY_INFLIGHT.get(course.course_id) is task:
                    _GEOMETRY_INFLIGHT.pop(course.course_id, None)

        _GEOMETRY_CACHE[course.course_id] = geometry
        return geometry

    async def _fetch_and_parse_gpx(
        self,
        gpx_url: str,
    ) -> DurunubiGeometry:
        normalized_gpx_url = self._normalize_gpx_url(gpx_url)

        try:
            response = await self._get_client().get(normalized_gpx_url)
            response.raise_for_status()
        except httpx.TimeoutException:
            raise DurunubiProviderError(
                "Durunubi GPX request timed out."
            ) from None
        except httpx.HTTPStatusError as exc:
            raise DurunubiProviderError(
                "Durunubi GPX request was rejected "
                f"with HTTP {exc.response.status_code}."
            ) from None
        except httpx.HTTPError:
            raise DurunubiProviderError(
                "Durunubi GPX request failed."
            ) from None

        self._validate_gpx_url(str(response.url))
        content_length = response.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.gpx_max_bytes:
                    raise DurunubiProviderError(
                        "Durunubi GPX file is too large."
                    )
            except ValueError:
                pass

        if len(response.content) > self.gpx_max_bytes:
            raise DurunubiProviderError(
                "Durunubi GPX file is too large."
            )

        return self.parse_gpx(
            response.content,
            max_points=self.gpx_max_points,
        )

    @staticmethod
    def parse_gpx(
        content: bytes,
        max_points: int = 2000,
    ) -> DurunubiGeometry:
        try:
            root = ElementTree.fromstring(content)
        except ElementTree.ParseError:
            raise DurunubiProviderError(
                "Durunubi GPX file is invalid XML."
            ) from None

        track_points = [
            element
            for element in root.iter()
            if element.tag.rsplit("}", 1)[-1] == "trkpt"
        ]
        if len(track_points) < 2:
            track_points = [
                element
                for element in root.iter()
                if element.tag.rsplit("}", 1)[-1] == "rtept"
            ]

        path: list[GeoCoordinate] = []
        for point in track_points:
            latitude_raw = point.attrib.get("lat")
            longitude_raw = point.attrib.get("lon")
            if latitude_raw is None or longitude_raw is None:
                continue

            try:
                coordinate = GeoCoordinate(
                    latitude=float(latitude_raw),
                    longitude=float(longitude_raw),
                )
            except (TypeError, ValueError):
                continue

            if not path or path[-1] != coordinate:
                path.append(coordinate)

        if len(path) < 2:
            raise DurunubiProviderError(
                "Durunubi GPX file has no usable route geometry."
            )

        original_point_count = len(path)
        geometry_distance_km = round(
            sum(
                haversine_distance_km(path[index - 1], path[index])
                for index in range(1, len(path))
            ),
            3,
        )
        if geometry_distance_km <= 0:
            raise DurunubiProviderError(
                "Durunubi GPX route distance is invalid."
            )

        simplified_path = DurunubiCourseService._downsample_path(
            path,
            max_points=max_points,
        )
        return DurunubiGeometry(
            path=tuple(simplified_path),
            distance_km=geometry_distance_km,
            original_point_count=original_point_count,
        )

    @staticmethod
    def normalize_course(
        item: dict[str, Any],
    ) -> DurunubiCourseRecord | None:
        course_id = DurunubiCourseService._clean_text(
            item.get("crsIdx")
        )
        name = DurunubiCourseService._clean_text(
            item.get("crsKorNm")
        )
        distance_km = DurunubiCourseService._parse_float(
            item.get("crsDstnc")
        )
        gpx_url = DurunubiCourseService._clean_text(
            item.get("gpxpath")
        )

        if (
            not course_id
            or not name
            or distance_km is None
            or distance_km <= 0
            or not gpx_url
        ):
            return None

        difficulty_map = {
            "1": "easy",
            "2": "moderate",
            "3": "hard",
        }
        cycle_text = DurunubiCourseService._clean_text(
            item.get("crsCycle")
        )

        return DurunubiCourseRecord(
            course_id=course_id,
            route_id=DurunubiCourseService._clean_text(
                item.get("routeIdx")
            ),
            name=name,
            distance_km=round(distance_km, 3),
            duration_minutes=DurunubiCourseService._parse_float(
                item.get("crsTotlRqrmHour")
            ),
            difficulty=difficulty_map.get(
                str(item.get("crsLevel") or ""),
                "unknown",
            ),
            is_loop=(
                bool(cycle_text)
                and "순환" in cycle_text
                and "비순환" not in cycle_text
            ),
            description=DurunubiCourseService._clean_html_text(
                item.get("crsContents")
            ),
            summary=DurunubiCourseService._clean_html_text(
                item.get("crsSummary")
            ),
            tourism_points=DurunubiCourseService._clean_html_text(
                item.get("crsTourInfo")
            ),
            traveler_info=DurunubiCourseService._clean_html_text(
                item.get("travelerinfo")
            ),
            region=(
                DurunubiCourseService._clean_text(item.get("sigun"))
                or "대한민국"
            ),
            gpx_url=gpx_url,
            modified_at=(
                DurunubiCourseService._clean_text(
                    item.get("modifiedtime")
                )
                or DurunubiCourseService._clean_text(
                    item.get("modifitedtime")
                )
            ),
        )

    @staticmethod
    def _validate_gpx_url(gpx_url: str) -> None:
        parsed = urlparse(gpx_url)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in DURUNUBI_ALLOWED_GPX_HOSTS
            or parsed.port not in {None, 443}
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise DurunubiProviderError(
                "Durunubi GPX URL is not an approved provider URL."
            )

    @staticmethod
    def _normalize_gpx_url(gpx_url: str) -> str:
        parsed = urlparse(gpx_url)
        if (
            parsed.scheme == "http"
            and parsed.hostname in DURUNUBI_ALLOWED_GPX_HOSTS
            and parsed.port in {None, 80}
            and parsed.username is None
            and parsed.password is None
        ):
            gpx_url = parsed._replace(
                scheme="https",
                netloc=parsed.hostname,
            ).geturl()
        DurunubiCourseService._validate_gpx_url(gpx_url)
        return gpx_url

    @staticmethod
    def _downsample_path(
        path: list[GeoCoordinate],
        max_points: int,
    ) -> list[GeoCoordinate]:
        if max_points < 2:
            raise ValueError("max_points must be at least 2")
        if len(path) <= max_points:
            return path

        last_index = len(path) - 1
        indices = {
            round(index * last_index / (max_points - 1))
            for index in range(max_points)
        }
        return [path[index] for index in sorted(indices)]

    @staticmethod
    def _parse_float(value: Any) -> float | None:
        if isinstance(value, (int, float)):
            return float(value)
        if value is None:
            return None
        match = re.search(r"\d+(?:\.\d+)?", str(value).replace(",", ""))
        return float(match.group(0)) if match else None

    @staticmethod
    def _clean_text(value: Any) -> str | None:
        if value is None:
            return None
        text = " ".join(str(value).strip().split())
        return text or None

    @staticmethod
    def _clean_html_text(value: Any) -> str | None:
        text = DurunubiCourseService._clean_text(value)
        if not text:
            return None
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = html.unescape(text)
        lines = [" ".join(line.split()) for line in text.splitlines()]
        cleaned = "\n".join(line for line in lines if line)
        return cleaned or None
