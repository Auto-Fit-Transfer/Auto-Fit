"""Authenticated upload, synchronous AI analysis, persistence and video cleanup."""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError

from backend.app.ai_server import AIServerClient, AIServerError, get_ai_server_config
from backend.app.http_client import client_scope
from backend.app.posture_result_contract import PostureAnalysisResult
from backend.app.posture_result_store import (
    PostureStoreError, PostureStoreUncertain, persist_posture_result,
    service_headers,
)
from backend.app.posture_video import StagedPostureVideo, stage_posture_video


BUCKET = "posture-analysis-temp"
STALE_AGE = timedelta(minutes=15)
CLEANUP_INTERVAL_SECONDS = 60
logger = logging.getLogger("uvicorn.error")
JOB_SELECT = ("posture_analysis_job_id,exercise_key,exercise_code,camera_view,"
              "analysis_side,rule_version,validation_status,status,"
              "temporary_video_path,pending_video_path,failure_code")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _owned_job(client: httpx.AsyncClient, settings: Any,
                     user_id: str, job_id: UUID) -> dict[str, Any]:
    try:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/posture_analysis_jobs",
            headers=service_headers(settings),
            params={"select": JOB_SELECT, "posture_analysis_job_id": f"eq.{job_id}",
                    "user_id": f"eq.{user_id}", "limit": "1"}, timeout=15,
        )
        rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="자세 분석 작업을 확인하지 못했습니다.") from None
    if response.status_code != 200 or not isinstance(rows, list):
        raise HTTPException(502, detail="자세 분석 작업을 확인하지 못했습니다.")
    if not rows:
        raise HTTPException(404, detail="자세 분석 작업을 찾지 못했습니다.")
    if len(rows) != 1 or not isinstance(rows[0], dict):
        raise HTTPException(502, detail="자세 분석 작업 형식이 올바르지 않습니다.")
    return rows[0]


async def _transition(client: httpx.AsyncClient, settings: Any,
                      user_id: str, job_id: UUID, from_status: str,
                      payload: dict[str, Any], *,
                      expected_pending_path: str | None = None,
                      expected_updated_at: str | None = None) -> None:
    try:
        response = await client.patch(
            f"{settings.supabase_url}/rest/v1/posture_analysis_jobs",
            headers={**service_headers(settings), "Prefer": "return=representation"},
            params={"select": "posture_analysis_job_id", "posture_analysis_job_id": f"eq.{job_id}",
                    "user_id": f"eq.{user_id}", "status": f"eq.{from_status}",
                    **({"pending_video_path": f"eq.{expected_pending_path}"}
                       if expected_pending_path is not None else {}),
                    **({"updated_at": f"eq.{expected_updated_at}"}
                       if expected_updated_at is not None else {})},
            json=payload, timeout=15,
        )
        rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="자세 분석 상태를 저장하지 못했습니다.") from None
    if response.status_code != 200:
        raise HTTPException(502, detail="자세 분석 상태를 저장하지 못했습니다.")
    if not isinstance(rows, list) or len(rows) != 1:
        raise HTTPException(409, detail="자세 분석 작업 상태가 변경됐습니다.")


async def _claim_upload(client: httpx.AsyncClient, settings: Any,
                        user_id: str, job_id: UUID, path: str) -> None:
    try:
        response = await client.patch(
            f"{settings.supabase_url}/rest/v1/posture_analysis_jobs",
            headers={**service_headers(settings), "Prefer": "return=representation"},
            params={"select": "posture_analysis_job_id",
                    "posture_analysis_job_id": f"eq.{job_id}",
                    "user_id": f"eq.{user_id}", "status": "eq.awaiting_upload",
                    "pending_video_path": "is.null"},
            json={"pending_video_path": path}, timeout=15,
        )
        rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="영상 업로드 상태를 저장하지 못했습니다.") from None
    if response.status_code != 200:
        raise HTTPException(502, detail="영상 업로드 상태를 저장하지 못했습니다.")
    if not isinstance(rows, list) or len(rows) != 1:
        raise HTTPException(409, detail="이미 영상 업로드가 진행 중입니다.")


async def _finish_pending_video_cleanup(client: httpx.AsyncClient, settings: Any,
                                        user_id: str, job_id: UUID, path: str) -> None:
    if not path.startswith(f"{user_id}/"):
        raise HTTPException(502, detail="이전 영상 경로를 확인하지 못했습니다.")
    await _delete(client, settings, path)
    try:
        response = await client.delete(
            f"{settings.supabase_url}/rest/v1/posture_pending_video_cleanup",
            headers=service_headers(settings),
            params={"posture_analysis_job_id": f"eq.{job_id}",
                    "video_path": f"eq.{path}"}, timeout=15,
        )
    except httpx.HTTPError:
        raise HTTPException(502, detail="영상 정리 기록을 삭제하지 못했습니다.") from None
    if not response.is_success:
        raise HTTPException(502, detail="영상 정리 기록을 삭제하지 못했습니다.")


