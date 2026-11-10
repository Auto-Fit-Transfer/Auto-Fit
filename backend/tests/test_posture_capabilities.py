"""Only exact, AI-declared validated profiles may reach the operational UI."""

import json
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import posture_analysis
from backend.app.posture_contract import PostureCapabilitiesResponse


def capability(code, key, status="validated"):
    return {
        "exercise_code": code,
        "display_name_ko": "운동",
        "camera_view": "side",
        "movement_type": "repetition",
        "analysis_side_required": False,
        "validation_status": status,
        "rule_version": f"{code}-side-rules-v1",
        "catalog_exercise_keys": [key],
        "capture_instructions": ["전신을 촬영하세요."],
        "limitations": ["2D 영상 한계가 있습니다."],
    }


CAPABILITIES = {
    "schema_version": "1.0",
    "exercises": [
        capability("squat", "ex_96dcb551b33a8e"),
        capability("push_up", "ex_f6c866501f5ac0", "experimental"),
    ],
}


def test_capabilities_keep_separate_version_and_hide_experimental():
    parsed = PostureCapabilitiesResponse.model_validate(CAPABILITIES)
    assert parsed.schema_version == "1.0"
    assert [item.exercise_code for item in parsed.operational().exercises] == ["squat"]
    assert parsed.validated_profile(
        exercise_key="ex_96dcb551b33a8e", exercise_code="squat",
        camera_view="side", analysis_side=None,
    ).rule_version == "squat-side-rules-v1"


@pytest.mark.parametrize("key,code,view,side", [
    ("ex_f6c866501f5ac0", "push_up", "side", None),
    ("ex_96dcb551b33a8e", "push_up", "side", None),
    ("ex_96dcb551b33a8e", "squat", "front", None),
    ("ex_96dcb551b33a8e", "squat", "side", "left"),
    ("EX_96dcb551b33a8e", "squat", "side", None),
])
def test_capabilities_reject_nonexact_or_experimental_profile(key, code, view, side):
    with pytest.raises(ValueError, match="unsupported"):
        PostureCapabilitiesResponse.model_validate(CAPABILITIES).validated_profile(
            exercise_key=key, exercise_code=code, camera_view=view,
            analysis_side=side,
        )


def test_capabilities_reject_duplicate_keys_across_profiles():
    payload = deepcopy(CAPABILITIES)
    payload["exercises"][1]["catalog_exercise_keys"] = ["ex_96dcb551b33a8e"]
    with pytest.raises(ValidationError):
        PostureCapabilitiesResponse.model_validate(payload)


def test_capabilities_allow_no_operational_profiles_after_filtering():
    payload = deepcopy(CAPABILITIES)
    payload["exercises"][0]["validation_status"] = "experimental"
    parsed = PostureCapabilitiesResponse.model_validate(payload)
    assert parsed.operational().exercises == []
    with pytest.raises(ValueError, match="unsupported"):
        parsed.validated_profile(
            exercise_key="ex_96dcb551b33a8e", exercise_code="squat",
            camera_view="side", analysis_side=None,
        )


def test_new_backend_job_rejects_missing_catalog_key():
    with pytest.raises(ValueError, match="unsupported"):
        PostureCapabilitiesResponse.model_validate(CAPABILITIES).validated_profile(
            exercise_key=None, exercise_code="squat",  # type: ignore[arg-type]
            camera_view="side", analysis_side=None,
        )


def make_client(monkeypatch, payload=CAPABILITIES):
    class FakeAIClient:
        def __init__(self, _config):
            pass

        async def posture_capabilities(self):
            return payload

    monkeypatch.setattr(posture_analysis, "get_ai_server_config", lambda: object())
    monkeypatch.setattr(posture_analysis, "AIServerClient", FakeAIClient)

    def get_user(authorization: str | None = Header(default=None)):
        if authorization != "Bearer owner-token":
            raise HTTPException(401)
        return SimpleNamespace(id="00000000-0000-4000-8000-000000000001")

    app = FastAPI()
    app.include_router(posture_analysis.create_posture_analysis_router(
        get_user, lambda: SimpleNamespace(
            supabase_url="https://db.example.invalid",
            supabase_service_role_key="test-service-key",
        ),
    ))
    return TestClient(app)


