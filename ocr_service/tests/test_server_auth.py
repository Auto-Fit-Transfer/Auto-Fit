"""The public OCR route must require the token configured for the API service."""

from fastapi.testclient import TestClient

from server import pipeline
from server.app import app


def test_ocr_rejects_missing_or_wrong_token(monkeypatch) -> None:
    monkeypatch.setenv("AUTOFIT_OCR_SERVER_TOKEN", "test-ocr-token")
    monkeypatch.setattr(
        pipeline,
        "run",
        lambda *_args: (_ for _ in ()).throw(AssertionError("OCR must not run")),
    )
    client = TestClient(app)

    missing = client.post("/ai/ocr", files={"file": ("sample.png", b"image", "image/png")})
    wrong = client.post(
        "/ai/ocr",
        files={"file": ("sample.png", b"image", "image/png")},
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert missing.status_code == 401
    assert wrong.status_code == 401


def test_ocr_accepts_matching_token(monkeypatch) -> None:
    monkeypatch.setenv("AUTOFIT_OCR_SERVER_TOKEN", "test-ocr-token")
    monkeypatch.setattr(pipeline, "run", lambda *_args: {"status": "success"})
    client = TestClient(app)

    response = client.post(
        "/ai/ocr",
        files={"file": ("sample.png", b"image", "image/png")},
        headers={"Authorization": "Bearer test-ocr-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}


def test_ocr_auth_runs_before_multipart_parsing(monkeypatch) -> None:
    monkeypatch.setenv("AUTOFIT_OCR_SERVER_TOKEN", "test-ocr-token")
    client = TestClient(app)

    response = client.post(
        "/ai/ocr",
        content=b"invalid multipart",
        headers={"Content-Type": "multipart/form-data"},
    )

    assert response.status_code == 401
