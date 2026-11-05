from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from math import cos, radians, sin
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest

from app.core.config import Settings, get_settings
from app.main import app
from app.schemas.posture_analysis import PostureAnalysisResult
from app.services.posture_analysis_service import (
    PoseFrame,
    PosePoint,
    PoseVideoSample,
    PostureAnalysisError,
    PostureAnalysisService,
    SquatPostureAnalyzer,
)


ROOT = Path(__file__).resolve().parent
RESULT_EXAMPLE = json.loads(
    (
        ROOT / "docs" / "posture_analysis_contract_examples.json"
    ).read_text(encoding="utf-8")
)["result"]


def _point(
    x: float,
    y: float,
    confidence: float = 0.99,
) -> PosePoint:
    return PosePoint(x=x, y=y, confidence=confidence)


def _squat_frame(
    timestamp_ms: int,
    *,
    knee_angle: float,
    torso_lean: float = 20.0,
    heel_lifted: bool = False,
) -> PoseFrame:
    knee_x = 0.55
    knee_y = 0.68
    segment_length = 0.20
    ankle = _point(knee_x, knee_y + segment_length)

    hip_direction = radians(90.0 + knee_angle)
    hip = _point(
        knee_x + segment_length * cos(hip_direction),
        knee_y + segment_length * sin(hip_direction),
    )

    torso_radians = radians(torso_lean)
    shoulder = _point(
        hip.x - 0.22 * sin(torso_radians),
        hip.y - 0.22 * cos(torso_radians),
    )
    foot = _point(0.65, 0.93)
    heel = _point(
        0.52,
        0.80 if heel_lifted else 0.92,
    )

    right_landmarks = {
        "right_shoulder": shoulder,
        "right_elbow": _point(shoulder.x + 0.07, shoulder.y + 0.08),
        "right_wrist": _point(shoulder.x + 0.14, shoulder.y + 0.10),
        "right_hip": hip,
        "right_knee": _point(knee_x, knee_y),
        "right_ankle": ankle,
        "right_heel": heel,
        "right_foot_index": foot,
    }
    left_landmarks = {
        code.replace("right_", "left_"): PosePoint(
            x=point.x + 0.01,
            y=point.y,
            confidence=0.80,
        )
        for code, point in right_landmarks.items()
    }

    return PoseFrame(
        timestamp_ms=timestamp_ms,
        landmarks={
            "head": _point(shoulder.x, max(0.05, shoulder.y - 0.12)),
            **left_landmarks,
            **right_landmarks,
        },
    )


def _squat_sample(
    *,
    torso_lean: float = 20.0,
    heel_lifted: bool = False,
) -> PoseVideoSample:
    knee_angles = (
        [175.0] * 5
        + [145.0, 125.0, 105.0]
        + [90.0] * 5
        + [110.0, 135.0, 160.0]
        + [175.0] * 5
    )
    frames = [
        _squat_frame(
            index * 100,
            knee_angle=knee_angle,
            torso_lean=torso_lean,
            heel_lifted=heel_lifted,
        )
        for index, knee_angle in enumerate(knee_angles)
    ]
    return PoseVideoSample(
        frames=frames,
        sampled_frame_count=len(frames),
        duration_ms=frames[-1].timestamp_ms,
    )


def test_squat_analyzer_returns_contract_result() -> None:
    settings = Settings(
        posture_min_landmark_confidence=0.5,
        posture_min_pose_coverage=0.6,
    )
    analyzer = SquatPostureAnalyzer(settings)

    result = analyzer.analyze(
        posture_analysis_job_id=uuid4(),
        sample=_squat_sample(),
    )

    assert result.exercise_code == "squat"
    assert result.camera_view == "side"
    assert result.assessment.repetition_count == 1
    assert result.assessment.passing_score is None
    assert len(result.repetitions[0].angles) == 4
    assert result.repetitions[0].start_offset_ms < (
        result.repetitions[0].keyframe_offset_ms
    )
    assert result.repetitions[0].keyframe_offset_ms < (
        result.repetitions[0].end_offset_ms
    )
    joint_codes = {
        point.joint_code for point in result.repetitions[0].keypoints
    }
    assert {
        "head",
        "neck",
        "right_hip",
        "right_knee",
        "right_ankle",
        "right_heel",
        "right_foot_index",
    }.issubset(joint_codes)
    assert any(
        finding.finding_code == "stable_heel_contact"
        for finding in result.findings
    )


def test_squat_analyzer_detects_torso_and_heel_corrections() -> None:
    analyzer = SquatPostureAnalyzer(Settings())

    result = analyzer.analyze(
        posture_analysis_job_id=uuid4(),
        sample=_squat_sample(
            torso_lean=60.0,
            heel_lifted=True,
        ),
    )

    finding_codes = {finding.finding_code for finding in result.findings}
    assert "excessive_torso_lean" in finding_codes
    assert "heel_lift" in finding_codes
    assert result.repetitions[0].score < 100
    assert len(result.routine_suggestions) >= 2


