import asyncio
from datetime import date
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from backend.app import main, meal_photos
from backend.app.http_client import bind_request_client
from backend.tests.test_main import TEST_SETTINGS


def test_foods_and_images_overlap_and_preserve_response():
    async def run():
        entered = set()
        all_entered = asyncio.Event()

        async def handler(request):
            path = request.url.path.rsplit("/", 1)[-1]
            if path == "diet_recommendations":
                assert request.url.params["user_id"] == "eq.owner"
                assert request.url.params["recommendation_date"] == "eq.2026-09-16"
                return httpx.Response(200, json=[{"diet_recommendation_id": "rec"}])
            if path == "diet_meals":
                assert request.url.params["diet_recommendation_id"] == "eq.rec"
                return httpx.Response(200, json=[{"diet_meal_id": "meal", "menu_image_key": "key"}])
            entered.add(path)
            if len(entered) == 4:
                all_entered.set()
            await asyncio.wait_for(all_entered.wait(), timeout=1)
            if path == "diet_meal_foods":
                assert request.url.params["diet_meal_id"] == "in.(meal)"
                return httpx.Response(
                    200,
                    json=[
                        {
                            "diet_meal_id": "meal",
                            "food_name": "[DUMMY 20260916] 현미밥",
                            "quantity": 56.26,
                            "unit": "g",
                        }
                    ],
                )
            if path == "diet_feedback":
                assert request.url.params["user_id"] == "eq.owner"
                assert request.url.params["diet_meal_id"] == "in.(meal)"
                return httpx.Response(200, json=[{
                    "diet_feedback_id": "feedback",
                    "diet_meal_id": "meal",
                    "meal_log_id": None,
                    "feedback_type": "skipped",
                    "actual_food_name": None,
                    "feedback_note": None,
                    "recorded_at": "2026-09-16T03:00:00Z",
                }])
            if path == "user_food_inventory":
                assert request.url.params["user_id"] == "eq.owner"
                return httpx.Response(200, json=[{
                    "user_food_inventory_id": "inventory-1",
                    "custom_name": "현미밥",
                    "quantity": 2,
                    "unit": "인분",
                    "food_items": None,
                }])
            assert path == "menu_images"
            return httpx.Response(200, json=[{"image_key": "key", "storage_path": "menu.png", "source_type": "cache", "generation_status": "completed"}])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await main.fetch_diet_recommendation("owner", TEST_SETTINGS, date(2026, 9, 16), client=client)
            assert not client.is_closed
        assert entered == {
            "diet_meal_foods", "menu_images", "diet_feedback",
            "user_food_inventory",
        }
        meal = result["meals"][0]
        assert meal["foods"] == [
            {
                "diet_meal_id": "meal",
                "food_name": "현미밥",
                "display_name": "현미밥",
                "quantity": 56,
                "unit": "g",
                "display_unit": "g",
            }
        ]
        assert meal["feedback"]["feedback_type"] == "skipped"
        assert meal["used_ingredients"][0]["name"] == "현미밥"
        assert meal["image_url"].endswith("/menu-images/menu.png")
        assert meal["image_generation_required"] is False

    asyncio.run(run())


def test_recommendation_returns_null_feedback_when_unrecorded():
    async def run():
        async def handler(request):
            path = request.url.path.rsplit("/", 1)[-1]
            if path == "diet_recommendations":
                return httpx.Response(200, json=[{"diet_recommendation_id": "rec"}])
            if path == "diet_meals":
                return httpx.Response(200, json=[{"diet_meal_id": "meal", "menu_image_key": None}])
            if path in {"diet_meal_foods", "diet_feedback", "user_food_inventory"}:
                return httpx.Response(200, json=[])
            raise AssertionError(f"unexpected request: {path}")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await main.fetch_diet_recommendation(
                "owner", TEST_SETTINGS, date(2026, 9, 16), client=client
            )

        assert result["meals"][0]["feedback"] is None

    asyncio.run(run())


