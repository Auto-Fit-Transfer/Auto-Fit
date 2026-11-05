"""Scheduled entry point for KST-midnight diet recommendation refreshes."""

from __future__ import annotations

import asyncio
from datetime import date, datetime
import logging

from fastapi import HTTPException

from backend.app.food_image_generation import generate_missing_menu_images
from backend.app.main import (
    KST,
    assign_menu_images,
    build_daily_diet_recommendation_plan,
    client_scope,
    create_diet_recommendation,
    fetch_allergy_catalog,
    fetch_food_catalog,
    fetch_food_inventory,
    fetch_user_allergies,
    get_settings,
    service_headers,
    resolve_daily_allergy_names,
)


logger = logging.getLogger("uvicorn.error")


def refresh_failure_reason(exc: Exception) -> str:
    """Return a fixed diagnostic code without exposing user or allergy data."""
    if (
        isinstance(exc, HTTPException)
        and exc.status_code == 502
        and exc.detail == "Stored allergy could not be resolved"
    ):
        return "allergy_unresolved"
    return "unexpected"


async def fetch_refresh_user_ids() -> list[str]:
    settings = get_settings()
    user_ids: list[str] = []
    page_size = 1000
    async with client_scope() as client:
        while True:
            response = await client.get(
                f"{settings.supabase_url}/rest/v1/profiles",
                headers=service_headers(settings),
                params={
                    "select": "user_id",
                    "order": "user_id.asc",
                    "limit": str(page_size),
                    "offset": str(len(user_ids)),
                },
            )
            response.raise_for_status()
            page = response.json()
            user_ids.extend(row["user_id"] for row in page)
            if len(page) < page_size:
                return user_ids


async def fetch_user_ids_with_active_diet(target_date: date) -> set[str]:
    settings = get_settings()
    user_ids: set[str] = set()
    page_size = 1000
    offset = 0
    async with client_scope() as client:
        while True:
            response = await client.get(
                f"{settings.supabase_url}/rest/v1/diet_recommendations",
                headers=service_headers(settings),
                params={
                    "select": "user_id",
                    "recommendation_date": f"eq.{target_date.isoformat()}",
                    "status": "eq.active",
                    "order": "user_id.asc",
                    "limit": str(page_size),
                    "offset": str(offset),
                },
            )
            response.raise_for_status()
            page = response.json()
            user_ids.update(row["user_id"] for row in page)
            offset += len(page)
            if len(page) < page_size:
                return user_ids


async def refresh_daily_diets() -> tuple[int, int]:
    settings = get_settings()
    target_date = datetime.now(KST).date()
    user_ids, existing_user_ids, allergy_catalog, food_catalog = await asyncio.gather(
        fetch_refresh_user_ids(),
        fetch_user_ids_with_active_diet(target_date),
        fetch_allergy_catalog(settings),
        fetch_food_catalog(settings),
    )
    # A rerun only fills the gaps: regenerating would pay for AI again and replace today's menu.
    pending_user_ids = [
        user_id for user_id in user_ids if user_id not in existing_user_ids
    ]
    logger.info(
        "daily diet refresh for %s: pending=%d skipped=%d",
        target_date.isoformat(),
        len(pending_user_ids),
        len(user_ids) - len(pending_user_ids),
    )
    semaphore = asyncio.Semaphore(3)

    async def refresh_one(user_id: str) -> bool:
        async with semaphore:
            try:
                inventory, selected = await asyncio.gather(
                    fetch_food_inventory(user_id, settings),
                    fetch_user_allergies(user_id, settings),
                )
                allergy_names = resolve_daily_allergy_names(selected, allergy_catalog)
                plan = await build_daily_diet_recommendation_plan(
                    user_id,
                    inventory,
                    allergy_names,
                    food_catalog,
                    target_date=target_date,
                )
                await assign_menu_images(plan["meals"], settings)
                await generate_missing_menu_images(plan["meals"], settings)
                await create_diet_recommendation(user_id, plan, settings)
                return True
            except Exception as exc:  # Keep refreshing other users after one isolated failure.
                logger.warning(
                    "daily diet refresh failed for one user: reason=%s exception_type=%s",
                    refresh_failure_reason(exc),
                    type(exc).__name__,
                )
                return False

    results = await asyncio.gather(*(refresh_one(user_id) for user_id in pending_user_ids))
    succeeded = sum(results)
    return succeeded, len(results) - succeeded


def main() -> int:
    succeeded, failed = asyncio.run(refresh_daily_diets())
    logger.info(
        "daily diet refresh completed: succeeded=%d failed=%d", succeeded, failed
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