async def expire_stale_awaiting_upload(client: httpx.AsyncClient, settings: Any,
                                       user_id: str, job: dict[str, Any]) -> None:
    try:
        job_id = UUID(job["posture_analysis_job_id"])
        observed_updated_at = job.get("updated_at") or job["created_at"]
        pending_path = job.get("pending_video_path")
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/rpc/expire_stale_posture_upload",
            headers=service_headers(settings),
            json={"p_job_id": str(job_id), "p_user_id": user_id,
                  "p_updated_at": observed_updated_at,
                  "p_pending_path": pending_path}, timeout=15,
        )
        expired = response.json()
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        raise HTTPException(502, detail="이전 자세 분석 작업을 정리하지 못했습니다.") from None
    if response.status_code != 200 or not isinstance(expired, bool):
        raise HTTPException(502, detail="이전 자세 분석 작업을 정리하지 못했습니다.")
    if not expired:
        raise HTTPException(409, detail="이전 자세 분석 작업 상태가 변경됐습니다.")
    if pending_path:
        await _finish_pending_video_cleanup(client, settings, user_id, job_id, pending_path)


async def _upload(client: httpx.AsyncClient, settings: Any,
                  path: str, video: StagedPostureVideo) -> None:
    async def chunks():
        with video.path.open("rb") as source:
            while data := await asyncio.to_thread(source.read, 1024 * 1024):
                yield data

    try:
        response = await client.post(
            f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{path}",
            headers={**service_headers(settings), "Content-Type": video.content_type,
                     "Content-Length": str(video.size_bytes), "x-upsert": "false"},
            content=chunks(), timeout=90,
        )
    except httpx.HTTPError:
        raise HTTPException(502, detail="영상 임시 저장에 실패했습니다.") from None
    if response.status_code not in {200, 201}:
        raise HTTPException(502, detail="영상 임시 저장에 실패했습니다.")


async def _delete(client: httpx.AsyncClient, settings: Any, path: str) -> None:
    try:
        response = await client.delete(
            f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{path}",
            headers=service_headers(settings), timeout=30,
        )
    except httpx.HTTPError:
        raise HTTPException(502, detail="임시 영상을 삭제하지 못했습니다.") from None
    if response.is_success or response.status_code == 404:
        return
    if response.status_code == 400:
        try:
            body = response.json()
        except ValueError:
            body = None
        if (isinstance(body, dict) and body.get("error") == "not_found"
                and body.get("message") == "Object not found"):
            return
    raise HTTPException(502, detail="임시 영상을 삭제하지 못했습니다.")


async def _cleanup(client: httpx.AsyncClient, settings: Any, user_id: str,
                   job_id: UUID, path: str, failure_code: str | None,
                   repetitions: int = 0) -> None:
    await _transition(client, settings, user_id, job_id, "processing", {
        "status": "cleanup_pending", "analysis_stage": "result_summary",
        "progress_percent": 95, "detected_repetitions": repetitions,
        "failure_code": failure_code,
    })
    await _finish_cleanup(client, settings, user_id, job_id, path, failure_code)


async def _finish_cleanup(client: httpx.AsyncClient, settings: Any,
                          user_id: str, job_id: UUID, path: str,
                          failure_code: str | None, *,
                          expected_updated_at: str | None = None) -> None:
    await _delete(client, settings, path)
    final = {
        "status": "failed" if failure_code else "completed",
        "analysis_stage": "failed" if failure_code else "complete",
        "progress_percent": 95 if failure_code else 100,
        "temporary_video_path": None, "video_deleted_at": _now(),
        "finished_at": _now(), "failure_code": failure_code,
    }
    await _transition(client, settings, user_id, job_id, "cleanup_pending", final,
                      expected_updated_at=expected_updated_at)


