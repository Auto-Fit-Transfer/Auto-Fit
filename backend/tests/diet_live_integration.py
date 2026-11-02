"""Opt-in deployed diet API test with synthetic users and automatic cleanup.

Run:
    python -m backend.tests.diet_live_integration \
      --project eeeqibyssajykrhvecbv \
      --api-base https://auto-fit-api-dev.onrender.com

The script never prints credentials, tokens, or response bodies.
"""

import argparse
import asyncio
import secrets
from datetime import UTC, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from dotenv import dotenv_values

from backend.app import main
from backend.tests.live_test_cleanup import cleanup_user_defaults


APPROVED_API_BASE = "https://auto-fit-api-dev.onrender.com"
KST = ZoneInfo("Asia/Seoul")


async def run(project: str, api_base: str) -> None:
    if api_base != APPROVED_API_BASE:
        raise ValueError("Unapproved API target")

    config = dotenv_values("backend/.env")
    expected_supabase_url = f"https://{project}.supabase.co"
    assert config["SUPABASE_URL"].rstrip("/") == expected_supabase_url, "Wrong target"
    settings = main.Settings(
        expected_supabase_url,
        config["SUPABASE_PUBLISHABLE_KEY"],
        config["SUPABASE_SERVICE_ROLE_KEY"],
        "http://localhost:3000",
    )
    admin_headers = main.service_headers(settings)
    created_users: list[str] = []
    access_tokens: list[str] = []
    recommendation_id: str | None = None
    meal_ids: list[str] = []
    meal_log_id: str | None = None
    cleanup_errors: list[str] = []
    checks = 0

    def check(condition: bool, label: str) -> None:
        nonlocal checks
        assert condition, label
        checks += 1
        print(f"PASS {label}", flush=True)

    async with httpx.AsyncClient(
        base_url=settings.supabase_url,
        timeout=30,
        trust_env=False,
    ) as remote:
        try:
            for _ in range(2):
                email = f"autofit-diet-test-{uuid4().hex}@example.invalid"
                password = "Af9!" + secrets.token_urlsafe(32)
                created = await remote.post(
                    "/auth/v1/admin/users",
                    headers=admin_headers,
                    json={
                        "email": email,
                        "password": password,
                        "email_confirm": True,
                        "app_metadata": {"autofit_integration_test": True},
                    },
                )
                check(created.status_code in (200, 201), "create synthetic auth user")
                created_users.append(created.json()["id"])
                login = await remote.post(
                    "/auth/v1/token?grant_type=password",
                    headers={"apikey": settings.supabase_publishable_key},
                    json={"email": email, "password": password},
                )
                check(login.status_code == 200, "real Supabase password login")
                access_tokens.append(login.json()["access_token"])

            owner = {"Authorization": f"Bearer {access_tokens[0]}"}
            other = {"Authorization": f"Bearer {access_tokens[1]}"}
            today = datetime.now(KST).date().isoformat()

            async with httpx.AsyncClient(
                base_url=api_base,
                timeout=90,
                trust_env=False,
            ) as api:
                created = await api.post(
                    "/api/diet/inventory",
                    headers=owner,
                    json={
                        "name": "통합테스트 두부",
                        "quantity": 1,
                        "unit": "모",
                        "purchased_on": today,
                    },
                )
                check(created.status_code == 201, "create inventory item")
                inventory_id = created.json()["item"]["user_food_inventory_id"]

                patched = await api.patch(
                    f"/api/diet/inventory/{inventory_id}",
                    headers=owner,
                    json={"quantity": 2, "unit": "팩"},
                )
                check(
                    patched.status_code == 200
                    and float(patched.json()["item"]["quantity"]) == 2
                    and patched.json()["item"]["unit"] == "팩",
                    "update owned inventory item",
                )
                denied_patch = await api.patch(
                    f"/api/diet/inventory/{inventory_id}",
                    headers=other,
                    json={"quantity": 99},
                )
                check(denied_patch.status_code == 404, "other user cannot update inventory")
                hidden_delete = await api.delete(
                    f"/api/diet/inventory/{inventory_id}", headers=other
                )
                check(hidden_delete.status_code == 204, "foreign delete remains idempotent")
                inventory = await api.get("/api/diet/inventory", headers=owner)
                check(
                    inventory.status_code == 200
                    and any(
                        row["user_food_inventory_id"] == inventory_id
                        for row in inventory.json()["inventory"]
                    ),
                    "foreign delete does not change owner inventory",
                )

                generated = await api.post(
                    "/api/diet/recommendations/generate", headers=owner, json={}
                )
                check(generated.status_code == 200, "generate diet recommendation")
                generated_result = generated.json()["result"]
                recommendation_id = generated_result["recommendation"][
                    "diet_recommendation_id"
                ]
                meals = generated_result["meals"]
                meal_ids.extend(meal["diet_meal_id"] for meal in meals)
                check(len(meals) == 4, "generated recommendation contains four meals")

                dated = await api.get(
                    "/api/diet/recommendations",
                    headers=owner,
                    params={"date": today},
                )
                check(
                    dated.status_code == 200
                    and dated.json()["result"]["recommendation"][
                        "diet_recommendation_id"
                    ]
                    == recommendation_id,
                    "read recommendation by KST date",
                )

                image_urls = [meal.get("image_url") for meal in dated.json()["result"]["meals"]]
                check(all(image_urls), "recommendation reload restores images for all meals")
                for image_url in set(image_urls):
                    image = await remote.get(image_url)
                    check(image.status_code == 200 and image.headers.get("content-type", "").startswith("image/"),
                          "recommendation image URL returns actual image")

                before_summary = await api.get(
                    "/api/diet/nutrition-summary",
                    headers=owner,
                    params={"date": today},
                )
                before = before_summary.json()["summary"]
                check(
                    before_summary.status_code == 200
                    and before["has_recommendation"]
                    and float(before["calories"]["consumed"]) == 0,
                    "nutrition summary starts with targets and zero intake",
                )

                original_meal = meals[0]
                original_food = original_meal["foods"][0]["food_name"]
                regenerated = await api.post(
                    f"/api/diet/meals/{original_meal['diet_meal_id']}/regenerate",
                    headers=owner,
                    json={},
                )
                check(regenerated.status_code == 200, "regenerate one diet meal")
                regenerated_payload = regenerated.json()
                regenerated_meal = regenerated_payload["meal"]
                check(
                    regenerated_payload["generator"] == "ai_v1"
                    and regenerated_meal["source_type"] == "ai_generated",
                    "regenerated meal records its AI source",
                )
                check(
                    any(
                        item["user_food_inventory_id"] == inventory_id
                        for item in regenerated_payload["used_ingredients"]
                    ),
                    "regenerated meal reports used inventory",
                )
                check(
                    regenerated_meal["diet_meal_id"]
                    == original_meal["diet_meal_id"],
                    "regenerated meal keeps its ID",
                )
                check(
                    regenerated_meal["meal_type"] == original_meal["meal_type"],
                    "regenerated meal keeps its type",
                )
                check(
                    regenerated_meal["meal_order"] == original_meal["meal_order"],
                    "regenerated meal keeps its order",
                )
                check(
                    regenerated_meal["foods"][0]["food_name"] != original_food,
                    "regenerated meal changes its representative food",
                )
                denied_regenerate = await api.post(
                    f"/api/diet/meals/{original_meal['diet_meal_id']}/regenerate",
                    headers=other,
                    json={},
                )
                check(
                    denied_regenerate.status_code == 404,
                    "other user cannot regenerate meal",
                )

                direct_rpc = await remote.post(
                    "/rest/v1/rpc/replace_diet_meal",
                    headers={
                        "apikey": settings.supabase_publishable_key,
                        **owner,
                    },
                    json={
                        "p_user_id": created_users[0],
                        "p_diet_meal_id": original_meal["diet_meal_id"],
                        "p_meal": {},
                    },
                )
                check(
                    direct_rpc.status_code in (401, 403, 404),
                    "authenticated client cannot call service-only RPC",
                )

                feedback = await api.post(
                    f"/api/diet/meals/{original_meal['diet_meal_id']}/feedback",
                    headers=owner,
                    json={
                        "feedback_type": "eaten",
                        "eaten_at": datetime.now(UTC).isoformat(),
                        "actual_items": [],
                    },
                )
                check(feedback.status_code == 200, "record regenerated meal as eaten")
                meal_log_id = feedback.json()["result"]["meal_log"]["meal_log_id"]

                after_summary = await api.get(
                    "/api/diet/nutrition-summary",
                    headers=owner,
                    params={"date": today},
                )
                after = after_summary.json()["summary"]
                check(
                    after_summary.status_code == 200
                    and float(after["calories"]["consumed"]) > 0
                    and after["calories"]["target"] is not None,
                    "nutrition summary includes recorded intake",
                )
                logs = await api.get(
                    "/api/diet/meal-logs",
                    headers=owner,
                    params={"from_date": today, "to_date": today},
                )
                check(
                    logs.status_code == 200
                    and any(
                        row["meal_log_id"] == meal_log_id
                        for row in logs.json()["logs"]
                    ),
                    "read recorded meal from KST date range",
                )

                deleted = await api.delete(
                    f"/api/diet/inventory/{inventory_id}", headers=owner
                )
                repeated = await api.delete(
                    f"/api/diet/inventory/{inventory_id}", headers=owner
                )
                check(
                    deleted.status_code == repeated.status_code == 204,
                    "inventory delete is idempotent",
                )
                inventory = await api.get("/api/diet/inventory", headers=owner)
                check(
                    inventory.status_code == 200
                    and all(
                        row["user_food_inventory_id"] != inventory_id
                        for row in inventory.json()["inventory"]
                    ),
                    "deleted inventory is absent from active list",
                )
        finally:
            discovered_log_ids = {meal_log_id} if meal_log_id else set()
            discovered_recommendation_ids = (
                {recommendation_id} if recommendation_id else set()
            )
            discovered_meal_ids = set(meal_ids)
            for user_id in created_users:
                recommendations = await remote.get(
                    "/rest/v1/diet_recommendations",
                    headers=admin_headers,
                    params={
                        "user_id": f"eq.{user_id}",
                        "select": "diet_recommendation_id",
                    },
                )
                if recommendations.status_code == 200:
                    discovered_recommendation_ids.update(
                        row["diet_recommendation_id"]
                        for row in recommendations.json()
                    )
                else:
                    cleanup_errors.append(f"discover:diet_recommendations:{user_id}")
                logs = await remote.get(
                    "/rest/v1/meal_logs",
                    headers=admin_headers,
                    params={"user_id": f"eq.{user_id}", "select": "meal_log_id"},
                )
                if logs.status_code == 200:
                    discovered_log_ids.update(
                        row["meal_log_id"] for row in logs.json()
                    )
                else:
                    cleanup_errors.append(f"discover:meal_logs:{user_id}")
            for current_recommendation_id in discovered_recommendation_ids:
                meals = await remote.get(
                    "/rest/v1/diet_meals",
                    headers=admin_headers,
                    params={
                        "diet_recommendation_id": f"eq.{current_recommendation_id}",
                        "select": "diet_meal_id",
                    },
                )
                if meals.status_code == 200:
                    discovered_meal_ids.update(
                        row["diet_meal_id"] for row in meals.json()
                    )
                else:
                    cleanup_errors.append(
                        f"discover:diet_meals:{current_recommendation_id}"
                    )
            for current_log_id in discovered_log_ids:
                response = await remote.delete(
                    "/rest/v1/meal_log_items",
                    headers=admin_headers,
                    params={"meal_log_id": f"eq.{current_log_id}"},
                )
                if response.status_code not in (200, 204):
                    cleanup_errors.append(f"meal_log_items:{current_log_id}")
            for user_id in created_users:
                for table in (
                    "diet_feedback",
                    "meal_logs",
                    "user_food_inventory",
                    "user_allergies",
                ):
                    response = await remote.delete(
                        f"/rest/v1/{table}",
                        headers=admin_headers,
                        params={"user_id": f"eq.{user_id}"},
                    )
                    if response.status_code not in (200, 204):
                        cleanup_errors.append(f"{table}:{user_id}")
            for meal_id in discovered_meal_ids:
                response = await remote.delete(
                    "/rest/v1/diet_meal_foods",
                    headers=admin_headers,
                    params={"diet_meal_id": f"eq.{meal_id}"},
                )
                if response.status_code not in (200, 204):
                    cleanup_errors.append(f"diet_meal_foods:{meal_id}")
            for current_recommendation_id in discovered_recommendation_ids:
                response = await remote.delete(
                    "/rest/v1/diet_meals",
                    headers=admin_headers,
                    params={
                        "diet_recommendation_id": f"eq.{current_recommendation_id}"
                    },
                )
                if response.status_code not in (200, 204):
                    cleanup_errors.append(
                        f"diet_meals:{current_recommendation_id}"
                    )
            for user_id in created_users:
                for table in ("diet_recommendations",):
                    response = await remote.delete(
                        f"/rest/v1/{table}",
                        headers=admin_headers,
                        params={"user_id": f"eq.{user_id}"},
                    )
                    if response.status_code not in (200, 204):
                        cleanup_errors.append(f"{table}:{user_id}")
            for user_id, token in zip(created_users, access_tokens, strict=False):
                signed_out = await remote.post(
                    "/auth/v1/logout?scope=global",
                    headers={
                        "apikey": settings.supabase_publishable_key,
                        "Authorization": f"Bearer {token}",
                    },
                )
                if signed_out.status_code not in (200, 204):
                    cleanup_errors.append(f"logout:{user_id}")
            for user_id in created_users:
                cleanup_errors.extend(await cleanup_user_defaults(remote, admin_headers, user_id))
                deleted_user = await remote.delete(
                    f"/auth/v1/admin/users/{user_id}", headers=admin_headers
                )
                if deleted_user.status_code not in (200, 204):
                    cleanup_errors.append(f"auth:{user_id}")
                verify = await remote.get(
                    f"/auth/v1/admin/users/{user_id}", headers=admin_headers
                )
                if verify.status_code != 404:
                    cleanup_errors.append(f"remaining:auth:{user_id}")
            if cleanup_errors:
                raise RuntimeError(
                    "Test resource cleanup required: " + ",".join(cleanup_errors)
                )
            print(
                f"Cleaned up {len(created_users)} synthetic users and diet records.",
                flush=True,
            )

    print(f"Completed {checks} deployed diet integration checks.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--api-base", choices=[APPROVED_API_BASE], required=True)
    args = parser.parse_args()
    asyncio.run(run(args.project, args.api_base))
