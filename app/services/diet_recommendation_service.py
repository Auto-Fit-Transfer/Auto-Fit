import asyncio

import copy
import hashlib
import json
import logging
import math
import re
import threading
import time

from collections import OrderedDict

from time import perf_counter

from typing import Any, Awaitable, Callable



from openai import AsyncOpenAI



from app.core.config import get_settings

from app.graphs.nodes.rag_node import rag_node



from app.schemas.recommendation import (

    DietFoodItem,

    DietMeal,

    DietRecommendationMetadataResponse,

    DietRecommendationRequest,

    DietRecommendationResponse,

    DietWeeklyNarrativePartResponse,

    DietWeeklyPlanPartResponse,

    RecommendationSource,

    ReplaceMealLLMResponse,

    ReplaceMealRequest,

    ReplaceMealResponse,

)



from app.services.diet_context_service import (

    build_diet_safety_tags,

)

from app.services.food_catalog_service import FoodCatalogService
from app.services.local_specialty_service import LocalSpecialtyService





logger = logging.getLogger(

    __name__

)


_DIET_LLM_CACHE: OrderedDict[str, Any] = OrderedDict()
_DIET_LLM_CACHE_EXPIRES: dict[str, float] = {}
_DIET_LLM_INFLIGHT: dict[str, asyncio.Task[Any]] = {}
_DIET_LLM_STATE_LOCK = threading.RLock()
_DIET_LLM_CACHE_STATS = {
    "cache_hits": 0,
    "cache_misses": 0,
    "cache_expirations": 0,
    "cache_stores": 0,
    "cache_evictions": 0,
    "inflight_waits": 0,
}
_DIET_LLM_RESILIENCE_STATS = {
    "weekly_narrative_fallbacks": 0,
    "metadata_fallbacks": 0,
    "replacement_fallbacks": 0,
    "timeouts": 0,
    "errors": 0,
}


def _increment_diet_llm_cache_metric(metric_name: str) -> None:
    with _DIET_LLM_STATE_LOCK:
        _DIET_LLM_CACHE_STATS[metric_name] += 1


def get_diet_llm_cache_stats() -> dict[str, Any]:
    """외부 호출 없이 현재 프로세스의 Diet LLM 캐시 상태를 반환한다."""

    with _DIET_LLM_STATE_LOCK:
        return {
            **_DIET_LLM_CACHE_STATS,
            "cache_entries": len(_DIET_LLM_CACHE),
            "inflight_requests": len(_DIET_LLM_INFLIGHT),
        }


def _increment_diet_llm_resilience_metric(
    metric_name: str,
) -> None:
    with _DIET_LLM_STATE_LOCK:
        _DIET_LLM_RESILIENCE_STATS[metric_name] += 1


def get_diet_llm_resilience_stats() -> dict[str, int]:
    """Diet OpenAI 장애 시 사용한 fallback 횟수를 반환한다."""

    with _DIET_LLM_STATE_LOCK:
        return dict(_DIET_LLM_RESILIENCE_STATS)


def _build_diet_llm_cache_key(
    *,
    namespace: str,
    model: str,
    instructions: str,
    prompt: str,
) -> str:
    """민감할 수 있는 입력 원문 대신 안정적인 SHA-256 키만 보관한다."""

    digest = hashlib.sha256()
    digest.update(namespace.encode("utf-8"))
    digest.update(b"\0")
    digest.update(model.encode("utf-8"))
    digest.update(b"\0")
    digest.update(instructions.encode("utf-8"))
    digest.update(b"\0")
    digest.update(prompt.encode("utf-8"))
    return f"{namespace}:{digest.hexdigest()}"


def _get_cached_diet_llm_result(cache_key: str) -> Any | None:
    now = time.monotonic()

    with _DIET_LLM_STATE_LOCK:
        cached = _DIET_LLM_CACHE.get(cache_key)
        expires_at = _DIET_LLM_CACHE_EXPIRES.get(cache_key, 0.0)

        if cached is None:
            _increment_diet_llm_cache_metric("cache_misses")
            return None

        if expires_at <= now:
            _DIET_LLM_CACHE.pop(cache_key, None)
            _DIET_LLM_CACHE_EXPIRES.pop(cache_key, None)
            _increment_diet_llm_cache_metric("cache_expirations")
            return None

        _DIET_LLM_CACHE.move_to_end(cache_key)
        _increment_diet_llm_cache_metric("cache_hits")
        return copy.deepcopy(cached)


def _store_diet_llm_result(cache_key: str, result: Any) -> None:
    settings = get_settings()

    with _DIET_LLM_STATE_LOCK:
        _DIET_LLM_CACHE[cache_key] = copy.deepcopy(result)
        _DIET_LLM_CACHE_EXPIRES[cache_key] = (
            time.monotonic()
            + settings.diet_llm_cache_ttl_seconds
        )
        _DIET_LLM_CACHE.move_to_end(cache_key)
        _increment_diet_llm_cache_metric("cache_stores")

        while (
            len(_DIET_LLM_CACHE)
            > settings.diet_llm_cache_max_entries
        ):
            oldest_key, _ = _DIET_LLM_CACHE.popitem(last=False)
            _DIET_LLM_CACHE_EXPIRES.pop(oldest_key, None)
            _increment_diet_llm_cache_metric("cache_evictions")


async def _execute_and_cache_diet_llm_result(
    *,
    cache_key: str,
    factory: Callable[[], Awaitable[Any]],
) -> Any:
    try:
        result = await factory()
        _store_diet_llm_result(cache_key, result)
        return result
    finally:
        current_task = asyncio.current_task()
        with _DIET_LLM_STATE_LOCK:
            if _DIET_LLM_INFLIGHT.get(cache_key) is current_task:
                _DIET_LLM_INFLIGHT.pop(cache_key, None)


async def _get_or_create_diet_llm_result(
    *,
    cache_key: str,
    factory: Callable[[], Awaitable[Any]],
) -> Any:
    cached = _get_cached_diet_llm_result(cache_key)
    if cached is not None:
        return cached

    current_loop = asyncio.get_running_loop()

    with _DIET_LLM_STATE_LOCK:
        task = _DIET_LLM_INFLIGHT.get(cache_key)

        if task is not None and (
            task.done()
            or task.get_loop() is not current_loop
        ):
            _DIET_LLM_INFLIGHT.pop(cache_key, None)
            task = None

        if task is None:
            task = asyncio.create_task(
                _execute_and_cache_diet_llm_result(
                    cache_key=cache_key,
                    factory=factory,
                )
            )
            _DIET_LLM_INFLIGHT[cache_key] = task
        else:
            _increment_diet_llm_cache_metric("inflight_waits")

    result = await asyncio.shield(task)
    return copy.deepcopy(result)


def _reset_diet_llm_cache_for_tests() -> None:
    """Deterministic test 격리를 위한 내부 초기화 함수."""

    with _DIET_LLM_STATE_LOCK:
        _DIET_LLM_CACHE.clear()
        _DIET_LLM_CACHE_EXPIRES.clear()
        _DIET_LLM_INFLIGHT.clear()
        for metric_name in _DIET_LLM_CACHE_STATS:
            _DIET_LLM_CACHE_STATS[metric_name] = 0


def _reset_diet_llm_resilience_for_tests() -> None:
    """Deterministic test 격리를 위한 fallback 통계 초기화 함수."""

    with _DIET_LLM_STATE_LOCK:
        for metric_name in _DIET_LLM_RESILIENCE_STATS:
            _DIET_LLM_RESILIENCE_STATS[metric_name] = 0


_DIET_RAG_CACHE: OrderedDict[
    str,
    list[dict[str, Any]],
] = OrderedDict()
_DIET_RAG_CACHE_EXPIRES: dict[str, float] = {}
_DIET_RAG_CACHE_LOCK = threading.RLock()
_DIET_RAG_CACHE_STATS = {
    "cache_hits": 0,
    "cache_misses": 0,
    "cache_expirations": 0,
    "cache_stores": 0,
    "cache_evictions": 0,
}


def get_diet_rag_cache_stats() -> dict[str, Any]:
    with _DIET_RAG_CACHE_LOCK:
        return {
            **_DIET_RAG_CACHE_STATS,
            "cache_entries": len(_DIET_RAG_CACHE),
        }


def _build_diet_rag_cache_key(
    metric_statuses: dict[str, str],
) -> str:
    normalized = {
        str(key).strip().lower(): str(value).strip().lower()
        for key, value in metric_statuses.items()
    }
    serialized = json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _get_cached_diet_rag_context(
    cache_key: str,
) -> list[dict[str, Any]] | None:
    now = time.monotonic()

    with _DIET_RAG_CACHE_LOCK:
        cached = _DIET_RAG_CACHE.get(cache_key)
        expires_at = _DIET_RAG_CACHE_EXPIRES.get(cache_key, 0.0)

        if cached is None:
            _DIET_RAG_CACHE_STATS["cache_misses"] += 1
            return None

        if expires_at <= now:
            _DIET_RAG_CACHE.pop(cache_key, None)
            _DIET_RAG_CACHE_EXPIRES.pop(cache_key, None)
            _DIET_RAG_CACHE_STATS["cache_expirations"] += 1
            return None

        _DIET_RAG_CACHE.move_to_end(cache_key)
        _DIET_RAG_CACHE_STATS["cache_hits"] += 1
        return copy.deepcopy(cached)


def _store_diet_rag_context(
    cache_key: str,
    rag_context: list[dict[str, Any]],
) -> None:
    settings = get_settings()

    with _DIET_RAG_CACHE_LOCK:
        _DIET_RAG_CACHE[cache_key] = copy.deepcopy(rag_context)
        _DIET_RAG_CACHE_EXPIRES[cache_key] = (
            time.monotonic()
            + settings.diet_rag_cache_ttl_seconds
        )
        _DIET_RAG_CACHE.move_to_end(cache_key)
        _DIET_RAG_CACHE_STATS["cache_stores"] += 1

        while (
            len(_DIET_RAG_CACHE)
            > settings.diet_rag_cache_max_entries
        ):
            oldest_key, _ = _DIET_RAG_CACHE.popitem(last=False)
            _DIET_RAG_CACHE_EXPIRES.pop(oldest_key, None)
            _DIET_RAG_CACHE_STATS["cache_evictions"] += 1


def _reset_diet_rag_cache_for_tests() -> None:
    with _DIET_RAG_CACHE_LOCK:
        _DIET_RAG_CACHE.clear()
        _DIET_RAG_CACHE_EXPIRES.clear()
        for metric_name in _DIET_RAG_CACHE_STATS:
            _DIET_RAG_CACHE_STATS[metric_name] = 0


_DietCandidateResult = tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    dict[str, Any],
]
_DIET_CANDIDATE_CACHE: OrderedDict[
    str,
    _DietCandidateResult,
] = OrderedDict()
_DIET_CANDIDATE_CACHE_EXPIRES: dict[str, float] = {}
_DIET_CANDIDATE_INFLIGHT: dict[
    str,
    asyncio.Task[_DietCandidateResult],
] = {}
_DIET_CANDIDATE_CACHE_LOCK = threading.RLock()
_DIET_CANDIDATE_CACHE_STATS = {
    "cache_hits": 0,
    "cache_misses": 0,
    "cache_expirations": 0,
    "cache_stores": 0,
    "cache_evictions": 0,
    "inflight_waits": 0,
}


def get_diet_candidate_cache_stats() -> dict[str, Any]:
    with _DIET_CANDIDATE_CACHE_LOCK:
        return {
            **_DIET_CANDIDATE_CACHE_STATS,
            "cache_entries": len(_DIET_CANDIDATE_CACHE),
            "inflight_requests": len(_DIET_CANDIDATE_INFLIGHT),
        }


