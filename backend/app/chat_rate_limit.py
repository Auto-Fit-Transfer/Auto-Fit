"""Shared rolling-window quota. Authenticated user identity comes from FastAPI."""
import httpx
from fastapi import HTTPException
from backend.app.chat_storage import fail
from backend.app.http_client import client_scope


class ChatRateLimiter:
    def __init__(self, url, headers, user_id):
        self.url, self.headers, self.user_id = url, headers, user_id

    async def check(self, bucket):
        if bucket not in {"requests", "answers"}:
            raise ValueError("Unknown chat quota")
        try:
            async with client_scope() as client:
                response = await client.post(
                    f"{self.url}/rest/v1/rpc/consume_chat_rate_limit",
                    headers=self.headers,
                    json={"p_user_id": self.user_id, "p_bucket": bucket},
                )
            if response.is_error:
                fail("DATA_SOURCE_ERROR")
            result = response.json()
            if (not isinstance(result, dict) or type(result.get("allowed")) is not bool
                or type(result.get("retry_after")) is not int
                or not 0 <= result["retry_after"] <= 60):
                fail("DATA_SOURCE_ERROR")
        except (httpx.HTTPError, ValueError):
            fail("DATA_SOURCE_ERROR")
        if not result["allowed"]:
            retry = max(1, result["retry_after"])
            raise HTTPException(429, detail={
                "code": "RATE_LIMITED", "message": "잠시 후 다시 시도해 주세요.",
                "fields": None, "retry_after": retry,
            }, headers={"Retry-After": str(retry)})