def test_capabilities_proxy_requires_auth_and_returns_validated_only(monkeypatch):
    client = make_client(monkeypatch)
    assert client.get("/api/posture/capabilities").status_code == 401
    response = client.get("/api/posture/capabilities", headers={
        "Authorization": "Bearer owner-token",
    })
    assert response.status_code == 200, response.text
    assert response.json()["schema_version"] == "1.0"
    assert [item["exercise_code"] for item in response.json()["exercises"]] == ["squat"]


def test_capabilities_proxy_rejects_invalid_upstream_response(monkeypatch):
    payload = deepcopy(CAPABILITIES)
    payload["exercises"][0]["unknown"] = "not in the contract"
    client = make_client(monkeypatch, payload)
    response = client.get("/api/posture/capabilities", headers={
        "Authorization": "Bearer owner-token",
    })
    assert response.status_code == 502
    assert "unknown" not in response.text


def test_capabilities_proxy_returns_empty_list_when_none_validated(monkeypatch):
    payload = deepcopy(CAPABILITIES)
    for item in payload["exercises"]:
        item["validation_status"] = "experimental"
    client = make_client(monkeypatch, payload)
    response = client.get("/api/posture/capabilities", headers={
        "Authorization": "Bearer owner-token",
    })
    assert response.status_code == 200
    assert response.json() == {"schema_version": "1.0", "exercises": []}


def make_job_client(monkeypatch, handler, payload=CAPABILITIES,
                    active_rows=None, result_rows=None):
    monkeypatch.setenv("POSTURE_ANALYSIS_WRITE_ENABLED", "true")
    client = make_client(monkeypatch, payload)

    def db_handler(request):
        if request.method == "GET":
            if request.url.path.endswith("/posture_assessments"):
                return httpx.Response(200, json=result_rows or [])
            rows = active_rows() if callable(active_rows) else active_rows
            return httpx.Response(200, json=rows or [])
        return handler(request)

    @asynccontextmanager
    async def fake_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(db_handler)) as db:
            yield db

    monkeypatch.setattr(posture_analysis, "client_scope", fake_scope)
    return client


def test_create_job_is_disabled_until_upload_flow_is_ready(monkeypatch):
    monkeypatch.delenv("POSTURE_ANALYSIS_WRITE_ENABLED", raising=False)
    client = make_client(monkeypatch)
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 503