async def _result_count(client: httpx.AsyncClient, settings: Any,
                        job_id: UUID) -> int | None:
    try:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/posture_assessments",
            headers=service_headers(settings),
            params={"select": "result_digest,repetition_count",
                    "posture_analysis_job_id": f"eq.{job_id}", "limit": "1"},
            timeout=15,
        )
        rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="이전 자세 분석 결과를 확인하지 못했습니다.") from None
    if response.status_code != 200 or not isinstance(rows, list) or len(rows) > 1:
        raise HTTPException(502, detail="이전 자세 분석 결과를 확인하지 못했습니다.")
    if not rows:
        return None
    row = rows[0]
    if (not isinstance(row, dict)
            or not isinstance(row.get("result_digest"), str)
            or not isinstance(row.get("repetition_count"), int)
            or not 1 <= row["repetition_count"] <= 20):
        raise HTTPException(502, detail="이전 자세 분석 결과를 확인하지 못했습니다.")
    return row["repetition_count"]


async def recover_stale_job(client: httpx.AsyncClient, settings: Any,
                            user_id: str, job: dict[str, Any]) -> None:
    """A later create request can release a job stranded by a process crash."""
    job_id = UUID(job["posture_analysis_job_id"])
    path = job.get("temporary_video_path")
    if not isinstance(path, str) or not path.startswith(f"{user_id}/"):
        raise HTTPException(502, detail="이전 자세 분석 영상 경로를 확인하지 못했습니다.")
    status = job["status"]
    failure_code = job.get("failure_code")
    observed_updated_at = job.get("updated_at")
    if status == "processing":
        repetitions = await _result_count(client, settings, job_id)
        failure_code = None if repetitions is not None else "ANALYSIS_TIMEOUT"
        await _transition(client, settings, user_id, job_id, "processing", {
            "status": "cleanup_pending", "analysis_stage": "result_summary",
            "progress_percent": 95, "failure_code": failure_code,
            "detected_repetitions": repetitions or 0,
        }, expected_updated_at=observed_updated_at)
        observed_updated_at = None
    elif status != "cleanup_pending":
        raise HTTPException(409, detail="이전 자세 분석 작업이 진행 중입니다.")
    elif failure_code is None and await _result_count(client, settings, job_id) is None:
        failure_code = "RESULT_MISSING"
    await _finish_cleanup(client, settings, user_id, job_id, path, failure_code,
                          expected_updated_at=observed_updated_at)


async def sweep_pending_video_cleanup(client: httpx.AsyncClient, settings: Any) -> None:
    try:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/posture_pending_video_cleanup",
            headers=service_headers(settings),
            params={"select": "posture_analysis_job_id,user_id,video_path",
                    "order": "created_at.asc", "limit": "100"}, timeout=15,
        )
        rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="임시 영상 정리 대상을 확인하지 못했습니다.") from None
    if response.status_code != 200 or not isinstance(rows, list):
        raise HTTPException(502, detail="임시 영상 정리 대상을 확인하지 못했습니다.")
    for row in rows:
        try:
            user_id = str(UUID(row["user_id"]))
            job_id = UUID(row["posture_analysis_job_id"])
            await _finish_pending_video_cleanup(
                client, settings, user_id, job_id, row["video_path"])
        except (HTTPException, KeyError, TypeError, ValueError):
            logger.warning("Posture pending video cleanup deferred for one object")


async def sweep_stale_posture_jobs(client: httpx.AsyncClient, settings: Any) -> None:
    """Clean abandoned uploads even when users never create another job."""
    await sweep_pending_video_cleanup(client, settings)
    cutoff = (datetime.now(timezone.utc) - STALE_AGE).isoformat()
    try:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/posture_analysis_jobs",
            headers=service_headers(settings),
            params={"select": "posture_analysis_job_id,user_id,status,"
                    "temporary_video_path,pending_video_path,failure_code,updated_at",
                    "status": "in.(awaiting_upload,processing,cleanup_pending)",
                    "updated_at": f"lt.{cutoff}", "order": "updated_at.asc",
                    "limit": "100"}, timeout=15,
        )
        rows = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, detail="자세 분석 정리 대상을 확인하지 못했습니다.") from None
    if response.status_code != 200 or not isinstance(rows, list):
        raise HTTPException(502, detail="자세 분석 정리 대상을 확인하지 못했습니다.")
    for row in rows:
        try:
            user_id = str(UUID(row["user_id"]))
            job_id = UUID(row["posture_analysis_job_id"])
            if row["status"] == "awaiting_upload":
                await expire_stale_awaiting_upload(client, settings, user_id, row)
            else:
                await recover_stale_job(client, settings, user_id, row)
        except (HTTPException, KeyError, ValueError, TypeError):
            # A competing worker may already have completed this job. Retry
            # other stale jobs now; the next pass revisits unresolved ones.
            logger.warning("Posture cleanup deferred for one stale job")


async def posture_cleanup_loop(client: httpx.AsyncClient, settings: Any) -> None:
    while True:
        try:
            await sweep_stale_posture_jobs(client, settings)
        except HTTPException:
            logger.warning("Posture cleanup scan deferred")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)


