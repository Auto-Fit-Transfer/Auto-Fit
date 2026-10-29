import asyncio
from io import BytesIO

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient

from backend.app import main, meal_photos
from backend.tests.test_main import TEST_SETTINGS

OWNER = "3388350b-2b51-4784-a258-7d7f505fa311"
LOG = "20260916-0000-4000-8000-000000000002"
PNG = b"\x89PNG\r\n\x1a\nphoto"


def transport(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr(meal_photos.httpx, "AsyncClient",
                        lambda **kw: original(transport=httpx.MockTransport(handler), **kw))


@pytest.mark.parametrize("data,code", [(b"fake image", 415), (b"x" * (meal_photos.MAX_BYTES + 1), 413), (b"", 415)])
def test_reject_invalid_photo(data, code):
    with pytest.raises(HTTPException) as error:
        asyncio.run(meal_photos.read_photo(UploadFile(file=BytesIO(data), filename="photo.png")))
    assert error.value.status_code == code


def test_upload_and_reload_private_photo(monkeypatch):
    stored = {}
    signed = []

    def handle(request):
        import json
        path = request.url.path
        if path.endswith("/meal_logs"):
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            assert request.url.params["status"] == "eq.recorded"
            if request.method == "PATCH":
                assert request.url.params["photo_storage_path"] == "is.null"
                stored["storage_path"] = json.loads(request.content)["photo_storage_path"]
                return httpx.Response(200, json=[{"meal_log_id": LOG}])
            return httpx.Response(200, json=[{"meal_log_id": LOG}])
        if "/object/sign/" in path:
            signed.append(path)
            return httpx.Response(200, json={"signedURL": f"/object/sign/meal-photos/{stored['storage_path']}?token={len(signed)}"})
        assert path.startswith(f"/storage/v1/object/meal-photos/{OWNER}/{LOG}/")
        assert request.headers["content-type"] == "image/png"
        assert request.content == PNG
        return httpx.Response(200)

    transport(monkeypatch, handle)
    uploaded = asyncio.run(meal_photos.upload_photo(LOG, OWNER, UploadFile(file=BytesIO(PNG)), TEST_SETTINGS))
    logs = [{"meal_log_id": LOG, "photo_storage_path": stored["storage_path"]}]
    asyncio.run(meal_photos.attach_photos(logs, OWNER, TEST_SETTINGS))
    assert uploaded["image_storage_path"] == logs[0]["image_storage_path"]
    assert uploaded["image_url"] != logs[0]["image_url"]
    assert logs[0]["image_url_expires_in"] == 3600


def test_other_user_cannot_upload(monkeypatch):
    requests = []

    def handle(request):
        requests.append(request)
        assert request.url.params["user_id"] == f"eq.{OWNER}"
        return httpx.Response(200, json=[])

    transport(monkeypatch, handle)
    with pytest.raises(HTTPException) as error:
        asyncio.run(meal_photos.upload_photo(LOG, OWNER, UploadFile(file=BytesIO(PNG)), TEST_SETTINGS))
    assert error.value.status_code == 404
    assert len(requests) == 1


@pytest.mark.parametrize("db_status,code", [(409, 409), (500, 502)])
def test_db_failure_cleans_uploaded_object(monkeypatch, db_status, code):
    deleted = []

    def handle(request):
        if request.url.path.endswith("/meal_logs"):
            if request.method == "PATCH":
                return httpx.Response(db_status)
            return httpx.Response(200, json=[{"meal_log_id": LOG}])
        if request.method == "DELETE":
            deleted.append(request.url.path)
        return httpx.Response(200)

    transport(monkeypatch, handle)
    with pytest.raises(HTTPException) as error:
        asyncio.run(meal_photos.upload_photo(LOG, OWNER, UploadFile(file=BytesIO(PNG)), TEST_SETTINGS))
    assert error.value.status_code == code
    assert len(deleted) == 1


def test_upload_contract_and_auth(monkeypatch):
    async def fake_user():
        return main.AuthenticatedUser(id=OWNER)

    async def fake_upload(log_id, user_id, file, settings):
        assert (log_id, user_id) == (LOG, OWNER)
        return {"meal_log_id": LOG, "image_storage_path": "photo.png", "image_url": "https://example.com/photo"}

    monkeypatch.setattr(meal_photos, "upload_photo", fake_upload)
    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).post(f"/api/diet/meal-logs/{LOG}/photo", files={"file": ("photo.png", PNG, "image/png")})
        assert response.status_code == 201
        assert response.json()["image_url_expires_in"] == 3600
    finally:
        main.app.dependency_overrides.clear()
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        assert TestClient(main.app).post(f"/api/diet/meal-logs/{LOG}/photo", files={"file": ("photo.png", PNG)}).status_code == 401
    finally:
        main.app.dependency_overrides.clear()


def test_concurrent_upload_loser_cleans_object(monkeypatch):
    deleted = []

    def handle(request):
        if request.method == "GET":
            return httpx.Response(200, json=[{"meal_log_id": LOG}])
        if request.method == "PATCH":
            return httpx.Response(200, json=[])
        if request.method == "DELETE":
            deleted.append(request.url.path)
        return httpx.Response(200)

    transport(monkeypatch, handle)
    with pytest.raises(HTTPException) as error:
        asyncio.run(meal_photos.upload_photo(LOG, OWNER, UploadFile(file=BytesIO(PNG)), TEST_SETTINGS))
    assert error.value.status_code == 409
    assert len(deleted) == 1


def test_ambiguous_db_timeout_keeps_potentially_committed_photo(monkeypatch):
    deleted = []

    def handle(request):
        if request.method == "GET":
            return httpx.Response(200, json=[{"meal_log_id": LOG}])
        if request.method == "PATCH":
            raise httpx.ReadTimeout("response lost", request=request)
        if request.method == "DELETE":
            deleted.append(request.url.path)
        return httpx.Response(200)

    transport(monkeypatch, handle)
    with pytest.raises(httpx.ReadTimeout):
        asyncio.run(meal_photos.upload_photo(LOG, OWNER, UploadFile(file=BytesIO(PNG)), TEST_SETTINGS))
    assert not deleted
