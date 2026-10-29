from __future__ import annotations

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


# Allows a 10 MiB health document plus multipart framing while remaining bounded.
DEFAULT_MAX_REQUEST_BODY_BYTES = 12 * 1024 * 1024


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

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in {
            "POST",
            "PUT",
            "PATCH",
        }:
            await self.app(scope, receive, send)
            return

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
            if declared_bytes > self.max_bytes:
                await self._reject(scope, receive, send, 413, "Request body is too large")
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
            if received_bytes > self.max_bytes:
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
