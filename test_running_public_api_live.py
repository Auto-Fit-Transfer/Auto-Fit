import asyncio
import os

import pytest

from app.services.public_running_course_service import (
    PublicRunningCourseService,
)


async def main() -> None:
    async with PublicRunningCourseService() as service:
        items, total_count = await service.fetch_course_page(
            page_no=1,
            num_of_rows=5,
        )
        normalized_count = sum(
            service.normalize_course(item) is not None
            for item in items
        )

    assert items
    assert normalized_count == len(items)
    print(
        "running public API live test: OK "
        f"(items={len(items)}, total={total_count})"
    )


@pytest.mark.live
@pytest.mark.asyncio
async def test_running_public_api_live() -> None:
    if os.getenv("RUN_LIVE_RUNNING_TESTS") != "1":
        pytest.skip("Set RUN_LIVE_RUNNING_TESTS=1 to run live API tests.")
    await main()


if __name__ == "__main__":
    asyncio.run(main())
