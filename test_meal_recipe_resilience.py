# -*- coding: utf-8 -*-

from __future__ import annotations

import asyncio
import threading
from collections import OrderedDict
from types import MethodType

import httpx

from app.services.meal_recipe_service import MealRecipeService
from app.services.recipe_service import (
    OfficialRecipeCircuitOpenError,
    RecipeService,
)


def make_service(
    cache: OrderedDict | None = None,
    expires: dict | None = None,
    inflight: dict | None = None,
    state_lock: threading.RLock | None = None,
) -> MealRecipeService:
    """외부 client 없이 캐시 동작을 검증하는 서비스."""

    service = object.__new__(MealRecipeService)
    service._recipe_cache = (
        cache if cache is not None else OrderedDict()
    )
    service._recipe_cache_expires = (
        expires if expires is not None else {}
    )
    service._inflight_tasks = (
        inflight if inflight is not None else {}
    )
    service._recipe_state_lock = (
        state_lock if state_lock is not None else threading.RLock()
    )
    return service


def available_result(food_name: str) -> dict:
    return {
        "recipe_available": True,
        "recipe_source": "llm_generated",
        "official_recipe": False,
        "matched_recipe_name": None,
        "match_score": None,
        "safety_checked": True,
        "restriction_matches": [],
        "recipe": {
            "menu_name": food_name,
            "ingredients": [],
            "steps": [],
        },
    }