async def analyze_uploaded_video(user_id: str, job_id: UUID, file: UploadFile,
                                 settings: Any) -> dict[str, str]:
    if os.getenv("POSTURE_ANALYSIS_WRITE_ENABLED", "false") != "true":
        raise HTTPException(503, detail="자세 분석 업로드가 아직 준비되지 않았습니다.")
    async with client_scope() as client:
        job = await _owned_job(client, settings, user_id, job_id)
        if job.get("status") != "awaiting_upload":
            raise HTTPException(409, detail="이미 업로드되었거나 종료된 자세 분석 작업입니다.")
        if job.get("pending_video_path"):
            raise HTTPException(409, detail="이미 영상 업로드가 진행 중입니다.")
        if job.get("validation_status") != "validated" or not job.get("exercise_key"):
            raise HTTPException(409, detail="운영 검증된 자세 분석 작업이 아닙니다.")
        video = await stage_posture_video(file)
        try:
            path = f"{user_id}/{job_id}/{uuid4()}{video.extension}"
            try:
                await _claim_upload(client, settings, user_id, job_id, path)
            except HTTPException:
                current = await _owned_job(client, settings, user_id, job_id)
                if (current.get("status") != "awaiting_upload"
                        or current.get("pending_video_path") != path):
                    raise
            try:
                await _upload(client, settings, path, video)
            except HTTPException:
                # Upload may have succeeded despite a response timeout.
                try:
                    await _delete(client, settings, path)
                except HTTPException:
                    pass
                else:
                    try:
                        await _transition(client, settings, user_id, job_id,
                                          "awaiting_upload",
                                          {"pending_video_path": None},
                                          expected_pending_path=path)
                    except HTTPException:
                        pass
                raise
            started = _now()
            try:
                await _transition(client, settings, user_id, job_id, "awaiting_upload", {
                    "status": "processing", "analysis_stage": "joint_detection",
                    "progress_percent": 1, "temporary_video_path": path,
                    "pending_video_path": None,
                    "capture_duration_ms": video.duration_ms,
                    "video_uploaded_at": started, "analysis_started_at": started,
                }, expected_pending_path=path)
            except HTTPException:
                # A timeout can occur after the DB committed the transition.
                current = await _owned_job(client, settings, user_id, job_id)
                if (current.get("status") != "processing"
                        or current.get("temporary_video_path") != path):
                    try:
                        await _delete(client, settings, path)
                    except HTTPException:
                        pass
                    else:
                        try:
                            await _transition(client, settings, user_id, job_id,
                                              "awaiting_upload",
                                              {"pending_video_path": None},
                                              expected_pending_path=path)
                        except HTTPException:
                            pass
                    raise

            failure_code: str | None = None
            error_status = 502
            try:
                try:
                    config = get_ai_server_config()
                except ValueError:
                    raise AIServerError("AI_UNAVAILABLE") from None
                if config is None:
                    raise AIServerError("AI_UNAVAILABLE")
                with video.path.open("rb") as source:
                    raw = await AIServerClient(config).analyze_posture_video(
                        video=source, content_type=video.content_type,
                        filename=Path(path).name,
                        posture_analysis_job_id=str(job_id),
                        exercise_key=job["exercise_key"],
                        exercise_code=job["exercise_code"],
                        camera_view=job["camera_view"],
                        analysis_side=job.get("analysis_side"),
                    )
                result = PostureAnalysisResult.model_validate(raw)
                result.validate_job(job, video.duration_ms)
                await persist_posture_result(client, settings, result)
            except AIServerError as exc:
                failure_code = exc.code
                error_status = 422 if exc.upstream_status == 422 else 503
            except (ValidationError, ValueError):
                failure_code = "AI_INVALID_RESPONSE"
            except PostureStoreUncertain:
                # The sweeper checks the assessment digest before choosing
                # completed or failed; do not hide a possibly committed result.
                raise HTTPException(502, detail="자세 분석 저장 상태를 확인하지 못했습니다.") from None
            except PostureStoreError:
                failure_code = "RESULT_SAVE_FAILED"
            except (OSError, KeyError):
                failure_code = "POSTURE_INTERNAL_ERROR"
            await _cleanup(client, settings, user_id, job_id, path, failure_code,
                           0 if failure_code else result.assessment.repetition_count)
            if failure_code:
                raise HTTPException(error_status, detail="자세 분석을 완료하지 못했습니다.")
            return {"posture_analysis_job_id": str(job_id), "status": "completed"}
        finally:
            video.close()
