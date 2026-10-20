import asyncio

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


if __name__ == "__main__":
    asyncio.run(main())
