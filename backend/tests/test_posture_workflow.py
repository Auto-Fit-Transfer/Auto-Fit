"""The upload flow persists only validated results and removes raw video."""

import asyncio
import io
import json
from contextlib import asynccontextmanager
from copy import deepcopy
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError

from backend.app import posture_workflow
from backend.app.posture_result_contract import PostureAnalysisResult
from backend.app.posture_video import StagedPostureVideo


OWNER = "00000000-0000-4000-8000-000000000001"
JOB = "00000000-0000-4000-8000-000000000011"
RULE = "squat-side-rules-v2"


def result():
    return {
        "schema_version": "1.1", "posture_analysis_job_id": JOB,
        "exercise_code": "squat", "camera_view": "side",
        "model_version": f"mediapipe-pose-full-4eaa5eb7+{RULE}",
        "assessment": {"overall_score": 82, "passing_score": None,
                       "verdict": "within_current_rules", "repetition_count": 1,
                       "summary": "1회 분석"},
        "repetitions": [{
            "repetition_number": 1, "start_offset_ms": 1000,
            "keyframe_offset_ms": 2000, "end_offset_ms": 3000, "score": 82,
            "keypoints": [{"joint_code": "right_knee", "x_normalized": 0.5,
                           "y_normalized": 0.6, "confidence": 0.9}],
            "angles": [{"angle_code": "knee_flexion", "measured_degrees": 90,
                        "target_min_degrees": None, "target_max_degrees": 100}],
        }],
        "findings": [], "routine_suggestions": [],
    }


def job(status="awaiting_upload"):
    return {"posture_analysis_job_id": JOB, "exercise_key": "ex_96dcb551b33a8e",
            "exercise_code": "squat", "camera_view": "side", "analysis_side": None,
            "rule_version": RULE, "validation_status": "validated", "status": status,
            "temporary_video_path": None, "pending_video_path": None,
            "failure_code": None}


def test_schema_rejects_wrong_version_references_and_verdict():
    payload = result()
    assert PostureAnalysisResult.model_validate(payload).assessment.overall_score == 82
    payload["schema_version"] = "1.0"
    with pytest.raises(ValidationError):
        PostureAnalysisResult.model_validate(payload)
    payload = result()
    payload["assessment"]["verdict"] = "needs_correction"
    with pytest.raises(ValidationError):
        PostureAnalysisResult.model_validate(payload)
    payload = result()
    payload["repetitions"][0]["keypoints"].append(
        deepcopy(payload["repetitions"][0]["keypoints"][0]))
    with pytest.raises(ValidationError):
        PostureAnalysisResult.model_validate(payload)
    with pytest.raises(ValueError):
        PostureAnalysisResult.model_validate(result()).validate_job(job(), 2000)
    payload = result()
    payload["routine_suggestions"] = [{
        "display_order": 1, "finding_display_order": 1,
        "exercise_name": "임의 운동", "prescription": "1세트",
        "target_sets": 1, "target_repetitions": 1,
    }]
    with pytest.raises(ValidationError):
        PostureAnalysisResult.model_validate(payload)


def test_schema_rejects_unpublished_passing_score():
    payload = result()
    payload["assessment"]["passing_score"] = 70
    with pytest.raises(ValidationError):
        PostureAnalysisResult.model_validate(payload)


