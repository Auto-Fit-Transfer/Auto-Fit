"""E17/E18 result reads must stay within the signed-in user's job."""

from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import UUID

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from backend.app import posture_analysis

OWNER = "00000000-0000-4000-8000-000000000001"
JOB = "00000000-0000-4000-8000-000000000011"
ASSESSMENT = "00000000-0000-4000-8000-000000000012"
REP = "00000000-0000-4000-8000-000000000013"
FINDING = "00000000-0000-4000-8000-000000000014"


def make_client(monkeypatch, *, owner=True, status="completed",
                repetition_count=1, finding_count=1):
    requests = []
    job = {"posture_analysis_job_id": JOB, "status": status, "analysis_stage": "complete",
           "progress_percent": 100, "processed_frames": 100, "total_frames": 100,
           "detected_repetitions": 1, "temporary_video_path": "private/video.mp4"}
    repetition_ids = ([REP] if repetition_count == 1 else
                      [str(UUID(int=100 + index)) for index in range(repetition_count)])
    finding_ids = ([FINDING] if finding_count == 1 else
                   [str(UUID(int=200 + index)) for index in range(finding_count)])
    tables = {
        "posture_analysis_jobs": [job] if owner else [],
        "posture_assessments": [{"posture_assessment_id": ASSESSMENT, "overall_score": 82}],
        "posture_repetitions": [
            {"posture_repetition_id": rep_id, "repetition_number": index + 1, "score": 82}
            for index, rep_id in enumerate(repetition_ids)
        ],
        "posture_joint_keypoints": [
            {"posture_repetition_id": rep_id, "joint_code": "left_knee",
             "x_normalized": .5, "y_normalized": .6}
            for rep_id in repetition_ids
        ],
        "posture_joint_angles": [
            {"posture_repetition_id": rep_id, "angle_code": "knee_flexion",
             "measured_degrees": 101}
            for rep_id in repetition_ids
        ],
        "posture_findings": [
            {"posture_finding_id": finding_id, "title": "무릎을 더 굽혀요"}
            for finding_id in finding_ids
        ],
        "posture_guidance_steps": [
            {"posture_finding_id": finding_id, "sequence_order": 1,
             "instruction": "천천히 내려가요"}
            for finding_id in finding_ids
        ],
        "posture_routine_suggestions": [],
    }

    def handler(request):
        requests.append(request)
        table = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json=tables[table])

    @asynccontextmanager
    async def fake_scope():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    monkeypatch.setattr(posture_analysis, "client_scope", fake_scope)

    def get_user(authorization: str | None = Header(default=None)):
        if authorization != "Bearer owner-token":
            raise HTTPException(401)
        return SimpleNamespace(id=OWNER)

    def settings():
        return SimpleNamespace(supabase_url="https://db.example.invalid",
                               supabase_service_role_key="test-service-key")

    app = FastAPI()
    app.include_router(posture_analysis.create_posture_analysis_router(get_user, settings))
    return TestClient(app, headers={"Authorization": "Bearer owner-token"}), requests


def test_job_read_filters_owner_and_never_returns_video_path(monkeypatch):
    client, requests = make_client(monkeypatch)
    response = client.get(f"/api/posture/jobs/{JOB}")
    assert response.status_code == 200
    assert response.json()["progress_percent"] == 100
    assert "temporary_video_path" not in response.json()
    assert requests[0].url.params["user_id"] == f"eq.{OWNER}"
    assert "temporary_video_path" not in requests[0].url.params["select"]


def test_non_owner_cannot_read_job_or_result(monkeypatch):
    client, requests = make_client(monkeypatch, owner=False)
    assert client.get(f"/api/posture/jobs/{JOB}").status_code == 404
    assert client.get(f"/api/posture/jobs/{JOB}/result").status_code == 404
    assert all(request.url.path.endswith("posture_analysis_jobs") for request in requests)


def test_incomplete_result_is_not_exposed(monkeypatch):
    client, requests = make_client(monkeypatch, status="processing")
    response = client.get(f"/api/posture/jobs/{JOB}/result")
    assert response.status_code == 409
    assert len(requests) == 1


def test_completed_result_contains_owned_nested_data(monkeypatch):
    client, requests = make_client(monkeypatch)
    response = client.get(f"/api/posture/jobs/{JOB}/result")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["assessment"]["overall_score"] == 82
    assert result["repetitions"][0]["keypoints"][0]["joint_code"] == "left_knee"
    assert result["findings"][0]["guidance_steps"][0]["instruction"] == "천천히 내려가요"
    assert "private/video.mp4" not in response.text
    assert requests[0].url.params["user_id"] == f"eq.{OWNER}"


def test_maximum_result_reads_children_in_three_batches(monkeypatch):
    client, requests = make_client(monkeypatch, repetition_count=20, finding_count=30)
    response = client.get(f"/api/posture/jobs/{JOB}/result")
    assert response.status_code == 200, response.text
    assert len(response.json()["repetitions"]) == 20
    assert len(response.json()["findings"]) == 30
    assert len(requests) == 8
    assert all(
        request.url.params[parent_field].startswith("in.(")
        for request, parent_field in zip(
            requests[-3:],
            ["posture_repetition_id", "posture_repetition_id", "posture_finding_id"],
        )
    )
