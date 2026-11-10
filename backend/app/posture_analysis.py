"""Owner-scoped posture analysis reads and validated exercise discovery."""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import HTTPBearer
from pydantic import ValidationError

from backend.app.ai_server import AIServerClient, AIServerError, get_ai_server_config
from backend.app.http_client import client_scope
from backend.app.posture_contract import (
    CreatePostureJobRequest, CreatedPostureJob, PostureCapabilitiesResponse,
)
from backend.app.posture_workflow import (
    analyze_uploaded_video, expire_stale_awaiting_upload, recover_stale_job,
)


JOB_COLUMNS = (
    "posture_analysis_job_id,exercise_code,camera_view,status,analysis_stage,"
    "progress_percent,processed_frames,total_frames,detected_repetitions,"
    "capture_duration_ms,created_at,finished_at,failure_code"
)
CREATED_JOB_COLUMNS = (
    "posture_analysis_job_id,exercise_key,exercise_code,camera_view,analysis_side,"
    "rule_version,validation_status,status"
)
ACTIVE_JOB_TTL = timedelta(minutes=15)
PROFILE_COLUMNS = (
    "exercise_key", "exercise_code", "camera_view", "analysis_side",
    "rule_version", "validation_status",
)


async def _rows(client: httpx.AsyncClient, settings: Any, table: str,
                columns: str, params: dict[str, str]) -> list[dict[str, Any]]:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    try:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/{table}",
            headers=headers, params={"select": columns, **params}, timeout=15,
        )
        response.raise_for_status()
        rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="자세 분석 정보를 불러오지 못했습니다.") from None
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise HTTPException(502, detail="자세 분석 정보 형식이 올바르지 않습니다.")
    return rows


async def _owned_job(client: httpx.AsyncClient, settings: Any, user_id: str,
                     job_id: UUID) -> dict[str, Any]:
    rows = await _rows(client, settings, "posture_analysis_jobs", JOB_COLUMNS, {
        "posture_analysis_job_id": f"eq.{job_id}", "user_id": f"eq.{user_id}", "limit": "1",
    })
    if not rows:
        raise HTTPException(404, detail="자세 분석 작업을 찾지 못했습니다.")
    # Keep the private Storage object path out even if an upstream response
    # accidentally includes more columns than requested.
    return {column: rows[0].get(column) for column in JOB_COLUMNS.split(",")}


async def _group_children(
    client: httpx.AsyncClient, settings: Any, *, table: str,
    parent_field: str, parent_rows: list[dict[str, Any]], columns: str,
    order: str, limit: int,
) -> dict[str, list[dict[str, Any]]]:
    try:
        parent_ids = [str(UUID(row[parent_field])) for row in parent_rows]
    except (KeyError, TypeError, ValueError):
        raise HTTPException(502, detail="자세 분석 결과 형식이 올바르지 않습니다.") from None
    if len(parent_ids) != len(set(parent_ids)):
        raise HTTPException(502, detail="자세 분석 결과 형식이 올바르지 않습니다.")
    grouped: dict[str, list[dict[str, Any]]] = {parent_id: [] for parent_id in parent_ids}
    if not parent_ids:
        return grouped
    rows = await _rows(client, settings, table, f"{parent_field},{columns}", {
        parent_field: f"in.({','.join(parent_ids)})", "order": order,
        "limit": str(limit + 1),
    })
    if len(rows) > limit:
        raise HTTPException(502, detail="자세 분석 결과 형식이 올바르지 않습니다.")
    for row in rows:
        try:
            parent_id = str(UUID(row.pop(parent_field)))
            grouped[parent_id].append(row)
        except (KeyError, TypeError, ValueError):
            raise HTTPException(502, detail="자세 분석 결과 형식이 올바르지 않습니다.") from None
    return grouped


async def fetch_posture_job(user_id: str, job_id: UUID, settings: Any) -> dict[str, Any]:
    async with client_scope() as client:
        return await _owned_job(client, settings, user_id, job_id)


async def load_posture_capabilities() -> PostureCapabilitiesResponse:
    try:
        config = get_ai_server_config()
    except ValueError:
        raise HTTPException(503, detail="자세 분석 설정을 확인해 주세요.") from None
    if config is None:
        raise HTTPException(503, detail="자세 분석을 사용할 수 없습니다.")
    try:
        raw = await AIServerClient(config).posture_capabilities()
    except AIServerError:
        raise HTTPException(503, detail="자세 분석 지원 정보를 불러오지 못했습니다.") from None
    try:
        return PostureCapabilitiesResponse.model_validate(raw)
    except (ValidationError, ValueError):
        raise HTTPException(502, detail="자세 분석 지원 정보 형식이 올바르지 않습니다.") from None


async def fetch_posture_capabilities() -> dict[str, Any]:
    return (await load_posture_capabilities()).operational().model_dump()