def test_recommendation_restores_used_inventory_after_reload():
    async def run():
        async def handler(request):
            path = request.url.path.rsplit("/", 1)[-1]
            if path == "diet_recommendations":
                return httpx.Response(200, json=[{"diet_recommendation_id": "rec"}])
            if path == "diet_meals":
                return httpx.Response(200, json=[{
                    "diet_meal_id": "meal",
                    "menu_image_key": None,
                    "status": "completed",
                }])
            if path == "diet_meal_foods":
                return httpx.Response(200, json=[{
                    "diet_meal_id": "meal",
                    "food_name": "바나나",
                    "quantity": 1,
                    "unit": "개(중간)",
                }])
            if path == "diet_feedback":
                return httpx.Response(200, json=[{
                    "diet_meal_id": "meal",
                    "feedback_type": "eaten",
                }])
            if path == "user_food_inventory":
                return httpx.Response(200, json=[{
                    "user_food_inventory_id": "inventory-1",
                    "custom_name": "바나나",
                    "quantity": 6,
                    "unit": "개",
                    "food_items": None,
                }])
            raise AssertionError(f"unexpected request: {path}")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await main.fetch_diet_recommendation(
                "owner", TEST_SETTINGS, date(2026, 9, 16), client=client
            )

        assert result["meals"][0]["used_ingredients"] == [{
            "user_food_inventory_id": "inventory-1",
            "name": "바나나",
            "matched_food_name": "바나나",
            "quantity": 6,
            "unit": "개",
        }]

    asyncio.run(run())


def test_recommendation_preserves_historical_inventory_snapshot():
    async def run():
        async def handler(request):
            path = request.url.path.rsplit("/", 1)[-1]
            if path == "diet_recommendations":
                return httpx.Response(200, json=[{
                    "diet_recommendation_id": "rec",
                    "recommendation_date": "2026-09-15",
                }])
            if path == "diet_meals":
                return httpx.Response(200, json=[{
                    "diet_meal_id": "meal",
                    "menu_image_key": None,
                    "status": "completed",
                    "used_ingredients": [{
                        "user_food_inventory_id": "inventory-1",
                        "name": "블루베리",
                        "matched_food_name": "블루베리",
                        "quantity": 10,
                        "unit": "개",
                    }],
                }])
            if path == "diet_meal_foods":
                return httpx.Response(200, json=[{
                    "diet_meal_id": "meal",
                    "food_name": "블루베리",
                    "quantity": 10,
                    "unit": "개",
                }])
            if path in {"diet_feedback", "user_food_inventory"}:
                return httpx.Response(200, json=[])
            raise AssertionError(f"unexpected request: {path}")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await main.fetch_diet_recommendation(
                "owner", TEST_SETTINGS, date(2026, 9, 15), client=client
            )

        assert result["meals"][0]["used_ingredients"] == [{
            "user_food_inventory_id": "inventory-1",
            "name": "블루베리",
            "matched_food_name": "블루베리",
            "quantity": 10,
            "unit": "개",
        }]

    asyncio.run(run())


def test_summary_fetches_only_targets_and_nutrients_concurrently():
    async def run():
        entered = set()
        ready = asyncio.Event()
        calls = []

        async def handler(request):
            path = request.url.path.rsplit("/", 1)[-1]
            calls.append(path)
            if path in {"diet_recommendations", "meal_logs"}:
                assert request.url.params["user_id"] == "eq.owner"
                entered.add(path)
                if len(entered) == 2:
                    ready.set()
                await asyncio.wait_for(ready.wait(), timeout=1)
            if path == "diet_recommendations":
                assert request.url.params["select"] == "target_calories,target_carbohydrates,target_protein,target_fat"
                return httpx.Response(200, json=[{"diet_recommendation_id": "rec", "target_calories": 2000}])
            if path == "meal_logs":
                return httpx.Response(200, json=[{"meal_log_id": "log", "photo_storage_path": "missing.png"}])
            assert path == "meal_log_items", "summary must not fetch meals, foods, images or signed photos"
            return httpx.Response(200, json=[{"meal_log_id": "log", "calories": 500, "carbohydrates": 80, "protein": 25, "fat": 10}])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(supabase_http_client=client)))
            result = await main.get_diet_nutrition_summary(date(2026, 9, 16), main.AuthenticatedUser(id="owner"), TEST_SETTINGS, request)
            assert not client.is_closed
        assert set(calls) == {"diet_recommendations", "meal_logs", "meal_log_items"}
        assert len(calls) == 3
        assert result["summary"]["calories"] == {"consumed": 500.0, "target": 2000.0, "unit": "kcal"}
        assert result["summary"]["protein"]["consumed"] == 25.0

    asyncio.run(run())


