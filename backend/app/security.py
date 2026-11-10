from __future__ import annotations

import asyncio
import os
from tempfile import SpooledTemporaryFile
from uuid import UUID

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


# Allows a 10 MiB health document plus multipart framing while remaining bounded.
DEFAULT_MAX_REQUEST_BODY_BYTES = 12 * 1024 * 1024
DEFAULT_POSTURE_UPLOAD_MAX_REQUEST_BYTES = 50_000_000 + 256 * 1024
POSTURE_REPLAY_CHUNK_BYTES = 1024 * 1024
POSTURE_MAX_CONCURRENT_REQUESTS = 2
POSTURE_UPLOAD_IDLE_TIMEOUT_SECONDS = 30
POSTURE_UPLOAD_TOTAL_TIMEOUT_SECONDS = 180


def is_posture_video_upload(scope: Scope) -> bool:
    if scope.get("method") != "POST":
        return False
    parts = scope.get("path", "").split("/")
    if len(parts) != 6 or parts[:4] != ["", "api", "posture", "jobs"] or parts[5] != "video":
        return False
    try:
        UUID(parts[4])
    except ValueError:
        return False
    return True


def environment_flag(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_allowed_hosts(value: str | None) -> list[str]:
    if value is None:
        return ["localhost", "127.0.0.1", "testserver"]
    hosts = [host.strip() for host in value.split(",") if host.strip()]
    if not hosts:
        raise RuntimeError("BACKEND_ALLOWED_HOSTS must contain at least one host")
    return hosts


def parse_request_body_limit(value: str | None) -> int:
    if value is None:
        return DEFAULT_MAX_REQUEST_BODY_BYTES
    try:
        limit = int(value)
    except ValueError as exc:
        raise RuntimeError("MAX_REQUEST_BODY_BYTES must be an integer") from exc
    if limit < 1024:
        raise RuntimeError("MAX_REQUEST_BODY_BYTES must be at least 1024")
    return limit


class RequestBodyLimitMiddleware:
    """Reject oversized request bodies before FastAPI parses or stores them."""

    def __init__(self, app: ASGIApp, *, max_bytes: int,
                 posture_upload_max_bytes: int | None = None) -> None:
        self.app = app
        self.max_bytes = max_bytes
        configured_posture_limit = os.getenv("POSTURE_UPLOAD_MAX_REQUEST_BYTES")
        if posture_upload_max_bytes is not None:
            self.posture_upload_max_bytes = posture_upload_max_bytes
        elif configured_posture_limit is not None:
            self.posture_upload_max_bytes = parse_request_body_limit(configured_posture_limit)
        else:
            self.posture_upload_max_bytes = DEFAULT_POSTURE_UPLOAD_MAX_REQUEST_BYTES
        self._posture_slots = asyncio.Semaphore(POSTURE_MAX_CONCURRENT_REQUESTS)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in {
            "POST",
            "PUT",
            "PATCH",
        }:
            await self.app(scope, receive, send)
            return

        posture_video_upload = is_posture_video_upload(scope)
        max_bytes = (self.posture_upload_max_bytes if posture_video_upload
                     else self.max_bytes)
        content_length = Headers(scope=scope).get("content-length")
        if content_length is not None:
            try:
                declared_bytes = int(content_length)
            except ValueError:
                await self._reject(scope, receive, send, 400, "Invalid Content-Length header")
                return
            if declared_bytes < 0:
                await self._reject(scope, receive, send, 400, "Invalid Content-Length header")
                return
            if declared_bytes > max_bytes:
                await self._reject(scope, receive, send, 413, "Request body is too large")
                return

        if posture_video_upload:
            try:
                await asyncio.wait_for(self._posture_slots.acquire(), timeout=0.05)
            except TimeoutError:
                await self._reject(scope, receive, send, 429, "Too many video uploads")
                return
            try:
                await self._spooled_request(scope, receive, send, max_bytes)
            finally:
                self._posture_slots.release()
            return

        messages: list[Message] = []
        received_bytes = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.disconnect":
                break
            if message["type"] != "http.request":
                continue
            received_bytes += len(message.get("body", b""))
            if received_bytes > max_bytes:
                await self._reject(scope, receive, send, 413, "Request body is too large")
                return
            if not message.get("more_body", False):
                break

        message_index = 0

        async def replay_receive() -> Message:
            nonlocal message_index
            if message_index < len(messages):
                message = messages[message_index]
                message_index += 1
                return message
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, replay_receive, send)

    async def _spooled_request(self, scope: Scope, receive: Receive, send: Send,
                               max_bytes: int) -> None:
        # The 50 MB video path must not hold the entire multipart body in RAM.
        with SpooledTemporaryFile(max_size=POSTURE_REPLAY_CHUNK_BYTES, mode="w+b") as spool:
            received_bytes = 0
            disconnected = False
            loop = asyncio.get_running_loop()
            deadline = loop.time() + POSTURE_UPLOAD_TOTAL_TIMEOUT_SECONDS
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    await self._reject(scope, receive, send, 408, "Video upload timed out")
                    return
                try:
                    message = await asyncio.wait_for(
                        receive(), timeout=min(POSTURE_UPLOAD_IDLE_TIMEOUT_SECONDS, remaining),
                    )
                except TimeoutError:
                    await self._reject(scope, receive, send, 408, "Video upload timed out")
                    return
                if message["type"] == "http.disconnect":
                    disconnected = True
                    break
                if message["type"] != "http.request":
                    continue
                body = message.get("body", b"")
                received_bytes += len(body)
                if received_bytes > max_bytes:
                    await self._reject(scope, receive, send, 413, "Request body is too large")
                    return
                await asyncio.to_thread(spool.write, body)
                if loop.time() > deadline:
                    await self._reject(scope, receive, send, 408, "Video upload timed out")
                    return
                if not message.get("more_body", False):
                    break
            await asyncio.to_thread(spool.seek, 0)

            async def replay_receive() -> Message:
                if disconnected:
                    return {"type": "http.disconnect"}
                chunk = await asyncio.to_thread(spool.read, POSTURE_REPLAY_CHUNK_BYTES)
                return {"type": "http.request", "body": chunk,
                        "more_body": spool.tell() < received_bytes}

            await self.app(scope, replay_receive, send)

    @staticmethod
    async def _reject(
        scope: Scope,
        receive: Receive,
        send: Send,
        status_code: int,
        detail: str,
    ) -> None:
        response = JSONResponse(status_code=status_code, content={"detail": detail})
        await response(scope, receive, send)


class SecurityHeadersMiddleware:
    """Apply browser and cache protections to every HTTP response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        async def send_with_security_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "no-referrer")
                headers.setdefault(
                    "Permissions-Policy",
                    "camera=(), microphone=(), geolocation=(), bluetooth=()",
                )
                if path.startswith("/api"):
                    headers.setdefault("Cache-Control", "no-store")
                    headers.setdefault("Pragma", "no-cache")
                if path not in {"/docs", "/redoc"}:
                    headers.setdefault(
                        "Content-Security-Policy",
                        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
                    )
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


class BlockedPathMiddleware:
    """Hide routes that must not be reachable in the configured environment."""

    def __init__(self, app: ASGIApp, *, prefixes: tuple[str, ...]) -> None:
        self.app = app
        self.prefixes = prefixes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] == "http" and any(
            path == prefix or path.startswith(f"{prefix}/")
            for prefix in self.prefixes
        ):
            response = JSONResponse(status_code=404, content={"detail": "Not found"})
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
