import asyncio
from io import BytesIO
import httpx
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient

from backend.app import health_documents, main
from backend.tests.test_main import TEST_SETTINGS


USER_ID = "3388350b-2b51-4784-a258-7d7f505fa311"
FILE_ID = "20260916-0000-4000-8000-000000000002"


async def fake_user() -> main.AuthenticatedUser:
    return main.AuthenticatedUser(id=USER_ID)


def override_dependencies() -> None:
    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS


def test_upload_endpoint_uses_authenticated_user(monkeypatch) -> None:
    captured = {}

    async def fake_create_document(**kwargs):
        captured.update(kwargs)
        return {"file": {"uploaded_file_id": FILE_ID, "document_type": "health_checkup", "file_name": "checkup.pdf", "uploaded_at": "2026-09-17T00:00:00Z"}, "ocr_result": {"status": "completed", "extracted_data": {"weight_kg": "70"}}}

    monkeypatch.setattr(health_documents, "_create_document", fake_create_document)
    override_dependencies()
    try:
        response = TestClient(main.app).post(
            "/api/health-documents",
            data={"document_type": "health_checkup"},
            files={"file": ("checkup.pdf", b"%PDF-1.7\n", "application/pdf")},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["uploaded_file_id"] == FILE_ID
    assert response.json()["original_file_name"] == "checkup.pdf"
    assert response.json()["extracted_data"]["weight_kg"] == "70"
    assert captured["user_id"] == USER_ID
    assert captured["document_type"] == "health_checkup"
    assert captured["settings"] == TEST_SETTINGS
    assert captured["file"].filename == "checkup.pdf"


def test_upload_endpoint_rejects_unknown_document_type() -> None:
    override_dependencies()
    try:
        response = TestClient(main.app).post(
            "/api/health-documents",
            data={"document_type": "prescription"},
            files={"file": ("checkup.pdf", b"%PDF-1.7\n", "application/pdf")},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["detail"]["fields"] == ["body.document_type"]


def test_upload_validation_uses_magic_bytes_not_filename() -> None:
    # Starlette expects a file-like object; BytesIO keeps this unit test in memory.

    valid = UploadFile(filename="wrong.txt", file=BytesIO(b"%PDF-1.7\n"))
    content, media_type, extension = asyncio.run(
        health_documents._read_validated_upload(valid)
    )
    assert content == b"%PDF-1.7\n"
    assert (media_type, extension) == ("application/pdf", ".pdf")

    disguised = UploadFile(filename="attack.pdf", file=BytesIO(b"not a pdf"))
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(health_documents._read_validated_upload(disguised))
    assert exc_info.value.status_code == 415


def test_health_data_validation_rejects_unknown_or_missing_fields() -> None:
    with pytest.raises(HTTPException) as unknown:
        health_documents._validate_extracted_data(
            "health_checkup",
            {"checkup_date": "2026-09-16", "user_id": "another-user"},
            require_measurement_date=True,
        )
    assert unknown.value.status_code == 422
    assert unknown.value.detail["fields"] == ["extracted_data.user_id"]

    with pytest.raises(HTTPException) as missing:
        health_documents._validate_extracted_data(
            "body_composition",
            {"weight_kg": 70},
            require_measurement_date=True,
        )
    assert missing.value.detail["fields"] == ["extracted_data.measured_at"]


def test_document_query_is_owner_scoped(monkeypatch) -> None:
    calls = []
    responses = [
        httpx.Response(
            200,
            json=[
                {
                    "uploaded_file_id": FILE_ID,
                    "document_type": "health_checkup",
                    "storage_path": f"{USER_ID}/2026/09/{FILE_ID}.pdf",
                }
            ],
        ),
        httpx.Response(200, json=[]),
    ]

    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["trust_env"] is False

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, headers, params):
            calls.append((url, params))
            return responses.pop(0)

    monkeypatch.setattr(health_documents.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(
        health_documents._fetch_document(FILE_ID, USER_ID, TEST_SETTINGS)
    )

    assert result["file"]["uploaded_file_id"] == FILE_ID
    assert calls[0][1]["user_id"] == f"eq.{USER_ID}"
    assert calls[0][1]["uploaded_file_id"] == f"eq.{FILE_ID}"


def test_health_document_routes_are_in_openapi() -> None:
    paths = main.app.openapi()["paths"]
    assert set(paths["/api/health-documents"]) == {"post", "get"}
    assert set(paths["/api/health-documents/{uploaded_file_id}"]) == {"get", "delete"}
    assert set(paths["/api/health-documents/{uploaded_file_id}/ocr-result"]) == {"patch"}
    assert set(paths["/api/health-documents/{uploaded_file_id}/confirm"]) == {"post"}


def test_delete_document_removes_storage_before_database_and_returns_deleted_ids(monkeypatch) -> None:
    calls = []

    async def fetch(uploaded_file_id, user_id, settings):
        assert str(uploaded_file_id) == FILE_ID
        assert user_id == USER_ID
        return {"file": {
            "storage_path": f"{USER_ID}/2026/09/{FILE_ID}.pdf",
            "processing_status": "manually_confirmed",
        }}

    class Client:
        def __init__(self, **kwargs):
            assert kwargs["trust_env"] is False

        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass

        async def delete(self, url, *, headers):
            calls.append(("storage", url, None))
            return httpx.Response(200)

        async def post(self, url, *, headers, json):
            calls.append(("database", url, json))
            return httpx.Response(200, json={
                "uploaded_file_id": FILE_ID,
                "document_type": "health_checkup",
                "health_checkup_id": "20260916-0000-4000-8000-000000000003",
                "body_composition_id": None,
            })

    monkeypatch.setattr(health_documents, "_fetch_document", fetch)
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    override_dependencies()
    try:
        response = TestClient(main.app).delete(f"/api/health-documents/{FILE_ID}")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "uploaded_file_id": FILE_ID,
        "document_type": "health_checkup",
        "status": "deleted",
        "health_checkup_id": "20260916-0000-4000-8000-000000000003",
        "body_composition_id": None,
    }
    assert [call[0] for call in calls] == ["storage", "database"]
    assert calls[1][2] == {"p_uploaded_file_id": FILE_ID, "p_user_id": USER_ID}


def test_delete_document_keeps_database_when_storage_deletion_fails(monkeypatch) -> None:
    async def fetch(*args):
        return {"file": {
            "storage_path": f"{USER_ID}/2026/09/{FILE_ID}.pdf",
            "processing_status": "manually_confirmed",
        }}

    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def delete(self, *args, **kwargs): return httpx.Response(500)
        async def post(self, *args, **kwargs):
            pytest.fail("database deletion must not run after storage deletion failure")

    monkeypatch.setattr(health_documents, "_fetch_document", fetch)
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    override_dependencies()
    try:
        response = TestClient(main.app).delete(f"/api/health-documents/{FILE_ID}")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "DATA_SOURCE_ERROR"


def test_delete_document_rejects_unconfirmed_document_before_storage(monkeypatch) -> None:
    async def fetch(*args):
        return {"file": {
            "storage_path": f"{USER_ID}/2026/09/{FILE_ID}.pdf",
            "processing_status": "awaiting_review",
        }}

    class Client:
        def __init__(self, **kwargs):
            pytest.fail("unconfirmed deletion must not call storage or database")

    monkeypatch.setattr(health_documents, "_fetch_document", fetch)
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    override_dependencies()
    try:
        response = TestClient(main.app).delete(f"/api/health-documents/{FILE_ID}")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DOCUMENT_NOT_CONFIRMED"


def test_ocr_update_endpoint_rejects_client_identity(monkeypatch) -> None:
    called = False

    async def fake_update(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(health_documents, "_update_ocr_result", fake_update)
    override_dependencies()
    try:
        response = TestClient(main.app).patch(
            f"/api/health-documents/{FILE_ID}/ocr-result",
            json={
                "extracted_data": {"checkup_date": "2026-09-16"},
                "user_id": "another-user",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["detail"]["fields"] == ["body.user_id"]
    assert called is False


def test_confirm_health_checkup_maps_reviewed_data_and_user(monkeypatch) -> None:
    calls = []

    def response(status_code, payload):
        return httpx.Response(status_code, json=payload)

    class FakeClient:
        def __init__(self, **kwargs):
            assert kwargs["trust_env"] is False

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, headers, params):
            calls.append(("GET", url, params, None))
            if url.endswith("/upload_files"):
                return response(
                    200,
                    [
                        {
                            "uploaded_file_id": FILE_ID,
                            "document_type": "health_checkup",
                            "upload_status": "processing",
                            "processing_status": "awaiting_review",
                        }
                    ],
                )
            if url.endswith("/ocr_results"):
                return response(
                    200,
                    [
                        {
                            "ocr_result_id": "20260916-0000-4000-8000-000000000016",
                            "status": "completed",
                            "extracted_data": {
                                "checkup_date": "2026-09-16",
                                "weight_kg": "68.4",
                            },
                        }
                    ],
                )
            if url.endswith("/health_checkups"):
                assert params["user_id"] == f"eq.{USER_ID}"
                return response(200, [])
            raise AssertionError(url)

        async def post(self, url, headers, params, json):
            calls.append(("POST", url, params, json))
            assert url.endswith("/health_checkups")
            return response(201, [{**json, "created_at": "2026-09-16T00:00:00Z"}])

        async def patch(self, url, headers, params, json):
            calls.append(("PATCH", url, params, json))
            assert params["user_id"] == f"eq.{USER_ID}"
            return response(200, [{"uploaded_file_id": FILE_ID, **json}])

    monkeypatch.setattr(health_documents.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(
        health_documents._confirm_document(FILE_ID, USER_ID, TEST_SETTINGS)
    )

    create_call = next(call for call in calls if call[0] == "POST")
    assert create_call[3]["user_id"] == USER_ID
    assert create_call[3]["uploaded_file_id"] == FILE_ID
    assert create_call[3]["source_type"] == "manual"
    assert create_call[3]["checkup_date"] == "2026-09-16"
    assert create_call[3]["weight_kg"] == "68.4"
    assert result["already_confirmed"] is False
    assert result["file"]["processing_status"] == "manually_confirmed"


def test_confirm_is_idempotent_when_health_data_already_exists(monkeypatch) -> None:
    post_called = False

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, headers, params):
            if url.endswith("/upload_files"):
                return httpx.Response(
                    200,
                    json=[{"uploaded_file_id": FILE_ID, "document_type": "body_composition", "processing_status": "manually_confirmed"}],
                )
            if url.endswith("/ocr_results"):
                return httpx.Response(
                    200,
                    json=[
                        {
                            "status": "completed",
                            "extracted_data": {"measured_at": "2026-09-16T09:00:00+09:00"},
                        }
                    ],
                )
            return httpx.Response(
                200,
                json=[{"body_composition_id": "existing", "uploaded_file_id": FILE_ID}],
            )

        async def post(self, *args, **kwargs):
            nonlocal post_called
            post_called = True
            raise AssertionError("idempotent confirmation must not insert again")

    monkeypatch.setattr(health_documents.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(
        health_documents._confirm_document(FILE_ID, USER_ID, TEST_SETTINGS)
    )

    assert result["already_confirmed"] is True
    assert result["health_data"]["body_composition_id"] == "existing"
    assert post_called is False


def test_confirm_retry_repairs_file_status_after_measurement_was_created(monkeypatch) -> None:
    patched = []

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, headers, params):
            if url.endswith("/upload_files"):
                return httpx.Response(200, json=[{
                    "uploaded_file_id": FILE_ID, "document_type": "body_composition",
                    "processing_status": "awaiting_review",
                }])
            if url.endswith("/ocr_results"):
                return httpx.Response(200, json=[{
                    "status": "completed",
                    "extracted_data": {"measured_at": "2026-09-16T09:00:00+09:00"},
                }])
            return httpx.Response(200, json=[{
                "body_composition_id": "existing", "uploaded_file_id": FILE_ID,
            }])

        async def patch(self, url, headers, params, json):
            patched.append((params, json))
            return httpx.Response(200, json=[{"uploaded_file_id": FILE_ID, **json}])

        async def post(self, *args, **kwargs):
            raise AssertionError("retry must not create a second measurement")

    monkeypatch.setattr(health_documents.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(health_documents._confirm_document(FILE_ID, USER_ID, TEST_SETTINGS))
    assert result["already_confirmed"] is True
    assert result["file"]["processing_status"] == "manually_confirmed"
    assert patched == [(
        {"uploaded_file_id": f"eq.{FILE_ID}", "user_id": f"eq.{USER_ID}",
         "select": "uploaded_file_id,upload_status,processing_status"},
        {"upload_status": "completed", "processing_status": "manually_confirmed"},
    )]


def test_ocr_missing_configuration_is_failed_not_completed(monkeypatch):
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_MOCK_ENABLED", "false")
    monkeypatch.delenv("HEALTH_DOCUMENT_OCR_URL", raising=False)
    data, error = asyncio.run(health_documents._extract_document(b"%PDF-1.7", "application/pdf", "health_checkup"))
    assert error == "OCR_NOT_CONFIGURED"
    assert all(value is None for value in data.values())


@pytest.mark.parametrize("result,expected", [
    ({"document_type": "body_composition", "extracted_data": {"weight_kg": 70}}, "DOCUMENT_TYPE_MISMATCH"),
    ({"document_type": "health_checkup", "extracted_data": {}}, "EXTRACTION_FAILED"),
    ({"document_type": "health_checkup", "extracted_data": {"user_id": "injected"}}, "EXTRACTION_FAILED"),
    ({"document_type": "health_checkup", "extracted_data": {"weight_kg": 70}}, None),
    ([], "EXTRACTION_FAILED"),
])
def test_ocr_provider_response_is_validated(monkeypatch, result, expected):
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_URL", "https://ocr.example/extract")
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            assert kwargs["data"]["document_type"] == "health_checkup"
            assert "apikey" not in kwargs["headers"]
            return httpx.Response(200, json=result, request=httpx.Request("POST", url))
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    data, error = asyncio.run(health_documents._extract_document(b"%PDF-1.7", "application/pdf", "health_checkup"))
    assert error == expected
    if expected is None: assert data["weight_kg"] == "70"


@pytest.mark.parametrize("confirmed", [False, True])
def test_patch_merges_fields_and_rejects_confirmed_documents(monkeypatch, confirmed):
    document = {"file": {"uploaded_file_id": FILE_ID, "document_type": "health_checkup"},
                "ocr_result": {"status": "completed", "extracted_data": {"checkup_date": "2026-09-17", "height_cm": "175", "weight_kg": "70"}}}
    async def fetch(*args): return document
    monkeypatch.setattr(health_documents, "_fetch_document", fetch)
    patches = []
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, *args, **kwargs): return httpx.Response(200, json=[{}] if confirmed else [])
        async def patch(self, *args, **kwargs):
            patches.append(kwargs["json"])
            return httpx.Response(200, json=[{"ocr_result_id": FILE_ID}])
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    if confirmed:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(health_documents._update_ocr_result(FILE_ID, {"weight_kg": None}, USER_ID, TEST_SETTINGS))
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "DOCUMENT_CONFIRMED"
        assert not patches
    else:
        asyncio.run(health_documents._update_ocr_result(FILE_ID, {"weight_kg": None}, USER_ID, TEST_SETTINGS))
        assert patches[0]["extracted_data"]["height_cm"] == "175"
        assert patches[0]["extracted_data"]["checkup_date"] == "2026-09-17"
        assert patches[0]["extracted_data"]["weight_kg"] is None


def test_document_openapi_has_discriminator_units_and_errors():
    schema = main.app.openapi()
    operation = schema["paths"]["/api/health-documents/{uploaded_file_id}"]["get"]
    response = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert response["discriminator"]["propertyName"] == "document_type"
    assert set(operation["responses"]) >= {"401", "404", "409", "422", "502"}
    fields = schema["components"]["schemas"]["HealthCheckupData-Output"]["properties"]
    assert "cm" in fields["height_cm"]["description"]
    assert "mmHg" in fields["systolic_bp"]["description"]


@pytest.mark.parametrize("document_type,id_field,date_field", [
    ("health_checkup", "health_checkup_id", "checkup_date"),
    ("body_composition", "body_composition_id", "measured_at"),
])
@pytest.mark.parametrize("automatic", [False, True])
@pytest.mark.parametrize("original_file_name", [None, "건강검진결과_2026.pdf"])
@pytest.mark.parametrize("provider_sample", [False, True])
def test_mock_ocr_upload_review_update_confirm_flow(monkeypatch, document_type, id_field, date_field, automatic, original_file_name, provider_sample):
    """Real route/service flow; only external Storage/PostgREST are in memory."""
    monkeypatch.delenv("HEALTH_DOCUMENT_OCR_URL", raising=False)
    monkeypatch.delenv("HEALTH_DOCUMENT_OCR_MOCK_ENABLED", raising=False)
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_MOCK_DOCUMENT_TYPE", document_type)
    if provider_sample:
        import json
        from pathlib import Path
        sample = json.loads((Path(__file__).parent / "fixtures" / "ocr" / f"success_{document_type}.json").read_text())
        monkeypatch.setenv("HEALTH_DOCUMENT_OCR_URL", "https://ocr.internal/ai/ocr")
        async def request(*args):
            return sample
        monkeypatch.setattr(health_documents, "_request_ocr", request)
    rows = {"upload_files": [], "ocr_results": [], "health_checkups": [], "body_compositions": []}
    uploads = []

    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, *, headers, params=None, json=None, content=None):
            if "/storage/v1/object/" in url:
                uploads.append(content)
                return httpx.Response(200, json={})
            table = url.rsplit("/", 1)[-1]
            record = dict(json)
            if table == "upload_files": record["uploaded_at"] = "2026-09-17T00:00:00Z"
            rows[table].append(record)
            return httpx.Response(201, json=[record])
        async def get(self, url, *, headers, params):
            table = url.rsplit("/", 1)[-1]
            matches = [r for r in rows[table] if all(
                r.get(k) == v[3:] for k,v in params.items() if v.startswith("eq."))]
            return httpx.Response(200, json=matches)
        async def patch(self, url, *, headers, params, json):
            table = url.rsplit("/", 1)[-1]
            matches = [r for r in rows[table] if all(
                r.get(k) == v[3:] for k,v in params.items() if v.startswith("eq."))]
            for record in matches: record.update(json)
            return httpx.Response(200, json=matches)

    # TestClient's own HTTP transport is unchanged; only backend external calls use this fake.
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    override_dependencies()
    try:
        client = TestClient(main.app)
        content = b"%PDF-1.7\n"
        data = {} if automatic else {"document_type": document_type}
        if original_file_name is not None:
            data["original_file_name"] = original_file_name
        upload = client.post("/api/health-documents", data=data,
            files={"file": ("cache-uuid.pdf", content, "application/pdf")})
        assert upload.status_code == 201
        initial = upload.json()
        assert initial["document_type"] == document_type
        expected_name = original_file_name or "cache-uuid.pdf"
        assert initial["original_file_name"] == initial["file_name"] == expected_name
        assert rows["upload_files"][0]["original_file_name"] == expected_name
        assert expected_name not in rows["upload_files"][0]["storage_path"]
        assert initial["ocr_status"] == "completed"
        assert initial["error"] is None
        assert initial["extracted_data"][date_field] is not None
        assert initial["extracted_data"]["weight_kg"] == (str(sample["extracted_data"]["weight_kg"]) if provider_sample else "70")
        if provider_sample:
            assert initial["ocr_review"]["pages_used"] == [1]
            assert "_ocr_review" not in initial["extracted_data"]
            assert "_ocr_review" not in initial["ocr_result"]["extracted_data"]
        assert len(uploads) == 1
        path = "/api/health-documents/" + initial["uploaded_file_id"]
        fetched = client.get(path)
        assert fetched.status_code == 200
        assert fetched.json()["extracted_data"] == initial["extracted_data"]
        assert fetched.json()["ocr_review"] == initial["ocr_review"]
        assert fetched.json()["original_file_name"] == expected_name
        patch = client.patch(path + "/ocr-result", json={"extracted_data": {"weight_kg": "69.5"}})
        assert patch.status_code == 200
        assert patch.json()["extracted_data"]["weight_kg"] == "69.5"
        if provider_sample:
            assert patch.json()["ocr_review"]["pages_used"] == [1]
            assert "weight_kg" not in patch.json()["ocr_review"]["field_confidence"]
        assert patch.json()["extracted_data"][date_field] == initial["extracted_data"][date_field]
        if provider_sample:
            flagged = [key for key in patch.json()["ocr_review"]["review_required"]
                       if patch.json()["extracted_data"].get(key) is not None]
            if flagged:
                blocked = client.post(path + "/confirm")
                assert blocked.status_code == 409
                assert blocked.json()["detail"]["code"] == "OCR_REVIEW_REQUIRED"
                assert set(blocked.json()["detail"]["fields"]) == set(flagged)
                acknowledged = client.patch(path + "/ocr-result", json={"extracted_data": {
                    key: patch.json()["extracted_data"][key] for key in flagged
                }})
                assert acknowledged.status_code == 200
        confirmed = client.post(path + "/confirm")
        assert confirmed.status_code == 200
        assert confirmed.json()["status"] == "confirmed"
        assert confirmed.json()[id_field]
        assert confirmed.json()["health_data"]["weight_kg"] == "69.5"
        assert "_ocr_review" not in confirmed.json()["health_data"]["raw_data"]
        assert client.get(path).json()["status"] == "confirmed"
        repeated = client.post(path + "/confirm")
        assert repeated.status_code == 200
        assert repeated.json()[id_field] == confirmed.json()[id_field]
        assert repeated.json()["already_confirmed"] is True
        forbidden = client.patch(path + "/ocr-result", json={"extracted_data": {"weight_kg": "68"}})
        assert forbidden.status_code == 409
        assert forbidden.json()["detail"]["code"] == "DOCUMENT_CONFIRMED"
        if automatic:
            reupload = client.post("/api/health-documents", files={"file": ("sample.pdf", content, "application/pdf")})
            assert reupload.status_code == 201
            assert reupload.json()["uploaded_file_id"] != initial["uploaded_file_id"]
            assert client.get(path).json()["status"] == "confirmed"
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize("content,media_type", [(b"%PDF-1.7\n", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"), (b"\xff\xd8\xff", "image/jpeg"),
    (b"not a recognized health document", "image/heic")])
def test_mock_auto_upload_uses_sample_without_classifying_content(monkeypatch, content, media_type):
    monkeypatch.delenv("HEALTH_DOCUMENT_OCR_URL", raising=False)
    monkeypatch.delenv("HEALTH_DOCUMENT_OCR_MOCK_DOCUMENT_TYPE", raising=False)
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_MOCK_ENABLED", "true")
    kind, data, error = asyncio.run(health_documents._auto_extract_document(content, media_type))
    assert kind == "health_checkup"
    assert data["weight_kg"] == "70"
    assert error is None


@pytest.mark.parametrize("result,code", [
    ({"document_type": "body_composition", "extracted_data": {"weight_kg": "70"}}, None),
    ({"document_type": "unknown"}, "UNKNOWN_DOCUMENT"),
    ({"document_type": "unsupported"}, "UNKNOWN_DOCUMENT"),
    ({"document_type": "invoice"}, "OCR_INVALID_RESPONSE"),
    ([], "OCR_INVALID_RESPONSE"),
])
@pytest.mark.parametrize("token", ["ocr-only-token", "'ocr-only-token'", '"ocr-only-token"'])
def test_remote_auto_detection_sends_file_without_type(monkeypatch, result, code, token):
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_URL", "https://ocr.internal/ai/ocr")
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_TOKEN", token)
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            assert kwargs["data"] == {}
            assert kwargs["headers"] == {"Authorization": "Bearer ocr-only-token"}
            assert kwargs["files"]["file"][1] == b"image bytes"
            return httpx.Response(200, json=result, request=httpx.Request("POST", url))
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    if code:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(health_documents._auto_extract_document(b"image bytes", "image/jpeg"))
        assert exc.value.detail["code"] == code
    else:
        kind, data, error = asyncio.run(health_documents._auto_extract_document(b"image bytes", "image/jpeg"))
        assert kind == "body_composition"
        assert data["weight_kg"] == "70"
        assert error is None


def test_upload_openapi_document_type_is_optional():
    spec = main.app.openapi()
    body = spec["paths"]["/api/health-documents"]["post"]["requestBody"]["content"]["multipart/form-data"]["schema"]
    schema = spec["components"]["schemas"][body["$ref"].rsplit("/", 1)[-1]]
    assert schema["required"] == ["file"]
    assert "original_file_name" in schema["properties"]


@pytest.mark.parametrize("rows,has_more", [([], False), ([None], False), ([None, "원본.pdf", "next.pdf"], True)])
@pytest.mark.parametrize("processing_status,ocr_status,expected", [
    ("awaiting_review", "completed", "awaiting_review"),
    ("awaiting_review", "failed", "failed"),
    ("manually_confirmed", "completed", "confirmed"),
    ("manually_confirmed", "failed", "confirmed"),
    ("awaiting_review", None, "awaiting_review"),
])
def test_document_list_preserves_names_scopes_owner_and_paginates(monkeypatch, rows, has_more, processing_status, ocr_status, expected):
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url, *, headers, params):
            if url.endswith("/ocr_results"):
                assert params["uploaded_file_id"] == "in.(" + ",".join(FILE_ID for _ in rows[:2]) + ")"
                return httpx.Response(200, json=[{"uploaded_file_id": FILE_ID, "status": ocr_status}] if ocr_status else [])
            assert params["user_id"] == f"eq.{USER_ID}"
            assert params["document_type"] == "in.(health_checkup,body_composition)"
            assert params["limit"] == "3"
            assert params["offset"] == "4"
            assert params["order"] == "uploaded_at.desc,uploaded_file_id.desc"
            return httpx.Response(200, json=[{"uploaded_file_id": FILE_ID, "original_file_name": name,
                "file_name": "fallback.pdf", "document_type": "health_checkup",
                "uploaded_at": "2026-09-17T00:00:00Z", "processing_status": processing_status} for name in rows])
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    override_dependencies()
    try:
        response = TestClient(main.app).get("/api/health-documents?limit=2&offset=4")
        assert response.status_code == 200
        body = response.json()
        assert body["has_more"] == has_more
        assert body["limit"] == 2 and body["offset"] == 4
        assert len(body["items"]) == min(len(rows), 2)
        assert [item["original_file_name"] for item in body["items"]] == [name or "fallback.pdf" for name in rows[:2]]
        assert all(item["status"] == expected for item in body["items"])
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1"])
def test_document_list_rejects_invalid_pagination(query):
    override_dependencies()
    try:
        response = TestClient(main.app).get("/api/health-documents?" + query)
        assert response.status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_document_list_requires_authentication():
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).get("/api/health-documents")
        assert response.status_code == 401
    finally:
        main.app.dependency_overrides.clear()


def test_confirmed_list_filters_before_pagination_and_empty_list_skips_ocr(monkeypatch):
    calls = []
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url, *, headers, params):
            calls.append(url)
            assert url.endswith("/upload_files")
            assert params["user_id"] == f"eq.{USER_ID}"
            assert params["processing_status"] == "eq.manually_confirmed"
            assert params["limit"] == "2"
            return httpx.Response(200, json=[])
    monkeypatch.setattr(health_documents.httpx, "AsyncClient", Client)
    override_dependencies()
    try:
        response = TestClient(main.app).get("/api/health-documents?status=confirmed&limit=1")
        assert response.status_code == 200
        assert response.json()["items"] == []
        assert len(calls) == 1
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize("name,expected", [(" /cache/건강검진.pdf ", "건강검진.pdf"),
    ("C:\\cache\\InBody.jpg", "InBody.jpg"), ("check\x00up.pdf", "checkup.pdf")])
