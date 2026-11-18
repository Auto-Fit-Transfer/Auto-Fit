import asyncio

import httpx
import pytest
from fastapi import HTTPException

from backend.app import main
from backend.app.http_client import bind_request_client


SETTINGS = main.Settings(
    supabase_url="https://example.supabase.co",
    supabase_publishable_key="sb_publishable_test",
    supabase_service_role_key="sb_secret_test",
    frontend_origin="http://localhost:3000",
)


def _history():
    return [{
        "session": {"exercise_session_id": "session-1", "exercise_recommendation_id": "plan-1"},
        "logs": [
            {"exercise_item_id": "item-full", "exercise_name": "전신 운동"},
            {"exercise_item_id": "item-old", "exercise_name": "과거 운동"},
            {"exercise_item_id": "item-other", "exercise_name": "다른 추천 운동"},
            {"exercise_item_id": None, "exercise_name": "사용자 운동"},
        ],
        "feedback": None,
    }]


def test_history_exposes_stored_array_without_expanding_full_body():
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/exercise_items")
        assert "body_regions" in request.url.params["select"]
        return httpx.Response(200, json=[
            {"exercise_item_id": "item-full", "exercise_recommendation_id": "plan-1", "body_regions": ["full_body"]},
            {"exercise_item_id": "item-old", "exercise_recommendation_id": "plan-1", "body_regions": None},
            {"exercise_item_id": "item-other", "exercise_recommendation_id": "plan-2", "body_regions": ["core"]},
        ], request=request)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            async with bind_request_client(client):
                return await main.enrich_exercise_history_with_body_regions(_history(), SETTINGS)

    result = asyncio.run(run())
    assert [row["body_regions"] for row in result[0]["logs"]] == [
        ["full_body"], None, None, None,
    ]
    assert result[0]["logs"][0]["exercise_name"] == "전신 운동"


def test_history_body_region_source_failure_is_not_reported_as_empty_data():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(503, json={"message": "unavailable"}, request=request),
        )) as client:
            async with bind_request_client(client):
                return await main.enrich_exercise_history_with_body_regions(_history(), SETTINGS)

    with pytest.raises(HTTPException) as error:
        asyncio.run(run())
    assert error.value.status_code == 502