def _get_cached_diet_candidates(
    cache_key: str,
) -> _DietCandidateResult | None:
    now = time.monotonic()

    with _DIET_CANDIDATE_CACHE_LOCK:
        cached = _DIET_CANDIDATE_CACHE.get(cache_key)
        expires_at = _DIET_CANDIDATE_CACHE_EXPIRES.get(
            cache_key,
            0.0,
        )

        if cached is None:
            _DIET_CANDIDATE_CACHE_STATS["cache_misses"] += 1
            return None

        if expires_at <= now:
            _DIET_CANDIDATE_CACHE.pop(cache_key, None)
            _DIET_CANDIDATE_CACHE_EXPIRES.pop(cache_key, None)
            _DIET_CANDIDATE_CACHE_STATS["cache_expirations"] += 1
            return None

        _DIET_CANDIDATE_CACHE.move_to_end(cache_key)
        _DIET_CANDIDATE_CACHE_STATS["cache_hits"] += 1
        return copy.deepcopy(cached)


def _store_diet_candidates(
    cache_key: str,
    result: _DietCandidateResult,
) -> None:
    settings = get_settings()

    with _DIET_CANDIDATE_CACHE_LOCK:
        _DIET_CANDIDATE_CACHE[cache_key] = copy.deepcopy(result)
        _DIET_CANDIDATE_CACHE_EXPIRES[cache_key] = (
            time.monotonic()
            + settings.diet_candidate_cache_ttl_seconds
        )
        _DIET_CANDIDATE_CACHE.move_to_end(cache_key)
        _DIET_CANDIDATE_CACHE_STATS["cache_stores"] += 1

        while (
            len(_DIET_CANDIDATE_CACHE)
            > settings.diet_candidate_cache_max_entries
        ):
            oldest_key, _ = _DIET_CANDIDATE_CACHE.popitem(last=False)
            _DIET_CANDIDATE_CACHE_EXPIRES.pop(oldest_key, None)
            _DIET_CANDIDATE_CACHE_STATS["cache_evictions"] += 1


async def _execute_and_cache_diet_candidates(
    *,
    cache_key: str,
    factory: Callable[[], Awaitable[_DietCandidateResult]],
) -> _DietCandidateResult:
    try:
        result = await factory()
        _store_diet_candidates(cache_key, result)
        return result
    finally:
        current_task = asyncio.current_task()
        with _DIET_CANDIDATE_CACHE_LOCK:
            if _DIET_CANDIDATE_INFLIGHT.get(cache_key) is current_task:
                _DIET_CANDIDATE_INFLIGHT.pop(cache_key, None)


async def _get_or_create_diet_candidates(
    *,
    cache_key: str,
    factory: Callable[[], Awaitable[_DietCandidateResult]],
) -> _DietCandidateResult:
    cached = _get_cached_diet_candidates(cache_key)
    if cached is not None:
        return cached

    current_loop = asyncio.get_running_loop()

    with _DIET_CANDIDATE_CACHE_LOCK:
        task = _DIET_CANDIDATE_INFLIGHT.get(cache_key)
        if task is not None and (
            task.done()
            or task.get_loop() is not current_loop
        ):
            _DIET_CANDIDATE_INFLIGHT.pop(cache_key, None)
            task = None

        if task is None:
            task = asyncio.create_task(
                _execute_and_cache_diet_candidates(
                    cache_key=cache_key,
                    factory=factory,
                )
            )
            _DIET_CANDIDATE_INFLIGHT[cache_key] = task
        else:
            _DIET_CANDIDATE_CACHE_STATS["inflight_waits"] += 1

    result = await asyncio.shield(task)
    return copy.deepcopy(result)


def _reset_diet_candidate_cache_for_tests() -> None:
    with _DIET_CANDIDATE_CACHE_LOCK:
        _DIET_CANDIDATE_CACHE.clear()
        _DIET_CANDIDATE_CACHE_EXPIRES.clear()
        _DIET_CANDIDATE_INFLIGHT.clear()
        for metric_name in _DIET_CANDIDATE_CACHE_STATS:
            _DIET_CANDIDATE_CACHE_STATS[metric_name] = 0





# =========================================================

# Optimization Settings

# =========================================================



MAX_DIET_RAG_CHUNKS = 6

MAX_RAG_CONTENT_CHARS = 1200



MAX_REPLACE_RAG_CHUNKS = 3

MAX_REPLACE_RAG_CONTENT_CHARS = 600

MAX_REPLACE_SOURCES = 4



FIRST_DAY_GROUP = [

    "monday",

    "tuesday",

    "wednesday",

    "thursday",

]



SECOND_DAY_GROUP = [

    "friday",

    "saturday",

    "sunday",

]



FIRST_GROUP_MAX_OUTPUT_TOKENS = 3200

SECOND_GROUP_MAX_OUTPUT_TOKENS = 2800

METADATA_MAX_OUTPUT_TOKENS = 2500



REPLACE_MEAL_MAX_OUTPUT_TOKENS = 1000


# =========================================================
# Verified Food Candidate Settings
# =========================================================

# 공식 음식 DB 기반 일반 한 끼 후보 생성용 목표값.
# 사용자별 목표값이 Request에 있으면 그 값을 우선 사용한다.
# 아래 값은 후보 정렬을 위한 fallback이며 의료 처방 기준이 아니다.
DEFAULT_MEAL_TARGET = {
    "calories_kcal": 500.0,
    "protein_g": 30.0,
    "fat_g": 15.0,
    "carbohydrate_g": 60.0,
}

# 간식 후보 정렬용 fallback 목표.
DEFAULT_SNACK_TARGET = {
    "calories_kcal": 200.0,
    "protein_g": 10.0,
    "fat_g": 7.0,
    "carbohydrate_g": 25.0,
}

VERIFIED_MEAL_CANDIDATE_LIMIT = 40
VERIFIED_SNACK_CANDIDATE_LIMIT = 20


# =========================================================
# Snack Candidate Rules
# =========================================================

# 간식으로 보기 어려운 식사형 메뉴는 제외한다.
SNACK_EXCLUDED_KEYWORDS = {
    # 식사형 탄수화물/주식
    "밥",
    "덮밥",
    "볶음밥",
    "비빔밥",
    "김밥",
    "주먹밥",
    "죽",
    "국",
    "찌개",
    "탕",
    "면",
    "국수",
    "라면",
    "우동",
    "파스타",

    # 식사형 조리 메뉴
    "만두",
    "전",
    "빈대떡",
    "부침개",
    "샌드위치",
    "브리또",
    "또띠아",
    "버거",
    "피자",
    "구이",
    "볶음",
    "조림",
    "찜",
    "불고기",
    "제육",
    "카레",
    "스테이크",
    "돈가스",
    "돈까스",
    "냉채",
    "무침",
    "샐러드",

    # 제과/고가공 간식
    "빵",
    "브레드",
    "롤",
    "소보로",
    "크림",
    "케이크",
    "쿠키",
    "도넛",
    "도너츠",
    "와플",
    "마카롱",
    "초콜릿",
    "사탕",
    "젤리",
    "아이스크림",
    "과자",
    "스낵",
    "크래커",
}

# 건강 간식으로 명확하게 분류 가능한 식품만 허용한다.
SNACK_ALLOWED_KEYWORDS = {
    # 과일
    "사과",
    "배",
    "복숭아",
    "포도",
    "수박",
    "바나나",
    "귤",
    "감귤",
    "오렌지",
    "키위",
    "딸기",
    "블루베리",
    "참외",
    "자두",
    "체리",
    "망고",

    # 구황작물/곡물 계열
    "고구마",
    "옥수수",
    "밤",

    # 견과류
    "견과",
    "아몬드",
    "호두",
    "땅콩",
    "캐슈넛",
    "피스타치오",

    # 유제품/대체유
    "우유",
    "두유",
    "요거트",
    "요구르트",

    # 단백질 간식
    "삶은계란",
    "삶은달걀",
    "구운계란",
    "구운달걀",
    "연두부",
    "두부",
}



def _normalize_text(
    value: str,
) -> str:
    """
    메뉴명/식품명 비교용 공통 문자열 정규화.
    공백과 대소문자 차이를 제거해서 중복 비교에 사용한다.
    """

    return (
        str(value)
        .strip()
        .lower()
        .replace(" ", "")
    )


# =========================================================
# Verified Food Candidate Utility
# =========================================================


def _request_payload(
    request: Any,
) -> dict[str, Any]:
    """
    Request schema가 확장되더라도 기존 코드를 깨지 않도록
    model_dump() 결과에서 선택적으로 값을 읽는다.
    """

    if hasattr(
        request,
        "model_dump",
    ):
        payload = request.model_dump()

        if isinstance(
            payload,
            dict,
        ):
            return payload

    return {
        key: value
        for key, value
        in vars(request).items()
        if not key.startswith("_")
    }


def _first_non_empty(
    payload: dict[str, Any],
    keys: list[str],
) -> Any:

    for key in keys:

        value = payload.get(
            key
        )

        if value not in (
            None,
            "",
            [],
            {},
        ):
            return value

    return None


def _normalize_string_list(
    value: Any,
) -> list[str]:

    if value is None:
        return []

    if isinstance(
        value,
        str,
    ):
        value = [
            value
        ]

    if not isinstance(
        value,
        list,
    ):
        return []

    result: list[str] = []
    seen: set[str] = set()

    for item in value:

        text = str(
            item
        ).strip()

        if not text:
            continue

        normalized = (
            text
            .lower()
            .replace(
                " ",
                "",
            )
        )

        if normalized in seen:
            continue

        seen.add(
            normalized
        )

        result.append(
            text
        )

    return result


def _extract_disliked_foods(
    request: Any,
) -> list[str]:
    """
    현재/향후 Request schema에서 기피 음식 필드를 유연하게 읽는다.
    """

    payload = _request_payload(
        request
    )

    value = _first_non_empty(
        payload,
        [
            "disliked_foods",
            "food_dislikes",
            "avoid_foods",
            "excluded_foods",
        ],
    )

    return _normalize_string_list(
        value
    )


def _extract_health_profile(
    metric_statuses: dict[str, Any],
) -> dict[str, Any]:
    """
    기존 건강 분석 결과의 key 이름이 조금 달라도
    FoodCatalogService가 사용하는 4개 건강 축으로 연결한다.
    """

    metric_statuses = (
        metric_statuses
        or {}
    )

    def first(
        keys: list[str],
    ) -> Any:

        for key in keys:

            value = metric_statuses.get(
                key
            )

            if value not in (
                None,
                "",
            ):
                return value

        return "normal"

    return {
        "blood_pressure": first(
            [
                "blood_pressure",
                "blood_pressure_status",
                "hypertension",
                "bp",
            ]
        ),
        "glucose": first(
            [
                "glucose",
                "glucose_status",
                "blood_glucose",
                "fasting_glucose",
            ]
        ),
        "lipid": first(
            [
                "lipid",
                "lipid_status",
                "cholesterol",
                "ldl",
            ]
        ),
        "obesity": first(
            [
                "obesity",
                "obesity_status",
                "bmi",
                "body_fat",
            ]
        ),
    }


def _coerce_target_dict(
    value: Any,
    fallback: dict[str, float],
) -> dict[str, float]:
    """
    Request에 target 영양값이 존재하면 사용하고,
    없거나 불완전하면 fallback을 사용한다.
    """

    if not isinstance(
        value,
        dict,
    ):
        return dict(
            fallback
        )

    aliases = {
        "calories_kcal": [
            "calories_kcal",
            "calories",
            "kcal",
        ],
        "protein_g": [
            "protein_g",
            "protein",
        ],
        "fat_g": [
            "fat_g",
            "fat",
        ],
        "carbohydrate_g": [
            "carbohydrate_g",
            "carbohydrates_g",
            "carbs_g",
            "carbs",
        ],
    }

    result: dict[
        str,
        float
    ] = {}

    for canonical, keys in aliases.items():

        found = None

        for key in keys:

            raw = value.get(
                key
            )

            if raw is None:
                continue

            try:
                found = float(
                    raw
                )
            except (
                TypeError,
                ValueError,
            ):
                found = None

            if (
                found is not None
                and found > 0
            ):
                break

        if (
            found is None
            or found <= 0
        ):
            found = float(
                fallback[
                    canonical
                ]
            )

        result[
            canonical
        ] = found

    return result