def test_create_job_saves_owner_and_capability_snapshot(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        assert request.method == "POST"
        assert request.url.path == "/rest/v1/posture_analysis_jobs"
        assert request.headers["apikey"] == "test-service-key"
        assert request.headers["authorization"] == "Bearer test-service-key"
        assert request.headers["prefer"] == "return=representation"
        row = json.loads(request.content)
        assert row["user_id"] == "00000000-0000-4000-8000-000000000001"
        assert row["exercise_key"] == "ex_96dcb551b33a8e"
        assert row["rule_version"] == "squat-side-rules-v1"
        assert row["validation_status"] == "validated"
        assert row["status"] == "awaiting_upload"
        assert row["analysis_side"] is None
        assert "temporary_video_path" not in row
        return httpx.Response(201, json=[{
            key: value for key, value in row.items() if key != "user_id"
        }])

    client = make_job_client(monkeypatch, handler)
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 201, response.text
    assert response.json()["rule_version"] == "squat-side-rules-v1"
    assert response.json()["status"] == "awaiting_upload"
    assert "user_id" not in response.json()
    assert len(requests) == 1


@pytest.mark.parametrize("key,code,view", [
    ("ex_96dcb551b33a8e", "push_up", "side"),
    ("ex_96dcb551b33a8e", "squat", "front"),
    ("ex_f6c866501f5ac0", "push_up", "side"),
])
def test_create_job_rejects_wrong_or_experimental_profile_before_db(
    monkeypatch, key, code, view,
):
    def handler(_):
        pytest.fail("Rejected profile must not create a DB job")

    client = make_job_client(monkeypatch, handler)
    response = client.post("/api/posture/jobs", json={
        "exercise_key": key, "exercise_code": code, "camera_view": view,
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 422


def test_create_job_rejects_client_supplied_user_id(monkeypatch):
    def handler(_):
        pytest.fail("Invalid request must not create a DB job")

    client = make_job_client(monkeypatch, handler)
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side", "user_id": "00000000-0000-4000-8000-000000000099",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 422


def test_create_job_does_not_expose_upstream_db_error(monkeypatch):
    def handler(_):
        return httpx.Response(400, text="private database details")

    client = make_job_client(monkeypatch, handler)
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 502
    assert "private database details" not in response.text


def test_create_job_rejects_unexpected_inserted_profile(monkeypatch):
    def handler(request):
        row = json.loads(request.content)
        row.pop("user_id")
        row["rule_version"] = "unrelated-rules-v1"
        return httpx.Response(201, json=[row])

    client = make_job_client(monkeypatch, handler)
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 502


def active_job(*, age=timedelta(seconds=0), status="awaiting_upload"):
    return {
        "posture_analysis_job_id": "00000000-0000-4000-8000-000000000011",
        "exercise_key": "ex_96dcb551b33a8e",
        "exercise_code": "squat",
        "camera_view": "side",
        "analysis_side": None,
        "rule_version": "squat-side-rules-v1",
        "validation_status": "validated",
        "status": status,
        "created_at": (datetime.now(timezone.utc) - age).isoformat(),
    }


@pytest.mark.parametrize("status", ["processing", "cleanup_pending"])
def test_create_job_recovers_stale_uploaded_video_before_new_job(
    monkeypatch, status,
):
    owner = "00000000-0000-4000-8000-000000000001"
    stale = active_job(age=timedelta(minutes=16), status=status)
    stale["updated_at"] = stale["created_at"]
    stale["temporary_video_path"] = f"{owner}/{stale['posture_analysis_job_id']}/video.mp4"
    stale["failure_code"] = "AI_INPUT_REJECTED" if status == "cleanup_pending" else None
    events = []

    def handler(request):
        events.append((request.method, request.url.path, request.url.params.get("status")))
        if request.method == "DELETE":
            return httpx.Response(200, json={})
        if request.method == "PATCH":
            return httpx.Response(200, json=[{"posture_analysis_job_id":
                                              stale["posture_analysis_job_id"]}])
        if request.method == "POST":
            row = json.loads(request.content)
            row.pop("user_id")
            return httpx.Response(201, json=[row])
        pytest.fail("Unexpected request")

    client = make_job_client(monkeypatch, handler, active_rows=[stale])
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 201, response.text
    methods = [event[0] for event in events]
    assert methods[-3:] == ["DELETE", "PATCH", "POST"]
    if status == "processing":
        assert methods[0] == "PATCH"


def test_stale_processing_with_committed_result_completes_before_new_job(monkeypatch):
    owner = "00000000-0000-4000-8000-000000000001"
    stale = active_job(age=timedelta(minutes=16), status="processing")
    stale["updated_at"] = stale["created_at"]
    stale["temporary_video_path"] = f"{owner}/{stale['posture_analysis_job_id']}/video.mp4"
    patches = []

    def handler(request):
        if request.method == "PATCH":
            patch = json.loads(request.content)
            patches.append(patch)
            return httpx.Response(200, json=[{"posture_analysis_job_id":
                                              stale["posture_analysis_job_id"]}])
        if request.method == "DELETE":
            return httpx.Response(200, json={})
        row = json.loads(request.content)
        row.pop("user_id")
        return httpx.Response(201, json=[row])

    client = make_job_client(monkeypatch, handler, active_rows=[stale],
                             result_rows=[{"result_digest": "a" * 64,
                                           "repetition_count": 1}])
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 201, response.text
    assert [item["status"] for item in patches] == ["cleanup_pending", "completed"]
    assert patches[0]["detected_repetitions"] == 1


def test_create_job_retry_returns_same_active_job_without_insert(monkeypatch):
    def handler(_):
        pytest.fail("A retry must not create another job")

    client = make_job_client(monkeypatch, handler, active_rows=[active_job()])
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 201
    assert response.json()["posture_analysis_job_id"] == "00000000-0000-4000-8000-000000000011"


def test_create_job_racing_retry_recovers_existing_job_id(monkeypatch):
    reads = 0

    def active_rows():
        nonlocal reads
        reads += 1
        return [] if reads == 1 else [active_job()]

    def handler(request):
        assert request.method == "POST"
        return httpx.Response(409, text="unique index conflict")

    client = make_job_client(monkeypatch, handler, active_rows=active_rows)
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 201, response.text
    assert response.json()["posture_analysis_job_id"] == "00000000-0000-4000-8000-000000000011"
    assert reads == 2


def test_create_job_rejects_while_analysis_is_processing(monkeypatch):
    def handler(_):
        pytest.fail("Processing job must block another insert")

    client = make_job_client(monkeypatch, handler, active_rows=[active_job(status="processing")])
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 409


def test_create_job_expires_stale_empty_job_before_insert(monkeypatch):
    requests = []

    def handler(request):
        requests.append(request.url.path)
        if request.url.path.endswith("/rpc/expire_stale_posture_upload"):
            assert json.loads(request.content)["p_pending_path"] is None
            return httpx.Response(200, json=True)
        row = json.loads(request.content)
        row.pop("user_id")
        return httpx.Response(201, json=[row])

    client = make_job_client(monkeypatch, handler, active_rows=[
        active_job(age=timedelta(hours=1)),
    ])
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 201, response.text
    assert requests == ["/rest/v1/rpc/expire_stale_posture_upload",
                        "/rest/v1/posture_analysis_jobs"]


def test_create_job_removes_stale_claimed_upload_before_expiring(monkeypatch):
    owner = "00000000-0000-4000-8000-000000000001"
    stale = active_job(age=timedelta(hours=1))
    stale["pending_video_path"] = f"{owner}/{stale['posture_analysis_job_id']}/pending.mp4"
    events = []

    def handler(request):
        events.append((request.method, request.url.path))
        if request.url.path.endswith("/rpc/expire_stale_posture_upload"):
            payload = json.loads(request.content)
            assert payload["p_updated_at"] == stale["created_at"]
            assert payload["p_pending_path"] == stale["pending_video_path"]
            return httpx.Response(200, json=True)
        if request.method == "DELETE" and "/storage/v1/object/" in request.url.path:
            assert stale["pending_video_path"] in request.url.path
            return httpx.Response(200, json={})
        if request.method == "DELETE":
            assert request.url.path.endswith("/posture_pending_video_cleanup")
            return httpx.Response(204)
        row = json.loads(request.content)
        row.pop("user_id")
        return httpx.Response(201, json=[row])

    client = make_job_client(monkeypatch, handler, active_rows=[stale])
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 201, response.text
    assert [event[0] for event in events] == ["POST", "DELETE", "DELETE", "POST"]


def test_recent_upload_claim_keeps_older_job_active(monkeypatch):
    stale = active_job(age=timedelta(hours=1))
    stale["updated_at"] = datetime.now(timezone.utc).isoformat()
    stale["pending_video_path"] = (
        f"00000000-0000-4000-8000-000000000001/"
        f"{stale['posture_analysis_job_id']}/pending.mp4"
    )

    def handler(_):
        pytest.fail("A recent upload claim must not be expired or deleted")

    client = make_job_client(monkeypatch, handler, active_rows=[stale])
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 409


def test_stale_claim_change_prevents_video_delete(monkeypatch):
    stale = active_job(age=timedelta(hours=1))
    stale["pending_video_path"] = (
        f"00000000-0000-4000-8000-000000000001/"
        f"{stale['posture_analysis_job_id']}/pending.mp4"
    )
    events = []

    def handler(request):
        events.append(request.method)
        assert request.url.path.endswith("/rpc/expire_stale_posture_upload")
        return httpx.Response(200, json=False)

    client = make_job_client(monkeypatch, handler, active_rows=[stale])
    response = client.post("/api/posture/jobs", json={
        "exercise_key": "ex_96dcb551b33a8e", "exercise_code": "squat",
        "camera_view": "side",
    }, headers={"Authorization": "Bearer owner-token"})
    assert response.status_code == 409
    assert events == ["POST"]
