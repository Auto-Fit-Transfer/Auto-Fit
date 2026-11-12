# -*- coding: utf-8 -*-

import asyncio

import app.services.local_specialty_service as module
from app.services.local_specialty_service import LocalSpecialtyService


async def _run_test() -> None:
    LocalSpecialtyService.reset_cache_for_tests()
    calls = 0

    async def fake_fetch_page(*, page_no: int, num_of_rows: int):
        nonlocal calls
        del num_of_rows
        calls += 1
        await asyncio.sleep(0.02)
        if page_no == 1:
            return {
                "items": [
                    {
                        "content_no": "1",
                        "product_name": "영양 고추",
                    }
                ],
                "total_count": 1,
            }
        return {"items": [], "total_count": 1}

    first_service = LocalSpecialtyService()
    second_service = LocalSpecialtyService()
    first_service.fetch_specialties_page = fake_fetch_page
    second_service.fetch_specialties_page = fake_fetch_page

    first, second = await asyncio.gather(
        first_service.fetch_all_specialties(),
        second_service.fetch_all_specialties(),
    )
    assert calls == 1
    assert first == second

    first[0]["product_name"] = "변경된 값"
    cached = await second_service.fetch_all_specialties()
    assert calls == 1
    assert cached[0]["product_name"] == "영양 고추"

    with module._SHARED_SPECIALTY_STATE_LOCK:
        module._SHARED_SPECIALTY_CACHE_EXPIRES_AT = 0.0

    refreshed = await second_service.fetch_all_specialties()
    assert calls == 2
    assert refreshed[0]["product_name"] == "영양 고추"

    stats = LocalSpecialtyService.get_cache_stats()
    assert stats["cache_stores"] == 2
    assert stats["cache_hits"] >= 2
    assert stats["cache_expirations"] == 1
    assert stats["inflight_waits"] == 1
    assert stats["cache_loaded"] is True
    assert stats["inflight_requests"] == 0

    LocalSpecialtyService.reset_cache_for_tests()


def main() -> None:
    asyncio.run(_run_test())
    print("Local specialty shared cache test: OK")


if __name__ == "__main__":
    main()