def _extract_meal_target(
    request: Any,
) -> dict[str, float]:

    payload = _request_payload(
        request
    )

    raw_target = _first_non_empty(
        payload,
        [
            "meal_target",
            "target_nutrition",
            "meal_nutrition_target",
        ],
    )

    return _coerce_target_dict(
        raw_target,
        DEFAULT_MEAL_TARGET,
    )


def _extract_location_context(
    request: Any,
) -> tuple[
    str | None,
    str | None,
    list[dict[str, Any]],
]:
    """
    정확한 GPS 좌표 대신 행정구역 정보만 사용한다.

    지원 형태:
    - request.sido / request.sigungu / request.nearby_regions
    - request.location = {sido, sigungu, nearby_regions}
    - location_sido / location_sigungu
    """

    payload = _request_payload(
        request
    )

    location = payload.get(
        "location"
    )

    if not isinstance(
        location,
        dict,
    ):
        location = {}

    sido = (
        payload.get(
            "sido"
        )
        or payload.get(
            "location_sido"
        )
        or location.get(
            "sido"
        )
    )

    sigungu = (
        payload.get(
            "sigungu"
        )
        or payload.get(
            "location_sigungu"
        )
        or location.get(
            "sigungu"
        )
    )

    nearby_regions = (
        payload.get(
            "nearby_regions"
        )
        or location.get(
            "nearby_regions"
        )
        or []
    )

    if not isinstance(
        nearby_regions,
        list,
    ):
        nearby_regions = []

    return (
        str(sido).strip()
        if sido
        else None,
        str(sigungu).strip()
        if sigungu
        else None,
        [
            item
            for item in nearby_regions
            if isinstance(
                item,
                dict,
            )
        ],
    )


def _build_diet_candidate_cache_key(
    *,
    request: Any,
    metric_statuses: dict[str, Any],
    food_allergens: list[str],
) -> str:
    sido, sigungu, nearby_regions = _extract_location_context(request)
    payload = {
        "version": "verified_food_candidates_v1",
        "health_profile": _extract_health_profile(metric_statuses),
        "food_allergens": sorted(
            _normalize_text(item)
            for item in _normalize_string_list(food_allergens)
        ),
        "disliked_foods": sorted(
            _normalize_text(item)
            for item in _extract_disliked_foods(request)
        ),
        "meal_target": _extract_meal_target(request),
        "location": {
            "sido": sido,
            "sigungu": sigungu,
            "nearby_regions": nearby_regions,
        },
    }
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _candidate_menu_name(
    items: list[dict[str, Any]],
) -> str:
    """
    공식 DB 음식 조합을 LLM이 그대로 선택할 수 있는
    단일 menu_name 문자열로 변환한다.
    """

    names = [
        str(
            item.get(
                "food_name"
            )
            or ""
        ).strip()
        for item in items
        if item.get(
            "food_name"
        )
    ]

    return " + ".join(
        names
    )


def _compact_verified_candidate(
    meal: dict[str, Any],
) -> dict[str, Any]:
    """
    LLM에 전달할 정보만 남겨 토큰 사용량을 줄인다.
    """

    totals = meal.get(
        "totals",
        {}
    )

    items = meal.get(
        "items",
        [],
    )

    matched_specialties = meal.get(
        "matched_specialties",
        [],
    )

    return {
        "menu_name": _candidate_menu_name(
            items
        ),
        "items": [
            {
                "food_name": item.get(
                    "food_name"
                ),
                "portion_g": item.get(
                    "portion_g"
                ),
                "calories_kcal": item.get(
                    "calories_kcal"
                ),
                "protein_g": item.get(
                    "protein_g"
                ),
                "fat_g": item.get(
                    "fat_g"
                ),
                "carbohydrate_g": item.get(
                    "carbohydrate_g"
                ),
            }
            for item in items
            if item.get(
                "food_name"
            )
        ],
        "nutrition": {
            "calories_kcal": float(
                totals.get(
                    "calories_kcal",
                    0.0,
                )
                or 0.0
            ),
            "protein_g": float(
                totals.get(
                    "protein_g",
                    0.0,
                )
                or 0.0
            ),
            "fat_g": float(
                totals.get(
                    "fat_g",
                    0.0,
                )
                or 0.0
            ),
            "carbohydrate_g": float(
                totals.get(
                    "carbohydrate_g",
                    0.0,
                )
                or 0.0
            ),
        },
        "final_score": meal.get(
            "final_score"
        ),
        "local_specialties": [
            item.get(
                "specialty_name"
            )
            for item in matched_specialties
            if item.get(
                "specialty_name"
            )
        ],
    }


def _select_replacement_candidate(
    *,
    candidates: list[dict[str, Any]],
    current_menu_name: str,
    excluded_menu_names: list[str],
) -> dict[str, Any]:
    """
    공식 Food DB 후보 중 현재 메뉴와 주간 식단의 기존 메뉴를
    제외하고 점수가 가장 높은 후보를 선택한다.
    """

    blocked_names = {
        _normalize_text(
            name
        )
        for name in (
            [current_menu_name]
            + list(
                excluded_menu_names
                or []
            )
        )
        if str(
            name
            or ""
        ).strip()
    }

    eligible = [
        candidate
        for candidate in candidates
        if (
            _normalize_text(
                str(
                    candidate.get(
                        "menu_name"
                    )
                    or ""
                )
            )
            and _normalize_text(
                str(
                    candidate.get(
                        "menu_name"
                    )
                    or ""
                )
            )
            not in blocked_names
        )
    ]

    if not eligible:
        raise RuntimeError(
            "현재 식단과 다른 검증 메뉴 후보를 찾지 못했습니다."
        )

    return max(
        eligible,
        key=lambda candidate: float(
            candidate.get(
                "final_score",
                0.0,
            )
            or 0.0
        ),
    )


def _apply_verified_candidate_to_meal(
    *,
    narrative: ReplaceMealLLMResponse,
    candidate: dict[str, Any],
) -> DietMeal:
    """
    LLM 응답의 설명과 guidance만 유지하고 메뉴, 영양값, Food item은
    서버가 선택한 공식 Food DB 후보값으로 강제한다.
    """

    menu_name = str(
        candidate.get(
            "menu_name"
        )
        or ""
    ).strip()
    nutrition = candidate.get(
        "nutrition",
        {},
    )
    raw_items = candidate.get(
        "items",
        [],
    )

    if (
        not menu_name
        or not isinstance(
            nutrition,
            dict,
        )
        or not isinstance(
            raw_items,
            list,
        )
        or not raw_items
    ):
        raise RuntimeError(
            "검증된 재추천 후보 데이터가 올바르지 않습니다."
        )

    verified_items = [
        DietFoodItem.model_validate(
            item
        )
        for item in raw_items
    ]

    return DietMeal.model_validate(
        {
            "menu_name": menu_name,
            "menu_description": narrative.menu_description,
            "estimated_calories_kcal": float(
                nutrition.get(
                    "calories_kcal",
                    0.0,
                )
                or 0.0
            ),
            "nutrition": {
                "carbohydrate_g": float(
                    nutrition.get("carbohydrate_g", 0.0)
                    or 0.0
                ),
                "protein_g": float(
                    nutrition.get("protein_g", 0.0)
                    or 0.0
                ),
                "fat_g": float(
                    nutrition.get("fat_g", 0.0)
                    or 0.0
                ),
            },
            "items": verified_items,
            "image_prompt": None,
            "ingredients": None,
            "guidance": narrative.guidance,
        }
    )


def _is_snack_candidate_food(
    food: dict[str, Any],
) -> bool:
    """
    건강 간식으로 명확한 음식만 허용한다.

    중요:
    - '배' 같은 한 글자 식품명이 '양배추' 내부에 포함되어
      잘못 허용되는 부분문자열 오탐을 막는다.
    """

    raw_food_name = str(
        food.get(
            "food_name"
        )
        or ""
    ).lower()

    category = str(
        food.get(
            "category"
        )
        or ""
    ).lower()

    subcategory = str(
        food.get(
            "subcategory"
        )
        or ""
    ).lower()

    searchable = " ".join(
        [
            raw_food_name,
            category,
            subcategory,
        ]
    )

    # -----------------------------------------------------
    # 식사형 / 제과 / 고가공 메뉴 제거
    # -----------------------------------------------------

    if any(
        keyword in searchable
        for keyword
        in SNACK_EXCLUDED_KEYWORDS
    ):
        return False

    # -----------------------------------------------------
    # 간식 허용 키워드 정밀 매칭
    #
    # 2글자 이상:
    #   기존처럼 포함 여부 허용
    #
    # 1글자:
    #   음식명 토큰과 정확히 일치할 때만 허용
    #
    # 예:
    #   배_생과 -> O
    #   양배추 초나물 -> X
    # -----------------------------------------------------

    food_name_tokens = [
        token.strip()
        for token in re.split(
            r"[\s_\-/(),·.]+",
            raw_food_name,
        )
        if token.strip()
    ]

    allowed_match = False

    for keyword in (
        SNACK_ALLOWED_KEYWORDS
    ):

        normalized_keyword = (
            str(keyword)
            .strip()
            .lower()
        )

        if not normalized_keyword:
            continue

        if len(
            normalized_keyword
        ) <= 1:

            if (
                normalized_keyword
                in food_name_tokens
            ):

                allowed_match = True
                break

            continue

        if (
            normalized_keyword
            in searchable
        ):

            allowed_match = True
            break

    if not allowed_match:
        return False

    sodium = float(
        food.get(
            "sodium_mg"
        )
        or 0.0
    )

    sugar = float(
        food.get(
            "sugar_g"
        )
        or 0.0
    )

    saturated_fat = float(
        food.get(
            "saturated_fat_g"
        )
        or 0.0
    )

    if sodium > 300:
        return False

    if sugar > 20:
        return False

    if saturated_fat > 5:
        return False

    return True


def _build_verified_snack_candidates(
    *,
    food_service: FoodCatalogService,
    foods: list[dict[str, Any]],
    target: dict[str, float],
    local_specialties: list[dict[str, Any]],
    health_profile: dict[str, Any],
    limit: int,
) -> list[dict[str, Any]]:
    """
    공식 음식 DB의 단일 음식 중 간식으로 사용할 수 있는
    비교적 작은 1회 제공량 후보를 점수화한다.
    """

    scored: list[
        dict[str, Any]
    ] = []

    for food in foods:

        # -----------------------------------------------------
        # 간식으로 부적합한 식사형 음식 제외
        # -----------------------------------------------------

        if not _is_snack_candidate_food(
            food
        ):
            continue

        best: dict[
            str,
            Any
        ] | None = None

        # 작은 간식량 후보
        for portion_g in (
            50,
            70,
            100,
            130,
            150,
        ):

            item = (
                food_service
                .calculate_portion_nutrition(
                    food,
                    portion_g,
                )
            )

            calories = (
                item.get(
                    "calories_kcal"
                )
                or 0.0
            )

            # 지나치게 작거나 큰 간식 제외
            if not (
                70
                <= calories
                <= 250
            ):
                continue

            result = (
                food_service
                .score_meal_for_target(
                    meal_items=[
                        item
                    ],
                    target=target,
                    local_specialties=(
                        local_specialties
                    ),
                    health_profile=(
                        health_profile
                    ),
                )
            )

            if result is None:
                continue

            result[
                "pattern"
            ] = "snack_single"

            if (
                best is None
                or result[
                    "final_score"
                ]
                > best[
                    "final_score"
                ]
            ):
                best = result

        if best is not None:

            scored.append(
                best
            )

    scored.sort(
        key=lambda item: item[
            "final_score"
        ],
        reverse=True,
    )

    result: list[
        dict[str, Any]
    ] = []

    seen: set[str] = set()

    for item in scored:

        menu_name = (
            _candidate_menu_name(
                item.get(
                    "items",
                    [],
                )
            )
        )

        normalized = (
            _normalize_text(
                menu_name
            )
        )

        if (
            not normalized
            or normalized in seen
        ):
            continue

        seen.add(
            normalized
        )

        result.append(
            item
        )

        if len(
            result
        ) >= limit:
            break

    return result


