from __future__ import annotations

import asyncio
import copy
import math
import re
import threading
import time
import xml.etree.ElementTree as ET
from typing import Any

import httpx

from app.core.config import get_settings


_SHARED_SPECIALTY_CACHE: list[dict[str, Any]] | None = None
_SHARED_SPECIALTY_CACHE_EXPIRES_AT = 0.0
_SHARED_SPECIALTY_CACHE_LOCK = asyncio.Lock()
_SHARED_SPECIALTY_STATE_LOCK = threading.RLock()
_SHARED_SPECIALTY_CACHE_STATS = {
    "cache_hits": 0,
    "cache_misses": 0,
    "cache_expirations": 0,
    "cache_stores": 0,
    "inflight_waits": 0,
}


# ==================================================
# 농촌진흥청 농사로 지역특산물 API
# ==================================================

NONGSARO_LOCAL_SPECIALTY_URL = (
    "http://api.nongsaro.go.kr/service/"
    "localSpcprd/localSpcprdLst"
)


# ==================================================
# 식단 추천에서 제외할 지역 특산물 키워드
# ==================================================

NON_FOOD_SPECIALTY_KEYWORDS = {
    "담배",
    "칠보석",
    "보석",
    "공예",
    "화훼",
    "관상",
    "목공",
    "도자기",
    "고로쇠수액",
}


# ==================================================
# 알코올 관련 특산물
# ==================================================

ALCOHOL_SPECIALTY_KEYWORDS = {
    "민속주",
    "술",
    "소주",
    "막걸리",
    "약주",
    "청주",
    "와인",
    "맥주",
}


# ==================================================
# 지역 특산물 정규화 규칙
# ==================================================

SPECIALTY_NORMALIZATION_MAP = {
    "영양 잡곡": [
        "잡곡",
    ],
    "영양 산나물": [
        "산나물",
    ],
    "영양 고추": [
        "고추",
    ],
    "영양 송이": [
        "송이버섯",
        "송이",
    ],
    "상황버섯": [
        "상황버섯",
    ],
    "일월산 흑염소": [
        "흑염소",
    ],
    "일월산산머루": [
        "산머루",
        "머루",
    ],
    "영양벌꿀": [
        "벌꿀",
    ],
    "유정란": [
        "유정란",
    ],
    "한우": [
        "한우",
    ],
    "메주.된장.간장": [
        "메주",
        "된장",
        "간장",
    ],
    "고랭지채소": [
        "고랭지채소",
    ],
}


