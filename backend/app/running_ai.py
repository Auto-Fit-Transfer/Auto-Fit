"""Server-side transport for the five allowlisted running AI endpoints."""

from __future__ import annotations

import asyncio
import json
import math
import os
from dataclasses import dataclass, field
from urllib.parse import quote
from urllib.parse import urlsplit

import httpx

MAX_RESPONSE_BYTES = 2 * 1024 * 1024


@dataclass(frozen=True)
class AIServerConfig:
    base_url: str
    api_key: str = field(repr=False)

    def __post_init__(self):
        parsed = urlsplit(self.base_url)
        try:
            port = parsed.port
        except ValueError:
            raise ValueError("AI_SERVER_BASE_URL has an invalid port") from None
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username is not None
                or parsed.password is not None or parsed.path not in {"", "/"}
                or parsed.query or parsed.fragment or port == 0
                or any(char.isspace() for char in self.base_url)):
            raise ValueError("AI_SERVER_BASE_URL must be a trusted HTTPS origin")
        if (len(self.api_key) < 32 or not self.api_key.isascii()
                or any(not 33 <= ord(char) <= 126 for char in self.api_key)):
            raise ValueError("AI_SERVER_API_KEY must contain 32+ printable non-space ASCII characters")


def get_ai_server_config() -> AIServerConfig | None:
    enabled = os.getenv("AI_SERVER_ENABLED", "false")
    if enabled not in {"true", "false"}:
        raise ValueError("AI_SERVER_ENABLED must be true or false")
    if enabled == "false":
        return None
    return AIServerConfig(os.getenv("AI_SERVER_BASE_URL", ""),
                          os.getenv("AI_SERVER_API_KEY", ""))


class AIServerError(RuntimeError):
    def __init__(self, code: str, upstream_status: int | None = None):
        super().__init__(code)
        self.code = code
        self.upstream_status = upstream_status


def _invalid_constant(value: str):
    raise ValueError("Non-finite JSON number")


def _finite_float(value: str) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Non-finite JSON number")
    return result


def _unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


class RunningAIClient:
    def __init__(self, config: AIServerConfig, *, transport=None):
        self.config = config
        self.transport = transport

    async def request(self, operation: str, *, params: dict | None = None,
                      body: dict | None = None, course_id: str | None = None) -> dict:
        paths = {
            "places": ("GET", "/running/places/search"),
            "recommend": ("GET", "/running/courses/recommend"),
            "detail": ("GET", "/running/courses/" + quote(course_id or "", safe="")),
            "preview": ("POST", "/running/routes/preview"),
            "generate": ("POST", "/running/routes/generate-loop"),
        }
        if operation not in paths or (operation == "detail" and not course_id):
            raise ValueError("Unsupported running AI operation")
        method, path = paths[operation]
        if method == "POST" and not isinstance(body, dict):
            raise ValueError("Running AI request requires a JSON object")
        payload = json.dumps(body, ensure_ascii=False, allow_nan=False).encode() if body is not None else None
        try:
            async with asyncio.timeout(95):
                async with httpx.AsyncClient(
                    timeout=90, follow_redirects=False, trust_env=False,
                    transport=self.transport,
                ) as client:
                    async with client.stream(
                        method, self.config.base_url.rstrip("/") + path,
                        params=params, content=payload,
                        headers={
                            "Authorization": f"Bearer {self.config.api_key}",
                            "Accept": "application/json",
                            **({"Content-Type": "application/json"} if payload is not None else {}),
                        },
                    ) as response:
                        if response.status_code != 200:
                            code = {
                                401: "AI_AUTH_FAILED", 404: "AI_COURSE_NOT_FOUND",
                                422: "AI_INPUT_REJECTED", 500: "AI_INTERNAL_ERROR",
                                502: "AI_UPSTREAM_ERROR", 503: "AI_UNAVAILABLE",
                            }.get(response.status_code, "AI_HTTP_ERROR")
                            raise AIServerError(code, response.status_code)
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            if len(data) + len(chunk) > MAX_RESPONSE_BYTES:
                                raise AIServerError("AI_RESPONSE_TOO_LARGE")
                            data.extend(chunk)
                        result = json.loads(
                            data, parse_constant=_invalid_constant,
                            parse_float=_finite_float, object_pairs_hook=_unique_object,
                        )
                        if not isinstance(result, dict):
                            raise AIServerError("AI_INVALID_RESPONSE")
                        return result
        except (httpx.TimeoutException, TimeoutError):
            raise AIServerError("AI_TIMEOUT") from None
        except httpx.HTTPError:
            raise AIServerError("AI_CONNECTION_ERROR") from None
        except (ValueError, RecursionError):
            raise AIServerError("AI_INVALID_RESPONSE") from None
