from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import get_settings


logger = logging.getLogger(__name__)


_RECIPE_API_STATE_LOCK = threading.Lock()
_RECIPE_API_STATS = {
    "requests": 0,
    "successes": 0,
    "failures": 0,
    "retries": 0,
    "circuit_rejections": 0,
}
_RECIPE_API_CONSECUTIVE_FAILURES = 0
_RECIPE_API_CIRCUIT_OPEN_UNTIL = 0.0


class OfficialRecipeCircuitOpenError(RuntimeError):
    """공식 Recipe API circuit가 복구 대기 중임을 나타낸다."""


# =========================================================
# 식품안전나라 레시피 API 설정
# =========================================================

FOOD_SAFETY_RECIPE_BASE_URL = (
    "http://openapi.foodsafetykorea.go.kr/api"
)

RECIPE_SERVICE_ID = "COOKRCP01"


# =========================================================
# Recipe Service
# =========================================================


class RecipeService:
    """
    식품의약품안전처 식품안전나라
    조리식품 레시피 API 전용 서비스.

    역할:
    1. 공식 레시피 API 호출
    2. 메뉴명 검색
    3. 식품안전나라 응답 정규화

    주의:
    - exact / similar 판정은 MealRecipeService가 담당한다.
    - 알레르기 / 기피 음식 검사는 MealRecipeService가 담당한다.
    - LLM fallback도 MealRecipeService가 담당한다.
    """

    REQUEST_MAX_ATTEMPTS = 3
    REQUEST_RETRY_BACKOFF_SECONDS = 0.25

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = get_settings()
        self._client = client
        self._owns_client = client is None
        self.REQUEST_MAX_ATTEMPTS = (
            self.settings.recipe_api_max_attempts
        )
        self.REQUEST_RETRY_BACKOFF_SECONDS = (
            self.settings.recipe_api_retry_backoff_seconds
        )
        self._request_timeout_seconds = (
            self.settings.recipe_api_timeout_seconds
        )
        self._circuit_failure_threshold = (
            self.settings.recipe_api_circuit_failure_threshold
        )
        self._circuit_recovery_seconds = (
            self.settings.recipe_api_circuit_recovery_seconds
        )

    @classmethod
    def get_operational_stats(cls) -> dict[str, Any]:
        del cls

        with _RECIPE_API_STATE_LOCK:
            remaining_seconds = max(
                0.0,
                _RECIPE_API_CIRCUIT_OPEN_UNTIL
                - time.monotonic(),
            )
            return {
                **_RECIPE_API_STATS,
                "consecutive_failures": (
                    _RECIPE_API_CONSECUTIVE_FAILURES
                ),
                "circuit_open": remaining_seconds > 0,
                "circuit_retry_after_seconds": round(
                    remaining_seconds,
                    3,
                ),
            }

    @classmethod
    def reset_operational_state(cls) -> None:
        """테스트 및 운영 복구 시 메모리 상태를 초기화한다."""

        del cls
        global _RECIPE_API_CONSECUTIVE_FAILURES
        global _RECIPE_API_CIRCUIT_OPEN_UNTIL

        with _RECIPE_API_STATE_LOCK:
            for key in _RECIPE_API_STATS:
                _RECIPE_API_STATS[key] = 0

            _RECIPE_API_CONSECUTIVE_FAILURES = 0
            _RECIPE_API_CIRCUIT_OPEN_UNTIL = 0.0

    def _record_request_success(self) -> None:
        global _RECIPE_API_CONSECUTIVE_FAILURES
        global _RECIPE_API_CIRCUIT_OPEN_UNTIL

        with _RECIPE_API_STATE_LOCK:
            _RECIPE_API_STATS["successes"] += 1
            _RECIPE_API_CONSECUTIVE_FAILURES = 0
            _RECIPE_API_CIRCUIT_OPEN_UNTIL = 0.0

    def _record_request_failure(
        self,
        *,
        circuit_failure: bool,
    ) -> None:
        global _RECIPE_API_CONSECUTIVE_FAILURES
        global _RECIPE_API_CIRCUIT_OPEN_UNTIL

        with _RECIPE_API_STATE_LOCK:
            _RECIPE_API_STATS["failures"] += 1

            if not circuit_failure:
                return

            _RECIPE_API_CONSECUTIVE_FAILURES += 1

            if (
                _RECIPE_API_CONSECUTIVE_FAILURES
                >= self._circuit_failure_threshold
            ):
                _RECIPE_API_CIRCUIT_OPEN_UNTIL = (
                    time.monotonic()
                    + self._circuit_recovery_seconds
                )
                logger.error(
                    "Official recipe API circuit opened after %s "
                    "consecutive failures.",
                    _RECIPE_API_CONSECUTIVE_FAILURES,
                )

    @staticmethod
    def _record_retry() -> None:
        with _RECIPE_API_STATE_LOCK:
            _RECIPE_API_STATS["retries"] += 1

    @staticmethod
    def _begin_request() -> None:
        with _RECIPE_API_STATE_LOCK:
            _RECIPE_API_STATS["requests"] += 1

            if (
                _RECIPE_API_CIRCUIT_OPEN_UNTIL
                > time.monotonic()
            ):
                _RECIPE_API_STATS["circuit_rejections"] += 1
                raise OfficialRecipeCircuitOpenError(
                    "공식 레시피 API circuit가 복구 대기 중입니다."
                )

    async def _get_client(
        self,
    ) -> httpx.AsyncClient:
        """같은 서비스 인스턴스 안에서 HTTP 연결을 재사용한다."""

        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._request_timeout_seconds,
            )

        return self._client

    async def aclose(self) -> None:
        """서비스가 소유한 HTTP client를 정리한다."""

        if (
            self._owns_client
            and self._client is not None
        ):
            await self._client.aclose()
            self._client = None

    async def _request_json(
        self,
        url: str,
    ) -> dict[str, Any]:
        """일시적인 공식 API 장애만 제한적으로 재시도한다."""

        self._begin_request()
        client = await self._get_client()

        for attempt in range(
            1,
            self.REQUEST_MAX_ATTEMPTS + 1,
        ):
            try:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

                if not isinstance(data, dict):
                    raise ValueError(
                        "공식 레시피 API 응답이 객체가 아닙니다."
                    )

                self._record_request_success()
                return data

            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code
                retryable = (
                    status_code == 429
                    or status_code >= 500
                )

                if (
                    not retryable
                    or attempt >= self.REQUEST_MAX_ATTEMPTS
                ):
                    self._record_request_failure(
                        circuit_failure=retryable,
                    )
                    raise

                self._record_retry()

                logger.warning(
                    "Official recipe API returned a retryable status "
                    "(%s/%s, status=%s).",
                    attempt,
                    self.REQUEST_MAX_ATTEMPTS,
                    status_code,
                )

            except (
                httpx.RequestError,
                ValueError,
            ):
                if attempt >= self.REQUEST_MAX_ATTEMPTS:
                    self._record_request_failure(
                        circuit_failure=True,
                    )
                    raise

                self._record_retry()

                logger.warning(
                    "Official recipe API request failed temporarily "
                    "(%s/%s).",
                    attempt,
                    self.REQUEST_MAX_ATTEMPTS,
                    exc_info=True,
                )

            await asyncio.sleep(
                self.REQUEST_RETRY_BACKOFF_SECONDS
                * (2 ** (attempt - 1))
            )

        raise RuntimeError(
            "공식 레시피 API 재시도 상태가 올바르지 않습니다."
        )

    # =====================================================
    # API Key
    # =====================================================

    def _get_api_key(
        self,
    ) -> str:
        api_key = (
            self.settings
            .food_safety_recipe_api_key
        )

        if not api_key:
            raise RuntimeError(
                "FOOD_SAFETY_RECIPE_API_KEY가 "
                "설정되지 않았습니다."
            )

        return api_key

    # =====================================================
    # 공식 레시피 전체/구간 조회
    # =====================================================

    async def fetch_recipes(
        self,
        start_idx: int = 1,
        end_idx: int = 100,
    ) -> list[dict[str, Any]]:
        """
        식품안전나라 레시피를
        지정한 범위만큼 조회한다.
        """

        if start_idx < 1:
            raise ValueError(
                "start_idx는 1 이상이어야 합니다."
            )

        if end_idx < start_idx:
            raise ValueError(
                "end_idx는 start_idx보다 "
                "크거나 같아야 합니다."
            )

        if (
            end_idx
            - start_idx
            + 1
            > 1000
        ):
            raise ValueError(
                "한 번에 최대 1000건까지 "
                "조회할 수 있습니다."
            )

        api_key = (
            self._get_api_key()
        )

        url = (
            f"{FOOD_SAFETY_RECIPE_BASE_URL}/"
            f"{api_key}/"
            f"{RECIPE_SERVICE_ID}/json/"
            f"{start_idx}/"
            f"{end_idx}"
        )

        data = await self._request_json(
            url
        )

        rows = self._extract_rows(
            data
        )

        return [
            self.normalize_recipe(
                row
            )
            for row in rows
            if isinstance(
                row,
                dict,
            )
        ]

    # =====================================================
    # 메뉴명 기반 공식 레시피 검색
    # =====================================================

    async def search_recipes_by_name(
        self,
        menu_name: str,
        start_idx: int = 1,
        end_idx: int = 100,
    ) -> list[dict[str, Any]]:
        """
        식품안전나라 레시피 DB에서
        메뉴명(RCP_NM) 기준으로 검색한다.

        MealRecipeService가 생성한 여러 검색어:

        예:
        톳나물 두부
        톳나물
        두부
        톳
        톳나물 두부무침

        등을 이 메서드로 전달한다.
        """

        menu_name = str(
            menu_name
        ).strip()

        if not menu_name:
            return []

        if start_idx < 1:
            raise ValueError(
                "start_idx는 1 이상이어야 합니다."
            )

        if end_idx < start_idx:
            raise ValueError(
                "end_idx는 start_idx보다 "
                "크거나 같아야 합니다."
            )

        if (
            end_idx
            - start_idx
            + 1
            > 1000
        ):
            raise ValueError(
                "한 번에 최대 1000건까지 "
                "조회할 수 있습니다."
            )

        api_key = (
            self._get_api_key()
        )

        encoded_menu_name = quote(
            menu_name,
            safe="",
        )

        url = (
            f"{FOOD_SAFETY_RECIPE_BASE_URL}/"
            f"{api_key}/"
            f"{RECIPE_SERVICE_ID}/json/"
            f"{start_idx}/"
            f"{end_idx}/"
            f"RCP_NM="
            f"{encoded_menu_name}"
        )

        data = await self._request_json(
            url
        )

        rows = self._extract_rows(
            data
        )

        return [
            self.normalize_recipe(
                row
            )
            for row in rows
            if isinstance(
                row,
                dict,
            )
        ]

    # =====================================================
    # 식품안전나라 Response row 추출
    # =====================================================

    def _extract_rows(
        self,
        data: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """
        식품안전나라 API 응답에서
        실제 row 배열을 추출한다.
        """

        service_data = data.get(
            RECIPE_SERVICE_ID,
            {},
        )

        if not isinstance(
            service_data,
            dict,
        ):
            return []

        result = service_data.get(
            "RESULT",
            {},
        )

        if isinstance(
            result,
            dict,
        ):

            result_code = str(
                result.get(
                    "CODE"
                )
                or ""
            ).strip()

            result_message = str(
                result.get(
                    "MSG"
                )
                or ""
            ).strip()

            # ---------------------------------------------
            # 조회 결과 없음
            # ---------------------------------------------

            if (
                result_code
                == "INFO-200"
            ):
                return []

            # ---------------------------------------------
            # 정상 응답이 아닌 명시적 오류
            # ---------------------------------------------

            if (
                result_code
                and result_code
                != "INFO-000"
            ):
                raise RuntimeError(
                    "식품안전나라 레시피 API 오류: "
                    f"{result_code} / "
                    f"{result_message}"
                )

        rows = service_data.get(
            "row",
            [],
        )

        # API가 1개 row를 dict로 반환하는 경우 방어
        if isinstance(
            rows,
            dict,
        ):
            return [
                rows
            ]

        if not isinstance(
            rows,
            list,
        ):
            return []

        return [
            row
            for row in rows
            if isinstance(
                row,
                dict,
            )
        ]

    # =====================================================
    # 공식 레시피 Response 정규화
    # =====================================================

    def normalize_recipe(
        self,
        row: dict[str, Any],
    ) -> dict[str, Any]:
        """
        식품안전나라의 원본 필드명을
        Auto-Fit 내부 레시피 형식으로 변환한다.
        """

        steps: list[str] = []

        step_images: list[str] = []

        # 식품안전나라 COOKRCP01은
        # MANUAL01 ~ MANUAL20 형태로 조리단계를 제공한다.
        for index in range(
            1,
            21,
        ):

            step_key = (
                f"MANUAL"
                f"{index:02d}"
            )

            image_key = (
                f"MANUAL_IMG"
                f"{index:02d}"
            )

            step = self._clean_text(
                row.get(
                    step_key
                )
            )

            image = self._clean_text(
                row.get(
                    image_key
                )
            )

            if step:
                steps.append(
                    step
                )

            if image:
                step_images.append(
                    image
                )

        return {
            # ---------------------------------------------
            # 기본 정보
            # ---------------------------------------------

            "recipe_id": (
                self._clean_text(
                    row.get(
                        "RCP_SEQ"
                    )
                )
            ),

            "menu_name": (
                self._clean_text(
                    row.get(
                        "RCP_NM"
                    )
                )
            ),

            "cooking_method": (
                self._clean_text(
                    row.get(
                        "RCP_WAY2"
                    )
                )
            ),

            "dish_type": (
                self._clean_text(
                    row.get(
                        "RCP_PAT2"
                    )
                )
            ),

            # ---------------------------------------------
            # 공식 레시피 기준 제공량
            # ---------------------------------------------

            "serving_weight": (
                self._to_float(
                    row.get(
                        "INFO_WGT"
                    )
                )
            ),

            # ---------------------------------------------
            # 공식 레시피 자체의 영양정보
            #
            # Auto-Fit 추천 메뉴의 최종 영양값은
            # FoodCatalogService에서 계산한 값을 사용한다.
            #
            # 이 값들은 공식 Recipe DB 원본 정보로만 유지한다.
            # ---------------------------------------------

            "calories_kcal": (
                self._to_float(
                    row.get(
                        "INFO_ENG"
                    )
                )
            ),

            "carbohydrate_g": (
                self._to_float(
                    row.get(
                        "INFO_CAR"
                    )
                )
            ),

            "protein_g": (
                self._to_float(
                    row.get(
                        "INFO_PRO"
                    )
                )
            ),

            "fat_g": (
                self._to_float(
                    row.get(
                        "INFO_FAT"
                    )
                )
            ),

            "sodium_mg": (
                self._to_float(
                    row.get(
                        "INFO_NA"
                    )
                )
            ),

            # ---------------------------------------------
            # 기타 정보
            # ---------------------------------------------

            "hash_tag": (
                self._clean_text(
                    row.get(
                        "HASH_TAG"
                    )
                )
            ),

            "image_small": (
                self._clean_text(
                    row.get(
                        "ATT_FILE_NO_MAIN"
                    )
                )
            ),

            "image_large": (
                self._clean_text(
                    row.get(
                        "ATT_FILE_NO_MK"
                    )
                )
            ),

            # ---------------------------------------------
            # 재료
            # ---------------------------------------------

            "ingredients_text": (
                self._clean_text(
                    row.get(
                        "RCP_PARTS_DTLS"
                    )
                )
            ),

            # ---------------------------------------------
            # 조리 단계
            # ---------------------------------------------

            "steps": steps,

            "step_images": (
                step_images
            ),

            "cooking_tip": (
                self._clean_text(
                    row.get(
                        "RCP_NA_TIP"
                    )
                )
            ),

            "source": (
                "식품의약품안전처 "
                "식품안전나라"
            ),
        }

    # =====================================================
    # 간단한 메뉴명 조회
    # =====================================================

    async def get_recipe_for_food(
        self,
        food_name: str,
    ) -> dict[str, Any] | None:
        """
        특정 메뉴명으로 공식 레시피를 검색하고
        첫 번째 검색 결과를 반환한다.

        주의:
        exact / similar 여부는 여기서 결정하지 않는다.

        최종 매칭 판정은 MealRecipeService가 담당한다.
        """

        recipes = (
            await self
            .search_recipes_by_name(
                menu_name=food_name,
                start_idx=1,
                end_idx=100,
            )
        )

        if not recipes:
            return None

        return recipes[0]

    # =====================================================
    # 숫자 변환
    # =====================================================

    @staticmethod
    def _to_float(
        value: Any,
    ) -> float | None:

        if value is None:
            return None

        text = str(
            value
        ).strip()

        if not text:
            return None

        try:
            return float(
                text
            )

        except (
            TypeError,
            ValueError,
        ):
            return None

    # =====================================================
    # 문자열 정리
    # =====================================================

    @staticmethod
    def _clean_text(
        value: Any,
    ) -> str | None:

        if value is None:
            return None

        text = str(
            value
        ).strip()

        if not text:
            return None

        return text