class LocalSpecialtyService:

    def __init__(self) -> None:
        self.settings = get_settings()

    @classmethod
    def get_cache_stats(cls) -> dict[str, Any]:
        del cls
        with _SHARED_SPECIALTY_STATE_LOCK:
            return {
                **_SHARED_SPECIALTY_CACHE_STATS,
                "cache_loaded": _SHARED_SPECIALTY_CACHE is not None,
                "inflight_requests": (
                    1 if _SHARED_SPECIALTY_CACHE_LOCK.locked() else 0
                ),
            }

    @classmethod
    def reset_cache_for_tests(cls) -> None:
        del cls
        global _SHARED_SPECIALTY_CACHE
        global _SHARED_SPECIALTY_CACHE_EXPIRES_AT

        with _SHARED_SPECIALTY_STATE_LOCK:
            _SHARED_SPECIALTY_CACHE = None
            _SHARED_SPECIALTY_CACHE_EXPIRES_AT = 0.0
            for metric_name in _SHARED_SPECIALTY_CACHE_STATS:
                _SHARED_SPECIALTY_CACHE_STATS[metric_name] = 0

    # ==================================================
    # API 인증키
    # ==================================================

    def _get_api_key(self) -> str:

        api_key = (
            self.settings.nongsaro_api_key
        )

        if not api_key:
            raise RuntimeError(
                "NONGSARO_API_KEY가 설정되지 않았습니다."
            )

        return api_key

    # ==================================================
    # XML 안전 추출
    # ==================================================

    @staticmethod
    def _get_text(
        element: ET.Element,
        tag: str,
    ) -> str | None:

        child = element.find(
            tag
        )

        if (
            child is None
            or child.text is None
        ):
            return None

        text = (
            child.text.strip()
        )

        return text or None

    # ==================================================
    # areaNm 파싱
    # ==================================================

    @staticmethod
    def parse_area_name(
        area_name: str | None,
    ) -> dict[str, str | None]:

        if not area_name:
            return {
                "sido": None,
                "sigungu": None,
            }

        parts = [
            part.strip()
            for part
            in area_name.split(">")
            if part.strip()
        ]

        return {
            "sido": (
                parts[0]
                if len(parts) >= 1
                else None
            ),
            "sigungu": (
                parts[1]
                if len(parts) >= 2
                else None
            ),
        }

    # ==================================================
    # 지역명 정규화
    # ==================================================

    @staticmethod
    def normalize_region_name(
        value: str | None,
    ) -> str:

        if not value:
            return ""

        return (
            str(value)
            .strip()
            .replace(" ", "")
        )

    # ==================================================
    # 특산물명 정규화
    # ==================================================

    @staticmethod
    def normalize_specialty_name(
        value: str | None,
    ) -> str:

        if not value:
            return ""

        return (
            str(value)
            .strip()
            .lower()
            .replace(" ", "")
            .replace("_", "")
        )

    # ==================================================
    # 음식/특산물 비교용 문자열 정규화
    # ==================================================

    @staticmethod
    def normalize_match_text(
        value: str | None,
    ) -> str:

        if not value:
            return ""

        return (
            str(value)
            .strip()
            .lower()
            .replace(" ", "")
            .replace("_", "")
            .replace("-", "")
            .replace(".", "")
            .replace("/", "")
        )

    # ==================================================
    # 원본 음식명 토큰 분리
    #
    # 짧은 단어 "배", "게" 같은 특산물이
    # "양배추" 내부 문자열로 잘못 매칭되는 것을 방지한다.
    # ==================================================

    @staticmethod
    def tokenize_food_name(
        value: str | None,
    ) -> list[str]:

        if not value:
            return []

        return [
            token.strip().lower()
            for token in re.split(
                r"[\s_\-/(),·.]+",
                str(value),
            )
            if token.strip()
        ]

    # ==================================================
    # 특산물 식품 여부 확인
    # ==================================================

    def is_food_specialty(
        self,
        specialty_name: str | None,
    ) -> bool:

        if not specialty_name:
            return False

        text = (
            str(specialty_name)
            .strip()
            .lower()
        )

        if any(
            keyword.lower() in text
            for keyword
            in NON_FOOD_SPECIALTY_KEYWORDS
        ):
            return False

        if any(
            keyword.lower() in text
            for keyword
            in ALCOHOL_SPECIALTY_KEYWORDS
        ):
            return False

        return True

    # ==================================================
    # 특산물명 → 음식 매칭용 키워드
    # ==================================================

    def build_specialty_match_terms(
        self,
        specialty_name: str | None,
    ) -> list[str]:

        if not specialty_name:
            return []

        original_name = (
            str(specialty_name)
            .strip()
        )

        mapped = (
            SPECIALTY_NORMALIZATION_MAP.get(
                original_name
            )
        )

        if mapped:
            return list(
                dict.fromkeys(
                    [
                        term.strip()
                        for term in mapped
                        if term.strip()
                    ]
                )
            )

        terms: list[str] = []

        split_terms = re.split(
            r"[.,/·]+",
            original_name,
        )

        for term in split_terms:

            term = term.strip()

            if (
                term
                and term not in terms
            ):
                terms.append(
                    term
                )

        if (
            original_name
            and original_name not in terms
        ):
            terms.append(
                original_name
            )

        return terms

    # ==================================================
    # API 한 페이지 조회
    # ==================================================

    async def fetch_specialties_page(
        self,
        page_no: int = 1,
        num_of_rows: int = 100,
    ) -> dict[str, Any]:

        api_key = (
            self._get_api_key()
        )

        params = {
            "apiKey": api_key,
            "pageNo": page_no,
            "numOfRows": num_of_rows,
        }

        async with httpx.AsyncClient(
            timeout=30.0
        ) as client:

            response = await client.get(
                NONGSARO_LOCAL_SPECIALTY_URL,
                params=params,
            )

            response.raise_for_status()

            xml_text = (
                response.text
            )

        root = ET.fromstring(
            xml_text
        )

        result_code = root.findtext(
            "./header/resultCode"
        )

        result_message = root.findtext(
            "./header/resultMsg"
        )

        if result_code != "00":

            raise RuntimeError(
                "농사로 지역특산물 API 오류: "
                f"{result_code} / "
                f"{result_message}"
            )

        items_element = (
            root.find(
                "./body/items"
            )
        )

        results: list[
            dict[str, Any]
        ] = []

        if items_element is not None:

            for item in (
                items_element.findall(
                    "item"
                )
            ):

                area_name = (
                    self._get_text(
                        item,
                        "areaNm",
                    )
                )

                region = (
                    self.parse_area_name(
                        area_name
                    )
                )

                specialty_name = (
                    self._get_text(
                        item,
                        "cntntsSj",
                    )
                )

                results.append(
                    {
                        "area_name": area_name,
                        "sido": region["sido"],
                        "sigungu": region["sigungu"],
                        "content_no": self._get_text(
                            item,
                            "cntntsNo",
                        ),
                        "specialty_name": specialty_name,
                        "match_terms": (
                            self.build_specialty_match_terms(
                                specialty_name
                            )
                        ),
                        "image_url": self._get_text(
                            item,
                            "imgUrl",
                        ),
                        "link_url": self._get_text(
                            item,
                            "linkUrl",
                        ),
                        "service_date": self._get_text(
                            item,
                            "svcDt",
                        ),
                        "source_org": (
                            "농촌진흥청 농사로"
                        ),
                    }
                )

        total_count_text = (
            items_element.findtext(
                "totalCount"
            )
            if items_element is not None
            else None
        )

        return {
            "items": results,
            "total_count": (
                int(total_count_text)
                if total_count_text
                else len(results)
            ),
        }

    # ==================================================
    # 전체 특산물 조회
    # ==================================================

    async def fetch_all_specialties(
        self,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        global _SHARED_SPECIALTY_CACHE
        global _SHARED_SPECIALTY_CACHE_EXPIRES_AT

        now = time.monotonic()
        with _SHARED_SPECIALTY_STATE_LOCK:
            if (
                _SHARED_SPECIALTY_CACHE is not None
                and _SHARED_SPECIALTY_CACHE_EXPIRES_AT > now
                and not force_refresh
            ):
                _SHARED_SPECIALTY_CACHE_STATS["cache_hits"] += 1
                return copy.deepcopy(_SHARED_SPECIALTY_CACHE)

            if (
                _SHARED_SPECIALTY_CACHE is not None
                and _SHARED_SPECIALTY_CACHE_EXPIRES_AT <= now
                and not force_refresh
            ):
                _SHARED_SPECIALTY_CACHE_STATS[
                    "cache_expirations"
                ] += 1

            _SHARED_SPECIALTY_CACHE_STATS["cache_misses"] += 1

            if _SHARED_SPECIALTY_CACHE_LOCK.locked():
                _SHARED_SPECIALTY_CACHE_STATS["inflight_waits"] += 1

        async with _SHARED_SPECIALTY_CACHE_LOCK:
            now = time.monotonic()
            with _SHARED_SPECIALTY_STATE_LOCK:
                if (
                    _SHARED_SPECIALTY_CACHE is not None
                    and _SHARED_SPECIALTY_CACHE_EXPIRES_AT > now
                    and not force_refresh
                ):
                    _SHARED_SPECIALTY_CACHE_STATS["cache_hits"] += 1
                    return copy.deepcopy(_SHARED_SPECIALTY_CACHE)

            page_no = 1
            page_size = 100

            all_items: list[
                dict[str, Any]
            ] = []

            while True:

                result = (
                    await self.fetch_specialties_page(
                        page_no=page_no,
                        num_of_rows=page_size,
                    )
                )

                items = result["items"]
                total_count = result["total_count"]

                if not items:
                    break

                all_items.extend(items)

                if len(all_items) >= total_count:
                    break

                page_no += 1

            unique_items: list[dict[str, Any]] = []
            seen_ids: set[str] = set()

            for item in all_items:
                content_no = item.get("content_no") or ""

                if content_no and content_no in seen_ids:
                    continue

                if content_no:
                    seen_ids.add(content_no)

                unique_items.append(item)

            with _SHARED_SPECIALTY_STATE_LOCK:
                _SHARED_SPECIALTY_CACHE = copy.deepcopy(unique_items)
                _SHARED_SPECIALTY_CACHE_EXPIRES_AT = (
                    time.monotonic()
                    + self.settings.local_specialty_cache_ttl_seconds
                )
                _SHARED_SPECIALTY_CACHE_STATS["cache_stores"] += 1

            return copy.deepcopy(unique_items)

    # ==================================================
    # 식품 특산물만 유지
    # ==================================================

    def filter_food_specialties(
        self,
        specialties: list[
            dict[str, Any]
        ],
    ) -> list[
        dict[str, Any]
    ]:

        return [
            item
            for item in specialties
            if self.is_food_specialty(
                item.get(
                    "specialty_name"
                )
            )
        ]

    # ==================================================
    # 정확 지역 필터
    # ==================================================

    def filter_exact_region(
        self,
        specialties: list[
            dict[str, Any]
        ],
        sido: str,
        sigungu: str,
    ) -> list[
        dict[str, Any]
    ]:

        sido = (
            self.normalize_region_name(
                sido
            )
        )

        sigungu = (
            self.normalize_region_name(
                sigungu
            )
        )

        return [
            item
            for item in specialties
            if (
                self.normalize_region_name(
                    item.get(
                        "sido"
                    )
                )
                == sido
                and
                self.normalize_region_name(
                    item.get(
                        "sigungu"
                    )
                )
                == sigungu
            )
        ]

    # ==================================================
    # 같은 시도 필터
    # ==================================================

    def filter_same_sido(
        self,
        specialties: list[
            dict[str, Any]
        ],
        sido: str,
        exclude_sigungu: str | None = None,
    ) -> list[
        dict[str, Any]
    ]:

        normalized_sido = (
            self.normalize_region_name(
                sido
            )
        )

        normalized_exclude = (
            self.normalize_region_name(
                exclude_sigungu
            )
        )

        results = []

        for item in specialties:

            if (
                self.normalize_region_name(
                    item.get(
                        "sido"
                    )
                )
                != normalized_sido
            ):
                continue

            if (
                normalized_exclude
                and
                self.normalize_region_name(
                    item.get(
                        "sigungu"
                    )
                )
                == normalized_exclude
            ):
                continue

            results.append(
                item
            )

        return results

    # ==================================================
    # 근교 지역 조회
    # ==================================================

    def filter_nearby_regions(
        self,
        specialties: list[
            dict[str, Any]
        ],
        nearby_regions: list[
            dict[str, Any]
        ],
    ) -> list[
        dict[str, Any]
    ]:

        sorted_regions = sorted(
            nearby_regions,
            key=lambda region: (
                float(
                    region.get(
                        "distance_km",
                        math.inf,
                    )
                )
            ),
        )

        results = []

        for region in sorted_regions:

            sido = (
                region.get(
                    "sido"
                )
            )

            sigungu = (
                region.get(
                    "sigungu"
                )
            )

            distance_km = (
                region.get(
                    "distance_km"
                )
            )

            if (
                not sido
                or not sigungu
            ):
                continue

            matches = (
                self.filter_exact_region(
                    specialties=specialties,
                    sido=sido,
                    sigungu=sigungu,
                )
            )

            for specialty in matches:

                item = (
                    specialty.copy()
                )

                item[
                    "distance_km"
                ] = distance_km

                item[
                    "location_match_type"
                ] = "nearby"

                results.append(
                    item
                )

        return results

    # ==================================================
    # 최종 지역 특산물 조회
    # ==================================================

    async def get_specialties_for_location(
        self,
        sido: str,
        sigungu: str,
        nearby_regions: list[
            dict[str, Any]
        ] | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:

        nearby_regions = (
            nearby_regions
            or []
        )

        all_specialties = (
            await self.fetch_all_specialties()
        )

        specialties = (
            self.filter_food_specialties(
                all_specialties
            )
        )

        exact_matches = (
            self.filter_exact_region(
                specialties=specialties,
                sido=sido,
                sigungu=sigungu,
            )
        )

        if exact_matches:

            results = []

            for specialty in (
                exact_matches[
                    :limit
                ]
            ):

                item = (
                    specialty.copy()
                )

                item[
                    "location_match_type"
                ] = "exact"

                item[
                    "distance_km"
                ] = 0.0

                results.append(
                    item
                )

            return {
                "requested_region": {
                    "sido": sido,
                    "sigungu": sigungu,
                },
                "match_type": "exact",
                "specialties": results,
            }

        nearby_matches = (
            self.filter_nearby_regions(
                specialties=specialties,
                nearby_regions=nearby_regions,
            )
        )

        if nearby_matches:

            return {
                "requested_region": {
                    "sido": sido,
                    "sigungu": sigungu,
                },
                "match_type": "nearby",
                "specialties": (
                    nearby_matches[
                        :limit
                    ]
                ),
            }

        same_sido_matches = (
            self.filter_same_sido(
                specialties=specialties,
                sido=sido,
                exclude_sigungu=sigungu,
            )
        )

        if same_sido_matches:

            results = []

            for specialty in (
                same_sido_matches[
                    :limit
                ]
            ):

                item = (
                    specialty.copy()
                )

                item[
                    "location_match_type"
                ] = "same_sido"

                item[
                    "distance_km"
                ] = None

                results.append(
                    item
                )

            return {
                "requested_region": {
                    "sido": sido,
                    "sigungu": sigungu,
                },
                "match_type": "same_sido",
                "specialties": results,
            }

        return {
            "requested_region": {
                "sido": sido,
                "sigungu": sigungu,
            },
            "match_type": "none",
            "specialties": [],
        }

    # ==================================================
    # 매칭 term의 신뢰도 계산
    # ==================================================

    def is_valid_term_match(
        self,
        term: str,
        food: dict[str, Any],
    ) -> bool:

        normalized_term = (
            self.normalize_match_text(
                term
            )
        )

        if not normalized_term:
            return False

        raw_food_name = str(
            food.get(
                "food_name"
            )
            or ""
        )

        food_name = (
            self.normalize_match_text(
                raw_food_name
            )
        )

        category = (
            self.normalize_match_text(
                food.get(
                    "category"
                )
            )
        )

        subcategory = (
            self.normalize_match_text(
                food.get(
                    "subcategory"
                )
            )
        )

        # --------------------------------------------------
        # 1글자 특산물은 부분 문자열 매칭 금지
        #
        # 예:
        # 배 → 양배추 X
        #
        # 음식명에서 독립 토큰으로 등장할 때만 허용
        # 예:
        # 배_생과 → O
        # 배 / 100g → O
        # --------------------------------------------------

        if len(
            normalized_term
        ) <= 1:

            tokens = (
                self.tokenize_food_name(
                    raw_food_name
                )
            )

            return (
                normalized_term
                in tokens
            )

        # --------------------------------------------------
        # 2글자 이상은 음식명 직접 매칭
        # --------------------------------------------------

        if (
            normalized_term
            in food_name
        ):
            return True

        # 카테고리/하위카테고리는 짧은 용어 오탐 방지
        if len(
            normalized_term
        ) < 3:
            return False

        if (
            normalized_term
            in category
        ):
            return True

        if (
            normalized_term
            in subcategory
        ):
            return True

        return False

    # ==================================================
    # 음식 ↔ 지역 특산물 매칭
    # ==================================================

    def get_specialty_matches_for_food(
        self,
        food: dict[str, Any],
        specialties: list[
            dict[str, Any]
        ],
    ) -> list[
        dict[str, Any]
    ]:

        matches = []

        for specialty in specialties:

            terms = (
                specialty.get(
                    "match_terms"
                )
                or []
            )

            matched_terms: list[str] = []

            for term in terms:

                if (
                    self.is_valid_term_match(
                        term=term,
                        food=food,
                    )
                ):

                    matched_terms.append(
                        term
                    )

            if not matched_terms:
                continue

            item = (
                specialty.copy()
            )

            item[
                "matched_terms"
            ] = matched_terms

            matches.append(
                item
            )

        return matches

    # ==================================================
    # 지역 특산물 점수
    # ==================================================

    def calculate_local_specialty_score(
        self,
        meal_items: list[
            dict[str, Any]
        ],
        specialties: list[
            dict[str, Any]
        ],
    ) -> tuple[
        float,
        list[dict[str, Any]],
    ]:

        if not specialties:
            return (
                0.0,
                [],
            )

        matched: dict[
            str,
            dict[str, Any]
        ] = {}

        score = 0.0

        for food in meal_items:

            matches = (
                self.get_specialty_matches_for_food(
                    food=food,
                    specialties=specialties,
                )
            )

            for specialty in matches:

                specialty_name = (
                    specialty.get(
                        "specialty_name"
                    )
                    or ""
                )

                if specialty_name in matched:
                    continue

                matched[
                    specialty_name
                ] = specialty

                match_type = (
                    specialty.get(
                        "location_match_type"
                    )
                )

                if match_type == "exact":
                    score += 40.0

                elif match_type == "nearby":

                    distance_km = (
                        specialty.get(
                            "distance_km"
                        )
                    )

                    if distance_km is None:
                        score += 15.0
                    else:

                        distance = float(
                            distance_km
                        )

                        if distance <= 20:
                            score += 30.0
                        elif distance <= 50:
                            score += 25.0
                        elif distance <= 100:
                            score += 15.0
                        else:
                            score += 8.0

                elif (
                    match_type
                    == "same_sido"
                ):
                    score += 10.0

        return (
            round(
                min(
                    score,
                    100.0,
                ),
                2,
            ),
            list(
                matched.values()
            ),
        )
