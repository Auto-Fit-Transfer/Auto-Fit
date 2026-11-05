"""Delete the authenticated account: freeze writes, remove files, then delete Auth.

Storage and Auth are separate services. A failed attempt leaves the deletion marker
and account in place so the same authenticated user can retry safely.
"""
from collections import defaultdict
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response


def service_headers(settings: Any) -> dict[str, str]:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


async def delete_account(user_id: str, settings: Any, *, client: httpx.AsyncClient | None = None) -> None:
    uid = str(UUID(user_id))
    headers = service_headers(settings)
    owned_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=30, trust_env=False)
    try:
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/rpc/begin_account_deletion",
            headers=headers, json={"p_user_id": uid},
        )
        if not response.is_success:
            raise HTTPException(502, "Account deletion could not be started")
        previous_batch = None
        while True:
            response = await client.post(
                f"{settings.supabase_url}/rest/v1/rpc/account_deletion_storage",
                headers=headers, json={"p_user_id": uid},
            )
            if not response.is_success:
                raise HTTPException(502, "Account file listing failed; retry account deletion")
            try:
                rows = response.json()
                if not isinstance(rows, list):
                    raise ValueError("Invalid listing")
                batch = tuple((row["bucket_id"], row["name"]) for row in rows)
                if any(not isinstance(bucket, str) or not bucket or not isinstance(name, str) or not name
                       for bucket, name in batch):
                    raise ValueError("Invalid object")
            except (ValueError, TypeError, KeyError):
                raise HTTPException(502, "Account file listing failed; retry account deletion") from None
            if not batch:
                break
            if batch == previous_batch:
                raise HTTPException(502, "Account files remain; retry account deletion")
            previous_batch = batch
            grouped = defaultdict(list)
            for bucket, name in batch:
                grouped[bucket].append(name)
            for bucket, names in grouped.items():
                response = await client.request(
                    "DELETE", f"{settings.supabase_url}/storage/v1/object/{quote(bucket, safe='')}",
                    headers=headers, json={"prefixes": names},
                )
                if not response.is_success:
                    raise HTTPException(502, "Account file deletion failed; retry account deletion")
        # The DB trigger removes all user-owned rows and indirect children atomically.
        response = await client.delete(
            f"{settings.supabase_url}/auth/v1/admin/users/{uid}", headers=headers,
        )
        if not response.is_success:
            raise HTTPException(502, "Account deletion failed; retry account deletion")
    except httpx.HTTPError:
        raise HTTPException(502, "Account deletion service unavailable; retry account deletion") from None
    finally:
        if owned_client:
            await client.aclose()


def create_account_deletion_router(current_user_dependency: Any, settings_dependency: Any) -> APIRouter:
    router = APIRouter(prefix="/api/account", tags=["Profile"])

    @router.delete("", status_code=204, summary="Permanently delete my account and associated data")
    async def delete_my_account(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Response:
        # The target comes exclusively from verified authentication, never a body/path ID.
        await delete_account(user.id, settings)
        return Response(status_code=204)

    return router
