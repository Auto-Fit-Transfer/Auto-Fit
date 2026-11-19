# -*- coding: utf-8 -*-

import asyncio
from types import SimpleNamespace

import app.services.diet_recommendation_service as service


async def _run_test() -> None:
    original_rag_node = service.rag_node
    original_get_settings = service.get_settings
    calls = 0

    async def fake_rag_node(state):
        nonlocal calls
        calls += 1
        statuses = state["merged_analysis"]["metric_statuses"]
        return {
            "rag_context": [
                {
                    "content": f"guide-{statuses['blood_pressure']}",
                    "source_org": "공식 기관",
                    "title": "검증 문서",
                }
            ],
            "warnings": [],
        }

    service.rag_node = fake_rag_node
    service.get_settings = lambda: SimpleNamespace(
        diet_rag_cache_ttl_seconds=60.0,
        diet_rag_cache_max_entries=2,
    )
    service._reset_diet_rag_cache_for_tests()

    try:
        first = await service._get_diet_rag_context(
            {
                "blood_pressure": "high",
                "glucose": "normal",
            }
        )
        second = await service._get_diet_rag_context(
            {
                "glucose": "normal",
                "blood_pressure": "high",
            }
        )
        assert calls == 1
        assert first == second

        first[0]["content"] = "changed"
        third = await service._get_diet_rag_context(
            {
                "blood_pressure": "high",
                "glucose": "normal",
            }
        )
        assert third[0]["content"] == "guide-high"

        cache_key = service._build_diet_rag_cache_key(
            {
                "blood_pressure": "high",
                "glucose": "normal",
            }
        )
        with service._DIET_RAG_CACHE_LOCK:
            service._DIET_RAG_CACHE_EXPIRES[cache_key] = 0.0

        await service._get_diet_rag_context(
            {
                "blood_pressure": "high",
                "glucose": "normal",
            }
        )
        assert calls == 2

        stats = service.get_diet_rag_cache_stats()
        assert stats["cache_hits"] == 2
        assert stats["cache_expirations"] == 1
        assert stats["cache_stores"] == 2
        assert stats["cache_entries"] == 1
    finally:
        service._reset_diet_rag_cache_for_tests()
        service.rag_node = original_rag_node
        service.get_settings = original_get_settings


def main() -> None:
    asyncio.run(_run_test())
    print("Diet RAG cache test: OK")


if __name__ == "__main__":
    main()