def configure(monkeypatch, tmp_path, *, ai_error=None, owner=True, rpc_error=None,
              claim_race=False, storage_failure=False):
    monkeypatch.setenv("POSTURE_ANALYSIS_WRITE_ENABLED", "true")
    events = []
    state = job()
    stored_digest = None
    video_path = tmp_path / "staged.mp4"
    video_path.write_bytes(b"valid-video")

    async def stage(_file):
        return StagedPostureVideo(video_path, "video/mp4", ".mp4", 11, 4000)

    monkeypatch.setattr(posture_workflow, "stage_posture_video", stage)
    monkeypatch.setattr(posture_workflow, "get_ai_server_config", lambda: object())

    class FakeAI:
        def __init__(self, _config):
            pass

        async def analyze_posture_video(self, **kwargs):
            events.append(("ai", kwargs["posture_analysis_job_id"]))
            if ai_error:
                raise ai_error
            return result()

    monkeypatch.setattr(posture_workflow, "AIServerClient", FakeAI)

    def handler(request):
        nonlocal stored_digest
        path = request.url.path
        if path.endswith("/posture_analysis_jobs") and request.method == "GET":
            events.append(("get", None))
            return httpx.Response(200, json=[state] if owner else [])
        if path.endswith("/posture_analysis_jobs") and request.method == "PATCH":
            update = json.loads(request.content)
            events.append(("patch", update.get("status", "claim")))
            if claim_race and update.get("pending_video_path"):
                state["pending_video_path"] = f"{OWNER}/{JOB}/other.mp4"
                return httpx.Response(200, json=[])
            if request.url.params["status"] != f"eq.{state['status']}":
                return httpx.Response(200, json=[])
            pending_filter = request.url.params.get("pending_video_path")
            if pending_filter == "is.null" and state["pending_video_path"] is not None:
                return httpx.Response(200, json=[])
            if pending_filter and pending_filter.startswith("eq."):
                if state["pending_video_path"] != pending_filter.removeprefix("eq."):
                    return httpx.Response(200, json=[])
            state.update(update)
            return httpx.Response(200, json=[{"posture_analysis_job_id": JOB}])
        if "/storage/v1/object/posture-analysis-temp/" in path:
            events.append(("storage", request.method))
            if storage_failure and request.method == "POST":
                return httpx.Response(500, json={})
            return httpx.Response(200, json={})
        if path.endswith("/rpc/save_posture_analysis_result"):
            events.append(("rpc", "save"))
            if rpc_error == "reject":
                return httpx.Response(500, json={})
            stored_digest = json.loads(request.content)["p_result_digest"]
            if rpc_error in {"lost_response", "unknown"}:
                raise httpx.ReadTimeout("response lost")
            return httpx.Response(204)
        if path.endswith("/posture_assessments") and request.method == "GET":
            events.append(("get", "digest"))
            if rpc_error == "unknown":
                raise httpx.ReadTimeout("confirmation unavailable")
            return httpx.Response(200, json=(
                [{"result_digest": stored_digest}] if stored_digest else []))
        raise AssertionError((request.method, path))

    @asynccontextmanager
    async def scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(posture_workflow, "client_scope", scope)
    settings = SimpleNamespace(supabase_url="https://db.example.invalid",
                               supabase_service_role_key="test-service-key")
    return events, state, video_path, settings


def invoke(settings):
    return asyncio.run(posture_workflow.analyze_uploaded_video(
        OWNER, __import__("uuid").UUID(JOB), UploadFile(file=io.BytesIO(b"unused")), settings))


def test_success_persists_result_then_deletes_video_then_completes(monkeypatch, tmp_path):
    events, state, video_path, settings = configure(monkeypatch, tmp_path)
    assert invoke(settings) == {"posture_analysis_job_id": JOB, "status": "completed"}
    assert state["status"] == "completed"
    assert state["temporary_video_path"] is None
    assert state["video_deleted_at"]
    assert events.index(("rpc", "save")) < events.index(("storage", "DELETE"))
    assert events.index(("storage", "DELETE")) < events.index(("patch", "completed"))
    assert not video_path.exists()


def test_ai_rejection_marks_failed_after_video_delete(monkeypatch, tmp_path):
    error = posture_workflow.AIServerError("AI_INPUT_REJECTED", 422)
    events, state, video_path, settings = configure(
        monkeypatch, tmp_path, ai_error=error)
    with pytest.raises(HTTPException) as response:
        invoke(settings)
    assert response.value.status_code == 422
    assert state["status"] == "failed"
    assert state["failure_code"] == "AI_INPUT_REJECTED"
    assert events.index(("storage", "DELETE")) < events.index(("patch", "failed"))
    assert not video_path.exists()


def test_other_user_cannot_stage_or_upload(monkeypatch, tmp_path):
    events, _, video_path, settings = configure(monkeypatch, tmp_path, owner=False)
    with pytest.raises(HTTPException) as response:
        invoke(settings)
    assert response.value.status_code == 404
    assert events == [("get", None)]
    assert video_path.exists()


def test_rejected_atomic_result_marks_failed_without_child_inserts(monkeypatch, tmp_path):
    events, state, video_path, settings = configure(
        monkeypatch, tmp_path, rpc_error="reject")
    with pytest.raises(HTTPException) as response:
        invoke(settings)
    assert response.value.status_code == 502
    assert state["status"] == "failed"
    assert state["failure_code"] == "RESULT_SAVE_FAILED"
    assert ("rpc", "save") in events
    assert ("get", "digest") in events
    assert not video_path.exists()


def test_lost_rpc_response_resolves_from_stored_digest(monkeypatch, tmp_path):
    events, state, _, settings = configure(
        monkeypatch, tmp_path, rpc_error="lost_response")
    assert invoke(settings)["status"] == "completed"
    assert state["status"] == "completed"
    assert ("get", "digest") in events


def test_uncertain_rpc_does_not_hide_possibly_committed_result(monkeypatch, tmp_path):
    events, state, video_path, settings = configure(
        monkeypatch, tmp_path, rpc_error="unknown")
    with pytest.raises(HTTPException) as response:
        invoke(settings)
    assert response.value.status_code == 502
    assert state["status"] == "processing"
    assert state["temporary_video_path"]
    assert ("storage", "DELETE") not in events
    assert not video_path.exists()


def test_racing_upload_claim_cannot_delete_other_upload(monkeypatch, tmp_path):
    events, state, video_path, settings = configure(
        monkeypatch, tmp_path, claim_race=True)
    with pytest.raises(HTTPException) as response:
        invoke(settings)
    assert response.value.status_code == 409
    assert state["pending_video_path"].endswith("other.mp4")
    assert all(event[0] != "storage" for event in events)
    assert not video_path.exists()


