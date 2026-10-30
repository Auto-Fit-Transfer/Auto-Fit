"""Clean trigger-created rows for users created by the current live test run."""
import httpx


async def cleanup_user_defaults(
    remote: httpx.AsyncClient, headers: dict[str, str], user_id: str
) -> list[str]:
    errors = []
    for table in ("notification_settings", "profiles"):
        try:
            removed = await remote.delete(
                f"/rest/v1/{table}", headers=headers,
                params={"user_id": f"eq.{user_id}"},
            )
            if removed.status_code not in (200, 204):
                errors.append(f"{table}:{user_id}")
            remaining = await remote.get(
                f"/rest/v1/{table}", headers=headers,
                params={"user_id": f"eq.{user_id}", "select": "user_id", "limit": 1},
            )
            if remaining.status_code != 200 or remaining.json() != []:
                errors.append(f"remaining:{table}:{user_id}")
        except (httpx.HTTPError, ValueError):
            # Continue with other resources; never print privileged response bodies.
            errors.append(f"cleanup_request:{table}:{user_id}")
    return errors
