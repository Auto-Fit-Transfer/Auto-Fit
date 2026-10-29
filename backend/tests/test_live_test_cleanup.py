import asyncio

import httpx
import pytest

from backend.tests.live_test_cleanup import cleanup_user_defaults


@pytest.mark.parametrize("failure", [None, "delete", "remaining", "network"])
def test_cleanup_scopes_and_checks_both_tables_even_on_failure(failure):
    calls = []

    def handle(request):
        calls.append((request.method, request.url.path))
        assert request.url.params["user_id"] == "eq.disposable-user"
        if request.method == "GET":
            assert request.url.params["select"] == "user_id"
            assert request.url.params["limit"] == "1"
        if request.url.path.endswith("notification_settings"):
            if failure == "network":
                raise httpx.ConnectError("offline", request=request)
            if failure == "delete" and request.method == "DELETE":
                return httpx.Response(500)
            if failure == "remaining" and request.method == "GET":
                return httpx.Response(200, json=[{"user_id": "disposable-user"}])
        return httpx.Response(204) if request.method == "DELETE" else httpx.Response(200, json=[])

    async def run():
        async with httpx.AsyncClient(base_url="https://test.invalid", transport=httpx.MockTransport(handle)) as client:
            return await cleanup_user_defaults(client, {}, "disposable-user")

    errors = asyncio.run(run())
    assert bool(errors) == (failure is not None)
    assert calls[0] == ("DELETE", "/rest/v1/notification_settings")
    assert calls[-2:] == [("DELETE", "/rest/v1/profiles"), ("GET", "/rest/v1/profiles")]