async def _prepare_verified_food_candidates_uncached(
    *,
    request: Any,
    metric_statuses: dict[str, Any],
    food_allergens: list[str],
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    dict[str, Any],
]:
    """
    공식 음식 DB → 건강식 필터 → 알레르기/기피 음식 제거
    → 지역 특산물/건강상태 반영 → 검증 후보를 생성한다.

    위치 정보가 Request에 없으면 지역 점수 없이 정상 동작한다.
    """

    start = perf_counter()

    food_service = (
        FoodCatalogService()
    )

    specialty_service = (
        LocalSpecialtyService()
    )

    disliked_foods = (
        _extract_disliked_foods(
            request
        )
    )

    health_profile = (
        _extract_health_profile(
            metric_statuses
        )
    )

    meal_target = (
        _extract_meal_target(
            request
        )
    )

    snack_target = dict(
        DEFAULT_SNACK_TARGET
    )

    # -----------------------------------------------------
    # 지역 특산물
    # -----------------------------------------------------

    (
        sido,
        sigungu,
        nearby_regions,
    ) = (
        _extract_location_context(
            request
        )
    )

    local_specialties: list[
        dict[str, Any]
    ] = []

    location_match_type = "none"

    # 공식 Food DB와 지역 특산물 API는 서로 독립적이다.
    # Food DB 조회를 먼저 예약하여 지역 조회와 병렬 실행한다.
    raw_foods_task = asyncio.create_task(
        food_service.fetch_all_foods()
    )

    if (
        sido
        and sigungu
    ):

        try:

            location_result = (
                await specialty_service
                .get_specialties_for_location(
                    sido=sido,
                    sigungu=sigungu,
                    nearby_regions=(
                        nearby_regions
                    ),
                    limit=50,
                )
            )

            local_specialties = (
                location_result.get(
                    "specialties",
                    [],
                )
                or []
            )

            location_match_type = str(
                location_result.get(
                    "match_type",
                    "none",
                )
            )

        except Exception:

            logger.exception(
                "Local specialty loading failed"
            )

            local_specialties = []
            location_match_type = "error"

    # -----------------------------------------------------
    # 공식 음식 DB
    # -----------------------------------------------------

    raw_foods = (
        await raw_foods_task
    )

    recommendable_foods = (
        food_service
        .get_recommendable_foods(
            raw_foods
        )
    )

    personalized_foods = (
        food_service
        .filter_foods_for_user(
            foods=(
                recommendable_foods
            ),
            allergies=(
                food_allergens
            ),
            disliked_foods=(
                disliked_foods
            ),
        )
    )

    groups = (
        food_service
        .group_foods_by_role(
            personalized_foods
        )
    )

    # -----------------------------------------------------
    # 아침/점심/저녁용 조합 후보
    # -----------------------------------------------------

    meal_candidates_raw = (
        food_service
        .recommend_meal_combinations(
            groups=groups,
            target=meal_target,
            local_specialties=(
                local_specialties
            ),
            health_profile=(
                health_profile
            ),
            candidate_limit_per_role=20,
            result_limit=(
                VERIFIED_MEAL_CANDIDATE_LIMIT
            ),
        )
    )

    # -----------------------------------------------------
    # 간식용 단일 음식 후보
    # -----------------------------------------------------

    snack_candidates_raw = (
        _build_verified_snack_candidates(
            food_service=(
                food_service
            ),
            foods=(
                personalized_foods
            ),
            target=(
                snack_target
            ),
            local_specialties=(
                local_specialties
            ),
            health_profile=(
                health_profile
            ),
            limit=(
                VERIFIED_SNACK_CANDIDATE_LIMIT
            ),
        )
    )

    meal_candidates = [
        _compact_verified_candidate(
            item
        )
        for item in meal_candidates_raw
    ]

    snack_candidates = [
        _compact_verified_candidate(
            item
        )
        for item in snack_candidates_raw
    ]

    metadata = {
        "meal_target": meal_target,
        "snack_target": snack_target,
        "disliked_foods": (
            disliked_foods
        ),
        "health_profile": (
            health_profile
        ),
        "location": {
            "sido": sido,
            "sigungu": sigungu,
            "match_type": (
                location_match_type
            ),
        },
        "food_count": len(
            personalized_foods
        ),
        "meal_candidate_count": len(
            meal_candidates
        ),
        "snack_candidate_count": len(
            snack_candidates
        ),
    }

    logger.info(
        "Verified food candidates prepared elapsed_seconds=%.2f foods=%d meals=%d snacks=%d location_match=%s",
        (
            perf_counter()
            - start
        ),
        len(
            personalized_foods
        ),
        len(
            meal_candidates
        ),
        len(
            snack_candidates
        ),
        location_match_type,
    )

    return (
        meal_candidates,
        snack_candidates,
        metadata,
    )


async def _prepare_verified_food_candidates(
    *,
    request: Any,
    metric_statuses: dict[str, Any],
    food_allergens: list[str],
) -> _DietCandidateResult:
    """동일한 안전/건강/지역 조건의 검증 후보 계산을 재사용한다."""

    cache_key = _build_diet_candidate_cache_key(
        request=request,
        metric_statuses=metric_statuses,
        food_allergens=food_allergens,
    )

    async def prepare() -> _DietCandidateResult:
        return await _prepare_verified_food_candidates_uncached(
            request=request,
            metric_statuses=metric_statuses,
            food_allergens=food_allergens,
        )

    return await _get_or_create_diet_candidates(
        cache_key=cache_key,
        factory=prepare,
    )


