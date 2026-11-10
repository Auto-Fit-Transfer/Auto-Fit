"""Posture video staging rejects spoofed, oversized and invalid media."""

import asyncio
import io
import shutil
import subprocess

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from backend.app import posture_video


MP4_HEADER = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00"


def upload(data: bytes, mime: str) -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename="untrusted-name.mp4",
                      headers=Headers({"content-type": mime}))


@pytest.mark.parametrize("header,mime,kind,extension", [
    (MP4_HEADER, "video/mp4", "mp4", ".mp4"),
    (b"\x00\x00\x00\x18ftypqt  ", "video/quicktime", "mov", ".mov"),
    (b"\x1a\x45\xdf\xa3webm", "video/webm", "webm", ".webm"),
    (b"RIFF\x00\x00\x00\x00AVI ", "video/x-msvideo", "avi", ".avi"),
])
def test_supported_container_signatures(header, mime, kind, extension):
    assert posture_video._container(header, mime) == (kind, mime, extension)


def test_mime_cannot_disagree_with_container():
    assert posture_video._container(MP4_HEADER, "video/mp4; codecs=avc1")[0] == "mp4"
    with pytest.raises(HTTPException) as error:
        posture_video._container(MP4_HEADER, "video/webm")
    assert error.value.status_code == 422


def test_staged_file_is_bounded_and_removed(monkeypatch):
    monkeypatch.setattr(posture_video, "_probe_duration", lambda path, kind: 2000)
    staged = asyncio.run(posture_video.stage_posture_video(upload(
        MP4_HEADER + b"payload", "video/mp4")))
    assert staged.path.read_bytes() == MP4_HEADER + b"payload"
    assert staged.size_bytes == len(MP4_HEADER) + len(b"payload")
    assert staged.duration_ms == 2000
    staged.close()
    assert not staged.path.exists()


def test_oversized_staging_removes_temp_file(monkeypatch, tmp_path):
    monkeypatch.setattr(posture_video, "MAX_VIDEO_BYTES", len(MP4_HEADER) + 2)
    monkeypatch.setattr(posture_video, "NamedTemporaryFile",
                        lambda **kwargs: __import__("tempfile").NamedTemporaryFile(
                            dir=tmp_path, **kwargs))
    with pytest.raises(HTTPException) as error:
        asyncio.run(posture_video.stage_posture_video(upload(
            MP4_HEADER + b"longer", "video/mp4")))
    assert error.value.status_code == 413
    assert list(tmp_path.iterdir()) == []


def test_probe_requires_video_stream_and_legal_duration(monkeypatch, tmp_path):
    file = tmp_path / "file.mp4"
    file.write_bytes(MP4_HEADER)

    def fake_run(*args, **kwargs):
        return subprocess.CompletedProcess(args[0], 0, stdout=(
            '{"format":{"format_name":"mov,mp4", "duration":"2"},"streams":[]}'
        ))

    monkeypatch.setattr(posture_video.subprocess, "run", fake_run)
    monkeypatch.setenv("POSTURE_FFPROBE_PATH", "/usr/bin/ffprobe")
    with pytest.raises(HTTPException) as error:
        posture_video._probe_duration(file, "mp4")
    assert error.value.status_code == 422

    def too_long(*args, **kwargs):
        return subprocess.CompletedProcess(args[0], 0, stdout=(
            '{"format":{"format_name":"mov,mp4", "duration":"30.01"},'
            '"streams":[{"codec_type":"video"}]}'
        ))

    monkeypatch.setattr(posture_video.subprocess, "run", too_long)
    with pytest.raises(HTTPException) as error:
        posture_video._probe_duration(file, "mp4")
    assert error.value.status_code == 422


def test_real_ffprobe_on_video_and_audio_only(monkeypatch, tmp_path):
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        pytest.skip("ffmpeg and ffprobe unavailable")
    monkeypatch.setenv("POSTURE_FFPROBE_PATH", ffprobe)
    video = tmp_path / "video.mp4"
    subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i",
                    "color=c=black:s=64x64:r=1:d=2", "-c:v", "mpeg4",
                    "-y", str(video)], check=True)
    staged = asyncio.run(posture_video.stage_posture_video(upload(
        video.read_bytes(), "video/mp4")))
    try:
        assert staged.duration_ms == 2000
    finally:
        staged.close()

    audio = tmp_path / "audio.mp4"
    subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i",
                    "sine=frequency=440:duration=2", "-c:a", "aac",
                    "-y", str(audio)], check=True)
    with pytest.raises(HTTPException) as error:
        asyncio.run(posture_video.stage_posture_video(upload(
            audio.read_bytes(), "video/mp4")))
    assert error.value.status_code == 422