async def test_shared_cache_and_single_flight() -> None:
    cache: OrderedDict = OrderedDict()
    expires: dict = {}
    inflight: dict = {}
    state_lock = threading.RLock()
    first = make_service(cache, expires, inflight, state_lock)
    second = make_service(cache, expires, inflight, state_lock)
    resolve_count = 0

    async def fake_resolve(
        self: MealRecipeService,
        item: dict,
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> dict:
        nonlocal resolve_count
        del self, allergies, disliked_foods
        resolve_count += 1
        await asyncio.sleep(0.01)
        return available_result(item["food_name"])

    first._resolve_recipe = MethodType(fake_resolve, first)
    second._resolve_recipe = MethodType(fake_resolve, second)
    item = {
        "food_name": "두부구이",
        "portion_g": 70.0,
        "calories_kcal": 100.0,
        "protein_g": 10.0,
        "fat_g": 5.0,
        "carbohydrate_g": 2.0,
    }

    results = await asyncio.gather(
        first.enrich_meal_item(item),
        second.enrich_meal_item(item),
    )
    cached = await second.enrich_meal_item(item)

    if resolve_count != 1:
        raise RuntimeError(
            f"공유 cache/single-flight 실패: {resolve_count}회 호출"
        )

    if not all(result["recipe_available"] for result in results):
        raise RuntimeError("동시 요청 결과가 손상되었습니다.")

    if cached["recipe"]["menu_name"] != "두부구이":
        raise RuntimeError("공유 cache 결과가 손상되었습니다.")


async def test_item_failure_isolation() -> None:
    service = make_service()

    async def fake_resolve(
        self: MealRecipeService,
        item: dict,
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> dict:
        del self, allergies, disliked_foods

        if item["food_name"] == "실패음식":
            raise RuntimeError("deterministic failure")

        return available_result(item["food_name"])

    service._resolve_recipe = MethodType(fake_resolve, service)
    meal = await service.enrich_meal(
        {
            "items": [
                {"food_name": "정상음식"},
                {"food_name": "실패음식"},
            ]
        }
    )

    if meal["items"][0]["recipe_source"] != "llm_generated":
        raise RuntimeError("정상 항목 결과가 보존되지 않았습니다.")

    if meal["items"][1]["recipe_source"] != "unavailable":
        raise RuntimeError("실패 항목이 unavailable로 격리되지 않았습니다.")


async def test_cache_ttl_and_size_limit() -> None:
    service = make_service()
    service.RECIPE_CACHE_TTL_SECONDS = 0.01
    service.RECIPE_CACHE_MAX_ENTRIES = 2
    resolve_count = 0

    async def fake_resolve(
        self: MealRecipeService,
        item: dict,
        allergies: list[str] | None,
        disliked_foods: list[str] | None,
    ) -> dict:
        nonlocal resolve_count
        del self, allergies, disliked_foods
        resolve_count += 1
        return available_result(item["food_name"])

    service._resolve_recipe = MethodType(fake_resolve, service)

    def item(food_name: str) -> dict:
        return {
            "food_name": food_name,
            "portion_g": 70.0,
            "calories_kcal": 100.0,
            "protein_g": 10.0,
            "fat_g": 5.0,
            "carbohydrate_g": 2.0,
        }

    await service.enrich_meal_item(item("TTL 음식"))
    await asyncio.sleep(0.02)
    await service.enrich_meal_item(item("TTL 음식"))

    if resolve_count != 2:
        raise RuntimeError("만료된 Recipe cache가 재사용되었습니다.")

    await service.enrich_meal_item(item("두 번째 음식"))
    await service.enrich_meal_item(item("세 번째 음식"))

    if len(service._recipe_cache) != 2:
        raise RuntimeError("Recipe cache 최대 크기 제한이 동작하지 않습니다.")


async def test_official_failure_uses_llm_fallback() -> None:
    service = make_service()

    async def fail_official(**kwargs) -> None:
        del kwargs
        raise httpx.TimeoutException("deterministic timeout")

    async def fake_llm(**kwargs) -> dict:
        item = kwargs["item"]
        return available_result(item["food_name"])

    service.find_official_recipe = fail_official
    service.generate_llm_recipe = fake_llm
    result = await service._resolve_recipe(
        item={"food_name": "대체레시피"},
        allergies=[],
        disliked_foods=[],
    )

    if result["recipe_source"] != "llm_generated":
        raise RuntimeError("공식 API 장애 시 LLM fallback이 실행되지 않았습니다.")


class RetryClient:
    def __init__(self) -> None:
        self.call_count = 0
        self.closed = False

    async def get(self, url: str) -> httpx.Response:
        self.call_count += 1

        if self.call_count < 3:
            raise httpx.ConnectError(
                "deterministic connection failure",
                request=httpx.Request("GET", url),
            )

        return httpx.Response(
            200,
            request=httpx.Request("GET", url),
            json={"COOKRCP01": {"row": []}},
        )

    async def aclose(self) -> None:
        self.closed = True


async def test_official_api_retry() -> None:
    RecipeService.reset_operational_state()
    client = RetryClient()
    service = RecipeService(client=client)
    service.REQUEST_RETRY_BACKOFF_SECONDS = 0
    result = await service._request_json("https://example.test/recipe")

    if client.call_count != 3:
        raise RuntimeError(
            f"공식 API 재시도 횟수가 잘못되었습니다: {client.call_count}"
        )

    if "COOKRCP01" not in result:
        raise RuntimeError("재시도 성공 응답이 손상되었습니다.")

    await service.aclose()

    if client.closed:
        raise RuntimeError("외부에서 주입한 HTTP client를 닫았습니다.")

    stats = RecipeService.get_operational_stats()

    if stats["retries"] != 2 or stats["successes"] != 1:
        raise RuntimeError(f"공식 API 통계가 잘못되었습니다: {stats}")


class CircuitClient:
    def __init__(self) -> None:
        self.call_count = 0
        self.should_fail = True

    async def get(self, url: str) -> httpx.Response:
        self.call_count += 1

        if self.should_fail:
            raise httpx.ConnectError(
                "deterministic circuit failure",
                request=httpx.Request("GET", url),
            )

        return httpx.Response(
            200,
            request=httpx.Request("GET", url),
            json={"COOKRCP01": {"row": []}},
        )


async def test_official_api_circuit_breaker() -> None:
    RecipeService.reset_operational_state()
    client = CircuitClient()
    service = RecipeService(client=client)
    service.REQUEST_MAX_ATTEMPTS = 1
    service._circuit_failure_threshold = 2
    service._circuit_recovery_seconds = 0.02

    for _ in range(2):
        try:
            await service._request_json("https://example.test/recipe")
        except httpx.ConnectError:
            pass
        else:
            raise RuntimeError("공식 API 실패가 정상 응답으로 처리되었습니다.")

    try:
        await service._request_json("https://example.test/recipe")
    except OfficialRecipeCircuitOpenError:
        pass
    else:
        raise RuntimeError("열린 circuit가 외부 호출을 차단하지 못했습니다.")

    if client.call_count != 2:
        raise RuntimeError("열린 circuit 상태에서 외부 API가 호출되었습니다.")

    stats = RecipeService.get_operational_stats()

    if not stats["circuit_open"] or stats["circuit_rejections"] != 1:
        raise RuntimeError(f"Circuit 상태 통계가 잘못되었습니다: {stats}")

    pipeline_stats = MealRecipeService.get_operational_stats()

    if pipeline_stats["status"] != "degraded":
        raise RuntimeError("열린 circuit가 Recipe 상태에 반영되지 않았습니다.")

    await asyncio.sleep(0.03)
    client.should_fail = False
    await service._request_json("https://example.test/recipe")
    recovered = RecipeService.get_operational_stats()

    if recovered["circuit_open"] or recovered["consecutive_failures"] != 0:
        raise RuntimeError("공식 API circuit가 성공 후 복구되지 않았습니다.")

    if MealRecipeService.get_operational_stats()["status"] != "ok":
        raise RuntimeError("복구된 circuit가 Recipe 상태에 반영되지 않았습니다.")


async def main() -> None:
    await test_shared_cache_and_single_flight()
    await test_item_failure_isolation()
    await test_cache_ttl_and_size_limit()
    await test_official_failure_uses_llm_fallback()
    await test_official_api_retry()
    await test_official_api_circuit_breaker()
    print("Meal Recipe 복원력 테스트: OK")


if __name__ == "__main__":
    asyncio.run(main())