@pytest.mark.parametrize("failure", ["status", "timeout"])
def test_optional_photo_failure_preserves_meal_items_and_hides_secrets(failure, caplog):
    async def run():
        async def handler(request):
            path = request.url.path
            if path.endswith("/meal_logs"):
                return httpx.Response(200, json=[{"meal_log_id": "log", "photo_storage_path": "private-path.png"}])
            if path.endswith("/meal_log_items"):
                return httpx.Response(200, json=[{"meal_log_id": "log", "calories": 123}])
            assert "/object/sign/" in path
            if failure == "timeout":
                raise httpx.ReadTimeout("private-token")
            return httpx.Response(404, json={"message": "private-path.png"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await main.fetch_meal_logs("owner", date(2026, 9, 16), date(2026, 9, 16), TEST_SETTINGS, client=client)
        assert result[0]["items"] == [{"meal_log_id": "log", "calories": 123}]
        assert result[0]["image_url"] is None

    asyncio.run(run())
    assert "[diet-photo]" in caplog.text
    assert "private-path" not in caplog.text
    assert "private-token" not in caplog.text


def test_food_query_failure_still_fails_and_waits_for_sibling():
    async def run():
        siblings_finished = set()
        async def handler(request):
            path = request.url.path.rsplit("/", 1)[-1]
            if path == "diet_recommendations":
                return httpx.Response(200, json=[{"diet_recommendation_id": "rec"}])
            if path == "diet_meals":
                return httpx.Response(200, json=[{"diet_meal_id": "meal", "menu_image_key": "key"}])
            if path == "diet_meal_foods":
                return httpx.Response(503)
            await asyncio.sleep(0)
            siblings_finished.add(path)
            return httpx.Response(200, json=[])
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(HTTPException) as error:
                await main.fetch_diet_recommendation("owner", TEST_SETTINGS, date(2026, 9, 16), client=client)
            assert error.value.status_code == 502
            assert siblings_finished == {
                "menu_images", "diet_feedback", "user_food_inventory",
            }
            assert not client.is_closed

    asyncio.run(run())


def test_request_bound_client_is_reused_for_parallel_profile_reads():
    async def run():
        calls = []

        async def handler(request):
            calls.append(request.url.path)
            return httpx.Response(200, json=[])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            async with bind_request_client(client):
                catalog, selected = await asyncio.gather(
                    main.fetch_allergy_catalog(TEST_SETTINGS),
                    main.fetch_user_allergies("owner", TEST_SETTINGS),
                )
            assert not client.is_closed
        assert catalog == []
        assert selected == []
        assert set(calls) == {
            "/rest/v1/allergy_types",
            "/rest/v1/user_allergies",
        }

    asyncio.run(run())


def test_exercise_history_queries_run_concurrently():
    async def run():
        entered = set()
        all_entered = asyncio.Event()

        async def handler(request):
            table = request.url.path.rsplit("/", 1)[-1]
            entered.add(table)
            if len(entered) == 3:
                all_entered.set()
            await asyncio.wait_for(all_entered.wait(), timeout=1)
            return httpx.Response(200, json=[])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            async with bind_request_client(client):
                result = await main.fetch_exercise_history(
                    "owner", date(2026, 9, 1), date(2026, 9, 28), TEST_SETTINGS
                )
            assert not client.is_closed
        assert result == []
        assert entered == {
            "exercise_sessions",
            "exercise_logs",
            "exercise_session_feedback",
        }

    asyncio.run(run())
