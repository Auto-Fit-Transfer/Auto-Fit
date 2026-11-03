"""The body-analysis model must not run without server-to-server credentials."""

import asyncio
from types import SimpleNamespace

import httpx
from fastapi import FastAPI

import app.core.security as security_module
from app.routers.body_router import router
from app.services.body_model_service import body_model_service


def test_body_analysis_requires_ai_server_key(monkeypatch) -> None:
    called = []
    monkeypatch.setattr(
        security_module, "get_settings",
        lambda: SimpleNamespace(ai_server_api_key="test-server-key"),
    )
    monkeypatch.setattr(
        body_model_service, "predict", lambda request: called.append(request) or {"ok": True},
    )
    app = FastAPI()
    app.include_router(router)

    async def exercise_route() -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            payload = {"age": 30}
            missing = await client.post("/ai/body-analysis", json=payload)
            invalid = await client.post(
                "/ai/body-analysis",
                json=payload,
                headers={"Authorization": "Bearer wrong-key"},
            )
            valid = await client.post(
                "/ai/body-analysis",
                json=payload,
                headers={"Authorization": "Bearer test-server-key"},
            )
            assert missing.status_code == 401
            assert invalid.status_code == 401
            assert valid.status_code == 200
            assert valid.json()["result"] == {"ok": True}

    asyncio.run(exercise_route())
    assert len(called) == 1
    assert app.openapi()["paths"]["/ai/body-analysis"]["post"]["security"] == [
        {"HTTPBearer": []}
    ]


def test_body_analysis_fails_closed_without_configured_key(monkeypatch) -> None:
    def forbidden(request) -> None:
        raise AssertionError("model must not run")

    monkeypatch.setattr(
        security_module, "get_settings",
        lambda: SimpleNamespace(ai_server_api_key=None),
    )
    monkeypatch.setattr(body_model_service, "predict", forbidden)
    app = FastAPI()
    app.include_router(router)

    async def exercise_route() -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.post(
                "/ai/body-analysis",
                json={"age": 30},
                headers={"Authorization": "Bearer any-key"},
            )
            assert response.status_code == 500

    asyncio.run(exercise_route())
