"""Transport for structured AI endpoints, with server-only credentials.

This client has no database access and never retries generation requests.
Callers must validate endpoint-specific responses before applying any changes.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
from dataclasses import dataclass, field
from enum import Enum
from urllib.parse import urlsplit

import httpx


class AIEndpoint(str, Enum):
    DIET = "/recommend/diet"
    REPLACE_MEAL = "/recommend/diet/replace-meal"
    RECIPE = "/recommend/diet/recipe"
    CHAT = "/chat/orchestrate"
    HEALTH = "/health-analysis"
    DIET_REFRESH = "/health-analysis/diet-refresh"
    EXERCISE = "/recommend/exercise"


@dataclass(frozen=True)
class AIServerConfig:
    base_url: str
    api_key: str = field(repr=False)

    def __post_init__(self) -> None:
        parsed = urlsplit(self.base_url)
        try:
            port = parsed.port
        except ValueError:
            raise ValueError("AI_SERVER_BASE_URL has an invalid port") from None
        if (parsed.scheme != "https" or not parsed.hostname
                or parsed.username is not None or parsed.password is not None
                or parsed.path not in {"", "/"} or parsed.query or parsed.fragment
                or any(char.isspace() for char in self.base_url)
                or "?" in self.base_url or "#" in self.base_url or port == 0):
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
    return AIServerConfig(
        os.getenv("AI_SERVER_BASE_URL", ""), os.getenv("AI_SERVER_API_KEY", "")
    )


class AIServerError(RuntimeError):
    """Safe internal error: never includes response bodies, credentials or input."""

    def __init__(self, code: str, upstream_status: int | None = None):
        super().__init__(code)
        self.code = code
        self.upstream_status = upstream_status


HTTP_TIMEOUT_SECONDS = 60
WALL_TIMEOUT_SECONDS = 65
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


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


class AIServerClient:
    def __init__(self, config: AIServerConfig, *, transport=None):
        self.config = config
        self._transport = transport

    async def post(self, endpoint: AIEndpoint, payload: dict) -> dict:
        if not isinstance(endpoint, AIEndpoint):
            raise ValueError("Use an explicitly supported AIEndpoint")
        if not isinstance(payload, dict):
            raise ValueError("AI request must be a JSON object")
        # Serialize before opening a connection; reject NaN/Infinity in input.
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        try:
            async with asyncio.timeout(WALL_TIMEOUT_SECONDS):
                # Never borrow the Supabase client: it can carry privileged headers.
                async with httpx.AsyncClient(
                    timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=False,
                    trust_env=False, transport=self._transport,
                ) as client:
                    async with client.stream(
                        "POST", self.config.base_url.rstrip("/") + endpoint.value,
                        headers={
                            "Authorization": f"Bearer {self.config.api_key}",
                            "Content-Type": "application/json",
                            "Accept": "application/json",
                        }, content=body,
                    ) as response:
                        if response.status_code != 200:
                            code = {
                                401: "AI_AUTH_FAILED", 422: "AI_INPUT_REJECTED",
                                500: "AI_INTERNAL_ERROR", 503: "AI_UNAVAILABLE",
                            }.get(response.status_code, "AI_HTTP_ERROR")
                            raise AIServerError(code, response.status_code)
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            if len(data) + len(chunk) > MAX_RESPONSE_BYTES:
                                raise AIServerError("AI_RESPONSE_TOO_LARGE")
                            data.extend(chunk)
                        result = json.loads(
                            data, parse_constant=_invalid_constant,
                            parse_float=_finite_float,
                            object_pairs_hook=_unique_object,
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