def test_original_name_sanitization(name, expected):
    assert health_documents._clean_filename(name) == expected


def test_original_name_over_limit_rejected_before_creation(monkeypatch):
    async def forbidden_create(**kwargs):
        pytest.fail("Invalid original_file_name must not persist an upload")
    monkeypatch.setattr(health_documents, "_create_document", forbidden_create)
    override_dependencies()
    try:
        response = TestClient(main.app).post("/api/health-documents", data={"original_file_name": "x" * 256},
            files={"file": ("cache.pdf", b"%PDF-1.7\n", "application/pdf")})
        assert response.status_code == 422
        assert response.json()["detail"]["fields"] == ["body.original_file_name"]
    finally:
        main.app.dependency_overrides.clear()


def test_auto_detection_disabled_without_server(monkeypatch):
    monkeypatch.delenv("HEALTH_DOCUMENT_OCR_URL", raising=False)
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_MOCK_ENABLED", "false")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(health_documents._auto_extract_document(b"%PDF-1.7\n", "application/pdf"))
    assert exc.value.status_code == 502
    assert exc.value.detail["code"] == "OCR_NOT_CONFIGURED"


@pytest.mark.parametrize("failure,status_code,code", [
    (422, 422, "UNSUPPORTED_DOCUMENT"),
    (500, 502, "OCR_FAILED"),
    ("timeout", 502, "OCR_TIMEOUT"),
])
def test_remote_classification_failure_never_falls_back_to_mock(monkeypatch, failure, status_code, code):
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_URL", "https://ocr.internal/ai/ocr")
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_MOCK_ENABLED", "true")
    async def request(*args):
        if failure == "timeout":
            raise httpx.ReadTimeout("OCR timed out")
        response = httpx.Response(failure, request=httpx.Request("POST", "https://ocr.internal/ai/ocr"))
        response.raise_for_status()
    monkeypatch.setattr(health_documents, "_request_ocr", request)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(health_documents._auto_extract_document(b"%PDF-1.7\n", "application/pdf"))
    assert exc.value.status_code == status_code
    assert exc.value.detail["code"] == code


@pytest.mark.parametrize("data", [{}, {"injected": "field"}, None])
def test_detected_document_with_invalid_extraction_keeps_type_and_failed_status(monkeypatch, data):
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_URL", "https://ocr.internal/ai/ocr")
    async def request(*args):
        return {"document_type": "body_composition", "extracted_data": data}
    monkeypatch.setattr(health_documents, "_request_ocr", request)
    kind, extracted, error = asyncio.run(health_documents._auto_extract_document(b"image", "image/jpeg"))
    assert kind == "body_composition"
    assert error == "EXTRACTION_FAILED"
    assert all(value is None for value in extracted.values())
