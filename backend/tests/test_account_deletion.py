import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.app import account_deletion

UID = "df928147-6106-4585-9730-aa74c5beef9c"
OTHER = "75383a55-4c59-49db-8bec-2cc46fd5be47"
SETTINGS = SimpleNamespace(supabase_url="https://test.invalid", supabase_service_role_key="sb_secret_test")


def run_delete(handler):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await account_deletion.delete_account(UID, SETTINGS, client=client)
    asyncio.run(run())


def test_files_removed_in_batches_before_auth_delete():
    calls = []
    listings = iter([
        [{"bucket_id": "health-documents", "name": f"{UID}/nested/file.pdf"},
         {"bucket_id": "meal-photos", "name": f"{UID}/meal.png"}],
        [{"bucket_id": "meal-photos", "name": f"{UID}/next.png"}], [],
    ])

    def handler(request):
        path = request.url.path
        calls.append(path)
        assert "authorization" not in request.headers
        assert request.headers["apikey"] == "sb_secret_test"
        if "/rpc/" in path:
            assert json.loads(request.content) == {"p_user_id": UID}
        if path.endswith("account_deletion_storage"):
            return httpx.Response(200, json=next(listings))
        if "/storage/" in path:
            assert request.method == "DELETE"
            assert all(name.startswith(UID + "/") for name in json.loads(request.content)["prefixes"])
        if "/auth/" in path:
            assert request.method == "DELETE" and path.endswith(UID)
        return httpx.Response(200, json={})

    run_delete(handler)
    assert calls[0].endswith("begin_account_deletion")
    assert calls[-1] == f"/auth/v1/admin/users/{UID}"
    assert len([p for p in calls if "/storage/" in p]) == 3


@pytest.mark.parametrize("failure", ["begin", "listing", "invalid_listing", "file", "remaining", "network"])
def test_failure_preserves_auth_and_never_claims_success(failure):
    calls = []

    def handler(request):
        path = request.url.path
        calls.append(path)
        assert "/auth/" not in path
        if path.endswith("begin_account_deletion"):
            return httpx.Response(500 if failure == "begin" else 204)
        if path.endswith("account_deletion_storage"):
            if failure == "listing":
                return httpx.Response(500)
            if failure == "invalid_listing":
                return httpx.Response(200, json={"unexpected": True})
            return httpx.Response(200, json=[{"bucket_id": "meal-photos", "name": UID + "/photo.png"}])
        if failure == "network":
            raise httpx.ReadTimeout("timeout", request=request)
        return httpx.Response(500 if failure == "file" else 200)

    with pytest.raises(HTTPException) as error:
        run_delete(handler)
    assert error.value.status_code == 502


def test_no_files_and_auth_failure_returns_error():
    def handler(request):
        if request.url.path.endswith("account_deletion_storage"):
            return httpx.Response(200, json=[])
        return httpx.Response(500 if "/auth/" in request.url.path else 204)
    with pytest.raises(HTTPException) as error:
        run_delete(handler)
    assert error.value.status_code == 502


def test_route_uses_only_authenticated_user_and_rejects_missing_auth(monkeypatch):
    calls = []

    async def auth():
        return SimpleNamespace(id=UID)

    async def delete(uid, settings):
        calls.append(uid)

    monkeypatch.setattr(account_deletion, "delete_account", delete)
    app = FastAPI()
    app.include_router(account_deletion.create_account_deletion_router(auth, lambda: SETTINGS))
    client = TestClient(app)
    assert client.request("DELETE", "/api/account", json={"user_id": OTHER}).status_code == 204
    assert calls == [UID]

    async def deny_auth():
        raise HTTPException(401, "Missing session")

    app.dependency_overrides[auth] = deny_auth
    assert client.delete("/api/account").status_code == 401
    assert calls == [UID]
