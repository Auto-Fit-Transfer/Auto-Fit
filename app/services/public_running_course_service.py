from __future__ import annotations

import asyncio
import hashlib
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings


PUBLIC_RUNNING_COURSE_API_URL = (
    "https://api.data.go.kr/openapi/"
    "tn_pubr_public_stret_tursm_info_api"
)
PUBLIC_RUNNING_COURSE_DATASET_NAME = (
    "전국길관광정보표준데이터"
)


class PublicRunningCourseConfigurationError(RuntimeError):
    """Raised when the public-data service key is unavailable."""


class PublicRunningCourseProviderError(RuntimeError):
    """Raised when the public-data provider cannot serve courses."""


@dataclass(frozen=True, slots=True)
class PublicRunningCourseRecord:
    course_id: str
    name: str
    description: str | None
    distance_km: float
    source_duration_text: str | None
    start_name: str | None
    start_address: str | None
    end_name: str | None
    end_address: str | None
    route_description: str | None
    waypoints: tuple[str, ...]
    region: str
    institution_name: str
    reference_date: str | None
    is_loop: bool

    def region_search_text(self) -> str:
        values = (
            self.region,
            self.institution_name,
            self.start_address,
            self.end_address,
        )
        return " ".join(value for value in values if value)


_COURSE_CACHE: list[PublicRunningCourseRecord] | None = None
_COURSE_CACHE_LOADED_AT = 0.0
_COURSE_CACHE_LOCK = asyncio.Lock()


class PublicRunningCourseService:
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
            settings.running_course_catalog_cache_ttl_seconds
        )
        self._client = client
        self._owns_client = client is None

    async def __aenter__(self) -> "PublicRunningCourseService":
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout_seconds,
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
                "PublicRunningCourseService must be used as an "
                "async context manager."
            )
        return self._client

    def _service_key(self) -> str:
        if not self.service_key or not self.service_key.strip():
            raise PublicRunningCourseConfigurationError(
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
            "type": "json",
        }

        try:
            response = await self._get_client().get(
                PUBLIC_RUNNING_COURSE_API_URL,
                params=params,
            )
            response.raise_for_status()
        except httpx.TimeoutException:
            raise PublicRunningCourseProviderError(
                "Public running-course request timed out."
            ) from None
        except httpx.HTTPStatusError as exc:
            raise PublicRunningCourseProviderError(
                "Public running-course API rejected the request "
                f"with HTTP {exc.response.status_code}."
            ) from None
        except httpx.HTTPError:
            raise PublicRunningCourseProviderError(
                "Public running-course request failed."
            ) from None

        try:
            payload = response.json()
        except ValueError as exc:
            raise PublicRunningCourseProviderError(
                "Public running-course API returned non-JSON data."
            ) from exc

        if not isinstance(payload, dict):
            raise PublicRunningCourseProviderError(
                "Public running-course API returned invalid data."
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

        if result_code != "00":
            result_message = header.get("resultMsg") or "unknown error"
            raise PublicRunningCourseProviderError(
                "Public running-course API error: "
                f"{result_message}"
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
            raise PublicRunningCourseProviderError(
                "Public running-course API returned invalid items."
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
    ) -> list[PublicRunningCourseRecord]:
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

            while page_no <= 100:
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
    ) -> PublicRunningCourseRecord | None:
        courses = await self.fetch_all_courses()
        return next(
            (
                course
                for course in courses
                if course.course_id == course_id
            ),
            None,
        )

    @classmethod
    def normalize_course(
        cls,
        item: dict[str, Any],
    ) -> PublicRunningCourseRecord | None:
        name = cls._clean_text(item.get("stretNm"))
        distance_km = cls._parse_distance_km(item.get("stretLt"))

        if not name or distance_km is None or distance_km <= 0:
            return None

        institution_name = (
            cls._clean_text(item.get("institutionNm"))
            or cls._clean_text(item.get("instt_nm"))
            or "지방자치단체"
        )
        start_name = cls._clean_text(item.get("beginSpotNm"))
        start_address = (
            cls._clean_text(item.get("beginRdnmadr"))
            or cls._clean_text(item.get("beginLnmadr"))
        )
        end_name = cls._clean_text(item.get("endSpotNm"))
        end_address = (
            cls._clean_text(item.get("endRdnmadr"))
            or cls._clean_text(item.get("endLnmadr"))
            or cls._clean_text(item.get("endLatitude"))
        )
        route_description = cls._clean_text(item.get("coursInfo"))
        waypoints = cls._parse_waypoints(route_description)
        course_id = cls._build_course_id(
            name=name,
            institution_name=institution_name,
            start_name=start_name,
            start_address=start_address,
        )

        return PublicRunningCourseRecord(
            course_id=course_id,
            name=name,
            description=cls._clean_text(item.get("stretIntrcn")),
            distance_km=distance_km,
            source_duration_text=cls._clean_text(
                item.get("reqreTime")
            ),
            start_name=start_name,
            start_address=start_address,
            end_name=end_name,
            end_address=end_address,
            route_description=route_description,
            waypoints=waypoints,
            region=institution_name,
            institution_name=institution_name,
            reference_date=cls._clean_text(
                item.get("referenceDate")
            ),
            is_loop=cls._is_loop(
                start_name=start_name,
                end_name=end_name,
                waypoints=waypoints,
            ),
        )

    @staticmethod
    def _clean_text(value: Any) -> str | None:
        if value is None:
            return None
        text = " ".join(str(value).strip().split())
        return text or None

    @staticmethod
    def _parse_distance_km(value: Any) -> float | None:
        if isinstance(value, (int, float)):
            return round(float(value), 3)
        if value is None:
            return None

        match = re.search(
            r"\d+(?:\.\d+)?",
            str(value).replace(",", ""),
        )
        if not match:
            return None
        return round(float(match.group(0)), 3)

    @staticmethod
    def _parse_waypoints(
        route_description: str | None,
    ) -> tuple[str, ...]:
        if not route_description:
            return ()

        points = re.split(
            r"\s*(?:→|->|>)\s*",
            route_description,
        )
        return tuple(point for point in points if point)

    @staticmethod
    def _normalize_place_name(value: str | None) -> str:
        return re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()

    @classmethod
    def _is_loop(
        cls,
        start_name: str | None,
        end_name: str | None,
        waypoints: tuple[str, ...],
    ) -> bool:
        normalized_start = cls._normalize_place_name(start_name)
        normalized_end = cls._normalize_place_name(end_name)

        if (
            normalized_start
            and normalized_end
            and normalized_start == normalized_end
        ):
            return True

        if len(waypoints) >= 2:
            return (
                cls._normalize_place_name(waypoints[0])
                == cls._normalize_place_name(waypoints[-1])
            )

        return False

    @staticmethod
    def _build_course_id(
        name: str,
        institution_name: str,
        start_name: str | None,
        start_address: str | None,
    ) -> str:
        identity = "|".join(
            (
                name,
                institution_name,
                start_name or "",
                start_address or "",
            )
        )
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
        return f"public-{digest[:16]}"
