from __future__ import annotations

import asyncio
from copy import deepcopy
import hashlib
import json
from math import cos, radians, sin
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest

import app.services.posture_analysis_service as posture_service_module
from app.core.config import Settings, get_settings
from app.main import app
from app.schemas.posture_analysis import PostureAnalysisResult
from app.scripts import download_pose_model
from app.services.posture_analysis_service import (
    CalfRaisePostureAnalyzer,
    CyclicPostureAnalyzer,
    MediaPipeVideoPoseExtractor,
    PoseFrame,
    PosePoint,
    PoseVideoSample,
    PostureAnalysisError,
    PostureConfigurationError,
    PostureAnalysisService,
    SquatPostureAnalyzer,
    _CYCLIC_EXERCISE_PROFILES,
    _PRESS_ASYMMETRY_RULE,
    _PRESS_PRIMARY_RULE,
    _measure_angle_rule,
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


def _generic_pose_sample(frame_count: int) -> PoseVideoSample:
    frames: list[PoseFrame] = []
    for index in range(frame_count):
        landmarks = {
            "head": _point(0.50, 0.10),
            "left_shoulder": _point(0.44, 0.25),
            "left_elbow": _point(0.39, 0.40),
            "left_wrist": _point(0.35, 0.55),
            "left_hip": _point(0.46, 0.55),
            "left_knee": _point(0.44, 0.72),
            "left_ankle": _point(0.43, 0.88),
            "left_heel": _point(0.41, 0.91),
            "left_foot_index": _point(0.48, 0.92),
            "right_shoulder": _point(0.56, 0.25),
            "right_elbow": _point(0.61, 0.40),
            "right_wrist": _point(0.65, 0.55),
            "right_hip": _point(0.54, 0.55),
            "right_knee": _point(0.56, 0.72),
            "right_ankle": _point(0.57, 0.88),
            "right_heel": _point(0.59, 0.91),
            "right_foot_index": _point(0.52, 0.92),
        }
        frames.append(
            PoseFrame(
                timestamp_ms=index * 100,
                landmarks=landmarks,
            )
        )
    return PoseVideoSample(
        frames=frames,
        sampled_frame_count=len(frames),
        duration_ms=frames[-1].timestamp_ms,
    )


def _calf_raise_sample() -> PoseVideoSample:
    ratios = [0.04] * 5 + [0.14] + [0.28] * 5 + [0.14] + [0.04] * 6
    base = _generic_pose_sample(len(ratios))
    frames: list[PoseFrame] = []
    for frame, ratio in zip(base.frames, ratios, strict=True):
        landmarks = dict(frame.landmarks)
        for side in ("left", "right"):
            knee = landmarks[f"{side}_knee"]
            ankle = landmarks[f"{side}_ankle"]
            foot = landmarks[f"{side}_foot_index"]
            lower_leg_length = (
                (knee.x - ankle.x) ** 2
                + (knee.y - ankle.y) ** 2
            ) ** 0.5
            current_heel = landmarks[f"{side}_heel"]
            landmarks[f"{side}_heel"] = _point(
                current_heel.x,
                foot.y - ratio * lower_leg_length,
            )
        frames.append(
            PoseFrame(
                timestamp_ms=frame.timestamp_ms,
                landmarks=landmarks,
            )
        )
    return PoseVideoSample(
        frames=frames,
        sampled_frame_count=len(frames),
        duration_ms=frames[-1].timestamp_ms,
    )


def _passing_rule_value(rule: object) -> float:
    target_min = getattr(rule, "target_min_degrees")
    target_max = getattr(rule, "target_max_degrees")
    if target_min is not None and target_max is not None:
        return (target_min + target_max) / 2
    if target_min is not None:
        return min(180.0, target_min + 5.0)
    assert target_max is not None
    return max(0.0, target_max - 5.0)


def _primary_sequence(profile: object) -> list[float]:
    direction = getattr(profile, "motion_direction")
    rest_threshold = getattr(profile, "rest_threshold_degrees")
    activation_threshold = getattr(profile, "activation_threshold_degrees")
    primary_rule = getattr(profile, "primary_rule")
    required_peak = getattr(profile, "required_peak_degrees")
    target_value = _passing_rule_value(primary_rule)
    if direction == "decrease":
        rest = min(180.0, rest_threshold + 10.0)
        peak = min(target_value, required_peak - 2.0)
    else:
        rest = max(0.0, rest_threshold - 10.0)
        peak = max(target_value, required_peak + 2.0)
    return (
        [rest] * 5
        + [activation_threshold]
        + [peak] * 5
        + [activation_threshold]
        + [rest] * 5
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
    assert result.schema_version == "1.1"
    assert result.assessment.repetition_count == 1
    assert result.assessment.passing_score is None
    assert result.assessment.verdict == "within_current_rules"
    assert isinstance(result.assessment.overall_score, int)
    assert isinstance(result.repetitions[0].score, int)
    assert {
        angle.angle_code for angle in result.repetitions[0].angles
    } == {"torso_lean", "knee_flexion"}
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
    assert result.assessment.verdict == "needs_correction"
    assert result.repetitions[0].score < 100
    assert result.routine_suggestions == []


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


@pytest.mark.parametrize(
    "profile",
    tuple(
        profile
        for profile in _CYCLIC_EXERCISE_PROFILES
        if profile.descriptor.exercise_code != "calf_raise"
    ),
    ids=lambda profile: profile.descriptor.exercise_code,
)
def test_each_registered_cyclic_analyzer_returns_contract_result(
    profile: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sequence = _primary_sequence(profile)

    def fake_measure_angle_rule(
        frame: PoseFrame,
        *,
        rule: object,
        side: object,
        bilateral: bool,
        bilateral_aggregation: str = "mean",
    ) -> float:
        del side, bilateral, bilateral_aggregation
        if rule is getattr(profile, "primary_rule"):
            return sequence[frame.timestamp_ms // 100]
        return _passing_rule_value(rule)

    monkeypatch.setattr(
        posture_service_module,
        "_measure_angle_rule",
        fake_measure_angle_rule,
    )
    settings = Settings(
        posture_min_landmark_confidence=0.5,
        posture_min_pose_coverage=0.6,
    )
    analyzer = CyclicPostureAnalyzer(settings, profile)  # type: ignore[arg-type]

    result = analyzer.analyze(
        posture_analysis_job_id=uuid4(),
        sample=_generic_pose_sample(len(sequence)),
    )

    descriptor = getattr(profile, "descriptor")
    assert result.exercise_code == descriptor.exercise_code
    assert result.camera_view == descriptor.camera_view
    assert result.assessment.repetition_count == 1
    assert result.assessment.verdict == "within_current_rules"
    assert result.repetitions[0].score == 100
    assert result.routine_suggestions == []
    assert result.model_version.endswith(descriptor.rule_version)


def test_calf_raise_uses_normalized_heel_lift_for_repetitions() -> None:
    profile = next(
        item
        for item in _CYCLIC_EXERCISE_PROFILES
        if item.descriptor.exercise_code == "calf_raise"
    )
    analyzer = CalfRaisePostureAnalyzer(Settings(), profile)

    result = analyzer.analyze(
        posture_analysis_job_id=uuid4(),
        sample=_calf_raise_sample(),
    )

    assert result.exercise_code == "calf_raise"
    assert result.assessment.repetition_count == 1
    assert result.assessment.verdict == "within_current_rules"
    assert result.repetitions[0].score == 100


def test_cyclic_analyzer_reports_profile_specific_correction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    profile = next(
        item
        for item in _CYCLIC_EXERCISE_PROFILES
        if item.descriptor.exercise_code == "push_up"
    )
    sequence = _primary_sequence(profile)

    def fake_measure_angle_rule(
        frame: PoseFrame,
        *,
        rule: object,
        side: object,
        bilateral: bool,
        bilateral_aggregation: str = "mean",
    ) -> float:
        del side, bilateral, bilateral_aggregation
        if rule is profile.primary_rule:
            return sequence[frame.timestamp_ms // 100]
        if getattr(rule, "angle_code") == "body_alignment":
            return 145.0
        return _passing_rule_value(rule)

    monkeypatch.setattr(
        posture_service_module,
        "_measure_angle_rule",
        fake_measure_angle_rule,
    )
    analyzer = CyclicPostureAnalyzer(Settings(), profile)
    result = analyzer.analyze(
        posture_analysis_job_id=uuid4(),
        sample=_generic_pose_sample(len(sequence)),
    )

    assert result.assessment.verdict == "needs_correction"
    assert result.repetitions[0].score < 100
    assert {
        finding.finding_code for finding in result.findings
    } == {"push_up_body_alignment"}


def test_jumping_jack_requires_leg_opening(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    profile = next(
        item
        for item in _CYCLIC_EXERCISE_PROFILES
        if item.descriptor.exercise_code == "jumping_jack"
    )
    sequence = _primary_sequence(profile)

    def fake_measure_angle_rule(
        frame: PoseFrame,
        *,
        rule: object,
        side: object,
        bilateral: bool,
        bilateral_aggregation: str = "mean",
    ) -> float:
        del side, bilateral, bilateral_aggregation
        if rule is profile.primary_rule:
            return sequence[frame.timestamp_ms // 100]
        if getattr(rule, "angle_code") == "leg_abduction":
            return 180.0
        return _passing_rule_value(rule)

    monkeypatch.setattr(
        posture_service_module,
        "_measure_angle_rule",
        fake_measure_angle_rule,
    )
    analyzer = CyclicPostureAnalyzer(Settings(), profile)

    with pytest.raises(PostureAnalysisError, match="완료된 점핑 잭"):
        analyzer.analyze(
            posture_analysis_job_id=uuid4(),
            sample=_generic_pose_sample(len(sequence)),
        )


def test_front_profile_uses_worst_side_and_measures_asymmetry() -> None:
    frame = PoseFrame(
        timestamp_ms=0,
        landmarks={
            "left_shoulder": _point(0.30, 0.50),
            "left_elbow": _point(0.30, 0.40),
            "left_wrist": _point(0.30, 0.30),
            "right_shoulder": _point(0.70, 0.50),
            "right_elbow": _point(0.70, 0.40),
            "right_wrist": _point(0.80, 0.40),
        },
    )

    mean_angle = _measure_angle_rule(
        frame,
        rule=_PRESS_PRIMARY_RULE,
        side=None,
        bilateral=True,
    )
    worst_angle = _measure_angle_rule(
        frame,
        rule=_PRESS_PRIMARY_RULE,
        side=None,
        bilateral=True,
        bilateral_aggregation="worst",
    )
    asymmetry = _measure_angle_rule(
        frame,
        rule=_PRESS_ASYMMETRY_RULE,
        side=None,
        bilateral=True,
    )

    assert mean_angle == pytest.approx(135.0)
    assert worst_angle == pytest.approx(90.0)
    assert asymmetry == pytest.approx(90.0)


def test_capabilities_use_exact_catalog_keys_and_validation_status() -> None:
    service = PostureAnalysisService(settings=Settings())

    capabilities = service.get_capabilities()
    by_code = {
        item.exercise_code: item for item in capabilities.exercises
    }

    assert set(by_code) == {
        "squat",
        "push_up",
        "glute_bridge",
        "biceps_curl",
        "calf_raise",
        "lunge",
        "split_squat",
        "jumping_jack",
        "shoulder_press",
        "lateral_raise",
    }
    assert by_code["squat"].validation_status == "validated"
    assert by_code["lunge"].analysis_side_required is True
    assert by_code["push_up"].analysis_side_required is False
    assert all(
        item.validation_status == "experimental"
        for code, item in by_code.items()
        if code != "squat"
    )
    all_keys = [
        exercise_key
        for item in capabilities.exercises
        for exercise_key in item.catalog_exercise_keys
    ]
    assert len(all_keys) == len(set(all_keys))
    assert by_code["push_up"].catalog_exercise_keys == [
        "ex_f6c866501f5ac0"
    ]


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
    service = PostureAnalysisService(
        settings=Settings(posture_allow_experimental=True)
    )
    video_bytes = b"\x00\x00\x00\x18ftypisom" + b"video"

    with pytest.raises(PostureAnalysisError, match="exercise_key"):
        service._validate_request(
            exercise_code="lunge",
            camera_view="side",
            analysis_side="right",
            video_bytes=video_bytes,
        )

    with pytest.raises(PostureAnalysisError, match="일치하지 않습니다"):
        service._validate_request(
            exercise_code="lunge",
            camera_view="side",
            exercise_key="ex_f6c866501f5ac0",
            analysis_side="right",
            video_bytes=video_bytes,
        )

    assert service._validate_request(
        exercise_code="lunge",
        camera_view="side",
        exercise_key="ex_b34acd08bef11a",
        analysis_side="right",
        video_bytes=video_bytes,
    ) == ("lunge", "side", "right")

    with pytest.raises(PostureAnalysisError, match="analysis_side"):
        service._validate_request(
            exercise_code="lunge",
            camera_view="side",
            exercise_key="ex_b34acd08bef11a",
            video_bytes=video_bytes,
        )

    with pytest.raises(PostureAnalysisError, match="camera_view"):
        service._validate_request(
            exercise_code="jumping_jack",
            camera_view="side",
            exercise_key="ex_3ecaba64725e87",
            video_bytes=video_bytes,
        )

    with pytest.raises(PostureAnalysisError, match="지원하지 않는"):
        service._validate_request(
            exercise_code="deadlift",
            camera_view="side",
            video_bytes=video_bytes,
        )

    with pytest.raises(PostureAnalysisError, match="지원하지 않는"):
        service._validate_request(
            exercise_code="Lunge",
            camera_view="side",
            exercise_key="ex_b34acd08bef11a",
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


def test_service_blocks_experimental_profiles_by_default() -> None:
    service = PostureAnalysisService(settings=Settings())
    video_bytes = b"\x00\x00\x00\x18ftypisom" + b"video"

    with pytest.raises(PostureAnalysisError, match="비활성화"):
        service._validate_request(
            exercise_code="push_up",
            camera_view="side",
            exercise_key="ex_f6c866501f5ac0",
            video_bytes=video_bytes,
        )


def test_extractor_rejects_unexpected_model_checksum(
    tmp_path: Path,
) -> None:
    model_path = tmp_path / "pose_landmarker_full.task"
    model_path.write_bytes(b"unexpected-model")
    settings = Settings(
        posture_model_path=str(model_path),
        posture_model_sha256="0" * 64,
    )
    extractor = MediaPipeVideoPoseExtractor(settings)

    with pytest.raises(
        PostureConfigurationError,
        match="checksum",
    ):
        extractor.extract(
            tmp_path / "unused.mp4",
            posture_analysis_job_id=uuid4(),
        )


def test_model_download_verifies_checksum(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model_bytes = b"verified-pose-model"
    source_path = tmp_path / "source.task"
    source_path.write_bytes(model_bytes)
    output_path = tmp_path / "target.task"
    expected_sha256 = hashlib.sha256(model_bytes).hexdigest()
    monkeypatch.setattr(download_pose_model, "MINIMUM_MODEL_BYTES", 1)

    downloaded = download_pose_model.download_model(
        output_path=output_path,
        model_url=source_path.as_uri(),
        expected_sha256=expected_sha256,
    )

    assert downloaded == output_path
    assert output_path.read_bytes() == model_bytes


def test_model_download_rejects_checksum_mismatch(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_path = tmp_path / "source.task"
    source_path.write_bytes(b"untrusted-pose-model")
    output_path = tmp_path / "target.task"
    monkeypatch.setattr(download_pose_model, "MINIMUM_MODEL_BYTES", 1)

    with pytest.raises(RuntimeError, match="checksum"):
        download_pose_model.download_model(
            output_path=output_path,
            model_url=source_path.as_uri(),
            expected_sha256="0" * 64,
        )

    assert not output_path.exists()


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
        exercise_key: str | None,
        analysis_side: str | None,
        video_bytes: bytes,
        declared_content_type: str | None,
        progress_callback: object = None,
    ) -> PostureAnalysisResult:
        del self, progress_callback
        assert posture_analysis_job_id == expected_job_id
        assert exercise_code == "squat"
        assert camera_view == "side"
        assert exercise_key is None
        assert analysis_side is None
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
            capabilities = await client.get(
                "/posture-analysis/capabilities",
                headers={
                    "Authorization": "Bearer posture-test-key",
                },
            )

        assert response.status_code == 200
        assert response.json()["posture_analysis_job_id"] == str(
            expected_job_id
        )
        assert unauthorized.status_code == 401
        assert capabilities.status_code == 200
        assert len(capabilities.json()["exercises"]) == 10

        operation = app.openapi()["paths"][
            "/posture-analysis/analyze"
        ]["post"]
        assert "multipart/form-data" in operation["requestBody"]["content"]
        assert operation["security"] == [{"HTTPBearer": []}]
        assert "/posture-analysis/capabilities" in app.openapi()["paths"]
    finally:
        PostureAnalysisService.analyze_video = original_analyze
        settings.ai_server_api_key = previous_key
        app.openapi_schema = None


def test_posture_analysis_router_contract() -> None:
    asyncio.run(_test_router_contract())