async def create_posture_job(user_id: str, request: CreatePostureJobRequest,
                             settings: Any) -> dict[str, Any]:
    # Keep incomplete upload/result workflows from creating stranded jobs.
    if os.getenv("POSTURE_ANALYSIS_WRITE_ENABLED", "false") != "true":
        raise HTTPException(503, detail="자세 분석 작업 생성이 아직 준비되지 않았습니다.")
    capabilities = await load_posture_capabilities()
    try:
        profile = capabilities.validated_profile(
            exercise_key=request.exercise_key,
            exercise_code=request.exercise_code,
            camera_view=request.camera_view,
            analysis_side=request.analysis_side,
        )
    except ValueError:
        raise HTTPException(422, detail="지원하지 않는 운동 또는 촬영 조건입니다.") from None

    job_id = str(uuid4())
    payload = {
        "posture_analysis_job_id": job_id,
        "user_id": user_id,
        "exercise_key": request.exercise_key,
        "exercise_code": profile.exercise_code,
        "camera_view": profile.camera_view,
        "analysis_side": request.analysis_side,
        "rule_version": profile.rule_version,
        "validation_status": profile.validation_status,
        "status": "awaiting_upload",
    }
    key = settings.supabase_service_role_key
    headers = {"apikey": key, "Prefer": "return=representation"}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    async with client_scope() as client:
        active = await _rows(client, settings, "posture_analysis_jobs",
                             CREATED_JOB_COLUMNS + ",created_at,updated_at,"
                             "temporary_video_path,pending_video_path,failure_code", {
            "user_id": f"eq.{user_id}",
            "status": "in.(awaiting_upload,processing,cleanup_pending)",
            "limit": "2",
        })
        if len(active) > 1:
            raise HTTPException(502, detail="자세 분석 작업 상태를 확인하지 못했습니다.")
        if active:
            previous = active[0]
            try:
                activity_raw = previous.get("updated_at") or previous["created_at"]
                activity_at = datetime.fromisoformat(activity_raw)
                if activity_at.tzinfo is None:
                    raise ValueError("missing timezone")
            except (KeyError, TypeError, ValueError):
                raise HTTPException(502, detail="자세 분석 작업 상태를 확인하지 못했습니다.") from None
            if datetime.now(timezone.utc) - activity_at < ACTIVE_JOB_TTL:
                if (previous.get("status") != "awaiting_upload"
                        or previous.get("pending_video_path")):
                    raise HTTPException(409, detail="진행 중인 자세 분석 작업이 있습니다.")
                if all(previous.get(field) == payload[field] for field in PROFILE_COLUMNS):
                    try:
                        return CreatedPostureJob.model_validate(previous).model_dump(mode="json")
                    except ValidationError:
                        raise HTTPException(502, detail="자세 분석 작업 상태를 확인하지 못했습니다.") from None
                raise HTTPException(409, detail="먼저 생성한 자세 분석 작업이 있습니다.")
            if previous.get("status") != "awaiting_upload":
                await recover_stale_job(client, settings, user_id, previous)
            else:
                await expire_stale_awaiting_upload(client, settings, user_id, previous)
        try:
            response = await client.post(
                f"{settings.supabase_url}/rest/v1/posture_analysis_jobs",
                headers=headers, params={"select": CREATED_JOB_COLUMNS},
                json=payload, timeout=15,
            )
            if response.status_code == 409:
                raced = await _rows(client, settings, "posture_analysis_jobs",
                                    CREATED_JOB_COLUMNS, {
                    "user_id": f"eq.{user_id}", "status": "eq.awaiting_upload",
                    "limit": "2",
                })
                if (len(raced) == 1 and
                        all(raced[0].get(field) == payload[field]
                            for field in PROFILE_COLUMNS)):
                    try:
                        return CreatedPostureJob.model_validate(raced[0]).model_dump(mode="json")
                    except ValidationError:
                        raise HTTPException(502, detail="자세 분석 작업 상태를 확인하지 못했습니다.") from None
                raise HTTPException(409, detail="진행 중인 자세 분석 작업이 있습니다.")
            if response.status_code != 201:
                raise HTTPException(502, detail="자세 분석 작업을 생성하지 못했습니다.")
            rows = response.json()
        except (httpx.HTTPError, ValueError):
            raise HTTPException(502, detail="자세 분석 작업을 생성하지 못했습니다.") from None
    if (not isinstance(rows, list) or len(rows) != 1
            or not isinstance(rows[0], dict)
            or any(rows[0].get(column) != payload[column]
                   for column in CREATED_JOB_COLUMNS.split(","))):
        raise HTTPException(502, detail="자세 분석 작업 생성 결과가 올바르지 않습니다.")
    try:
        return CreatedPostureJob.model_validate(rows[0]).model_dump(mode="json")
    except ValidationError:
        raise HTTPException(502, detail="자세 분석 작업 생성 결과가 올바르지 않습니다.") from None


