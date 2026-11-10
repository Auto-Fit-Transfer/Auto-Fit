"""Large posture multipart requests have a bounded disk-backed path."""

import asyncio

import httpx
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from backend.app import security
from backend.app.security import RequestBodyLimitMiddleware


JOB = "00000000-0000-4000-8000-000000000011"
VIDEO_PATH = f"/api/posture/jobs/{JOB}/video"


def make_app():
    app = FastAPI()
    app.add_middleware(RequestBodyLimitMiddleware, max_bytes=5,
                       posture_upload_max_bytes=12)

    @app.post("/api/other")
    @app.post("/api/posture/jobs/{job_id}/video")
    async def echo(request: Request):
        return {"received": len(await request.body())}

    return app


def test_only_exact_posture_video_path_gets_larger_limit():
    client = TestClient(make_app())
    assert client.post("/api/other", content=b"123456").status_code == 413
    response = client.post(VIDEO_PATH, content=b"123456")
    assert response.status_code == 200
    assert response.json() == {"received": 6}
    assert client.post(VIDEO_PATH, content=b"1234567890123").status_code == 413
    assert client.post("/api/posture/jobs/not-a-uuid/video",
                       content=b"123456").status_code == 413


def test_posture_limit_counts_chunked_body_without_content_length():
    async def chunks():
        yield b"123456"
        yield b"7890123"

    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=make_app()),
                                     base_url="http://testserver") as client:
            return await client.post(VIDEO_PATH, content=chunks())

    response = asyncio.run(request())
    assert response.status_code == 413
    assert response.json() == {"detail": "Request body is too large"}


def test_declared_posture_length_is_checked_before_body_read():
    response = TestClient(make_app()).post(
        VIDEO_PATH, content=b"1", headers={"Content-Length": "13"},
    )
    assert response.status_code == 413


def test_only_two_video_requests_can_hold_disk_spools():
    async def run():
        app = FastAPI()
        app.add_middleware(RequestBodyLimitMiddleware, max_bytes=5,
                           posture_upload_max_bytes=12)
        entered = asyncio.Event()
        release = asyncio.Event()
        count = 0

        @app.post("/api/posture/jobs/{job_id}/video")
        async def hold(request: Request):
            nonlocal count
            await request.body()
            count += 1
            if count == 2:
                entered.set()
            await release.wait()
            return {"ok": True}

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://testserver") as client:
            first = asyncio.create_task(client.post(VIDEO_PATH, content=b"123456"))
            second = asyncio.create_task(client.post(VIDEO_PATH, content=b"123456"))
            await asyncio.wait_for(entered.wait(), timeout=2)
            third = await client.post(VIDEO_PATH, content=b"123456")
            release.set()
            completed = await asyncio.gather(first, second)
        return third, completed

    rejected, completed = asyncio.run(run())
    assert rejected.status_code == 429
    assert all(item.status_code == 200 for item in completed)


def test_idle_uploads_time_out_and_release_both_slots(monkeypatch):
    monkeypatch.setattr(security, "POSTURE_UPLOAD_IDLE_TIMEOUT_SECONDS", 0.2)

    async def run():
        entered = asyncio.Event()
        never = asyncio.Event()
        count = 0

        async def stalled():
            nonlocal count
            yield b"123"
            count += 1
            if count == 2:
                entered.set()
            await never.wait()

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=make_app()),
                                     base_url="http://testserver") as client:
            first = asyncio.create_task(client.post(VIDEO_PATH, content=stalled()))
            second = asyncio.create_task(client.post(VIDEO_PATH, content=stalled()))
            await asyncio.wait_for(entered.wait(), timeout=2)
            blocked = await client.post(VIDEO_PATH, content=b"123")
            timed_out = await asyncio.gather(first, second)
            recovered = await client.post(VIDEO_PATH, content=b"123")
        return blocked, timed_out, recovered

    blocked, timed_out, recovered = asyncio.run(run())
    assert blocked.status_code == 429
    assert [response.status_code for response in timed_out] == [408, 408]
    assert recovered.status_code == 200


def test_total_upload_deadline_applies_to_dripping_body(monkeypatch):
    monkeypatch.setattr(security, "POSTURE_UPLOAD_IDLE_TIMEOUT_SECONDS", 0.1)
    monkeypatch.setattr(security, "POSTURE_UPLOAD_TOTAL_TIMEOUT_SECONDS", 0.08)

    async def chunks():
        while True:
            yield b"1"
            await asyncio.sleep(0.02)

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=make_app()),
                                     base_url="http://testserver") as client:
            return await client.post(VIDEO_PATH, content=chunks())

    response = asyncio.run(run())
    assert response.status_code == 408
