"""Focused diet-read instrumentation; never records query strings or user data."""
import json
import logging
import os
from contextlib import asynccontextmanager
from contextvars import ContextVar
from time import perf_counter
from uuid import uuid4

import httpx

from backend.app.http_client import client_scope


READ_PATHS = frozenset({
    "/api/diet/recommendations",
    "/api/diet/recommendations/latest",
    "/api/diet/meal-logs",
    "/api/diet/nutrition-summary",
})
_stages: ContextVar[dict | None] = ContextVar("diet_timing_stages", default=None)
logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def timed_http_client(stage: str, client=None, *, timeout=10):
    """Measure existing client scopes without changing pooling or request order.

    Includes client construction/cleanup and body download, not just DB execution.
    Borrowed clients remain open. Outside a traced request this is a no-op probe.
    """
    stages = _stages.get()
    started = perf_counter() if stages is not None else None
    try:
        if client is not None:
            async with client_scope(client) as borrowed:
                yield borrowed
        else:
            async with httpx.AsyncClient(timeout=timeout, trust_env=False) as owned:
                yield owned
    finally:
        if stages is not None:
            entry = stages.setdefault(stage, {"calls": 0, "ms": 0.0})
            entry["calls"] += 1
            entry["ms"] += (perf_counter() - started) * 1000


class DietTimingMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        enabled = os.getenv("DIET_TIMING_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
        if (not enabled or scope["type"] != "http"
                or scope.get("method") != "GET" or scope.get("path") not in READ_PATHS):
            await self.app(scope, receive, send)
            return

        trace_id = uuid4().hex
        stages = {}
        token = _stages.set(stages)
        started = perf_counter()
        status_code = 500

        async def traced_send(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                message = {**message, "headers": [
                    *message.get("headers", []),
                    (b"x-diet-trace-id", trace_id.encode("ascii")),
                ]}
            await send(message)

        try:
            await self.app(scope, receive, traced_send)
        finally:
            elapsed = (perf_counter() - started) * 1000
            _stages.reset(token)
            logger.info("[diet-timing] %s", json.dumps({
                "trace_id": trace_id,
                "route": scope["path"],
                "status": status_code,
                "total_ms": round(elapsed, 2),
                "stages": {name: {"calls": value["calls"], "ms": round(value["ms"], 2)}
                           for name, value in stages.items()},
            }, separators=(",", ":")))
