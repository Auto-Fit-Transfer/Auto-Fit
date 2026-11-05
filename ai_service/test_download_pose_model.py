"""The Docker build must reject a changed pose model artifact."""

import hashlib
from io import BytesIO

import pytest

from app.scripts import download_pose_model as downloader


def test_download_verifies_model_digest_before_install(monkeypatch, tmp_path) -> None:
    model = b"known-model"
    expected = hashlib.sha256(model).hexdigest()
    monkeypatch.setattr(downloader, "MINIMUM_MODEL_BYTES", 1)
    monkeypatch.setattr(downloader, "urlopen", lambda *_args, **_kwargs: BytesIO(model))
    output = tmp_path / "pose.task"

    assert downloader.download_model(output_path=output, expected_sha256=expected) == output
    assert output.read_bytes() == model
    assert downloader.download_model(output_path=output, expected_sha256=expected) == output


def test_download_rejects_unexpected_digest(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(downloader, "MINIMUM_MODEL_BYTES", 1)
    monkeypatch.setattr(downloader, "urlopen", lambda *_args, **_kwargs: BytesIO(b"changed-model"))
    output = tmp_path / "pose.task"

    with pytest.raises(RuntimeError, match="SHA-256"):
        downloader.download_model(output_path=output, expected_sha256="0" * 64)

    assert not output.exists()
    assert not output.with_suffix(".task.download").exists()
