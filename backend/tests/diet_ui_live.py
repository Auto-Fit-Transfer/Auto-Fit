"""Headless browser test for the deployed diet API test screen.

Run through the repository's local HTTP server helper::

    python /path/to/with_server.py \
      --server "python -m http.server 3000 --bind 127.0.0.1" --port 3000 -- \
      backend/.venv/bin/python -m backend.tests.diet_ui_live \
      --project eeeqibyssajykrhvecbv

The test creates one synthetic Supabase user and removes that user and all
associated diet records in a finally block. Credentials and tokens are never
printed.
"""

import argparse
import re
import secrets
import time
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

import httpx
from dotenv import dotenv_values
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import expect, sync_playwright

from backend.app import main


PROJECT = "eeeqibyssajykrhvecbv"
API_BASE = "https://auto-fit-api-dev.onrender.com"
PAGE_URL = (
    "http://localhost:3000/diet-ui-test.html"
    "?api_base=https%3A%2F%2Fauto-fit-api-dev.onrender.com"
)


def run(project: str, screenshot: Path) -> None:
    if project != PROJECT:
        raise ValueError("Unapproved Supabase project")

    config = dotenv_values("backend/.env")
    supabase_url = f"https://{project}.supabase.co"
    assert config["SUPABASE_URL"].rstrip("/") == supabase_url, "Wrong target"
    settings = main.Settings(
        supabase_url,
        config["SUPABASE_PUBLISHABLE_KEY"],
        config["SUPABASE_SERVICE_ROLE_KEY"],
        "http://localhost:3000",
    )
    admin_headers = main.service_headers(settings)
    email = f"autofit-diet-ui-{uuid4().hex}@example.invalid"
    password = "Af9!" + secrets.token_urlsafe(32)
    user_id: str | None = None
    cleanup_token: str | None = None
    cleanup_errors: list[str] = []
    checks = 0

    def check(condition: bool, label: str) -> None:
        nonlocal checks
        assert condition, label
        checks += 1
        print(f"PASS {label}", flush=True)

    with httpx.Client(base_url=supabase_url, timeout=30, trust_env=False) as remote:
        try:
            for attempt in range(4):
                created = remote.post(
                    "/auth/v1/admin/users",
                    headers=admin_headers,
                    json={
                        "email": email,
                        "password": password,
                        "email_confirm": True,
                        "app_metadata": {"autofit_ui_integration_test": True},
                    },
                )
                if created.status_code != 429 or attempt == 3:
                    break
                retry_after = min(int(created.headers.get("retry-after", "20")), 30)
                time.sleep(retry_after)
            check(
                created.status_code in (200, 201),
                f"create synthetic UI user ({created.status_code})",
            )
            user_id = created.json()["id"]

            login = remote.post(
                "/auth/v1/token?grant_type=password",
                headers={"apikey": settings.supabase_publishable_key},
                json={"email": email, "password": password},
            )
            check(login.status_code == 200, "prepare cleanup session")
            cleanup_token = login.json()["access_token"]

            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                context = browser.new_context(
                    viewport={"width": 1024, "height": 900},
                    timezone_id="Asia/Seoul",
                    locale="ko-KR",
                )
                page = context.new_page()
                page.set_default_timeout(90_000)
                console_errors: list[str] = []
                page_errors: list[str] = []
                page.on(
                    "console",
                    lambda message: console_errors.append(message.text)
                    if message.type == "error"
                    else None,
                )
                page.on("pageerror", lambda error: page_errors.append(str(error)))

                page.goto(PAGE_URL, wait_until="networkidle")
                check(page.title() == "Auto-Fit 식단 API 화면 검증", "load UI test page")

                page.get_by_label("이메일").fill(email)
                page.get_by_label("비밀번호").fill(password)
                page.get_by_role("button", name="로그인", exact=True).click()
                expect(page.locator("#app")).to_be_visible()
                expect(page.locator("#inventory-empty")).to_be_visible()
                expect(page.locator("#recommendation-empty")).to_be_visible()
                expect(page.locator("#nutrition-empty")).to_be_visible()
                check(True, "login and render all empty states")

                page.locator("#new-name").fill("UI 테스트 두부")
                page.get_by_role("button", name="재료 추가").click()
                row = page.locator("#inventory-list .inventory-row")
                expect(row).to_have_count(1)
                expect(row.get_by_label("재료명")).to_have_value("UI 테스트 두부")
                check(True, "add inventory from UI")

                today = date.today()
                row.get_by_label("구매일").fill(today.isoformat())
                row.get_by_label("유통기한").fill((today - timedelta(days=1)).isoformat())
                row.get_by_role("button", name="수정 저장").click()
                expect(page.locator("#notice")).to_contain_text("오류:")
                check(True, "show API validation error in live region")

                row.get_by_label("재료명").fill("UI 수정 두부")
                row.get_by_label("수량").fill("2")
                row.get_by_label("단위").fill("팩")
                row.get_by_label("유통기한").fill((today + timedelta(days=7)).isoformat())
                row.get_by_role("button", name="수정 저장").click()
                row = page.locator("#inventory-list .inventory-row")
                expect(row.get_by_label("재료명")).to_have_value("UI 수정 두부")
                expect(row.get_by_label("수량")).to_have_value("2")
                expect(row.get_by_label("단위")).to_have_value("팩")
                check(True, "update inventory from UI")

                page.get_by_role("button", name="오늘 식단 생성").click()
                meals = page.locator("#meal-list .meal")
                expect(meals).to_have_count(4)
                calories = page.locator('[data-metric="칼로리"]')
                expect(calories).to_contain_text("0 /")
                check(True, "generate four meals and nutrition targets")

                first_meal = meals.first
                second_meal_before = meals.nth(1).inner_text()
                with page.expect_response(
                    lambda response: response.url.endswith("/regenerate")
                ) as regenerate_response:
                    first_meal.get_by_role("button", name="다른 식단").click()
                check(
                    regenerate_response.value.status == 200,
                    "receive successful one-meal regeneration response",
                )
                regenerate_payload = regenerate_response.value.json()
                check(
                    regenerate_payload["generator"] == "ai_v1"
                    and regenerate_payload["meal"]["source_type"] == "ai_generated"
                    and bool(regenerate_payload["used_ingredients"]),
                    "show AI source and used inventory for regenerated meal",
                )
                expect(page.locator("#notice")).to_have_text(
                    re.compile(r"^AI 재추천 완료 · 냉장고 사용: .+")
                )
                expect(meals).to_have_count(4)
                check(
                    meals.nth(1).inner_text() == second_meal_before,
                    "keep unselected meal unchanged",
                )
                check(True, "regenerate only one meal from UI")

                first_meal.get_by_role("button", name="먹었어요").click()
                expect(meals.first.get_by_text("기록 상태:")).to_be_visible()
                page.wait_for_function(
                    """() => Number(
                      document.querySelector('[data-metric="칼로리"]')
                        ?.textContent.split('/')[0].trim()
                    ) > 0"""
                )
                check(True, "record eaten meal and refresh consumed nutrition")

                page.get_by_role("button", name="이전 날짜").click()
                expect(page.locator("#recommendation-empty")).to_be_visible()
                expect(page.locator("#nutrition-empty")).to_be_visible()
                check(True, "show empty state for another date")

                page.get_by_role("button", name="다음 날짜").click()
                expect(meals).to_have_count(4)
                page.wait_for_function(
                    """() => Number(
                      document.querySelector('[data-metric="칼로리"]')
                        ?.textContent.split('/')[0].trim()
                    ) > 0"""
                )
                check(True, "restore date-specific recommendation and intake")

                for width in (320, 768, 1024, 1440):
                    page.set_viewport_size({"width": width, "height": 900})
                    has_overflow = page.evaluate(
                        "document.documentElement.scrollWidth > window.innerWidth"
                    )
                    check(not has_overflow, f"no horizontal overflow at {width}px")

                page.set_viewport_size({"width": 1024, "height": 900})
                page.screenshot(path=str(screenshot), full_page=True)
                check(screenshot.exists(), "capture populated UI screenshot")

                for attempt in range(3):
                    row.get_by_role("button", name="삭제").click()
                    try:
                        row.wait_for(state="detached", timeout=20_000)
                        break
                    except PlaywrightTimeoutError:
                        if attempt == 2:
                            raise
                expect(page.locator("#inventory-empty")).to_be_visible()
                expect(row).to_have_count(0)
                check(True, "delete inventory from UI")

                page.get_by_role("button", name="로그아웃").click()
                expect(page.locator("#login-panel")).to_be_visible()
                expect(page.locator("#app")).to_be_hidden()
                check(True, "log out and hide authenticated UI")
                check(not page_errors, "no uncaught page errors")
                unexpected_console_errors = [
                    message for message in console_errors if "422" not in message
                ]
                check(
                    not unexpected_console_errors,
                    "no unexpected browser console errors",
                )
                context.close()
                browser.close()
        finally:
            if user_id:
                recommendation_ids: set[str] = set()
                meal_ids: set[str] = set()
                log_ids: set[str] = set()

                recommendations = remote.get(
                    "/rest/v1/diet_recommendations",
                    headers=admin_headers,
                    params={
                        "user_id": f"eq.{user_id}",
                        "select": "diet_recommendation_id",
                    },
                )
                if recommendations.status_code == 200:
                    recommendation_ids.update(
                        row["diet_recommendation_id"] for row in recommendations.json()
                    )
                else:
                    cleanup_errors.append("discover:diet_recommendations")

                logs = remote.get(
                    "/rest/v1/meal_logs",
                    headers=admin_headers,
                    params={"user_id": f"eq.{user_id}", "select": "meal_log_id"},
                )
                if logs.status_code == 200:
                    log_ids.update(row["meal_log_id"] for row in logs.json())
                else:
                    cleanup_errors.append("discover:meal_logs")

                for recommendation_id in recommendation_ids:
                    meals_response = remote.get(
                        "/rest/v1/diet_meals",
                        headers=admin_headers,
                        params={
                            "diet_recommendation_id": f"eq.{recommendation_id}",
                            "select": "diet_meal_id",
                        },
                    )
                    if meals_response.status_code == 200:
                        meal_ids.update(
                            row["diet_meal_id"] for row in meals_response.json()
                        )
                    else:
                        cleanup_errors.append("discover:diet_meals")

                for log_id in log_ids:
                    response = remote.delete(
                        "/rest/v1/meal_log_items",
                        headers=admin_headers,
                        params={"meal_log_id": f"eq.{log_id}"},
                    )
                    if response.status_code not in (200, 204):
                        cleanup_errors.append("meal_log_items")

                for table in (
                    "diet_feedback",
                    "meal_logs",
                    "user_food_inventory",
                    "user_allergies",
                ):
                    response = remote.delete(
                        f"/rest/v1/{table}",
                        headers=admin_headers,
                        params={"user_id": f"eq.{user_id}"},
                    )
                    if response.status_code not in (200, 204):
                        cleanup_errors.append(table)

                for meal_id in meal_ids:
                    response = remote.delete(
                        "/rest/v1/diet_meal_foods",
                        headers=admin_headers,
                        params={"diet_meal_id": f"eq.{meal_id}"},
                    )
                    if response.status_code not in (200, 204):
                        cleanup_errors.append("diet_meal_foods")

                for recommendation_id in recommendation_ids:
                    response = remote.delete(
                        "/rest/v1/diet_meals",
                        headers=admin_headers,
                        params={
                            "diet_recommendation_id": f"eq.{recommendation_id}"
                        },
                    )
                    if response.status_code not in (200, 204):
                        cleanup_errors.append("diet_meals")

                for table in ("diet_recommendations", "profiles"):
                    response = remote.delete(
                        f"/rest/v1/{table}",
                        headers=admin_headers,
                        params={"user_id": f"eq.{user_id}"},
                    )
                    if response.status_code not in (200, 204):
                        cleanup_errors.append(table)

                if cleanup_token:
                    signed_out = remote.post(
                        "/auth/v1/logout?scope=global",
                        headers={
                            "apikey": settings.supabase_publishable_key,
                            "Authorization": f"Bearer {cleanup_token}",
                        },
                    )
                    if signed_out.status_code not in (200, 204):
                        cleanup_errors.append("logout")

                deleted = remote.delete(
                    f"/auth/v1/admin/users/{user_id}", headers=admin_headers
                )
                if deleted.status_code not in (200, 204):
                    cleanup_errors.append("auth")
                verify = remote.get(
                    f"/auth/v1/admin/users/{user_id}", headers=admin_headers
                )
                if verify.status_code != 404:
                    cleanup_errors.append("remaining:auth")

            if cleanup_errors:
                raise RuntimeError(
                    "Test resource cleanup required: " + ",".join(cleanup_errors)
                )
            print("Cleaned up synthetic UI user and diet records.", flush=True)

    print(f"Completed {checks} deployed browser UI checks.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", choices=[PROJECT], required=True)
    parser.add_argument(
        "--screenshot",
        type=Path,
        default=Path("/tmp/autofit-diet-ui-test.png"),
    )
    args = parser.parse_args()
    run(args.project, args.screenshot)
