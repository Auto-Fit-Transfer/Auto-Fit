# -*- coding: utf-8 -*-

import asyncio
from types import SimpleNamespace

import app.services.diet_recommendation_service as service


async def _run_cache_test() -> None:
    original_get_settings = service.get_settings
    service.get_settings = lambda: SimpleNamespace(
        diet_llm_cache_ttl_seconds=60.0,
        diet_llm_cache_max_entries=2,
    )
    service._reset_diet_llm_cache_for_tests()

    calls = 0

    async def factory():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)
        return {"value": calls}

    try:
        cache_key = service._build_diet_llm_cache_key(
            namespace="test",
            model="test-model",
            instructions="instructions",
            prompt="sensitive-input",
        )
        assert "sensitive-input" not in cache_key

        first, second, third = await asyncio.gather(
            *[
                service._get_or_create_diet_llm_result(
                    cache_key=cache_key,
                    factory=factory,
                )
                for _ in range(3)
            ]
        )
        assert calls == 1
        assert first == second == third == {"value": 1}

        cached = await service._get_or_create_diet_llm_result(
            cache_key=cache_key,
            factory=factory,
        )
        assert cached == {"value": 1}
        assert calls == 1

        stats = service.get_diet_llm_cache_stats()
        assert stats["inflight_waits"] == 2
        assert stats["cache_hits"] == 1
        assert stats["cache_entries"] == 1

        with service._DIET_LLM_STATE_LOCK:
            service._DIET_LLM_CACHE_EXPIRES[cache_key] = 0.0

        expired = await service._get_or_create_diet_llm_result(
            cache_key=cache_key,
            factory=factory,
        )
        assert expired == {"value": 2}
        assert calls == 2
        assert service.get_diet_llm_cache_stats()[
            "cache_expirations"
        ] == 1

        for suffix in ("two", "three"):
            await service._get_or_create_diet_llm_result(
                cache_key=f"test:{suffix}",
                factory=factory,
            )

        final_stats = service.get_diet_llm_cache_stats()
        assert final_stats["cache_entries"] == 2
        assert final_stats["cache_evictions"] == 1
        assert final_stats["inflight_requests"] == 0
    finally:
        service._reset_diet_llm_cache_for_tests()
        service.get_settings = original_get_settings


def main() -> None:
    asyncio.run(_run_cache_test())
    print("Diet LLM cache/singleflight test: OK")


if __name__ == "__main__":
    main()
