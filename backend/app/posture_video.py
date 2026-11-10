"""Bounded temporary posture video staging and container/duration validation."""

from __future__ import annotations

import asyncio
import json
import math
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import HTTPException, UploadFile


MAX_VIDEO_BYTES = 50_000_000
MAX_VIDEO_SECONDS = 30
READ_CHUNK_BYTES = 1024 * 1024
FFPROBE_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class StagedPostureVideo:
    path: Path
    content_type: str
    extension: str
    size_bytes: int
    duration_ms: int

    def close(self) -> None:
        self.path.unlink(missing_ok=True)


def _container(first_bytes: bytes, declared_type: str | None) -> tuple[str, str, str]:
    declared = (declared_type or "").split(";", 1)[0].strip().lower()
    if len(first_bytes) >= 12 and first_bytes[4:8] == b"ftyp":
        if first_bytes[8:12] == b"qt  " or declared == "video/quicktime":
            kind, mime, extension = "mov", "video/quicktime", ".mov"
        else:
            kind, mime, extension = "mp4", "video/mp4", ".mp4"
    elif (len(first_bytes) >= 12 and first_bytes[4:8] in
          {b"moov", b"wide", b"free", b"mdat"} and declared == "video/quicktime"):
        kind, mime, extension = "mov", "video/quicktime", ".mov"
    elif first_bytes.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in first_bytes[:512].lower():
        kind, mime, extension = "webm", "video/webm", ".webm"
    elif first_bytes[:4] == b"RIFF" and first_bytes[8:12] == b"AVI ":
        kind, mime, extension = "avi", "video/x-msvideo", ".avi"
    else:
        raise HTTPException(422, detail="지원하지 않는 영상 형식입니다.")

    accepted_types = {mime, "application/octet-stream", ""}
    if kind == "avi":
        accepted_types.add("video/avi")
    if declared not in accepted_types:
        raise HTTPException(422, detail="영상 형식과 Content-Type이 일치하지 않습니다.")
    return kind, mime, extension


def _probe_duration(path: Path, kind: str) -> int:
    binary = os.getenv("POSTURE_FFPROBE_PATH", "/usr/bin/ffprobe")
    if not Path(binary).is_absolute():
        raise HTTPException(503, detail="영상 검증 도구 설정이 올바르지 않습니다.")
    try:
        result = subprocess.run(
            [binary, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "format=format_name,duration:stream=codec_type",
             "-of", "json", str(path)],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, timeout=FFPROBE_TIMEOUT_SECONDS, check=False,
        )
    except FileNotFoundError:
        raise HTTPException(503, detail="영상 검증 도구를 사용할 수 없습니다.") from None
    except subprocess.TimeoutExpired:
        raise HTTPException(422, detail="영상 정보를 읽는 시간이 초과됐습니다.") from None
    if result.returncode != 0:
        raise HTTPException(422, detail="영상 정보를 읽을 수 없습니다.")
    try:
        probe = json.loads(result.stdout)
        video_format = probe["format"]
        format_names = set(video_format["format_name"].split(","))
        duration = float(video_format["duration"])
        has_video = any(stream.get("codec_type") == "video"
                        for stream in probe["streams"])
    except (KeyError, TypeError, ValueError, AttributeError, json.JSONDecodeError):
        raise HTTPException(422, detail="영상 길이를 확인할 수 없습니다.") from None
    if not has_video:
        raise HTTPException(422, detail="영상 트랙을 찾을 수 없습니다.")
    if ((kind in {"mp4", "mov"} and not format_names.intersection({"mov", "mp4"}))
            or (kind == "webm" and "webm" not in format_names)
            or (kind == "avi" and "avi" not in format_names)):
        raise HTTPException(422, detail="영상 컨테이너 형식이 올바르지 않습니다.")
    if not math.isfinite(duration) or not 1 <= duration <= MAX_VIDEO_SECONDS:
        raise HTTPException(422, detail="영상 길이는 1초 이상 30초 이하여야 합니다.")
    # Container durations can fall just below an analyzer frame timestamp.
    return min(MAX_VIDEO_SECONDS * 1000, math.ceil(duration * 10) * 100)


async def stage_posture_video(file: UploadFile) -> StagedPostureVideo:
    path: Path | None = None
    try:
        first_bytes = await file.read(512)
        kind, mime, extension = _container(first_bytes, file.content_type)
        if len(first_bytes) > MAX_VIDEO_BYTES:
            raise HTTPException(413, detail="영상은 50MB 이하여야 합니다.")
        with NamedTemporaryFile(prefix="posture-", suffix=extension, delete=False) as temp:
            path = Path(temp.name)
            size_bytes = len(first_bytes)
            temp.write(first_bytes)
            while True:
                chunk = await file.read(READ_CHUNK_BYTES)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > MAX_VIDEO_BYTES:
                    raise HTTPException(413, detail="영상은 50MB 이하여야 합니다.")
                await asyncio.to_thread(temp.write, chunk)
        duration_ms = await asyncio.to_thread(_probe_duration, path, kind)
        return StagedPostureVideo(path, mime, extension, size_bytes, duration_ms)
    except BaseException:
        if path is not None:
            path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
