"""Save an AI result in one Postgres transaction through a restricted RPC."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx

from backend.app.posture_result_contract import PostureAnalysisResult


class PostureStoreError(RuntimeError):
    pass


class PostureStoreUncertain(PostureStoreError):
    """The RPC may have committed, but a confirmation read also failed."""


def service_headers(settings: Any) -> dict[str, str]:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


async def _saved_digest(client: httpx.AsyncClient, settings: Any,
                        job_id: str) -> tuple[bool, str | None]:
    try:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/posture_assessments",
            headers=service_headers(settings),
            params={"select": "result_digest", "posture_analysis_job_id": f"eq.{job_id}",
                    "limit": "1"}, timeout=15,
        )
        rows = response.json()
    except (httpx.HTTPError, ValueError):
        return False, None
    if response.status_code != 200 or not isinstance(rows, list) or len(rows) > 1:
        return False, None
    if not rows:
        return True, None
    if not isinstance(rows[0], dict):
        return False, None
    return True, rows[0].get("result_digest")


async def persist_posture_result(client: httpx.AsyncClient, settings: Any,
                                 result: PostureAnalysisResult) -> None:
    payload = result.model_dump(mode="json")
    job_id = str(result.posture_analysis_job_id)
    digest = hashlib.sha256(json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")).hexdigest()
    try:
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/rpc/save_posture_analysis_result",
            headers={**service_headers(settings), "Content-Type": "application/json"},
            json={"p_job_id": job_id, "p_result": payload,
                  "p_result_digest": digest}, timeout=30,
        )
        if response.is_success:
            return
    except httpx.HTTPError:
        pass
    # A lost response may follow a committed RPC. Verify the stored digest
    # before treating it as failed and moving the job to cleanup_pending.
    known, saved_digest = await _saved_digest(client, settings, job_id)
    if saved_digest == digest:
        return
    if not known:
        raise PostureStoreUncertain("atomic result state is uncertain")
    raise PostureStoreError("atomic result write failed")
