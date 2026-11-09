"""Share the lifespan HTTP client across a request without closing it."""
import asyncio
from contextlib import asynccontextmanager
from contextvars import ContextVar
import logging

import httpx


logger = logging.getLogger("uvicorn.error")
PGRST303_RETRY_DELAYS = (0.25, 0.5)
_retry_pgrst303: ContextVar[bool] = ContextVar(
    "retry_pgrst303", default=False
)


@asynccontextmanager
async def retry_pgrst303_scope():
    """Limit transient-auth retries to selected read-only Supabase GET batches."""
    token = _retry_pgrst303.set(True)
    try:
        yield
    finally:
        _retry_pgrst303.reset(token)


async def get_with_pgrst303_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, str],
) -> httpx.Response:
    """Retry only transient PostgREST JWT-claim failures on a read-only GET."""
    if not _retry_pgrst303.get():
        return await client.get(url, headers=headers, params=params)

    for attempt in range(len(PGRST303_RETRY_DELAYS) + 1):
        response = await client.get(url, headers=headers, params=params)
        if response.status_code != 401:
            return response
        try:
            error = response.json()
        except ValueError:
            return response
        if not isinstance(error, dict) or error.get("code") != "PGRST303":
            return response

        reason = (
            "jwt_issued_at_future"
            if error.get("message") == "JWT issued at future"
            else "other"
        )
        logger.warning(
            "Supabase GET PGRST303: path=%s reason=%s attempt=%d/%d",
            httpx.URL(url).path,
            reason,
            attempt + 1,
            len(PGRST303_RETRY_DELAYS) + 1,
        )
        if attempt == len(PGRST303_RETRY_DELAYS):
            return response
        await asyncio.sleep(PGRST303_RETRY_DELAYS[attempt])

    raise AssertionError("unreachable")


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