async def fetch_posture_result(user_id: str, job_id: UUID, settings: Any) -> dict[str, Any]:
    async with client_scope() as client:
        job = await _owned_job(client, settings, user_id, job_id)
        if job["status"] != "completed":
            raise HTTPException(409, detail="자세 분석 결과가 아직 준비되지 않았습니다.")
        assessments = await _rows(client, settings, "posture_assessments",
            "posture_assessment_id,schema_version,model_version,overall_score,passing_score,verdict,"
            "repetition_count,summary,assessed_at", {
                "posture_analysis_job_id": f"eq.{job_id}", "limit": "1",
            })
        if not assessments:
            raise HTTPException(502, detail="완료된 자세 분석 결과가 없습니다.")
        assessment = assessments[0]
        assessment_id = assessment["posture_assessment_id"]
        repetitions = await _rows(client, settings, "posture_repetitions",
            "posture_repetition_id,repetition_number,start_offset_ms,keyframe_offset_ms,"
            "end_offset_ms,score", {
                "posture_assessment_id": f"eq.{assessment_id}",
                "order": "repetition_number.asc", "limit": "20",
            })
        findings = await _rows(client, settings, "posture_findings",
            "posture_finding_id,display_order,finding_type,finding_code,title,"
            "explanation,repetition_start,repetition_end", {
                "posture_assessment_id": f"eq.{assessment_id}",
                "order": "display_order.asc", "limit": "30",
            })
        suggestions = await _rows(client, settings, "posture_routine_suggestions",
            "posture_routine_suggestion_id,posture_finding_id,display_order,exercise_name,"
            "prescription,target_sets,target_repetitions,applied_at", {
                "posture_assessment_id": f"eq.{assessment_id}",
                "order": "display_order.asc", "limit": "20",
            })
        keypoints = await _group_children(
            client, settings, table="posture_joint_keypoints",
            parent_field="posture_repetition_id", parent_rows=repetitions,
            columns="joint_code,x_normalized,y_normalized,confidence",
            order="joint_code.asc", limit=400,
        )
        angles = await _group_children(
            client, settings, table="posture_joint_angles",
            parent_field="posture_repetition_id", parent_rows=repetitions,
            columns="angle_code,measured_degrees,target_min_degrees,target_max_degrees",
            order="angle_code.asc", limit=80,
        )
        guidance = await _group_children(
            client, settings, table="posture_guidance_steps",
            parent_field="posture_finding_id", parent_rows=findings,
            columns="sequence_order,instruction", order="sequence_order.asc", limit=300,
        )
        for repetition in repetitions:
            repetition["keypoints"] = keypoints[repetition["posture_repetition_id"]]
            repetition["angles"] = angles[repetition["posture_repetition_id"]]
        for finding in findings:
            finding["guidance_steps"] = guidance[finding["posture_finding_id"]]
        return {"job": job, "assessment": assessment, "repetitions": repetitions,
                "findings": findings, "routine_suggestions": suggestions}


def create_posture_analysis_router(current_user_dependency: Callable,
                                   settings_dependency: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/posture", tags=["Posture Analysis"],
                       dependencies=[Depends(HTTPBearer(auto_error=False))])

    @router.get("/capabilities", summary="운영 검증된 자세 분석 운동 조회")
    async def get_capabilities(user: Any = Depends(current_user_dependency)):
        return await fetch_posture_capabilities()

    @router.post("/jobs", status_code=201, response_model=CreatedPostureJob,
                 summary="검증된 자세 분석 작업 생성")
    async def post_job(request: CreatePostureJobRequest,
                       user: Any = Depends(current_user_dependency),
                       settings: Any = Depends(settings_dependency)):
        return await create_posture_job(user.id, request, settings)

    @router.get("/jobs/{job_id}", summary="본인의 자세 분석 진행 상태 조회")
    async def get_job(job_id: UUID, user: Any = Depends(current_user_dependency),
                      settings: Any = Depends(settings_dependency)):
        return await fetch_posture_job(user.id, job_id, settings)

    @router.post("/jobs/{job_id}/video", summary="자세 분석 영상 업로드 및 분석")
    async def post_video(job_id: UUID, video: UploadFile = File(...),
                         user: Any = Depends(current_user_dependency),
                         settings: Any = Depends(settings_dependency)):
        return await analyze_uploaded_video(user.id, job_id, video, settings)

    @router.get("/jobs/{job_id}/result", summary="본인의 완료된 자세 분석 결과 조회")
    async def get_result(job_id: UUID, user: Any = Depends(current_user_dependency),
                         settings: Any = Depends(settings_dependency)):
        return await fetch_posture_result(user.id, job_id, settings)

    return router
