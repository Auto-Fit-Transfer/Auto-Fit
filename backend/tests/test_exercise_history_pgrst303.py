import asyncio
from collections import Counter
from datetime import date

from fastapi import HTTPException
import httpx
import pytest

from backend.app import main
from backend.app.http_client import bind_request_client


SETTINGS = main.Settings(
    supabase_url="https://example.supabase.co",
    supabase_publishable_key="sb_publishable_test",
    supabase_service_role_key="sb_secret_test",
    frontend_origin="http://localhost:3000",
)
TABLES = (
    "exercise_sessions",
    "exercise_logs",
    "exercise_session_feedback",
)


async def _fetch_with_failure(failed_table: str, failures: int, counts: Counter[str]):
    def respond(request: httpx.Request) -> httpx.Response:
        table = request.url.path.rsplit("/", 1)[-1]
        assert table in TABLES
        assert request.headers["apikey"] == "sb_secret_test"
        assert "authorization" not in request.headers
        counts[table] += 1
        if table == failed_table and counts[table] <= failures:
            return httpx.Response(
                401,
                json={"code": "PGRST303", "message": "JWT issued at future"},
                request=request,
            )
        return httpx.Response(200, json=[], request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        async with bind_request_client(client):
            return await main.fetch_exercise_history(
                "owner", date(2026, 9, 1), date(2026, 9, 28), SETTINGS
            )


@pytest.mark.parametrize("failed_table", TABLES)
def test_exercise_history_retries_only_the_failed_read(failed_table):
    counts: Counter[str] = Counter()

    assert asyncio.run(_fetch_with_failure(failed_table, 1, counts)) == []
    assert counts == Counter({table: 2 if table == failed_table else 1 for table in TABLES})


def test_exercise_history_still_returns_502_after_bounded_retries():
    counts: Counter[str] = Counter()

    with pytest.raises(HTTPException) as error:
        asyncio.run(_fetch_with_failure("exercise_session_feedback", 3, counts))

    assert error.value.status_code == 502
    assert counts == Counter({
        "exercise_sessions": 1,
        "exercise_logs": 1,
        "exercise_session_feedback": 3,
    })
