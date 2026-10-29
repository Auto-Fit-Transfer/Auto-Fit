"""Share the lifespan HTTP client across a request without closing it."""
from contextlib import asynccontextmanager
from contextvars import ContextVar

import httpx


_request_client: ContextVar[httpx.AsyncClient | None] = ContextVar(
    "request_http_client", default=None
)


@asynccontextmanager
async def bind_request_client(client: httpx.AsyncClient | None):
    """Make the app's pooled client available to lower-level request helpers."""
    token = _request_client.set(client)
    try:
        yield
    finally:
        _request_client.reset(token)


@asynccontextmanager
async def client_scope(client: httpx.AsyncClient | None = None):
    borrowed = client or _request_client.get()
    if borrowed is not None:
        yield borrowed
    else:
        async with httpx.AsyncClient(timeout=10, trust_env=False) as owned:
            yield owned


class SharedHttpClientMiddleware:
    """Bind the lifespan connection pool to every HTTP request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        app = scope.get("app")
        client = getattr(getattr(app, "state", None), "supabase_http_client", None)
        async with bind_request_client(client):
            await self.app(scope, receive, send)