def test_storage_rejection_clears_claim_after_delete(monkeypatch, tmp_path):
    events, state, video_path, settings = configure(
        monkeypatch, tmp_path, storage_failure=True)
    with pytest.raises(HTTPException) as response:
        invoke(settings)
    assert response.value.status_code == 502
    assert state["status"] == "awaiting_upload"
    assert state["pending_video_path"] is None
    assert ("storage", "DELETE") in events
    assert not video_path.exists()


def test_sweeper_removes_orphan_without_user_request():
    state = {**job("awaiting_upload"), "user_id": OWNER,
             "pending_video_path": f"{OWNER}/{JOB}/orphan.mp4",
             "updated_at": "2026-01-01T00:00:00+00:00"}
    events = []

    def handler(request):
        if request.method == "GET" and request.url.path.endswith("/posture_pending_video_cleanup"):
            events.append("queue_scan")
            return httpx.Response(200, json=[])
        if request.method == "GET":
            events.append("job_scan")
            return httpx.Response(200, json=[state])
        if request.method == "POST":
            events.append("expire")
            state["status"] = "failed"
            state["pending_video_path"] = None
            return httpx.Response(200, json=True)
        if "/storage/v1/object/" in request.url.path:
            events.append("video_delete")
            return httpx.Response(200, json={})
        events.append("queue_delete")
        return httpx.Response(204)

    async def run():
        settings = SimpleNamespace(supabase_url="https://db.example.invalid",
                                   supabase_service_role_key="test-service-key")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await posture_workflow.sweep_stale_posture_jobs(client, settings)

    asyncio.run(run())
    assert events == ["queue_scan", "job_scan", "expire", "video_delete", "queue_delete"]
    assert state["pending_video_path"] is None


def test_sweeper_skips_job_claimed_after_scan():
    stale = {**job("awaiting_upload"), "user_id": OWNER,
             "updated_at": "2026-01-01T00:00:00+00:00"}
    events = []

    def handler(request):
        events.append((request.method, request.url.path))
        if request.method == "GET" and request.url.path.endswith("/posture_pending_video_cleanup"):
            return httpx.Response(200, json=[])
        if request.method == "GET":
            return httpx.Response(200, json=[stale])
        assert request.url.path.endswith("/rpc/expire_stale_posture_upload")
        return httpx.Response(200, json=False)

    async def run():
        settings = SimpleNamespace(supabase_url="https://db.example.invalid",
                                   supabase_service_role_key="test-service-key")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await posture_workflow.sweep_stale_posture_jobs(client, settings)

    asyncio.run(run())
    assert [method for method, _ in events] == ["GET", "GET", "POST"]
    assert stale["status"] == "awaiting_upload"


def test_failed_storage_delete_stays_in_retry_queue():
    path = f"{OWNER}/{JOB}/orphan.mp4"
    queued = {"posture_analysis_job_id": JOB, "user_id": OWNER, "video_path": path}
    delete_attempts = 0
    queue_present = True

    def handler(request):
        nonlocal delete_attempts, queue_present
        if request.method == "POST":
            return httpx.Response(200, json=True)
        if request.method == "GET":
            return httpx.Response(200, json=[queued] if queue_present else [])
        if "/storage/v1/object/" in request.url.path:
            delete_attempts += 1
            return httpx.Response(503 if delete_attempts == 1 else 200, json={})
        queue_present = False
        return httpx.Response(204)

    async def run():
        settings = SimpleNamespace(supabase_url="https://db.example.invalid",
                                   supabase_service_role_key="test-service-key")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(HTTPException) as error:
                await posture_workflow.expire_stale_awaiting_upload(
                    client, settings, OWNER,
                    {"posture_analysis_job_id": JOB,
                     "updated_at": "2026-01-01T00:00:00+00:00",
                     "pending_video_path": path},
                )
            assert error.value.status_code == 502
            assert queue_present
            await posture_workflow.sweep_pending_video_cleanup(client, settings)

    asyncio.run(run())
    assert delete_attempts == 2
    assert not queue_present


def test_missing_storage_object_with_nosuchkey_response_is_already_clean():
    async def run(response):
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda _: response,
        )) as client:
            await posture_workflow._delete(
                client,
                SimpleNamespace(supabase_url="https://db.example.invalid",
                                supabase_service_role_key="test-service-key"),
                f"{OWNER}/{JOB}/missing.mp4",
            )

    asyncio.run(run(httpx.Response(400, json={
        "statusCode": "400", "error": "not_found", "message": "Object not found",
    })))
    with pytest.raises(HTTPException) as error:
        asyncio.run(run(httpx.Response(400, json={
            "statusCode": "400", "error": "invalid_request", "message": "Bad path",
        })))
    assert error.value.status_code == 502
