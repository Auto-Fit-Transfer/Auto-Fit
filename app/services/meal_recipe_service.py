from __future__ import annotations

import asyncio
import copy
import inspect
import logging
import re
import threading
import time
from collections import OrderedDict
from difflib import SequenceMatcher
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.food_catalog_service import ALLERGY_KEYWORD_MAP
from app.services.recipe_service import RecipeService


logger = logging.getLogger(__name__)


_SHARED_RECIPE_CACHE: OrderedDict[
    str,
    dict[str, Any],
] = OrderedDict()
_SHARED_RECIPE_CACHE_EXPIRES: dict[
    str,
    float,
] = {}
_SHARED_RECIPE_INFLIGHT: dict[
    str,
    asyncio.Task[dict[str, Any]],
] = {}
_SHARED_RECIPE_STATE_LOCK = threading.RLock()
_RECIPE_PIPELINE_STATS = {
    "cache_hits": 0,
    "cache_misses": 0,
    "cache_expirations": 0,
    "cache_stores": 0,
    "cache_evictions": 0,
    "inflight_waits": 0,
    "item_failures": 0,
    "official_api_fallbacks": 0,
    "llm_failures": 0,
}


def _increment_recipe_metric(
    metric_name: str,
) -> None:
    with _SHARED_RECIPE_STATE_LOCK:
        _RECIPE_PIPELINE_STATS[metric_name] += 1


# ==================================================
# LLM 생성 레시피 Structured Output
# ==================================================

class GeneratedRecipeIngredient(BaseModel):
    """LLM fallback이 생성하는 재료 1개."""

    name: str = Field(
        min_length=1,
        max_length=200,
    )

    amount_g: float | None = Field(
        default=None,
        ge=0,
        le=100000,
    )


class GeneratedRecipeResponse(BaseModel):
    ingredients: list[GeneratedRecipeIngredient] = Field(
        default_factory=list,
        max_length=20,
    )

    steps: list[str] = Field(
        default_factory=list,
        max_length=10,
    )

    cooking_tip: str | None = Field(
        default=None,
        max_length=500,
    )