def _split_verified_candidates(
    candidates: list[dict[str, Any]],
    first_minimum: int,
    second_minimum: int,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    """
    병렬 LLM 두 요청이 같은 메뉴를 선택하는 확률을 줄이기 위해
    후보를 두 그룹으로 나눈다.

    후보가 부족하면 전체 후보를 공유하여 생성 실패를 방지한다.
    """

    if not candidates:
        return (
            [],
            [],
        )

    required = (
        first_minimum
        + second_minimum
    )

    if len(
        candidates
    ) < required:

        return (
            list(
                candidates
            ),
            list(
                candidates
            ),
        )

    first = candidates[
        :first_minimum
    ]

    second = candidates[
        first_minimum:
        first_minimum
        + second_minimum
    ]

    # 각 LLM에 선택 여유를 추가한다.
    remaining = candidates[
        first_minimum
        + second_minimum:
    ]

    for index, item in enumerate(
        remaining
    ):

        if index % 2 == 0:
            first.append(
                item
            )
        else:
            second.append(
                item
            )

    return (
        first,
        second,
    )


# =========================================================
# Weekly Menu Family / Diversity Utility
# =========================================================

# 같은 음식군으로 취급할 대표 패턴.
# 정확히 같은 이름이 아니더라도 사용자 관점에서 비슷한 메뉴는
# 주간 반복을 제한한다.
MENU_FAMILY_RULES: list[
    tuple[str, tuple[str, ...]]
] = [
    (
        "회덮밥",
        (
            "회덮밥",
        ),
    ),
    (
        "참치샐러드",
        (
            "참치샐러드",
            "샐러드참치",
        ),
    ),
    (
        "닭가슴살샐러드",
        (
            "닭가슴살샐러드",
            "샐러드닭가슴살",
        ),
    ),
    (
        "치킨샐러드",
        (
            "치킨샐러드",
            "닭고기샐러드",
            "샐러드시저치킨",
            "샐러드치킨콥",
        ),
    ),
    (
        "닭고기냉채",
        (
            "닭고기냉채",
            "냉채닭고기",
        ),
    ),
    (
        "황태구이",
        (
            "황태구이",
        ),
    ),
    (
        "파래무침",
        (
            "파래무침",
        ),
    ),
    (
        "톳나물",
        (
            "톳나물",
        ),
    ),
    (
        "파무침",
        (
            "파무침",
            "파강회",
        ),
    ),
    (
        "현미밥",
        (
            "현미밥",
        ),
    ),
    (
        "잡곡밥",
        (
            "혼합잡곡밥",
            "잡곡밥",
        ),
    ),
    (
        "흑미밥",
        (
            "흑미밥",
        ),
    ),
    (
        "팥밥",
        (
            "팥밥",
        ),
    ),
]


def _normalize_menu_family_text(
    value: str,
) -> str:

    return (
        str(value)
        .strip()
        .lower()
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
    )


def _food_family_name(
    food_name: str,
) -> str:
    """
    유사한 음식명을 동일 family로 묶는다.
    """

    normalized = (
        _normalize_menu_family_text(
            food_name
        )
    )

    for (
        family,
        keywords,
    ) in MENU_FAMILY_RULES:

        for keyword in keywords:

            if (
                _normalize_menu_family_text(
                    keyword
                )
                in normalized
            ):
                return family

    return normalized


def _candidate_family_signature(
    candidate: dict[str, Any],
) -> dict[str, list[str] | str]:
    """
    후보의 primary/carb/side family를 추출한다.
    """

    items = (
        candidate.get(
            "items"
        )
        or []
    )

    primary_family = ""

    if items:

        primary_family = (
            _food_family_name(
                str(
                    items[0].get(
                        "food_name"
                    )
                    or ""
                )
            )
        )

    carb_families: list[str] = []
    side_families: list[str] = []

    for item in items:

        role = item.get(
            "role"
        )

        family = (
            _food_family_name(
                str(
                    item.get(
                        "food_name"
                    )
                    or ""
                )
            )
        )

        if (
            role == "carb"
            and family
        ):

            carb_families.append(
                family
            )

        if (
            role == "side"
            and family
        ):

            side_families.append(
                family
            )

    return {
        "primary": (
            primary_family
        ),
        "carbs": list(
            dict.fromkeys(
                carb_families
            )
        ),
        "sides": list(
            dict.fromkeys(
                side_families
            )
        ),
    }


def _collect_candidate_family_counts(
    candidates: list[dict[str, Any]],
) -> dict[str, set[str]]:
    """
    후보 Pool에 실제로 존재하는 primary/carb/side family 종류를 수집한다.
    """

    result = {
        "primary": set(),
        "carb": set(),
        "side": set(),
    }

    for candidate in candidates:

        signature = (
            _candidate_family_signature(
                candidate
            )
        )

        primary = str(
            signature[
                "primary"
            ]
            or ""
        )

        if primary:
            result[
                "primary"
            ].add(
                primary
            )

        for family in (
            signature[
                "carbs"
            ]
        ):

            if family:
                result[
                    "carb"
                ].add(
                    family
                )

        for family in (
            signature[
                "sides"
            ]
        ):

            if family:
                result[
                    "side"
                ].add(
                    family
                )

    return result


def _calculate_feasible_family_limits(
    *,
    candidates: list[dict[str, Any]],
    total_meal_slots: int,
) -> dict[str, int]:
    """
    실제 후보 family 개수를 기준으로 주간 반복 상한을 계산한다.

    예:
    - primary family 11개 / 21끼 -> 최소 2회면 전체 구성 가능
    - carb family 4개 / 21끼 -> 최소 6회 필요
    - side family 5개 / 21끼 -> 최소 5회 필요

    너무 강한 고정 상한 때문에 스케줄러가 fallback으로
    규칙을 깨는 문제를 방지한다.
    """

    families = (
        _collect_candidate_family_counts(
            candidates
        )
    )

    def feasible_limit(
        key: str,
        preferred_limit: int,
    ) -> int:

        count = len(
            families[
                key
            ]
        )

        if count <= 0:
            return (
                total_meal_slots
            )

        minimum_required = (
            math.ceil(
                total_meal_slots
                / count
            )
        )

        return max(
            preferred_limit,
            minimum_required,
        )

    return {
        "primary": feasible_limit(
            "primary",
            2,
        ),
        "carb": feasible_limit(
            "carb",
            5,
        ),
        "side": feasible_limit(
            "side",
            4,
        ),
    }


def _candidate_novelty_score(
    *,
    candidate: dict[str, Any],
    primary_counts: dict[str, int],
    carb_counts: dict[str, int],
    side_counts: dict[str, int],
    previous_primary_family: str | None,
    day_primary_families: set[str],
) -> float:
    """
    기존 final_score를 유지하면서 반복되는 food family에
    novelty penalty를 부여한다.
    """

    signature = (
        _candidate_family_signature(
            candidate
        )
    )

    primary = str(
        signature[
            "primary"
        ]
        or ""
    )

    carbs = list(
        signature[
            "carbs"
        ]
    )

    sides = list(
        signature[
            "sides"
        ]
    )

    score = float(
        candidate.get(
            "final_score",
            0.0,
        )
        or 0.0
    )

    # 동일 primary family가 이미 주간에 사용됐으면 감점
    score -= (
        primary_counts.get(
            primary,
            0,
        )
        * 8.0
    )

    # 직전 끼니와 같은 primary family는 더 크게 감점
    if (
        primary
        and previous_primary_family
        and primary
        == previous_primary_family
    ):

        score -= 15.0

    # 같은 날 같은 primary family 재사용 금지 수준의 감점
    if (
        primary
        and primary
        in day_primary_families
    ):

        score -= 30.0

    for family in carbs:

        score -= (
            carb_counts.get(
                family,
                0,
            )
            * 2.5
        )

    for family in sides:

        score -= (
            side_counts.get(
                family,
                0,
            )
            * 4.0
        )

    return score


def _select_schedule_candidate(
    *,
    candidates: list[dict[str, Any]],
    used_menu_names: set[str],
    primary_counts: dict[str, int],
    carb_counts: dict[str, int],
    side_counts: dict[str, int],
    previous_primary_family: str | None,
    day_primary_families: set[str],
    max_primary_family_repeat: int,
    max_carb_family_repeat: int,
    max_side_family_repeat: int,
) -> dict[str, Any]:
    """
    한 슬롯의 최종 후보를 선택한다.

    가장 중요한 규칙:
    - menu_name 중복 금지
    - 같은 날 동일 primary family 금지
    - primary family 주간 상한은 fallback에서도 유지

    carb/side는 후보 부족 시에만 단계적으로 완화할 수 있다.
    """

    def select_best(
        *,
        enforce_carb_limit: bool,
        enforce_side_limit: bool,
    ) -> dict[str, Any] | None:

        best: dict[
            str,
            Any
        ] | None = None

        best_score = float(
            "-inf"
        )

        for candidate in candidates:

            menu_name = str(
                candidate.get(
                    "menu_name"
                )
                or ""
            ).strip()

            if (
                not menu_name
                or menu_name
                in used_menu_names
            ):

                continue

            signature = (
                _candidate_family_signature(
                    candidate
                )
            )

            primary = str(
                signature[
                    "primary"
                ]
                or ""
            )

            carbs = list(
                signature[
                    "carbs"
                ]
            )

            sides = list(
                signature[
                    "sides"
                ]
            )

            # primary family 주간 제한
            if (
                primary
                and primary_counts.get(
                    primary,
                    0,
                )
                >= max_primary_family_repeat
            ):

                continue

            # 같은 날 동일 primary family 금지
            if (
                primary
                and primary
                in day_primary_families
            ):

                continue

            if (
                enforce_carb_limit
                and any(
                    carb_counts.get(
                        family,
                        0,
                    )
                    >= max_carb_family_repeat
                    for family in carbs
                )
            ):

                continue

            if (
                enforce_side_limit
                and any(
                    side_counts.get(
                        family,
                        0,
                    )
                    >= max_side_family_repeat
                    for family in sides
                )
            ):

                continue

            score = (
                _candidate_novelty_score(
                    candidate=candidate,
                    primary_counts=(
                        primary_counts
                    ),
                    carb_counts=(
                        carb_counts
                    ),
                    side_counts=(
                        side_counts
                    ),
                    previous_primary_family=(
                        previous_primary_family
                    ),
                    day_primary_families=(
                        day_primary_families
                    ),
                )
            )

            if score > best_score:

                best = candidate
                best_score = score

        return best

    # 1차: 모든 반복 제한 엄격 적용
    best = select_best(
        enforce_carb_limit=True,
        enforce_side_limit=True,
    )

    if best is not None:
        return best

    # 2차: 탄수화물 반복 제한만 완화
    best = select_best(
        enforce_carb_limit=False,
        enforce_side_limit=True,
    )

    if best is not None:
        return best

    # 3차: carb/side 제한은 완화하되
    # primary 주간 제한과 같은 날 primary 중복은 끝까지 유지
    best = select_best(
        enforce_carb_limit=False,
        enforce_side_limit=False,
    )

    if best is not None:
        return best

    raise RuntimeError(
        "주간 식단 다양성 규칙을 유지하면서 "
        "배치할 수 있는 검증 후보가 부족합니다."
    )


def _build_fixed_partial_schedule(
    *,
    days: list[str],
    meal_candidates: list[dict[str, Any]],
    snack_candidates: list[dict[str, Any]],
    used_menu_names: set[str] | None = None,
    primary_counts: dict[str, int] | None = None,
    carb_counts: dict[str, int] | None = None,
    side_counts: dict[str, int] | None = None,
    previous_primary_family: str | None = None,
    max_primary_family_repeat: int = 2,
    max_carb_family_repeat: int = 5,
    max_side_family_repeat: int = 3,
) -> tuple[
    dict[
        str,
        dict[
            str,
            dict[str, Any]
        ]
    ],
    str | None,
]:
    """
    점수순으로 단순 배치하지 않고,
    primary/carb/side family 다양성을 고려해 스케줄을 만든다.

    breakfast/lunch/dinner:
        일반 식사 후보에서 선택

    snack:
        간식 후보에서 선택

    반환:
        고정 스케줄
        마지막 일반 식사의 primary family
    """

    used_menu_names = (
        used_menu_names
        if used_menu_names is not None
        else set()
    )

    primary_counts = (
        primary_counts
        if primary_counts is not None
        else {}
    )

    carb_counts = (
        carb_counts
        if carb_counts is not None
        else {}
    )

    side_counts = (
        side_counts
        if side_counts is not None
        else {}
    )

    result: dict[
        str,
        dict[
            str,
            dict[str, Any]
        ]
    ] = {}

    for day in days:

        result[
            day
        ] = {}

        day_primary_families: set[
            str
        ] = set()

        # -------------------------------------------------
        # 아침/점심/저녁
        # -------------------------------------------------

        for meal_type in (
            "breakfast",
            "lunch",
            "dinner",
        ):

            selected = (
                _select_schedule_candidate(
                    candidates=(
                        meal_candidates
                    ),
                    used_menu_names=(
                        used_menu_names
                    ),
                    primary_counts=(
                        primary_counts
                    ),
                    carb_counts=(
                        carb_counts
                    ),
                    side_counts=(
                        side_counts
                    ),
                    previous_primary_family=(
                        previous_primary_family
                    ),
                    day_primary_families=(
                        day_primary_families
                    ),
                    max_primary_family_repeat=(
                        max_primary_family_repeat
                    ),
                    max_carb_family_repeat=(
                        max_carb_family_repeat
                    ),
                    max_side_family_repeat=(
                        max_side_family_repeat
                    ),
                )
            )

            result[
                day
            ][
                meal_type
            ] = selected

            menu_name = str(
                selected.get(
                    "menu_name"
                )
                or ""
            ).strip()

            used_menu_names.add(
                menu_name
            )

            signature = (
                _candidate_family_signature(
                    selected
                )
            )

            primary = str(
                signature[
                    "primary"
                ]
                or ""
            )

            if primary:

                primary_counts[
                    primary
                ] = (
                    primary_counts.get(
                        primary,
                        0,
                    )
                    + 1
                )

                day_primary_families.add(
                    primary
                )

                previous_primary_family = (
                    primary
                )

            for family in (
                signature[
                    "carbs"
                ]
            ):

                carb_counts[
                    family
                ] = (
                    carb_counts.get(
                        family,
                        0,
                    )
                    + 1
                )

            for family in (
                signature[
                    "sides"
                ]
            ):

                side_counts[
                    family
                ] = (
                    side_counts.get(
                        family,
                        0,
                    )
                    + 1
                )

        # -------------------------------------------------
        # 간식
        # -------------------------------------------------

        snack = (
            _select_schedule_candidate(
                candidates=(
                    snack_candidates
                ),
                used_menu_names=(
                    used_menu_names
                ),
                primary_counts={},
                carb_counts={},
                side_counts={},
                previous_primary_family=None,
                day_primary_families=set(),
                max_primary_family_repeat=999,
                max_carb_family_repeat=999,
                max_side_family_repeat=999,
            )
        )

        result[
            day
        ][
            "snack"
        ] = snack

        used_menu_names.add(
            str(
                snack.get(
                    "menu_name"
                )
                or ""
            ).strip()
        )

    return (
        result,
        previous_primary_family,
    )


def _compact_fixed_schedule_for_prompt(
    schedule: dict[
        str,
        dict[
            str,
            dict[str, Any]
        ]
    ],
) -> dict[str, Any]:
    """
    LLM Prompt에는 필요한 값만 전달한다.
    """

    result: dict[
        str,
        Any
    ] = {}

    for day, meals in (
        schedule.items()
    ):

        result[
            day
        ] = {}

        for (
            meal_type,
            candidate
        ) in meals.items():

            result[
                day
            ][
                meal_type
            ] = {
                "menu_name": (
                    candidate.get(
                        "menu_name"
                    )
                ),
                "nutrition": (
                    candidate.get(
                        "nutrition"
                    )
                ),
                "local_specialties": (
                    candidate.get(
                        "local_specialties",
                        [],
                    )
                ),
            }

    return result


def _apply_fixed_schedule_to_partial_response(
    *,
    response: DietWeeklyNarrativePartResponse,
    schedule: dict[
        str,
        dict[
            str,
            dict[str, Any]
        ]
    ],
) -> DietWeeklyPlanPartResponse:
    """
    LLM의 설명과 guidance를 서버 확정 메뉴/Food DB 값에 결합한다.
    """

    updated_days: list[dict[str, Any]] = []

    for day_plan in (
        response.weekly_plan
    ):

        day = _day_value(
            day_plan
        )

        expected = (
            schedule.get(
                day
            )
        )

        if expected is None:
            raise RuntimeError(
                "고정 식단 스케줄에 없는 요일이 "
                f"LLM 응답에 포함되었습니다: {day}"
            )

        meals = (
            day_plan.meals
        )

        updates: dict[str, Any] = {}

        for meal_type in (
            "breakfast",
            "lunch",
            "dinner",
            "snack",
        ):

            narrative = getattr(
                meals,
                meal_type,
            )

            candidate = (
                expected[
                    meal_type
                ]
            )

            nutrition = (
                candidate.get(
                    "nutrition",
                    {}
                )
            )

            updates[meal_type] = {
                "menu_name": str(
                    candidate.get("menu_name") or ""
                ),
                "menu_description": narrative.menu_description,
                "image_prompt": None,
                "estimated_calories_kcal": float(
                    nutrition.get("calories_kcal", 0.0)
                    or 0.0
                ),
                "nutrition": {
                    "carbohydrate_g": float(
                        nutrition.get("carbohydrate_g", 0.0)
                        or 0.0
                    ),
                    "protein_g": float(
                        nutrition.get("protein_g", 0.0)
                        or 0.0
                    ),
                    "fat_g": float(
                        nutrition.get("fat_g", 0.0)
                        or 0.0
                    ),
                },
                "items": candidate.get("items", []),
                "ingredients": None,
                "guidance": narrative.guidance,
            }

        updated_days.append(
            {
                "day": day,
                "meals": updates,
            }
        )

    return DietWeeklyPlanPartResponse.model_validate(
        {"weekly_plan": updated_days}
    )


def _build_candidate_map(
    meal_candidates: list[dict[str, Any]],
    snack_candidates: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:

    result: dict[
        str,
        dict[str, Any]
    ] = {}

    for item in (
        meal_candidates
        + snack_candidates
    ):

        menu_name = str(
            item.get(
                "menu_name"
            )
            or ""
        ).strip()

        if not menu_name:
            continue

        result[
            _normalize_text(
                menu_name
            )
        ] = item

    return result


def _apply_verified_nutrition_to_response(
    *,
    response: DietRecommendationResponse,
    candidate_map: dict[str, dict[str, Any]],
) -> DietRecommendationResponse:
    """
    LLM이 선택한 공식 후보의 영양정보를
    공식 DB 기반 계산값으로 다시 덮어쓴다.

    menu_name이 후보와 정확히 일치하지 않으면 수정하지 않고
    warning만 남긴다.
    """

    updated_days = []
    unmatched: list[str] = []

    for day_plan in (
        response.weekly_plan
    ):

        meals = day_plan.meals

        updates: dict[
            str,
            Any
        ] = {}

        for meal_key in (
            "breakfast",
            "lunch",
            "dinner",
            "snack",
        ):

            meal = getattr(
                meals,
                meal_key,
            )

            candidate = (
                candidate_map.get(
                    _normalize_text(
                        meal.menu_name
                    )
                )
            )

            if candidate is None:

                unmatched.append(
                    meal.menu_name
                )

                updates[
                    meal_key
                ] = meal

                continue

            nutrition = (
                candidate.get(
                    "nutrition",
                    {}
                )
            )

            verified_items = [
                DietFoodItem.model_validate(
                    item
                )
                for item in candidate.get(
                    "items",
                    [],
                )
            ]

            updated_nutrition = (
                meal.nutrition
                .model_copy(
                    update={
                        "carbohydrate_g": float(
                            nutrition.get(
                                "carbohydrate_g",
                                0.0,
                            )
                            or 0.0
                        ),
                        "protein_g": float(
                            nutrition.get(
                                "protein_g",
                                0.0,
                            )
                            or 0.0
                        ),
                        "fat_g": float(
                            nutrition.get(
                                "fat_g",
                                0.0,
                            )
                            or 0.0
                        ),
                    }
                )
            )

            updated_meal = (
                meal.model_copy(
                    update={
                        "estimated_calories_kcal": float(
                            nutrition.get(
                                "calories_kcal",
                                0.0,
                            )
                            or 0.0
                        ),
                        "nutrition": (
                            updated_nutrition
                        ),
                        "items": (
                            verified_items
                        ),
                        # 냉장고 기능 제거 정책
                        "ingredients": None,
                    }
                )
            )

            updates[
                meal_key
            ] = updated_meal

        updated_meals = (
            meals.model_copy(
                update=updates
            )
        )

        updated_days.append(
            day_plan.model_copy(
                update={
                    "meals": (
                        updated_meals
                    )
                }
            )
        )

    if unmatched:

        logger.warning(
            "Diet result contains menus outside verified candidate pool count=%d",
            len(
                unmatched
            ),
        )

    return response.model_copy(
        update={
            "weekly_plan": (
                updated_days
            )
        }
    )


# =========================================================

# Menu Utility

# =========================================================





def _collect_menu_names(

    response: DietRecommendationResponse,

) -> list[str]:

    menu_names: list[str] = []



    for day_plan in response.weekly_plan:

        meals = day_plan.meals



        menu_names.extend(

            [

                meals.breakfast.menu_name,

                meals.lunch.menu_name,

                meals.dinner.menu_name,

                meals.snack.menu_name,

            ]

        )



    return menu_names





def _find_duplicate_menu_names(

    response: DietRecommendationResponse,

) -> list[str]:



    menu_names = (

        _collect_menu_names(

            response

        )

    )



    counts: dict[str, int] = {}

    display_names: dict[str, str] = {}



    for name in menu_names:

        normalized = (

            _normalize_text(

                name

            )

        )



        counts[

            normalized

        ] = (

            counts.get(

                normalized,

                0,

            )

            + 1

        )



        if (

            normalized

            not in display_names

        ):

            display_names[

                normalized

            ] = name



    return [

        display_names[

            normalized

        ]

        for normalized, count

        in counts.items()

        if count > 1

    ]





def _day_value(

    day_plan: Any,

) -> str:



    value = getattr(

        day_plan,

        "day",

        "",

    )



    if hasattr(

        value,

        "value",

    ):

        value = value.value



    return str(

        value

    ).lower()





def _sort_weekly_plan(

    weekly_plan: list[Any],

) -> list[Any]:



    day_order = {

        "monday": 0,

        "tuesday": 1,

        "wednesday": 2,

        "thursday": 3,

        "friday": 4,

        "saturday": 5,

        "sunday": 6,

    }



    return sorted(

        weekly_plan,

        key=lambda item: (

            day_order.get(

                _day_value(

                    item

                ),

                999,

            )

        ),

    )





# =========================================================

# RAG

# =========================================================





async def _get_diet_rag_context(

    metric_statuses: dict[str, str],

) -> list[dict[str, Any]]:



    if not metric_statuses:

        return []

    cache_key = _build_diet_rag_cache_key(metric_statuses)
    cached_context = _get_cached_diet_rag_context(cache_key)

    if cached_context is not None:
        return cached_context



    start = perf_counter()



    try:

        result = await rag_node(

            {

                "merged_analysis": {

                    "metric_statuses": (

                        metric_statuses

                    )

                },

                "warnings": [],

            }

        )



    except Exception:

        logger.exception(

            "Diet RAG search failed"

        )

        return []



    finally:

        logger.info(

            "Diet RAG elapsed_seconds=%.2f",

            (

                perf_counter()

                - start

            ),

        )



    rag_context = result.get(

        "rag_context",

        [],

    )



    if not isinstance(

        rag_context,

        list,

    ):

        return []



    _store_diet_rag_context(
        cache_key,
        rag_context,
    )

    return rag_context





def _build_safe_rag_context(

    rag_context: list[dict[str, Any]],

) -> list[dict[str, Any]]:



    safe_context: list[

        dict[str, Any]

    ] = []



    for item in rag_context[

        :MAX_DIET_RAG_CHUNKS

    ]:

        if not isinstance(

            item,

            dict,

        ):

            continue



        content = (

            item.get(

                "content"

            )

            or item.get(

                "content_preview"

            )

        )



        if not content:

            continue



        safe_context.append(

            {

                "content": (

                    str(content)[

                        :MAX_RAG_CONTENT_CHARS

                    ]

                ),

                "source_org": (

                    item.get(

                        "source_org"

                    )

                ),

                "title": (

                    item.get(

                        "title"

                    )

                ),

                "topic": (

                    item.get(

                        "topic"

                    )

                ),

            }

        )



    return safe_context





def _build_replace_rag_context(

    rag_context: list[dict[str, Any]],

) -> list[dict[str, Any]]:



    safe_context: list[

        dict[str, Any]

    ] = []



    for item in rag_context[

        :MAX_REPLACE_RAG_CHUNKS

    ]:

        if not isinstance(

            item,

            dict,

        ):

            continue



        content = (

            item.get(

                "content"

            )

            or item.get(

                "content_preview"

            )

        )



        if not content:

            continue



        safe_context.append(

            {

                "content": (

                    str(content)[

                        :MAX_REPLACE_RAG_CONTENT_CHARS

                    ]

                ),

                "source_org": (

                    item.get(

                        "source_org"

                    )

                ),

                "title": (

                    item.get(

                        "title"

                    )

                ),

            }

        )



    return safe_context





def _build_sources_from_rag(

    rag_context: list[dict[str, Any]],

) -> list[RecommendationSource]:



    sources: list[

        RecommendationSource

    ] = []



    seen: set[

        tuple[str, str]

    ] = set()



    for item in rag_context:

        if not isinstance(

            item,

            dict,

        ):

            continue



        source_org = str(

            item.get(

                "source_org"

            )

            or ""

        ).strip()



        title = str(

            item.get(

                "title"

            )

            or ""

        ).strip()



        if (

            not source_org

            or not title

        ):

            continue



        key = (

            source_org,

            title,

        )



        if key in seen:

            continue



        sources.append(

            RecommendationSource(

                source_org=source_org,

                title=title,

            )

        )



        seen.add(

            key

        )



        if (

            len(sources)

            >= MAX_REPLACE_SOURCES

        ):

            break



    return sources







# =========================================================

# Parallel Weekly Plan Generation

# =========================================================


def _build_weekly_narrative_fallback(
    *,
    days: list[str],
    fixed_schedule: dict[
        str,
        dict[str, dict[str, Any]],
    ],
) -> DietWeeklyNarrativePartResponse:
    """공식 Food DB 메뉴를 바꾸지 않는 보수적인 설명을 생성한다."""

    weekly_plan: list[dict[str, Any]] = []

    for day in days:
        day_schedule = fixed_schedule.get(day)
        if day_schedule is None:
            raise RuntimeError(
                f"고정 식단 스케줄에 요일이 없습니다: {day}"
            )

        meals: dict[str, dict[str, str]] = {}
        for meal_type in (
            "breakfast",
            "lunch",
            "dinner",
            "snack",
        ):
            candidate = day_schedule.get(meal_type)
            if candidate is None:
                raise RuntimeError(
                    "고정 식단 스케줄에 식사 슬롯이 없습니다: "
                    f"{day}/{meal_type}"
                )

            menu_name = str(
                candidate.get("menu_name") or ""
            ).strip()
            meals[meal_type] = {
                "menu_description": (
                    f"{menu_name}으로 구성한 검증된 식사입니다."
                ),
                "guidance": (
                    "개인별 식사 목표에 맞춰 섭취량을 조절하세요."
                ),
            }

        weekly_plan.append(
            {
                "day": day,
                "meals": meals,
            }
        )

    return DietWeeklyNarrativePartResponse.model_validate(
        {"weekly_plan": weekly_plan}
    )


def _build_metadata_fallback(
    *,
    safe_rag_context: list[dict[str, Any]],
) -> DietRecommendationMetadataResponse:
    """새 출처나 의료 판단을 만들지 않는 주간 식단 메타데이터다."""

    return DietRecommendationMetadataResponse.model_validate(
        {
            "summary": (
                "공식 Food DB에서 검증한 메뉴로 구성한 주간 식단입니다."
            ),
            "strategy": (
                "알레르기와 기피 음식을 제외하고 영양 목표와 "
                "메뉴 다양성을 반영했습니다."
            ),
            "nutrition_balance": {},
            "dietary_principles": [
                "검증된 제공량과 메뉴 전체 영양정보를 기준으로 섭취합니다."
            ],
            "cautions": [
                "개인 상태에 따라 섭취량을 조절하세요."
            ],
            "sources": _build_sources_from_rag(
                safe_rag_context
            ),
        }
    )


def _build_replacement_narrative_fallback(
    *,
    selected_candidate: dict[str, Any],
) -> ReplaceMealLLMResponse:
    """검증 후보만 사용해 재추천 설명을 로컬에서 조립한다."""

    menu_name = str(
        selected_candidate.get("menu_name") or ""
    ).strip()
    return ReplaceMealLLMResponse(
        menu_description=(
            f"{menu_name}으로 구성한 검증된 대체 식사입니다."
        ),
        guidance=(
            "개인별 식사 목표에 맞춰 섭취량을 조절하세요."
        ),
        cautions=[],
    )





async def _request_diet_days_from_llm(

    *,

    client: AsyncOpenAI,

    model: str,

    days: list[str],

    max_output_tokens: int,

    metric_statuses: dict[str, str],

    safety_tags: list[str],

    food_allergens: list[str],

    goal_type: str,

    additional_input: (

        str

        | list[str]

        | None

    ),

    safe_rag_context: list[

        dict[str, Any]

    ],

    fixed_schedule: dict[
        str,
        dict[
            str,
            dict[str, Any]
        ]
    ],

) -> DietWeeklyPlanPartResponse:



    slot_count = (

        len(days)

        * 4

    )



    instructions = """
너는 Auto-Fit의 개인 맞춤 식단 추천 AI다.

건강 및 안전 우선순위:

1. 알레르기 및 명시적 제한
2. 건강 상태 및 안전성
3. 검증된 공식 음식 후보 사용
4. 사용자 목표
5. 영양 균형
6. 메뉴 다양성

핵심 규칙:

- 요청받은 요일만 생성한다.
- 각 요일마다 breakfast, lunch, dinner, snack을 정확히 생성한다.
- 요청되지 않은 요일은 생성하지 않는다.
- 너의 역할은 각 고정 메뉴에 맞는 menu_description과 guidance를 작성하는 것이다.
- 의료 진단 또는 치료 처방을 하지 않는다.
- 제공되지 않은 건강 수치는 추측하지 않는다.

출력 길이 규칙:

- menu_description은 한국어 한 문장으로 간결하게 작성한다.
- guidance는 가장 중요한 내용 한 문장만 작성한다.
- 불필요한 설명은 작성하지 않는다.

Structured Output Schema를 정확히 따른다.
""".strip()



    prompt = f"""

[생성 대상 요일]

{days}



[생성해야 하는 총 식사 슬롯]

{slot_count}



[건강 상태]

{metric_statuses}



[건강 안전 태그]

{safety_tags}



[사용자 목표]

{goal_type}



[알레르기]

{food_allergens}



[추가 사용자 입력]

{additional_input}





[검증된 건강 가이드라인 RAG]

{safe_rag_context}



[고정 식단 스케줄]

{_compact_fixed_schedule_for_prompt(fixed_schedule)}



고정 식단 스케줄을 참고하여 각 슬롯의 짧은 설명과 guidance만 작성하라.

"""



    start = perf_counter()

    cache_key = _build_diet_llm_cache_key(
        namespace="weekly_narrative_v1",
        model=model,
        instructions=instructions,
        prompt=prompt,
    )

    async def request_openai() -> Any:
        response = await client.responses.parse(
            model=model,
            instructions=instructions,
            input=prompt,
            reasoning={
                "effort": "low"
            },
            text_format=(
                DietWeeklyNarrativePartResponse
            ),
            max_output_tokens=(
                max_output_tokens
            ),
        )
        result = response.output_parsed
        if result is None:
            raise RuntimeError("Partial diet output is empty")
        return result



    try:

        result = await asyncio.wait_for(
            _get_or_create_diet_llm_result(
                cache_key=cache_key,
                factory=request_openai,
            ),
            timeout=(
                get_settings().diet_openai_timeout_seconds
            ),
        )



    except asyncio.TimeoutError:

        _increment_diet_llm_resilience_metric("timeouts")
        _increment_diet_llm_resilience_metric(
            "weekly_narrative_fallbacks"
        )
        logger.warning(
            "Parallel diet day generation timed out; "
            "using deterministic fallback days=%s",
            days,
        )
        result = _build_weekly_narrative_fallback(
            days=days,
            fixed_schedule=fixed_schedule,
        )



    except Exception:

        _increment_diet_llm_resilience_metric("errors")
        _increment_diet_llm_resilience_metric(
            "weekly_narrative_fallbacks"
        )
        logger.exception(

            "Parallel diet day generation failed; "
            "using deterministic fallback"

        )

        result = _build_weekly_narrative_fallback(
            days=days,
            fixed_schedule=fixed_schedule,
        )



    finally:

        logger.info(

            "Diet partial generation elapsed_seconds=%.2f days=%d",

            (

                perf_counter()

                - start

            ),

            len(days),

        )



    expected_days = set(

        days

    )



    actual_days = {

        _day_value(

            item

        )

        for item in result.weekly_plan

    }



    if (

        len(result.weekly_plan)

        != len(days)

        or actual_days

        != expected_days

    ):

        raise ValueError(

            "Partial diet response contains "

            "unexpected or missing days."

        )



    # =====================================================
    # LLM이 메뉴명/영양정보를 바꾸더라도
    # 서버가 확정한 검증 후보로 강제 복원
    # =====================================================

    result = (
        _apply_fixed_schedule_to_partial_response(
            response=result,
            schedule=(
                fixed_schedule
            ),
        )
    )



    return result





# =========================================================

# Metadata Generation

# =========================================================





async def _request_diet_metadata_from_llm(

    *,

    client: AsyncOpenAI,

    model: str,

    metric_statuses: dict[str, str],

    safety_tags: list[str],

    food_allergens: list[str],

    goal_type: str,

    additional_input: (

        str

        | list[str]

        | None

    ),

    safe_rag_context: list[

        dict[str, Any]

    ],

) -> DietRecommendationMetadataResponse:



    instructions = """

너는 Auto-Fit의 개인 맞춤 식단 추천 AI다.



주간 식단의 공통 설명 정보만 생성한다.

weekly_plan은 생성하지 않는다.



규칙:



- 건강 상태는 metric_statuses만 사용한다.

- 의료 진단이나 치료 처방을 하지 않는다.

- 알레르기와 안전 조건을 우선한다.

- 사용자의 목표에 맞는 현실적인 식단 전략을 제시한다.

- 불필요하게 긴 설명을 작성하지 않는다.



sources 규칙:



- sources는 반드시 제공된 RAG 문서만 사용한다.

- RAG에 없는 출처를 새로 만들지 않는다.

- 각 source에는 source_org와 title을 정확히 넣는다.

- WHO, USDA 등의 출처가 RAG에 없다면 임의로 추가하지 않는다.



Structured Output Schema를 정확히 따른다.

""".strip()



    prompt = f"""

[건강 상태]

{metric_statuses}



[건강 안전 태그]

{safety_tags}



[사용자 목표]

{goal_type}



[알레르기]

{food_allergens}



[추가 사용자 입력]

{additional_input}



[검증된 건강 가이드라인 RAG]

{safe_rag_context}



위 정보를 바탕으로

주간 식단의 공통 전략과 근거 정보를 생성하라.

"""



    start = perf_counter()

    cache_key = _build_diet_llm_cache_key(
        namespace="weekly_metadata_v1",
        model=model,
        instructions=instructions,
        prompt=prompt,
    )

    async def request_openai() -> Any:
        response = await client.responses.parse(
            model=model,
            instructions=instructions,
            input=prompt,
            reasoning={
                "effort": "low"
            },
            text_format=(
                DietRecommendationMetadataResponse
            ),
            max_output_tokens=(
                METADATA_MAX_OUTPUT_TOKENS
            ),
        )
        result = response.output_parsed
        if result is None:
            raise RuntimeError("Diet metadata output is empty")
        return result



    try:

        result = await asyncio.wait_for(
            _get_or_create_diet_llm_result(
                cache_key=cache_key,
                factory=request_openai,
            ),
            timeout=(
                get_settings().diet_openai_timeout_seconds
            ),
        )



    except asyncio.TimeoutError:

        _increment_diet_llm_resilience_metric("timeouts")
        _increment_diet_llm_resilience_metric(
            "metadata_fallbacks"
        )
        logger.warning(
            "Diet metadata generation timed out; "
            "using deterministic fallback"
        )
        result = _build_metadata_fallback(
            safe_rag_context=safe_rag_context,
        )



    except Exception:

        _increment_diet_llm_resilience_metric("errors")
        _increment_diet_llm_resilience_metric(
            "metadata_fallbacks"
        )
        logger.exception(

            "Diet metadata generation failed; "
            "using deterministic fallback"

        )

        result = _build_metadata_fallback(
            safe_rag_context=safe_rag_context,
        )



    finally:

        logger.info(

            "Diet metadata generation elapsed_seconds=%.2f",

            (

                perf_counter()

                - start

            ),

        )



    return result





# =========================================================

# Diet Recommendation

# =========================================================





async def generate_diet_recommendation(

    request: DietRecommendationRequest,

) -> DietRecommendationResponse:



    total_start = perf_counter()



    settings = get_settings()



    if not settings.openai_api_key:

        raise RuntimeError(

            "OPENAI_API_KEY is not configured"

        )



    client = AsyncOpenAI(

        api_key=(

            settings.openai_api_key

        )

    )



    metric_statuses = (

        request.metric_statuses

        or {}

    )



    safety_tags = (

        build_diet_safety_tags(

            metric_statuses

        )

    )



    food_allergens = (

        request.food_allergens

        or []

    )



    goal_type = (

        request.goal_type

        or "general_health"

    )



    additional_input = (

        request.additional_input

    )



    # -----------------------------------------------------
    # RAG 조회와 공식 Food DB 후보 준비는 서로 독립적이므로
    # 병렬로 실행한다.
    # -----------------------------------------------------

    (
        rag_context,
        prepared_candidates,
    ) = await asyncio.gather(
        _get_diet_rag_context(
            metric_statuses
        ),
        _prepare_verified_food_candidates(
            request=request,
            metric_statuses=(
                metric_statuses
            ),
            food_allergens=(
                food_allergens
            ),
        ),
    )

    safe_rag_context = (
        _build_safe_rag_context(
            rag_context
        )
    )

    (
        verified_meal_candidates,
        verified_snack_candidates,
        verified_candidate_metadata,
    ) = prepared_candidates



    if not verified_meal_candidates:

        raise RuntimeError(
            "검증된 일반 식사 후보를 생성하지 못했습니다."
        )



    if not verified_snack_candidates:

        raise RuntimeError(
            "검증된 간식 후보를 생성하지 못했습니다."
        )



    logger.info(
        "Verified candidate metadata=%s",
        verified_candidate_metadata,
    )



    # -----------------------------------------------------
    # 주간 전체 후보 Pool 공유
    #
    # 기존에는 점수순 후보를 월~목 / 금~일로 반씩 나눠
    # 후반부에 특정 primary family가 부족해지는 문제가 있었다.
    #
    # 서버 스케줄러가 used_menu_names와 family counts를 공유하므로
    # 두 LLM 그룹 모두 같은 전체 후보 Pool을 사용해도
    # 최종 menu_name 중복은 발생하지 않는다.
    # -----------------------------------------------------

    first_meal_candidates = (
        verified_meal_candidates
    )

    second_meal_candidates = (
        verified_meal_candidates
    )

    first_snack_candidates = (
        verified_snack_candidates
    )

    second_snack_candidates = (
        verified_snack_candidates
    )



    # -----------------------------------------------------
    # LLM 호출 전에 서버가 요일/식사별 메뉴를 확정한다.
    # 두 그룹은 서로 다른 후보 집합을 사용하므로
    # 월~일 전체 menu_name 중복도 방지된다.
    # -----------------------------------------------------

    # -----------------------------------------------------
    # 후보 Pool 실제 family 수를 바탕으로
    # 현실적으로 지킬 수 있는 주간 반복 상한 계산
    # -----------------------------------------------------

    family_limits = (
        _calculate_feasible_family_limits(
            candidates=(
                verified_meal_candidates
            ),
            total_meal_slots=21,
        )
    )



    logger.info(
        "Weekly feasible family limits=%s",
        family_limits,
    )



    used_menu_names: set[str] = set()

    primary_family_counts: dict[
        str,
        int
    ] = {}

    carb_family_counts: dict[
        str,
        int
    ] = {}

    side_family_counts: dict[
        str,
        int
    ] = {}



    (
        first_fixed_schedule,
        previous_primary_family,
    ) = (
        _build_fixed_partial_schedule(
            days=(
                FIRST_DAY_GROUP
            ),
            meal_candidates=(
                first_meal_candidates
            ),
            snack_candidates=(
                first_snack_candidates
            ),
            used_menu_names=(
                used_menu_names
            ),
            primary_counts=(
                primary_family_counts
            ),
            carb_counts=(
                carb_family_counts
            ),
            side_counts=(
                side_family_counts
            ),
            previous_primary_family=None,
            max_primary_family_repeat=(
                family_limits[
                    "primary"
                ]
            ),
            max_carb_family_repeat=(
                family_limits[
                    "carb"
                ]
            ),
            max_side_family_repeat=(
                family_limits[
                    "side"
                ]
            ),
        )
    )



    (
        second_fixed_schedule,
        previous_primary_family,
    ) = (
        _build_fixed_partial_schedule(
            days=(
                SECOND_DAY_GROUP
            ),
            meal_candidates=(
                second_meal_candidates
            ),
            snack_candidates=(
                second_snack_candidates
            ),
            used_menu_names=(
                used_menu_names
            ),
            primary_counts=(
                primary_family_counts
            ),
            carb_counts=(
                carb_family_counts
            ),
            side_counts=(
                side_family_counts
            ),
            previous_primary_family=(
                previous_primary_family
            ),
            max_primary_family_repeat=(
                family_limits[
                    "primary"
                ]
            ),
            max_carb_family_repeat=(
                family_limits[
                    "carb"
                ]
            ),
            max_side_family_repeat=(
                family_limits[
                    "side"
                ]
            ),
        )
    )



    logger.info(
        "Weekly family diversity primary=%s carbs=%s sides=%s",
        primary_family_counts,
        carb_family_counts,
        side_family_counts,
    )



    (

        first_result,

        second_result,

        metadata_result,

    ) = await asyncio.gather(

        _request_diet_days_from_llm(

            client=client,

            model=(

                settings.openai_diet_model

            ),

            days=(

                FIRST_DAY_GROUP

            ),

            max_output_tokens=(

                FIRST_GROUP_MAX_OUTPUT_TOKENS

            ),

            metric_statuses=(

                metric_statuses

            ),

            safety_tags=(

                safety_tags

            ),

            food_allergens=(

                food_allergens

            ),

            goal_type=(

                goal_type

            ),

            additional_input=(

                additional_input

            ),

            safe_rag_context=(

                safe_rag_context

            ),

            fixed_schedule=(
                first_fixed_schedule
            ),

        ),

        _request_diet_days_from_llm(

            client=client,

            model=(

                settings.openai_diet_model

            ),

            days=(

                SECOND_DAY_GROUP

            ),

            max_output_tokens=(

                SECOND_GROUP_MAX_OUTPUT_TOKENS

            ),

            metric_statuses=(

                metric_statuses

            ),

            safety_tags=(

                safety_tags

            ),

            food_allergens=(

                food_allergens

            ),

            goal_type=(

                goal_type

            ),

            additional_input=(

                additional_input

            ),

            safe_rag_context=(

                safe_rag_context

            ),

            fixed_schedule=(
                second_fixed_schedule
            ),

        ),

        _request_diet_metadata_from_llm(

            client=client,

            model=(

                settings.openai_diet_model

            ),

            metric_statuses=(

                metric_statuses

            ),

            safety_tags=(

                safety_tags

            ),

            food_allergens=(

                food_allergens

            ),

            goal_type=(

                goal_type

            ),

            additional_input=(

                additional_input

            ),

            safe_rag_context=(

                safe_rag_context

            ),

        ),

    )



    combined_weekly_plan = (

        list(

            first_result.weekly_plan

        )

        + list(

            second_result.weekly_plan

        )

    )



    combined_weekly_plan = (

        _sort_weekly_plan(

            combined_weekly_plan

        )

    )



    metadata_payload = (

        metadata_result.model_dump()

    )



    final_payload = {

        **metadata_payload,

        "weekly_plan": (

            combined_weekly_plan

        ),

    }



    result = (

        DietRecommendationResponse

        .model_validate(

            final_payload

        )

    )



    # -----------------------------------------------------
    # LLM이 선택한 후보의 영양정보를
    # 공식 음식 DB 계산값으로 재검증/고정
    # -----------------------------------------------------

    candidate_map = _build_candidate_map(
        verified_meal_candidates,
        verified_snack_candidates,
    )



    result = (
        _apply_verified_nutrition_to_response(
            response=result,
            candidate_map=(
                candidate_map
            ),
        )
    )



    duplicates = (

        _find_duplicate_menu_names(

            result

        )

    )



    if duplicates:

        logger.warning(

            "Parallel diet result contains duplicate menu names count=%d",

            len(duplicates),

        )



    logger.info(

        "Parallel diet recommendation total elapsed_seconds=%.2f",

        (

            perf_counter()

            - total_start

        ),

    )



    return result





# =========================================================

# Replace Meal

# =========================================================





async def generate_replacement_meal(

    request: ReplaceMealRequest,

) -> ReplaceMealResponse:



    total_start = perf_counter()



    settings = get_settings()



    if not settings.openai_api_key:

        raise RuntimeError(

            "OPENAI_API_KEY is not configured"

        )



    client = AsyncOpenAI(

        api_key=(

            settings.openai_api_key

        )

    )



    metric_statuses = (

        request.metric_statuses

        or {}

    )



    safety_tags = (

        build_diet_safety_tags(

            metric_statuses

        )

    )



    food_allergens = (

        request.food_allergens

        or []

    )



    # RAG 조회와 공식 Food DB 후보 준비는 서로 독립적이다.
    (
        rag_context,
        prepared_candidates,
    ) = await asyncio.gather(
        _get_diet_rag_context(
            metric_statuses
        ),
        _prepare_verified_food_candidates(
            request=request,
            metric_statuses=(
                metric_statuses
            ),
            food_allergens=(
                food_allergens
            ),
        ),
    )



    (
        verified_meal_candidates,
        verified_snack_candidates,
        verified_candidate_metadata,
    ) = prepared_candidates



    candidate_pool = (
        verified_snack_candidates
        if request.target_meal == "snack"
        else verified_meal_candidates
    )



    selected_candidate = (
        _select_replacement_candidate(
            candidates=(
                candidate_pool
            ),
            current_menu_name=(
                request.current_menu_name
            ),
            excluded_menu_names=(
                request.excluded_menu_names
            ),
        )
    )



    logger.info(
        "Verified replacement candidate selected meal_type=%s menu=%s metadata=%s",
        request.target_meal,
        selected_candidate.get(
            "menu_name"
        ),
        verified_candidate_metadata,
    )



    replace_rag_context = (

        _build_replace_rag_context(

            rag_context

        )

    )



    sources = (

        _build_sources_from_rag(

            rag_context

        )

    )



    # =====================================================
    # 한 끼 재추천 입력값
    #
    # 냉장고 기능 제거 과정에서 함께 빠졌던
    # 기존 ReplaceMealRequest 필드들을 다시 정의한다.
    # =====================================================

    disliked_foods = (

        request.disliked_foods

        or []

    )



    goal_type = (

        request.goal_type

        or "general_health"

    )



    additional_input = (

        request.additional_input

    )



    # current_ingredients는 냉장고 재료가 아니라
    # "현재 교체 대상 메뉴의 구성 재료"이므로 유지한다.
    current_ingredients = (

        request.current_ingredients

        or []

    )





    instructions = """

너는 Auto-Fit의 한 끼 식단 재추천 AI다.



목표:



서버가 공식 Food DB에서 선택한 새 메뉴의 설명과 guidance를 작성한다.



우선순위:



1. 알레르기 및 섭취 제한

2. 건강 상태 및 안전성

3. 사용자 목표

4. 서버가 확정한 메뉴 유지

5. 영양 균형



규칙:



- 알레르기 재료는 사용하지 않는다.

- 의료 진단이나 치료 지시는 하지 않는다.

- 불필요한 설명을 생성하지 않는다.



menu_description:



- 한국어 한 문장

- 짧고 간결하게 작성한다.



guidance:



- 가장 중요한 조언 한 문장만 작성한다.



cautions:



- 필요한 경우에만 작성한다.

- 최대 3개다.

- 짧은 문장으로 작성한다.



Structured Output Schema를 정확히 따른다.

""".strip()



    prompt = f"""

[요일]

{request.target_day}



[식사]

{request.target_meal}



[현재 메뉴]

{request.current_menu_name}



[현재 메뉴 재료]

{current_ingredients}



[건강 상태]

{metric_statuses}



[안전 태그]

{safety_tags}



[목표]

{goal_type}



[알레르기]

{food_allergens}



[기피 음식]

{disliked_foods}



[추가 입력]

{additional_input}





[건강 가이드라인]

{replace_rag_context}



[확정 재추천 메뉴]

{selected_candidate}



확정 재추천 메뉴를 참고해 설명, guidance, 필요한 caution만 작성하라.

"""



    llm_start = perf_counter()

    cache_key = _build_diet_llm_cache_key(
        namespace="replacement_narrative_v1",
        model=settings.openai_replace_meal_model,
        instructions=instructions,
        prompt=prompt,
    )

    async def request_openai() -> Any:
        response = await client.responses.parse(
            model=(
                settings.openai_replace_meal_model
            ),
            instructions=instructions,
            input=prompt,
            reasoning={
                "effort": "low"
            },
            text_format=(
                ReplaceMealLLMResponse
            ),
            max_output_tokens=(
                REPLACE_MEAL_MAX_OUTPUT_TOKENS
            ),
        )
        result = response.output_parsed
        if result is None:
            raise RuntimeError("Replacement meal output is empty")
        return result



    try:

        result = await asyncio.wait_for(
            _get_or_create_diet_llm_result(
                cache_key=cache_key,
                factory=request_openai,
            ),
            timeout=(
                settings.replace_meal_openai_timeout_seconds
            ),
        )



    except asyncio.TimeoutError:

        _increment_diet_llm_resilience_metric("timeouts")
        _increment_diet_llm_resilience_metric(
            "replacement_fallbacks"
        )
        logger.warning(
            "Replacement meal OpenAI generation timed out; "
            "using deterministic fallback"
        )
        result = _build_replacement_narrative_fallback(
            selected_candidate=selected_candidate,
        )



    except Exception:

        _increment_diet_llm_resilience_metric("errors")
        _increment_diet_llm_resilience_metric(
            "replacement_fallbacks"
        )
        logger.exception(

            "Replacement meal OpenAI generation failed; "
            "using deterministic fallback"

        )

        result = _build_replacement_narrative_fallback(
            selected_candidate=selected_candidate,
        )



    finally:

        logger.info(

            "Replacement meal OpenAI elapsed_seconds=%.2f",

            (

                perf_counter()

                - llm_start

            ),

        )



    # LLM이 메뉴명이나 영양값을 변경해도 공식 Food DB 후보값으로
    # 모두 덮어쓴다. LLM 응답에서는 설명과 guidance만 사용한다.
    validated_meal = (
        _apply_verified_candidate_to_meal(
            narrative=result,
            candidate=(
                selected_candidate
            ),
        )
    )



    final_result = (

        ReplaceMealResponse(

            day=(

                request.target_day

            ),

            meal_type=(

                request.target_meal

            ),

            meal=(

                validated_meal

            ),

            cautions=(

                result.cautions

            ),

            sources=(

                sources

            ),

        )

    )



    logger.info(

        "Replacement meal total elapsed_seconds=%.2f",

        (

            perf_counter()

            - total_start

        ),

    )



    return final_result