def test_squat_analyzer_rejects_incomplete_motion() -> None:
    frames = [
        _squat_frame(index * 100, knee_angle=175.0)
        for index in range(12)
    ]
    analyzer = SquatPostureAnalyzer(Settings())

    with pytest.raises(PostureAnalysisError, match="완료된 스쿼트"):
        analyzer.analyze(
            posture_analysis_job_id=uuid4(),
            sample=PoseVideoSample(
                frames=frames,
                sampled_frame_count=len(frames),
                duration_ms=1100,
            ),
        )


class _FakeExtractor:
    def __init__(self, sample: PoseVideoSample) -> None:
        self.sample = sample
        self.temporary_path: Path | None = None

    def extract(
        self,
        video_path: Path,
        *,
        posture_analysis_job_id: UUID,
        progress_callback: object = None,
    ) -> PoseVideoSample:
        del posture_analysis_job_id, progress_callback
        assert video_path.is_file()
        self.temporary_path = video_path
        return self.sample


def test_service_deletes_temporary_video() -> None:
    settings = Settings(posture_video_max_bytes=1_000_000)
    extractor = _FakeExtractor(_squat_sample())
    service = PostureAnalysisService(
        settings=settings,
        extractor=extractor,  # type: ignore[arg-type]
        analyzer=SquatPostureAnalyzer(settings),
    )
    video_bytes = b"\x00\x00\x00\x18ftypisom" + b"video"

    service._validate_request(
        exercise_code="squat",
        camera_view="side",
        video_bytes=video_bytes,
    )
    result = service._analyze_video_sync(
        uuid4(),
        video_bytes,
        ".mp4",
        None,
    )

    assert result.assessment.repetition_count == 1
    assert extractor.temporary_path is not None
    assert not extractor.temporary_path.exists()


def test_service_rejects_unsupported_request_and_file() -> None:
    service = PostureAnalysisService(settings=Settings())
    video_bytes = b"\x00\x00\x00\x18ftypisom" + b"video"

    with pytest.raises(PostureAnalysisError, match="squat"):
        service._validate_request(
            exercise_code="lunge",
            camera_view="side",
            video_bytes=video_bytes,
        )

    with pytest.raises(PostureAnalysisError, match="형식을 확인"):
        from app.services.posture_analysis_service import (
            _detect_video_suffix,
        )

        _detect_video_suffix(
            b"not-a-video",
            declared_content_type="video/mp4",
        )


async def _test_router_contract() -> None:
    settings = get_settings()
    previous_key = settings.ai_server_api_key
    settings.ai_server_api_key = "posture-test-key"
    original_analyze = PostureAnalysisService.analyze_video
    expected_job_id = uuid4()

    async def fake_analyze(
        self: PostureAnalysisService,
        *,
        posture_analysis_job_id: UUID,
        exercise_code: str,
        camera_view: str,
        video_bytes: bytes,
        declared_content_type: str | None,
        progress_callback: object = None,
    ) -> PostureAnalysisResult:
        del self, progress_callback
        assert posture_analysis_job_id == expected_job_id
        assert exercise_code == "squat"
        assert camera_view == "side"
        assert video_bytes[4:8] == b"ftyp"
        assert declared_content_type == "video/mp4"
        payload = deepcopy(RESULT_EXAMPLE)
        payload["posture_analysis_job_id"] = str(expected_job_id)
        return PostureAnalysisResult.model_validate(payload)

    PostureAnalysisService.analyze_video = fake_analyze  # type: ignore[method-assign]
    app.openapi_schema = None

    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            response = await client.post(
                "/posture-analysis/analyze",
                data={
                    "posture_analysis_job_id": str(expected_job_id),
                    "exercise_code": "squat",
                    "camera_view": "side",
                },
                files={
                    "video": (
                        "squat.mp4",
                        b"\x00\x00\x00\x18ftypisom" + b"video",
                        "video/mp4",
                    )
                },
                headers={
                    "Authorization": "Bearer posture-test-key",
                },
            )
            unauthorized = await client.post(
                "/posture-analysis/analyze",
                data={
                    "posture_analysis_job_id": str(expected_job_id),
                },
                files={
                    "video": (
                        "squat.mp4",
                        b"\x00\x00\x00\x18ftypisom" + b"video",
                        "video/mp4",
                    )
                },
            )

        assert response.status_code == 200
        assert response.json()["posture_analysis_job_id"] == str(
            expected_job_id
        )
        assert unauthorized.status_code == 401

        operation = app.openapi()["paths"][
            "/posture-analysis/analyze"
        ]["post"]
        assert "multipart/form-data" in operation["requestBody"]["content"]
        assert operation["security"] == [{"HTTPBearer": []}]
    finally:
        PostureAnalysisService.analyze_video = original_analyze
        settings.ai_server_api_key = previous_key
        app.openapi_schema = None


def test_posture_analysis_router_contract() -> None:
    asyncio.run(_test_router_contract())
