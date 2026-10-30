"""Owner-scoped, read-only posture analysis endpoints for R7 E17/E18."""

from typing import Any, Callable
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer

from backend.app.http_client import client_scope


JOB_COLUMNS = (
    "posture_analysis_job_id,exercise_code,camera_view,status,analysis_stage,"
    "progress_percent,processed_frames,total_frames,detected_repetitions,"
    "capture_duration_ms,created_at,finished_at,failure_code"
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


async def fetch_posture_job(user_id: str, job_id: UUID, settings: Any) -> dict[str, Any]:
    async with client_scope() as client:
        return await _owned_job(client, settings, user_id, job_id)


async def fetch_posture_result(user_id: str, job_id: UUID, settings: Any) -> dict[str, Any]:
    async with client_scope() as client:
        job = await _owned_job(client, settings, user_id, job_id)
        if job["status"] != "completed":
            raise HTTPException(409, detail="자세 분석 결과가 아직 준비되지 않았습니다.")
        assessments = await _rows(client, settings, "posture_assessments",
            "posture_assessment_id,model_version,overall_score,passing_score,"
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
        for repetition in repetitions:
            repetition_id = repetition["posture_repetition_id"]
            repetition["keypoints"] = await _rows(client, settings, "posture_joint_keypoints",
                "joint_code,x_normalized,y_normalized,confidence", {
                    "posture_repetition_id": f"eq.{repetition_id}", "limit": "20",
                })
            repetition["angles"] = await _rows(client, settings, "posture_joint_angles",
                "angle_code,measured_degrees,target_min_degrees,target_max_degrees", {
                    "posture_repetition_id": f"eq.{repetition_id}", "limit": "4",
                })
        for finding in findings:
            finding["guidance_steps"] = await _rows(client, settings, "posture_guidance_steps",
                "sequence_order,instruction", {
                    "posture_finding_id": f"eq.{finding['posture_finding_id']}",
                    "order": "sequence_order.asc", "limit": "10",
                })
        return {"job": job, "assessment": assessment, "repetitions": repetitions,
                "findings": findings, "routine_suggestions": suggestions}


def create_posture_analysis_router(current_user_dependency: Callable,
                                   settings_dependency: Callable) -> APIRouter:
    router = APIRouter(prefix="/api/posture/jobs", tags=["Posture Analysis"],
                       dependencies=[Depends(HTTPBearer(auto_error=False))])

    @router.get("/{job_id}", summary="본인의 자세 분석 진행 상태 조회")
    async def get_job(job_id: UUID, user: Any = Depends(current_user_dependency),
                      settings: Any = Depends(settings_dependency)):
        return await fetch_posture_job(user.id, job_id, settings)

    @router.get("/{job_id}/result", summary="본인의 완료된 자세 분석 결과 조회")
    async def get_result(job_id: UUID, user: Any = Depends(current_user_dependency),
                         settings: Any = Depends(settings_dependency)):
        return await fetch_posture_result(user.id, job_id, settings)

    return router
