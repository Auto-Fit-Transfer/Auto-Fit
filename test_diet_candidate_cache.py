# -*- coding: utf-8 -*-

import asyncio
from types import SimpleNamespace

import app.services.diet_recommendation_service as service


def _request(**updates):
    payload = {
        "disliked_foods": ["버섯"],
        "sido": "경상북도",
        "sigungu": "영양군",
        "nearby_regions": [
            {
                "sido": "경상북도",
                "sigungu": "청송군",
                "distance_km": 28.5,
            }
        ],
        "meal_target": {
            "calories_kcal": 500,
            "protein_g": 30,
            "fat_g": 15,
            "carbohydrate_g": 60,
        },
        "current_menu_name": "현재 메뉴",
        "excluded_menu_names": ["제외 메뉴"],
        "target_day": "monday",
    }
    payload.update(updates)
    return SimpleNamespace(**payload)


async def _run_test() -> None:
    original_prepare = service._prepare_verified_food_candidates_uncached
    original_get_settings = service.get_settings
    calls = 0

    async def fake_prepare(*, request, metric_statuses, food_allergens):
        nonlocal calls
        del request, metric_statuses, food_allergens
        calls += 1
        await asyncio.sleep(0.02)
        return (
            [{"menu_name": "검증 식사", "items": [{}]}],
            [{"menu_name": "검증 간식", "items": [{}]}],
            {"call": calls},
        )

    service._prepare_verified_food_candidates_uncached = fake_prepare
    service.get_settings = lambda: SimpleNamespace(
        diet_candidate_cache_ttl_seconds=60.0,
        diet_candidate_cache_max_entries=2,
    )
    service._reset_diet_candidate_cache_for_tests()

    metric_statuses = {
        "blood_pressure": "high",
        "glucose": "normal",
    }

    try:
        request = _request()
        results = await asyncio.gather(
            *[
                service._prepare_verified_food_candidates(
                    request=request,
                    metric_statuses=metric_statuses,
                    food_allergens=["계란"],
                )
                for _ in range(3)
            ]
        )
        assert calls == 1
        assert results[0] == results[1] == results[2]

        # 재추천 전용 필드는 후보 풀 계산에 영향을 주지 않는다.
        replacement_request = _request(
            current_menu_name="다른 현재 메뉴",
            excluded_menu_names=["다른 제외 메뉴"],
            target_day="friday",
        )
        cached = await service._prepare_verified_food_candidates(
            request=replacement_request,
            metric_statuses=metric_statuses,
            food_allergens=["계란"],
        )
        assert calls == 1
        assert cached[2]["call"] == 1

        # 안전 또는 개인화 조건이 바뀌면 반드시 별도 후보를 계산한다.
        await service._prepare_verified_food_candidates(
            request=_request(disliked_foods=["두부"]),
            metric_statuses=metric_statuses,
            food_allergens=["계란"],
        )
        assert calls == 2

        await service._prepare_verified_food_candidates(
            request=request,
            metric_statuses=metric_statuses,
            food_allergens=["우유"],
        )
        assert calls == 3

        stats = service.get_diet_candidate_cache_stats()
        assert stats["inflight_waits"] == 2
        assert stats["cache_hits"] == 1
        assert stats["cache_stores"] == 3
        assert stats["cache_evictions"] == 1
        assert stats["cache_entries"] == 2
        assert stats["inflight_requests"] == 0
    finally:
        service._reset_diet_candidate_cache_for_tests()
        service._prepare_verified_food_candidates_uncached = original_prepare
        service.get_settings = original_get_settings


def main() -> None:
    asyncio.run(_run_test())
    print("Diet verified candidate cache/singleflight test: OK")


if __name__ == "__main__":
    main()