class MealRecipeService:

    # ==================================================
    # 공식 유사 레시피로 인정할 최소 유사도
    #
    # 너무 낮으면 엉뚱한 공식 레시피가 연결될 수 있으므로
    # 보수적으로 설정
    # ==================================================

    OFFICIAL_SIMILARITY_THRESHOLD = 0.82
    RECIPE_CACHE_TTL_SECONDS = 30 * 60
    RECIPE_CACHE_MAX_ENTRIES = 512

    def __init__(self) -> None:
        self.settings = get_settings()

        self.recipe_service = RecipeService()

        if not self.settings.openai_api_key:
            raise RuntimeError(
                "OPENAI_API_KEY가 설정되지 않았습니다."
            )

        self.openai_client = AsyncOpenAI(
            api_key=self.settings.openai_api_key,
            timeout=(
                self.settings.recipe_openai_timeout_seconds
            ),
        )
        self.RECIPE_CACHE_TTL_SECONDS = (
            self.settings.recipe_cache_ttl_seconds
        )
        self.RECIPE_CACHE_MAX_ENTRIES = (
            self.settings.recipe_cache_max_entries
        )

        # ==================================================
        # 동일 사용자 조건 + 동일 음식 반복 검색 방지 캐시
        # ==================================================

        self._recipe_cache = _SHARED_RECIPE_CACHE
        self._recipe_cache_expires = (
            _SHARED_RECIPE_CACHE_EXPIRES
        )

        # ==================================================
        # 동일 음식이 asyncio.gather에서 동시에 검색될 때
        # 중복 API/LLM 호출을 막기 위한 Single-flight Task
        # ==================================================

        self._inflight_tasks = _SHARED_RECIPE_INFLIGHT
        self._recipe_state_lock = (
            _SHARED_RECIPE_STATE_LOCK
        )

    async def __aenter__(self) -> MealRecipeService:
        return self

    async def __aexit__(
        self,
        exc_type: Any,
        exc_value: Any,
        traceback: Any,
    ) -> None:
        del exc_type, exc_value, traceback
        await self.aclose()

    async def aclose(self) -> None:
        """이 요청에서 생성한 외부 API client를 정리한다."""

        try:
            await self.recipe_service.aclose()
        finally:
            close = getattr(
                self.openai_client,
                "close",
                None,
            )

            if callable(close):
                close_result = close()

                if inspect.isawaitable(close_result):
                    await close_result

    @classmethod
    def get_operational_stats(cls) -> dict[str, Any]:
        del cls

        with _SHARED_RECIPE_STATE_LOCK:
            cache_stats = {
                **_RECIPE_PIPELINE_STATS,
                "cache_entries": len(_SHARED_RECIPE_CACHE),
                "inflight_requests": len(_SHARED_RECIPE_INFLIGHT),
            }

        official_api_stats = (
            RecipeService.get_operational_stats()
        )

        return {
            "status": (
                "degraded"
                if official_api_stats["circuit_open"]
                else "ok"
            ),
            "cache": cache_stats,
            "official_recipe_api": official_api_stats,
        }

    @staticmethod
    def _unavailable_recipe_result() -> dict[str, Any]:
        return {
            "recipe_available": False,
            "recipe_source": "unavailable",
            "official_recipe": False,
            "matched_recipe_name": None,
            "match_score": None,
            "safety_checked": True,
            "restriction_matches": [],
            "recipe": None,
        }

    def _ensure_recipe_state(self) -> None:
        """생성자를 우회하는 deterministic test도 지원한다."""

        if not hasattr(self, "_recipe_cache"):
            self._recipe_cache = {}

        if not hasattr(self, "_recipe_cache_expires"):
            self._recipe_cache_expires = {}

        if not hasattr(self, "_inflight_tasks"):
            self._inflight_tasks = {}

        if not hasattr(self, "_recipe_state_lock"):
            self._recipe_state_lock = threading.RLock()

    def _get_cached_recipe(
        self,
        cache_key: str,
    ) -> dict[str, Any] | None:
        self._ensure_recipe_state()
        now = time.monotonic()

        with self._recipe_state_lock:
            cached = self._recipe_cache.get(cache_key)
            expires_at = self._recipe_cache_expires.get(
                cache_key,
                0.0,
            )

            if cached is None:
                _increment_recipe_metric("cache_misses")
                logger.debug("Recipe cache miss.")
                return None

            if expires_at <= now:
                self._recipe_cache.pop(cache_key, None)
                self._recipe_cache_expires.pop(cache_key, None)
                _increment_recipe_metric("cache_expirations")
                logger.debug("Recipe cache entry expired.")
                return None

            move_to_end = getattr(
                self._recipe_cache,
                "move_to_end",
                None,
            )

            if callable(move_to_end):
                move_to_end(cache_key)

            _increment_recipe_metric("cache_hits")
            logger.debug("Recipe cache hit.")
            return copy.deepcopy(cached)

    def _cache_recipe(
        self,
        cache_key: str,
        recipe_result: dict[str, Any],
    ) -> None:
        if not recipe_result.get("recipe_available"):
            return

        self._ensure_recipe_state()

        with self._recipe_state_lock:
            self._recipe_cache[cache_key] = copy.deepcopy(
                recipe_result
            )
            self._recipe_cache_expires[cache_key] = (
                time.monotonic()
                + self.RECIPE_CACHE_TTL_SECONDS
            )
            _increment_recipe_metric("cache_stores")

            move_to_end = getattr(
                self._recipe_cache,
                "move_to_end",
                None,
            )

            if callable(move_to_end):
                move_to_end(cache_key)

            while (
                len(self._recipe_cache)
                > self.RECIPE_CACHE_MAX_ENTRIES
            ):
                try:
                    oldest_key, _ = self._recipe_cache.popitem(
                        last=False
                    )
                except TypeError:
                    oldest_key = next(iter(self._recipe_cache))
                    self._recipe_cache.pop(oldest_key, None)

                self._recipe_cache_expires.pop(oldest_key, None)
                _increment_recipe_metric("cache_evictions")

    # ==================================================
    # 음식명 기본 정규화
    # ==================================================

    @staticmethod
    def normalize_food_name(
        food_name: str,
    ) -> str:

        text = str(
            food_name
        ).strip()

        # 괄호 내용 제거
        text = re.sub(
            r"\([^)]*\)",
            " ",
            text,
        )

        # "_" → 공백
        text = text.replace(
            "_",
            " ",
        )

        # 연속 공백 제거
        text = re.sub(
            r"\s+",
            " ",
            text,
        )

        return text.strip()

    # ==================================================
    # 레시피명 비교용 정규화
    # ==================================================

    @staticmethod
    def normalize_for_compare(
        text: str | None,
    ) -> str:

        if not text:
            return ""

        normalized = (
            str(text)
            .strip()
            .lower()
        )

        normalized = re.sub(
            r"\([^)]*\)",
            "",
            normalized,
        )

        normalized = (
            normalized
            .replace("_", "")
            .replace(" ", "")
            .replace("-", "")
            .replace("/", "")
        )

        return normalized

    # ==================================================
    # 공식 레시피 재료 문자열 → 재료명 + g 구조 변환
    # ==================================================

    @staticmethod
    def _convert_mass_to_grams(
        amount: float,
        unit: str,
    ) -> float:
        normalized_unit = (
            str(unit)
            .strip()
            .lower()
        )

        if normalized_unit in {
            "kg",
            "킬로그램",
        }:
            return amount * 1000.0

        if normalized_unit in {
            "mg",
            "밀리그램",
        }:
            return amount / 1000.0

        return amount

    @classmethod
    def parse_ingredients_text(
        cls,
        ingredients_text: str | None,
        scale_ratio: float = 1.0,
    ) -> list[dict[str, Any]]:
        """
        식품안전나라 ingredients_text를
        [{"name": ..., "amount_g": ...}] 형태로 변환한다.

        g/kg/mg 단위는 g으로 환산한다.
        '개', '큰술'처럼 질량으로 안전하게 변환할 수 없는 단위는
        임의 변환하지 않고 amount_g=None으로 둔다.
        """

        if not ingredients_text:
            return []

        safe_ratio = (
            float(scale_ratio)
            if scale_ratio and scale_ratio > 0
            else 1.0
        )

        # 쉼표/줄바꿈/세미콜론 중심으로 재료 항목 분리
        chunks = [
            chunk.strip()
            for chunk in re.split(
                r"[,;\n\r]+",
                str(ingredients_text),
            )
            if chunk.strip()
        ]

        result: list[dict[str, Any]] = []

        mass_pattern = re.compile(
            r"(?P<amount>\d+(?:\.\d+)?)\s*"
            r"(?P<unit>kg|mg|g|킬로그램|밀리그램|그램)\b",
            re.IGNORECASE,
        )

        non_mass_amount_pattern = re.compile(
            r"\s*(?:약\s*)?"
            r"(?:\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)?)\s*"
            r"(?:개|큰술|작은술|컵|쪽|줌|꼬집|방울|장|알|대|봉|팩|"
            r"티스푼|테이블스푼|ml|l|cc)\s*$",
            re.IGNORECASE,
        )

        qualitative_amount_pattern = re.compile(
            r"\s*(?:약간|적당량|조금|소량|기호에\s*따라)\s*$",
            re.IGNORECASE,
        )

        for chunk in chunks:
            cleaned = re.sub(
                r"^[\[\(]?(?:재료|주재료|부재료|양념|양념장)[\]\)]?\s*[:：-]\s*",
                "",
                chunk,
                flags=re.IGNORECASE,
            ).strip()

            if not cleaned:
                continue

            matches = list(
                mass_pattern.finditer(
                    cleaned
                )
            )

            amount_g: float | None = None
            name = cleaned

            if matches:
                # 일반적으로 마지막 질량 표기가 해당 재료의 양이다.
                match = matches[-1]

                try:
                    raw_amount = float(
                        match.group("amount")
                    )
                    amount_g = (
                        cls._convert_mass_to_grams(
                            raw_amount,
                            match.group("unit"),
                        )
                        * safe_ratio
                    )
                    amount_g = round(
                        amount_g,
                        2,
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    amount_g = None

                name = cleaned[
                    :match.start()
                ].strip(
                    " -:/()[]"
                )

            else:
                # 개/큰술/ml처럼 질량으로 안전하게 환산할 수 없는
                # 수량 표현은 g 값으로 만들지 않는다.
                # 다만 화면에 표시할 재료명에서는 수량 표현을 분리한다.
                name = non_mass_amount_pattern.sub(
                    "",
                    name,
                ).strip(
                    " -:/()[]"
                )

                name = qualitative_amount_pattern.sub(
                    "",
                    name,
                ).strip(
                    " -:/()[]"
                )

            # 질량 단위가 없는 경우에도 재료명은 보존한다.
            if not name:
                name = cleaned

            result.append(
                {
                    "name": name,
                    "amount_g": amount_g,
                }
            )

        return result

    # ==================================================
    # 사용자 제한조건 정규화
    # ==================================================

    @staticmethod
    def _normalize_string_list(
        values: list[str] | None,
    ) -> list[str]:

        if not values:
            return []

        result: list[str] = []

        for value in values:

            value = (
                str(value)
                .strip()
                .lower()
            )

            if not value:
                continue

            if value not in result:
                result.append(
                    value
                )

        return result

    # ==================================================
    # 캐시 Key 생성
    #
    # 알레르기/기피 음식뿐 아니라 portion과 영양정보도
    # LLM recipe 내용 및 공식 재료 scaling에 영향을 주므로
    # 음식명만으로 캐시하지 않음
    # ==================================================

    @staticmethod
    def _normalize_cache_number(
        value: Any,
    ) -> str:

        if value is None:
            return "none"

        try:
            return format(
                float(value),
                ".12g",
            )
        except (
            TypeError,
            ValueError,
        ):
            return str(
                value
            ).strip().lower()

    def _build_cache_key(
        self,
        food_name: str,
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
        portion_g: Any = None,
        calories_kcal: Any = None,
        protein_g: Any = None,
        fat_g: Any = None,
        carbohydrate_g: Any = None,
    ) -> str:

        normalized_food = (
            self.normalize_food_name(
                food_name
            ).lower()
        )

        normalized_allergies = sorted(
            self._normalize_string_list(
                allergies
            )
        )

        normalized_disliked = sorted(
            self._normalize_string_list(
                disliked_foods
            )
        )

        return (
            f"{normalized_food}"
            f"|portion_g={self._normalize_cache_number(portion_g)}"
            f"|calories_kcal={self._normalize_cache_number(calories_kcal)}"
            f"|protein_g={self._normalize_cache_number(protein_g)}"
            f"|fat_g={self._normalize_cache_number(fat_g)}"
            f"|carbohydrate_g={self._normalize_cache_number(carbohydrate_g)}"
            f"|allergies={','.join(normalized_allergies)}"
            f"|disliked={','.join(normalized_disliked)}"
        )

    # ==================================================
    # 공식 레시피 검색어 후보 생성
    #
    # 목적:
    # Auto-Fit 영양 DB 음식명과
    # 식품안전나라 레시피 DB 음식명의 표현 차이를 보완한다.
    #
    # 예:
    #
    # 톳나물_두부
    # →
    # 톳나물 두부
    # 톳나물
    # 두부
    # 톳
    # 두부무침
    # 톳나물 두부무침
    #
    # 혼합잡곡밥
    # →
    # 혼합잡곡밥
    # 잡곡밥
    # 잡곡
    #
    # 황태구이_양념
    # →
    # 황태구이 양념
    # 황태구이
    # 황태
    #
    # 최종 공식 레시피 선택은
    # calculate_name_similarity()와
    # OFFICIAL_SIMILARITY_THRESHOLD에서
    # 다시 보수적으로 검증한다.
    # ==================================================

    def build_recipe_queries(
        self,
        food_name: str,
    ) -> list[str]:

        queries: list[str] = []

        # ==================================================
        # Query 중복 없이 추가하는 내부 함수
        # ==================================================

        def add_query(
            value: str | None,
        ) -> None:

            if not value:
                return

            value = re.sub(
                r"\s+",
                " ",
                str(value),
            ).strip()

            if not value:
                return

            if value not in queries:

                queries.append(
                    value
                )

        # ==================================================
        # 1. 기본 음식명 정규화
        # ==================================================

        normalized = (
            self.normalize_food_name(
                food_name
            )
        )

        add_query(
            normalized
        )

        # ==================================================
        # 2. "_" 기준 원본 구성요소 분리
        #
        # 예:
        # 톳나물_두부
        # →
        # 톳나물
        # 두부
        # ==================================================

        parts = [

            self.normalize_food_name(
                part
            )

            for part in str(
                food_name
            ).split("_")

            if part.strip()

        ]

        for part in parts:

            add_query(
                part
            )

        # ==================================================
        # 3. 공백 단위 구성요소 추가
        # ==================================================

        words = [

            word.strip()

            for word in normalized.split()

            if word.strip()

        ]

        for word in words:

            if len(word) >= 2:

                add_query(
                    word
                )

        # ==================================================
        # 4. "나물" 계열 확장
        #
        # 식품영양 DB:
        # 톳나물_두부
        #
        # 식품안전나라:
        # 톳나물 두부무침
        #
        # 같은 표현 차이를 보완한다.
        # ==================================================

        has_namul = any(

            "나물" in word

            for word in words

        )

        if has_namul:

            # ----------------------------------------------
            # "톳나물" → "톳"
            # ----------------------------------------------

            for word in words:

                if word.endswith(
                    "나물"
                ):

                    base = word[
                        :-2
                    ].strip()

                    if len(base) >= 1:

                        add_query(
                            base
                        )

            # ----------------------------------------------
            # 전체 음식명 + "무침"
            #
            # 톳나물 두부
            # →
            # 톳나물 두부무침
            # ----------------------------------------------

            if normalized:

                add_query(
                    f"{normalized}무침"
                )

            # ----------------------------------------------
            # 나물 이외의 주요 재료 + "무침"
            #
            # 두부
            # →
            # 두부무침
            # ----------------------------------------------

            for word in words:

                if (
                    "나물" not in word
                    and len(word) >= 2
                ):

                    add_query(
                        f"{word}무침"
                    )

        # ==================================================
        # 5. "구이" 계열 확장
        #
        # 황태구이
        # →
        # 황태
        #
        # 검색 범위만 확장한다.
        # 황태해장국 등 엉뚱한 결과는
        # 최종 유사도 검사에서 제거한다.
        # ==================================================

        for word in words:

            if word.endswith(
                "구이"
            ):

                base = word[
                    :-2
                ].strip()

                if len(base) >= 2:

                    add_query(
                        base
                    )

        # ==================================================
        # 6. 밥 계열의 표현 차이 보완
        #
        # 혼합잡곡밥
        # →
        # 잡곡밥
        # 잡곡
        #
        # 단, 검색 결과를 무조건 사용하는 것이 아니라
        # 기존 similarity 0.82 조건을 그대로 적용한다.
        # ==================================================

        for word in words:

            # ----------------------------------------------
            # "혼합" prefix 제거
            # ----------------------------------------------

            if (
                word.startswith(
                    "혼합"
                )
                and len(word) > 2
            ):

                without_mixed = (
                    word[
                        2:
                    ].strip()
                )

                if without_mixed:

                    add_query(
                        without_mixed
                    )

                    if (
                        without_mixed.endswith(
                            "밥"
                        )
                        and len(
                            without_mixed
                        ) > 1
                    ):

                        add_query(
                            without_mixed[
                                :-1
                            ]
                        )

            # ----------------------------------------------
            # 일반 "OO밥" → "OO"
            # 너무 짧은 단어는 제외
            # ----------------------------------------------

            if (
                word.endswith(
                    "밥"
                )
                and len(word) >= 3
            ):

                base = word[
                    :-1
                ].strip()

                if len(base) >= 2:

                    add_query(
                        base
                    )

        # ==================================================
        # 7. 검색 가치가 낮은 일반 단어 제거
        # ==================================================

        ignored_queries = {

            "양념",
            "양념장",

            "간편조리세트",

            "채소",
            "야채",

            "소스",
            "드레싱",

            "구이",
            "볶음",
            "무침",
            "조림",

            "쌀",

        }

        filtered: list[str] = []

        for query in queries:

            query = query.strip()

            if not query:

                continue

            if query in ignored_queries:

                continue

            if query in filtered:

                continue

            filtered.append(
                query
            )

        # ==================================================
        # 검색어가 과도하게 증가하지 않도록 제한
        #
        # 공식 API 요청 횟수 증가 방지
        # ==================================================

        return filtered[
            :10
        ]

    # ==================================================
    # 공식 메뉴명 유사도 계산
    # ==================================================

    def calculate_name_similarity(
        self,
        source_name: str,
        recipe_name: str,
    ) -> float:

        source = (
            self.normalize_for_compare(
                source_name
            )
        )

        target = (
            self.normalize_for_compare(
                recipe_name
            )
        )

        if (
            not source
            or not target
        ):
            return 0.0

        # 완전 일치
        if source == target:
            return 1.0

        # 포함 관계
        if (
            source in target
            or target in source
        ):

            shorter = min(
                len(source),
                len(target),
            )

            longer = max(
                len(source),
                len(target),
            )

            ratio = (
                shorter / longer
                if longer
                else 0.0
            )

            return min(
                0.97,
                0.78 + ratio * 0.19,
            )

        return SequenceMatcher(
            None,
            source,
            target,
        ).ratio()

    # ==================================================
    # 알레르기 키워드 확장
    # ==================================================

    def _get_allergy_keywords(
        self,
        allergies: list[str] | None,
    ) -> set[str]:

        result: set[str] = set()

        for allergy in (
            self._normalize_string_list(
                allergies
            )
        ):

            result.add(
                allergy
            )

            mapped = (
                ALLERGY_KEYWORD_MAP.get(
                    allergy,
                    set(),
                )
            )

            for keyword in mapped:
                result.add(
                    keyword.lower()
                )

        return result

    # ==================================================
    # 텍스트에 알레르기/기피 재료가 존재하는지 검사
    # ==================================================

    def find_restriction_matches(
        self,
        text: str | None,
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> list[str]:

        if not text:
            return []

        normalized_text = (
            str(text)
            .strip()
            .lower()
        )

        matches: set[str] = set()

        # 알레르기 검사
        allergy_keywords = (
            self._get_allergy_keywords(
                allergies
            )
        )

        for keyword in allergy_keywords:

            if keyword in normalized_text:
                matches.add(
                    keyword
                )

        # 기피 음식 검사
        for disliked in (
            self._normalize_string_list(
                disliked_foods
            )
        ):

            if disliked in normalized_text:
                matches.add(
                    disliked
                )

        return sorted(
            matches
        )

    # ==================================================
    # 공식 레시피 재료 안전성 검사
    # ==================================================

    def is_official_recipe_safe(
        self,
        recipe: dict[str, Any],
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> bool:

        ingredients_text = recipe.get(
            "ingredients_text"
        )

        # 알레르기가 있는데 공식 재료정보 자체가 없으면
        # 안전하다고 확정하지 않고 사용하지 않음
        if (
            allergies
            and not ingredients_text
        ):
            return False

        restriction_matches = (
            self.find_restriction_matches(
                text=ingredients_text,
                allergies=allergies,
                disliked_foods=disliked_foods,
            )
        )

        return (
            len(
                restriction_matches
            )
            == 0
        )

    # ==================================================
    # 공식 레시피 후보 중 최적 결과 선택
    #
    # 사용자 제한조건에 걸리는 레시피는 후보에서 제거
    # ==================================================

    def select_best_official_recipe(
        self,
        food_name: str,
        recipes: list[
            dict[str, Any]
        ],
        allergies: list[str] | None = None,
        disliked_foods: list[str] | None = None,
    ) -> tuple[
        dict[str, Any] | None,
        float,
    ]:

        best_recipe: (
            dict[str, Any] | None
        ) = None

        best_score = 0.0

        for recipe in recipes:

            # 사용자 안전 조건 검사
            if not self.is_official_recipe_safe(
                recipe=recipe,
                allergies=allergies,
                disliked_foods=disliked_foods,
            ):
                continue

            recipe_name = recipe.get(
                "menu_name"
            )

            if not recipe_name:
                continue

            score = (
                self.calculate_name_similarity(
                    source_name=food_name,
                    recipe_name=recipe_name,
                )
            )

            if score > best_score:

                best_score = score
                best_recipe = recipe

        return (
            best_recipe,
            round(
                best_score,
                4,
            ),
        )

    # ==================================================
    # 공식 레시피 검색
    #
    # 1. exact
    # 2. sufficiently similar
    # 3. 없으면 None
    # ==================================================

    async def find_official_recipe(
        self,
        food_name: str,
        allergies: list[str] | None = None,
        disliked_foods: list[str] | None = None,
    ) -> dict[str, Any] | None:

        queries = (
            self.build_recipe_queries(
                food_name
            )
        )

        collected_recipes: list[
            dict[str, Any]
        ] = []

        seen_recipe_ids: set[
            str
        ] = set()

        # ==================================================
        # 여러 검색어로 공식 레시피 검색
        # ==================================================

        for query in queries:

            try:

                recipes = (
                    await self.recipe_service
                    .search_recipes_by_name(
                        menu_name=query,
                        start_idx=1,
                        end_idx=100,
                    )
                )

            except Exception:

                # 공식 API 장애 시에도
                # LLM fallback까지 진행할 수 있도록 계속
                continue

            for recipe in recipes:

                recipe_id = str(
                    recipe.get(
                        "recipe_id"
                    )
                    or ""
                )

                if (
                    recipe_id
                    and recipe_id
                    in seen_recipe_ids
                ):
                    continue

                if recipe_id:
                    seen_recipe_ids.add(
                        recipe_id
                    )

                collected_recipes.append(
                    recipe
                )

        if not collected_recipes:
            return None

        (
            best_recipe,
            similarity,
        ) = (
            self.select_best_official_recipe(
                food_name=food_name,
                recipes=collected_recipes,
                allergies=allergies,
                disliked_foods=disliked_foods,
            )
        )

        if best_recipe is None:
            return None

        original_name = (
            self.normalize_for_compare(
                food_name
            )
        )

        recipe_name = (
            self.normalize_for_compare(
                best_recipe.get(
                    "menu_name"
                )
            )
        )

        # ==================================================
        # 정확 공식 레시피
        # ==================================================

        if (
            original_name
            == recipe_name
        ):

            return {
                "match_type": (
                    "official_exact"
                ),

                "similarity": 1.0,

                "recipe": (
                    best_recipe
                ),
            }

        # ==================================================
        # 유사 공식 레시피
        # ==================================================

        if (
            similarity
            >= self.OFFICIAL_SIMILARITY_THRESHOLD
        ):

            return {
                "match_type": (
                    "official_similar"
                ),

                "similarity": (
                    similarity
                ),

                "recipe": (
                    best_recipe
                ),
            }

        return None

    # ==================================================
    # LLM 생성 레시피의 제한 재료 검사
    # ==================================================

    def validate_generated_recipe(
        self,
        generated: GeneratedRecipeResponse,
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> list[str]:

        recipe_text = " ".join(
            ingredient.name
            for ingredient
            in generated.ingredients
        )

        return (
            self.find_restriction_matches(
                text=recipe_text,
                allergies=allergies,
                disliked_foods=disliked_foods,
            )
        )

    # ==================================================
    # 공식 레시피가 없을 경우
    # 사용자 제한조건을 반영해 LLM 레시피 생성
    # ==================================================

    async def generate_llm_recipe(
        self,
        item: dict[str, Any],
        allergies: list[str] | None = None,
        disliked_foods: list[str] | None = None,
    ) -> dict[str, Any]:

        food_name = (
            item.get(
                "food_name"
            )
            or ""
        )

        portion_g = item.get(
            "portion_g"
        )

        calories = item.get(
            "calories_kcal"
        )

        protein = item.get(
            "protein_g"
        )

        fat = item.get(
            "fat_g"
        )

        carbs = item.get(
            "carbohydrate_g"
        )

        normalized_allergies = (
            self._normalize_string_list(
                allergies
            )
        )

        normalized_disliked = (
            self._normalize_string_list(
                disliked_foods
            )
        )

        allergy_keywords = sorted(
            self._get_allergy_keywords(
                normalized_allergies
            )
        )

        # ==================================================
        # 안전성을 위해 최대 2회 생성 시도
        # ==================================================

        previous_violations: list[str] = []

        for attempt in range(
            1,
            3,
        ):

            retry_instruction = ""

            if previous_violations:

                retry_instruction = f"""
이전 생성 결과에서 아래 금지 재료가 발견되었다.

금지 재료:
{", ".join(previous_violations)}

이번에는 해당 재료 및 파생 재료를
절대 포함하지 않는다.
"""

            prompt = f"""
너는 Auto-Fit 건강 식단 서비스의
조리법 생성 도우미다.

아래 음식은 대한민국 공식 식품영양 데이터에서
선택된 실제 음식이다.

공식 레시피 DB에서 안전하게 사용할 수 있는
동일 또는 충분히 유사한 레시피를 찾지 못했다.

음식명과 권장 제공량을 기준으로
가정에서 따라할 수 있는 현실적인 조리법을 작성한다.

[음식]

음식명:
{food_name}

권장 제공량:
{portion_g}g

영양 정보:
열량 {calories} kcal
단백질 {protein}g
지방 {fat}g
탄수화물 {carbs}g

[사용자 알레르기]

{normalized_allergies}

[알레르기 관련 금지 키워드]

{allergy_keywords}

[사용자가 싫어하는 음식]

{normalized_disliked}

[필수 규칙]

1. 사용자 알레르기 재료를 절대 포함하지 않는다.

2. 알레르기 재료의 파생 식품도 포함하지 않는다.

3. 사용자가 싫어하는 음식도 포함하지 않는다.

4. 음식명에서 일반적으로 예상할 수 있는
   조리 형태를 크게 벗어나지 않는다.

5. 특정 브랜드 상품의 정확한 제조법을
   알고 있는 것처럼 작성하지 않는다.

6. 지나친 소금, 설탕, 버터,
   튀김용 기름 사용을 피한다.

7. 굽기, 찌기, 삶기, 데치기,
   가벼운 볶기 등을 우선한다.

8. 재료는 최대 12개 정도로 작성한다.

9. 각 재료는 name과 amount_g를 반드시 제공한다.

10. amount_g는 해당 추천 제공량을 조리하기 위한 입력 재료의
    현실적인 중량(g)으로 작성한다.

11. '1개', '1큰술', '약간' 같은 단위 대신 가능한 한 g으로 작성한다.

12. 재료별 칼로리, 탄수화물, 단백질, 지방은 생성하지 않는다.

13. 조리 단계는 3~8단계로 작성한다.

14. 공식기관의 레시피라고 주장하지 않는다.

15. 질환을 치료하거나 예방한다고 표현하지 않는다.

16. 한국 가정에서 이해하기 쉬운
    한국어로 작성한다.

{retry_instruction}
"""

            try:

                response = (
                    await self.openai_client.responses.parse(
                        model=(
                            self.settings.openai_model
                        ),

                        input=prompt,

                        text_format=(
                            GeneratedRecipeResponse
                        ),

                        max_output_tokens=1200,
                    )
                )

            except Exception:
                _increment_recipe_metric("llm_failures")
                logger.exception(
                    "LLM recipe generation failed (attempt %s/2).",
                    attempt,
                )
                continue

            generated = (
                response.output_parsed
            )

            if generated is None:
                continue

            # ==================================================
            # 생성 후 다시 코드 레벨에서 안전성 검사
            # ==================================================

            violations = (
                self.validate_generated_recipe(
                    generated=generated,
                    allergies=normalized_allergies,
                    disliked_foods=normalized_disliked,
                )
            )

            if violations:

                previous_violations = (
                    violations
                )

                continue

            return {
                "recipe_available": True,

                "recipe_source": (
                    "llm_generated"
                ),

                "official_recipe": False,

                "matched_recipe_name": None,

                "match_score": None,

                "safety_checked": True,

                "restriction_matches": [],

                "recipe": {
                    "recipe_id": None,

                    "menu_name": (
                        food_name
                    ),

                    "cooking_method": None,

                    "dish_type": None,

                    "serving_weight": (
                        portion_g
                    ),

                    "ingredients_text": None,

                    "ingredients": [
                        ingredient.model_dump()
                        for ingredient
                        in generated.ingredients
                    ],

                    "steps": (
                        generated.steps
                    ),

                    "cooking_tip": (
                        generated.cooking_tip
                    ),

                    "image_small": None,

                    "image_large": None,

                    "source": (
                        "Auto-Fit AI 생성 조리법"
                    ),
                },
            }

        # ==================================================
        # 두 번 생성 후에도 안전검사 실패
        # ==================================================

        return {
            "recipe_available": False,

            "recipe_source": (
                "unavailable"
            ),

            "official_recipe": False,

            "matched_recipe_name": None,

            "match_score": None,

            "safety_checked": True,

            "restriction_matches": (
                previous_violations
            ),

            "recipe": None,
        }

    # ==================================================
    # 공식 레시피 결과 구성
    # ==================================================

    def build_official_recipe_result(
        self,
        official_result: dict[
            str,
            Any
        ],
        target_portion_g: float | None = None,
    ) -> dict[str, Any]:

        recipe = (
            official_result[
                "recipe"
            ]
        )

        official_serving_weight = (
            recipe.get(
                "serving_weight"
            )
        )

        scale_ratio = 1.0

        try:
            if (
                target_portion_g is not None
                and official_serving_weight is not None
                and float(target_portion_g) > 0
                and float(official_serving_weight) > 0
            ):
                scale_ratio = (
                    float(target_portion_g)
                    / float(official_serving_weight)
                )
        except (
            TypeError,
            ValueError,
            ZeroDivisionError,
        ):
            scale_ratio = 1.0

        structured_ingredients = (
            self.parse_ingredients_text(
                recipe.get(
                    "ingredients_text"
                ),
                scale_ratio=scale_ratio,
            )
        )

        adapted_serving_weight = (
            float(target_portion_g)
            if target_portion_g is not None
            else official_serving_weight
        )

        return {
            "recipe_available": True,

            "recipe_source": (
                official_result[
                    "match_type"
                ]
            ),

            "official_recipe": True,

            "matched_recipe_name": (
                recipe.get(
                    "menu_name"
                )
            ),

            "match_score": (
                official_result[
                    "similarity"
                ]
            ),

            "safety_checked": True,

            "restriction_matches": [],

            "recipe": {
                "recipe_id": (
                    recipe.get(
                        "recipe_id"
                    )
                ),

                "menu_name": (
                    recipe.get(
                        "menu_name"
                    )
                ),

                "cooking_method": (
                    recipe.get(
                        "cooking_method"
                    )
                ),

                "dish_type": (
                    recipe.get(
                        "dish_type"
                    )
                ),

                "serving_weight": (
                    adapted_serving_weight
                ),

                "ingredients_text": (
                    recipe.get(
                        "ingredients_text"
                    )
                ),

                "ingredients": (
                    structured_ingredients
                ),

                "steps": (
                    recipe.get(
                        "steps",
                        [],
                    )
                ),

                "cooking_tip": (
                    recipe.get(
                        "cooking_tip"
                    )
                ),

                "image_small": (
                    recipe.get(
                        "image_small"
                    )
                ),

                "image_large": (
                    recipe.get(
                        "image_large"
                    )
                ),

                "source": (
                    recipe.get(
                        "source"
                    )
                ),
            },
        }

    # ==================================================
    # 음식 1개의 레시피 해결
    # ==================================================

    async def _resolve_recipe(
        self,
        item: dict[str, Any],
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> dict[str, Any]:

        food_name = (
            item.get(
                "food_name"
            )
        )

        if not food_name:

            return self._unavailable_recipe_result()

        # ==================================================
        # 공식 레시피 우선 검색
        # ==================================================

        try:
            official_result = (
                await self.find_official_recipe(
                    food_name=food_name,
                    allergies=allergies,
                    disliked_foods=disliked_foods,
                )
            )
        except Exception:
            _increment_recipe_metric("official_api_fallbacks")
            logger.exception(
                "Official recipe lookup failed; using LLM fallback."
            )
            official_result = None

        if official_result is not None:

            return (
                self.build_official_recipe_result(
                    official_result,
                    target_portion_g=(
                        item.get(
                            "portion_g"
                        )
                    ),
                )
            )

        # ==================================================
        # 공식 레시피 없음 → LLM fallback
        # ==================================================

        return await self.generate_llm_recipe(
            item=item,
            allergies=allergies,
            disliked_foods=disliked_foods,
        )

    # ==================================================
    # 단일 음식 레시피 연결
    #
    # Single-flight 적용으로 동일 음식의
    # 결과가 official/LLM으로 엇갈리는 현상 방지
    # ==================================================

    async def enrich_meal_item(
        self,
        item: dict[str, Any],
        allergies: list[str] | None = None,
        disliked_foods: list[str] | None = None,
    ) -> dict[str, Any]:

        result = (
            item.copy()
        )

        food_name = (
            item.get(
                "food_name"
            )
        )

        if not food_name:

            result.update(
                self._unavailable_recipe_result()
            )

            return result

        cache_key = (
            self._build_cache_key(
                food_name=food_name,
                allergies=allergies,
                disliked_foods=disliked_foods,
                portion_g=(
                    item.get(
                        "portion_g"
                    )
                ),
                calories_kcal=(
                    item.get(
                        "calories_kcal"
                    )
                ),
                protein_g=(
                    item.get(
                        "protein_g"
                    )
                ),
                fat_g=(
                    item.get(
                        "fat_g"
                    )
                ),
                carbohydrate_g=(
                    item.get(
                        "carbohydrate_g"
                    )
                ),
            )
        )

        self._ensure_recipe_state()
        current_loop = asyncio.get_running_loop()

        with self._recipe_state_lock:
            cached_recipe = self._get_cached_recipe(
                cache_key
            )
            task = None

            if (
                cached_recipe is None
            ):
                task = self._inflight_tasks.get(cache_key)

            if (
                cached_recipe is None
                and task is not None
                and (
                    task.done()
                    or task.get_loop() is not current_loop
                )
            ):
                self._inflight_tasks.pop(cache_key, None)
                task = None

            if cached_recipe is None and task is None:
                task = asyncio.create_task(
                    self._resolve_recipe(
                        item=item,
                        allergies=allergies,
                        disliked_foods=disliked_foods,
                    )
                )
                self._inflight_tasks[cache_key] = task
                task_owner = True
            else:
                task_owner = False

        if cached_recipe is not None:
            result.update(cached_recipe)
            return result

        if not task_owner:
            _increment_recipe_metric("inflight_waits")
            logger.debug("Waiting for in-flight recipe lookup.")

        # ==================================================
        # 최초 요청만 실제 API/LLM 실행하고,
        # 모든 대기자는 같은 결과를 캐시에 반영
        # ==================================================

        try:

            recipe_result = (
                await task
            )

            self._cache_recipe(
                cache_key,
                recipe_result,
            )

        finally:

            with self._recipe_state_lock:
                if (
                    self._inflight_tasks.get(cache_key)
                    is task
                ):
                    self._inflight_tasks.pop(
                        cache_key,
                        None,
                    )

        result.update(
            copy.deepcopy(recipe_result)
        )

        return result

    # ==================================================
    # 한 끼 전체 레시피 연결
    # ==================================================

    async def enrich_meal(
        self,
        meal: dict[str, Any],
        allergies: list[str] | None = None,
        disliked_foods: list[str] | None = None,
    ) -> dict[str, Any]:

        result = (
            meal.copy()
        )

        items = meal.get(
            "items",
            [],
        )

        if not items:

            result[
                "items"
            ] = []

            return result

        item_results = (
            await asyncio.gather(
                *[
                    self.enrich_meal_item(
                        item=item,
                        allergies=allergies,
                        disliked_foods=disliked_foods,
                    )
                    for item in items
                ],
                return_exceptions=True,
            )
        )

        enriched_items: list[dict[str, Any]] = []

        for item, item_result in zip(
            items,
            item_results,
        ):
            if isinstance(item_result, asyncio.CancelledError):
                raise item_result

            if isinstance(item_result, BaseException):
                _increment_recipe_metric("item_failures")
                logger.error(
                    "Recipe enrichment failed for one meal item.",
                    exc_info=(
                        type(item_result),
                        item_result,
                        item_result.__traceback__,
                    ),
                )
                fallback_item = item.copy()
                fallback_item.update(
                    self._unavailable_recipe_result()
                )
                enriched_items.append(fallback_item)
            else:
                enriched_items.append(item_result)

        result[
            "items"
        ] = list(
            enriched_items
        )

        return result

    # ==================================================
    # 여러 추천 식단 전체에 레시피 연결
    # ==================================================

    async def enrich_meals(
        self,
        meals: list[
            dict[str, Any]
        ],
        allergies: list[str] | None = None,
        disliked_foods: list[str] | None = None,
    ) -> list[
        dict[str, Any]
    ]:

        if not meals:
            return []

        meal_results = (
            await asyncio.gather(
                *[
                    self.enrich_meal(
                        meal=meal,
                        allergies=allergies,
                        disliked_foods=disliked_foods,
                    )
                    for meal in meals
                ],
                return_exceptions=True,
            )
        )

        enriched_meals: list[dict[str, Any]] = []

        for meal, meal_result in zip(
            meals,
            meal_results,
        ):
            if isinstance(meal_result, asyncio.CancelledError):
                raise meal_result

            if isinstance(meal_result, BaseException):
                _increment_recipe_metric("item_failures")
                logger.error(
                    "Recipe enrichment failed for one meal.",
                    exc_info=(
                        type(meal_result),
                        meal_result,
                        meal_result.__traceback__,
                    ),
                )
                fallback_meal = meal.copy()
                fallback_meal["items"] = [
                    {
                        **item,
                        **self._unavailable_recipe_result(),
                    }
                    for item in meal.get("items", [])
                ]
                enriched_meals.append(fallback_meal)
            else:
                enriched_meals.append(meal_result)

        return enriched_meals
