from __future__ import annotations

import asyncio
from dataclasses import dataclass
import hashlib
import hmac
from math import acos, degrees, hypot, isfinite
from pathlib import Path
import os
import tempfile
from threading import BoundedSemaphore
from typing import Callable, Literal, Mapping, Protocol
from uuid import UUID

from app.core.config import Settings, get_settings
from app.schemas.posture_analysis import (
    PostureCapabilitiesResponse,
    PostureAnalysisProgress,
    PostureAnalysisResult,
    PostureAngle,
    PostureAssessment,
    PostureExerciseCapability,
    PostureFinding,
    PostureGuidanceStep,
    PostureKeypoint,
    PostureRepetition,
    PostureRoutineSuggestion,
)


SUPPORTED_EXERCISE_CODE = "squat"
SUPPORTED_CAMERA_VIEW = "side"

_INDEX_TO_JOINT_CODE = {
    0: "head",
    11: "left_shoulder",
    12: "right_shoulder",
    13: "left_elbow",
    14: "right_elbow",
    15: "left_wrist",
    16: "right_wrist",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
    29: "left_heel",
    30: "right_heel",
    31: "left_foot_index",
    32: "right_foot_index",
}


class PostureAnalysisError(ValueError):
    """클라이언트가 수정할 수 있는 자세 분석 입력·품질 오류."""


class PostureConfigurationError(RuntimeError):
    """모델 파일 또는 런타임 의존성이 준비되지 않은 경우."""


class PostureModelError(RuntimeError):
    """자세 추론 런타임이 정상적으로 동작하지 않은 경우."""


@dataclass(frozen=True, slots=True)
class PosePoint:
    x: float
    y: float
    confidence: float


@dataclass(frozen=True, slots=True)
class PoseFrame:
    timestamp_ms: int
    landmarks: dict[str, PosePoint]


@dataclass(frozen=True, slots=True)
class PoseVideoSample:
    frames: list[PoseFrame]
    sampled_frame_count: int
    duration_ms: int


@dataclass(frozen=True, slots=True)
class _RepetitionWindow:
    start_index: int
    keyframe_index: int
    end_index: int


@dataclass(frozen=True, slots=True)
class _MeasuredRepetition:
    response: PostureRepetition
    torso_lean: float
    knee_flexion: float
    heel_lifted: bool


@dataclass(frozen=True, slots=True)
class _ExerciseDescriptor:
    exercise_code: str
    display_name_ko: str
    camera_view: Literal["side", "front"]
    validation_status: Literal["validated", "experimental"]
    rule_version: str
    catalog_exercise_keys: tuple[str, ...]
    capture_instructions: tuple[str, ...]
    limitations: tuple[str, ...]
    analysis_side_required: bool = False


@dataclass(frozen=True, slots=True)
class _AngleRule:
    angle_code: str
    calculation: Literal[
        "joint",
        "torso_lean",
        "body_alignment",
        "upper_arm_drift",
        "joint_asymmetry",
    ]
    joints: tuple[str, str, str] | None
    target_min_degrees: float | None
    target_max_degrees: float | None
    penalty_per_degree: float
    maximum_penalty: float
    finding_code: str
    finding_title: str
    finding_explanation: str
    guidance_steps: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class _CyclicExerciseProfile:
    descriptor: _ExerciseDescriptor
    required_joints: tuple[str, ...]
    bilateral: bool
    primary_rule: _AngleRule
    additional_rules: tuple[_AngleRule, ...]
    motion_direction: Literal["decrease", "increase"]
    rest_threshold_degrees: float
    activation_threshold_degrees: float
    required_peak_degrees: float
    minimum_repetition_duration_ms: int = 400
    completion_rule: _AngleRule | None = None
    completion_min_degrees: float | None = None
    completion_max_degrees: float | None = None


@dataclass(frozen=True, slots=True)
class _MeasuredCyclicRepetition:
    response: PostureRepetition
    failed_rule_codes: tuple[str, ...]


class _PostureAnalyzer(Protocol):
    descriptor: _ExerciseDescriptor

    def analyze(
        self,
        *,
        posture_analysis_job_id: UUID,
        sample: PoseVideoSample,
        analysis_side: Literal["left", "right"] | None = None,
        progress_callback: ProgressCallback | None = None,
    ) -> PostureAnalysisResult: ...


_SQUAT_DESCRIPTOR = _ExerciseDescriptor(
    exercise_code="squat",
    display_name_ko="스쿼트",
    camera_view="side",
    validation_status="validated",
    rule_version="squat-side-rules-v2",
    catalog_exercise_keys=(
        "ex_96dcb551b33a8e",
        "ex_3fb808cb84e33d",
    ),
    capture_instructions=(
        "전신과 양발이 모두 보이도록 측면에서 촬영하세요.",
        "선 자세로 시작해 2~5회 수행한 뒤 선 자세로 끝내세요.",
    ),
    limitations=(
        "무릎의 정면 외반과 발 압력은 측면 단일 영상으로 판단하지 않습니다.",
    ),
    analysis_side_required=False,
)


ProgressCallback = Callable[[PostureAnalysisProgress], None]
_POSTURE_ANALYSIS_SLOTS = BoundedSemaphore(
    get_settings().posture_max_concurrent_analyses
)


class MediaPipeVideoPoseExtractor:
    """OpenCV로 영상을 읽고 MediaPipe 33개 관절점을 추출한다."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.model_path = Path(
            settings.posture_model_path
        ).expanduser()

    def extract(
        self,
        video_path: Path,
        *,
        posture_analysis_job_id: UUID,
        progress_callback: ProgressCallback | None = None,
    ) -> PoseVideoSample:
        if not self.model_path.is_file():
            raise PostureConfigurationError(
                "Pose model is not configured. Run "
                "app/scripts/download_pose_model.py or set "
                "POSTURE_MODEL_PATH."
            )

        try:
            actual_model_sha256 = _file_sha256(self.model_path)
        except OSError as exc:
            raise PostureConfigurationError(
                "Pose model file cannot be read."
            ) from exc
        if not hmac.compare_digest(
            actual_model_sha256,
            self.settings.posture_model_sha256.lower(),
        ):
            raise PostureConfigurationError(
                "Pose model checksum does not match POSTURE_MODEL_SHA256."
            )

        try:
            import cv2
            import mediapipe as mp
        except ImportError as exc:
            raise PostureConfigurationError(
                "MediaPipe and OpenCV runtime dependencies are missing."
            ) from exc

        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            capture.release()
            raise PostureAnalysisError(
                "업로드한 영상을 디코딩할 수 없습니다."
            )

        try:
            fps = float(capture.get(cv2.CAP_PROP_FPS))
            frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            if not isfinite(fps) or fps <= 0:
                raise PostureAnalysisError(
                    "영상의 프레임 속도를 확인할 수 없습니다."
                )

            if frame_count > 0:
                duration_seconds = frame_count / fps
                if duration_seconds > self.settings.posture_video_max_seconds:
                    raise PostureAnalysisError(
                        "영상 길이가 허용 범위를 초과했습니다."
                    )

            sample_stride = max(
                1,
                round(fps / self.settings.posture_target_fps),
            )

            options = mp.tasks.vision.PoseLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(
                    model_asset_path=str(self.model_path.resolve())
                ),
                running_mode=mp.tasks.vision.RunningMode.VIDEO,
                num_poses=1,
                min_pose_detection_confidence=(
                    self.settings.posture_min_landmark_confidence
                ),
                min_pose_presence_confidence=(
                    self.settings.posture_min_landmark_confidence
                ),
                min_tracking_confidence=(
                    self.settings.posture_min_landmark_confidence
                ),
                output_segmentation_masks=False,
            )

            pose_frames: list[PoseFrame] = []
            sampled_frame_count = 0
            frame_index = 0
            last_timestamp_ms = -1

            try:
                with mp.tasks.vision.PoseLandmarker.create_from_options(
                    options
                ) as landmarker:
                    while True:
                        read_ok, frame = capture.read()
                        if not read_ok:
                            break

                        if frame_index % sample_stride != 0:
                            frame_index += 1
                            continue

                        timestamp_ms = max(
                            last_timestamp_ms + 1,
                            round(frame_index * 1000 / fps),
                        )
                        if (
                            timestamp_ms
                            > self.settings.posture_video_max_seconds * 1000
                        ):
                            raise PostureAnalysisError(
                                "영상 길이가 허용 범위를 초과했습니다."
                            )

                        last_timestamp_ms = timestamp_ms
                        sampled_frame_count += 1

                        rgb_frame = cv2.cvtColor(
                            frame,
                            cv2.COLOR_BGR2RGB,
                        )
                        media_pipe_image = mp.Image(
                            image_format=mp.ImageFormat.SRGB,
                            data=rgb_frame,
                        )
                        result = landmarker.detect_for_video(
                            media_pipe_image,
                            timestamp_ms,
                        )

                        if result.pose_landmarks:
                            landmarks = self._convert_landmarks(
                                result.pose_landmarks[0]
                            )
                            pose_frames.append(
                                PoseFrame(
                                    timestamp_ms=timestamp_ms,
                                    landmarks=landmarks,
                                )
                            )

                        if progress_callback and sampled_frame_count % 10 == 0:
                            estimated_total = max(
                                sampled_frame_count,
                                (
                                    (frame_count + sample_stride - 1)
                                    // sample_stride
                                    if frame_count > 0
                                    else sampled_frame_count
                                ),
                            )
                            progress_callback(
                                PostureAnalysisProgress(
                                    posture_analysis_job_id=(
                                        posture_analysis_job_id
                                    ),
                                    analysis_stage="joint_detection",
                                    progress_percent=min(
                                        70.0,
                                        70.0
                                        * sampled_frame_count
                                        / estimated_total,
                                    ),
                                    processed_frames=sampled_frame_count,
                                    total_frames=estimated_total,
                                    detected_repetitions=0,
                                )
                            )

                        frame_index += 1
            except PostureAnalysisError:
                raise
            except Exception as exc:
                raise PostureModelError(
                    "Pose landmark inference failed."
                ) from exc

            if sampled_frame_count == 0:
                raise PostureAnalysisError(
                    "분석할 수 있는 영상 프레임이 없습니다."
                )

            return PoseVideoSample(
                frames=pose_frames,
                sampled_frame_count=sampled_frame_count,
                duration_ms=max(last_timestamp_ms, 0),
            )
        finally:
            capture.release()

    @staticmethod
    def _convert_landmarks(
        landmarks: list[object],
    ) -> dict[str, PosePoint]:
        converted: dict[str, PosePoint] = {}

        for index, joint_code in _INDEX_TO_JOINT_CODE.items():
            landmark = landmarks[index]
            confidence_values = [
                float(value)
                for value in (
                    getattr(landmark, "visibility", None),
                    getattr(landmark, "presence", None),
                )
                if value is not None and isfinite(float(value))
            ]
            confidence = (
                min(confidence_values)
                if confidence_values
                else 0.0
            )
            converted[joint_code] = PosePoint(
                x=float(getattr(landmark, "x")),
                y=float(getattr(landmark, "y")),
                confidence=_clamp(confidence, 0.0, 1.0),
            )

        return converted


class SquatPostureAnalyzer:
    """측면 스쿼트 영상에 결정론적인 회차·각도·점수 정책을 적용한다."""

    descriptor = _SQUAT_DESCRIPTOR

    _STANDING_ANGLE = 155.0
    _DESCENT_ANGLE = 145.0
    _MINIMUM_REP_DEPTH_ANGLE = 125.0
    _TARGET_DEPTH_MAX_ANGLE = 110.0
    _TARGET_TORSO_LEAN_MAX = 45.0
    _MINIMUM_REP_DURATION_MS = 400
    _HEEL_LIFT_RATIO = 0.18
    _SMOOTHING_ALPHA = 0.35

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def analyze(
        self,
        *,
        posture_analysis_job_id: UUID,
        sample: PoseVideoSample,
        analysis_side: Literal["left", "right"] | None = None,
        progress_callback: ProgressCallback | None = None,
    ) -> PostureAnalysisResult:
        side = analysis_side or self._select_visible_side(sample.frames)
        prepared_frames = self._prepare_frames(
            sample=sample,
            side=side,
        )
        windows = self._find_repetition_windows(
            prepared_frames,
            side=side,
        )
        if not windows:
            raise PostureAnalysisError(
                "완료된 스쿼트 회차를 인식하지 못했습니다. "
                "전신이 보이는 측면 영상을 다시 촬영해 주세요."
            )

        if progress_callback:
            progress_callback(
                PostureAnalysisProgress(
                    posture_analysis_job_id=posture_analysis_job_id,
                    analysis_stage="posture_scoring",
                    progress_percent=85,
                    processed_frames=sample.sampled_frame_count,
                    total_frames=sample.sampled_frame_count,
                    detected_repetitions=len(windows),
                )
            )

        measured = [
            self._measure_repetition(
                repetition_number=index,
                window=window,
                frames=prepared_frames,
                side=side,
            )
            for index, window in enumerate(windows, start=1)
        ]
        findings, suggestions = self._build_findings(measured)
        overall_score = round(
            sum(item.response.score for item in measured) / len(measured),
        )
        correction_titles = [
            item.title
            for item in findings
            if item.finding_type == "correction"
        ]
        verdict = (
            "needs_correction"
            if correction_titles
            else "within_current_rules"
        )
        if correction_titles:
            summary = (
                f"스쿼트 {len(measured)}회를 분석했습니다. "
                f"우선 확인할 교정 항목: {', '.join(correction_titles)}."
            )
        else:
            summary = (
                f"스쿼트 {len(measured)}회에서 깊이, 상체 기울기와 "
                "발뒤꿈치 접촉이 안정적으로 확인됐습니다."
            )

        result = PostureAnalysisResult(
            schema_version="1.1",
            posture_analysis_job_id=posture_analysis_job_id,
            exercise_code=SUPPORTED_EXERCISE_CODE,
            camera_view=SUPPORTED_CAMERA_VIEW,
            model_version=_compose_model_version(
                self.settings,
                self.descriptor.rule_version,
            ),
            assessment=PostureAssessment(
                overall_score=overall_score,
                passing_score=None,
                verdict=verdict,
                repetition_count=len(measured),
                summary=summary,
            ),
            repetitions=[item.response for item in measured],
            findings=findings,
            routine_suggestions=suggestions,
        )

        if progress_callback:
            progress_callback(
                PostureAnalysisProgress(
                    posture_analysis_job_id=posture_analysis_job_id,
                    analysis_stage="result_summary",
                    progress_percent=100,
                    processed_frames=sample.sampled_frame_count,
                    total_frames=sample.sampled_frame_count,
                    detected_repetitions=len(windows),
                )
            )

        return result

    def _select_visible_side(
        self,
        frames: list[PoseFrame],
    ) -> Literal["left", "right"]:
        return _select_visible_side(
            frames,
            joint_names=(
                "shoulder",
                "hip",
                "knee",
                "ankle",
                "heel",
                "foot_index",
            ),
        )

    def _prepare_frames(
        self,
        *,
        sample: PoseVideoSample,
        side: Literal["left", "right"],
    ) -> list[PoseFrame]:
        return _prepare_frames_for_analysis(
            sample=sample,
            settings=self.settings,
            required_joint_names=(
                "shoulder",
                "hip",
                "knee",
                "ankle",
                "heel",
                "foot_index",
            ),
            side=side,
            bilateral=False,
            smoothing_alpha=self._SMOOTHING_ALPHA,
            exercise_name="스쿼트",
        )

    def _smooth_frames(
        self,
        frames: list[PoseFrame],
    ) -> list[PoseFrame]:
        return _smooth_pose_frames(
            frames,
            smoothing_alpha=self._SMOOTHING_ALPHA,
        )

    def _find_repetition_windows(
        self,
        frames: list[PoseFrame],
        *,
        side: Literal["left", "right"],
    ) -> list[_RepetitionWindow]:
        hip_code = f"{side}_hip"
        knee_code = f"{side}_knee"
        ankle_code = f"{side}_ankle"

        windows: list[_RepetitionWindow] = []
        last_standing_index: int | None = None
        start_index: int | None = None
        minimum_index: int | None = None
        minimum_angle = 180.0
        previous_timestamp_ms: int | None = None

        for index, frame in enumerate(frames):
            if (
                previous_timestamp_ms is not None
                and frame.timestamp_ms - previous_timestamp_ms > 500
            ):
                last_standing_index = None
                start_index = None
                minimum_index = None
                minimum_angle = 180.0
            previous_timestamp_ms = frame.timestamp_ms

            knee_angle = _joint_angle(
                frame.landmarks[hip_code],
                frame.landmarks[knee_code],
                frame.landmarks[ankle_code],
            )
            if knee_angle is None:
                continue

            if start_index is None:
                if knee_angle >= self._STANDING_ANGLE:
                    last_standing_index = index
                    continue
                if (
                    last_standing_index is not None
                    and knee_angle <= self._DESCENT_ANGLE
                ):
                    start_index = last_standing_index
                    minimum_index = index
                    minimum_angle = knee_angle
                continue

            if knee_angle < minimum_angle:
                minimum_angle = knee_angle
                minimum_index = index

            if knee_angle < self._STANDING_ANGLE:
                continue

            duration_ms = (
                frame.timestamp_ms
                - frames[start_index].timestamp_ms
            )
            if (
                minimum_index is not None
                and minimum_angle <= self._MINIMUM_REP_DEPTH_ANGLE
                and duration_ms >= self._MINIMUM_REP_DURATION_MS
            ):
                windows.append(
                    _RepetitionWindow(
                        start_index=start_index,
                        keyframe_index=minimum_index,
                        end_index=index,
                    )
                )
                if len(windows) > 20:
                    raise PostureAnalysisError(
                        "한 영상에서는 스쿼트 회차를 최대 20회까지 "
                        "분석할 수 있습니다."
                    )

            last_standing_index = index
            start_index = None
            minimum_index = None
            minimum_angle = 180.0

        return windows

    def _measure_repetition(
        self,
        *,
        repetition_number: int,
        window: _RepetitionWindow,
        frames: list[PoseFrame],
        side: Literal["left", "right"],
    ) -> _MeasuredRepetition:
        frame = frames[window.keyframe_index]
        shoulder = frame.landmarks[f"{side}_shoulder"]
        hip = frame.landmarks[f"{side}_hip"]
        knee = frame.landmarks[f"{side}_knee"]
        ankle = frame.landmarks[f"{side}_ankle"]
        foot_index = frame.landmarks[f"{side}_foot_index"]

        torso_lean = _angle_from_vertical(shoulder, hip)
        knee_flexion = _required_angle(hip, knee, ankle)
        heel_lifted = self._heel_lifted(
            frames[window.start_index : window.end_index + 1],
            side=side,
        )

        score = 100.0
        score -= min(
            25.0,
            max(0.0, torso_lean - self._TARGET_TORSO_LEAN_MAX) * 1.5,
        )
        score -= min(
            30.0,
            max(
                0.0,
                knee_flexion - self._TARGET_DEPTH_MAX_ANGLE,
            )
            * 1.2,
        )
        if heel_lifted:
            score -= 20.0
        score = round(_clamp(score, 0.0, 100.0))

        response = PostureRepetition(
            repetition_number=repetition_number,
            start_offset_ms=frames[window.start_index].timestamp_ms,
            keyframe_offset_ms=frame.timestamp_ms,
            end_offset_ms=frames[window.end_index].timestamp_ms,
            score=score,
            keypoints=self._build_keypoints(frame, side=side),
            angles=[
                PostureAngle(
                    angle_code="torso_lean",
                    measured_degrees=round(torso_lean, 1),
                    target_min_degrees=None,
                    target_max_degrees=self._TARGET_TORSO_LEAN_MAX,
                ),
                PostureAngle(
                    angle_code="knee_flexion",
                    measured_degrees=round(knee_flexion, 1),
                    target_min_degrees=None,
                    target_max_degrees=self._TARGET_DEPTH_MAX_ANGLE,
                ),
            ],
        )

        return _MeasuredRepetition(
            response=response,
            torso_lean=torso_lean,
            knee_flexion=knee_flexion,
            heel_lifted=heel_lifted,
        )

    def _heel_lifted(
        self,
        frames: list[PoseFrame],
        *,
        side: Literal["left", "right"],
    ) -> bool:
        ratios: list[float] = []
        for frame in frames:
            knee = frame.landmarks[f"{side}_knee"]
            ankle = frame.landmarks[f"{side}_ankle"]
            heel = frame.landmarks[f"{side}_heel"]
            foot = frame.landmarks[f"{side}_foot_index"]
            lower_leg_length = hypot(
                knee.x - ankle.x,
                knee.y - ankle.y,
            )
            if lower_leg_length <= 1e-6:
                continue
            ratios.append(
                max(0.0, foot.y - heel.y) / lower_leg_length
            )

        return bool(ratios) and max(ratios) > self._HEEL_LIFT_RATIO

    def _build_keypoints(
        self,
        frame: PoseFrame,
        *,
        side: Literal["left", "right"],
    ) -> list[PostureKeypoint]:
        return _build_schema_keypoints(
            frame,
            settings=self.settings,
            joint_names=(
                "shoulder",
                "elbow",
                "wrist",
                "hip",
                "knee",
                "ankle",
                "heel",
                "foot_index",
            ),
            side=side,
            bilateral=False,
        )

    def _build_findings(
        self,
        repetitions: list[_MeasuredRepetition],
    ) -> tuple[list[PostureFinding], list[PostureRoutineSuggestion]]:
        findings: list[PostureFinding] = []

        torso_reps = [
            item.response.repetition_number
            for item in repetitions
            if item.torso_lean > self._TARGET_TORSO_LEAN_MAX
        ]
        depth_reps = [
            item.response.repetition_number
            for item in repetitions
            if item.knee_flexion > self._TARGET_DEPTH_MAX_ANGLE
        ]
        heel_reps = [
            item.response.repetition_number
            for item in repetitions
            if item.heel_lifted
        ]

        def add_correction(
            *,
            repetition_numbers: list[int],
            finding_code: str,
            title: str,
            explanation: str,
            instructions: list[str],
        ) -> None:
            if not repetition_numbers:
                return
            display_order = len(findings) + 1
            findings.append(
                PostureFinding(
                    display_order=display_order,
                    finding_type="correction",
                    finding_code=finding_code,
                    title=title,
                    explanation=explanation,
                    repetition_start=min(repetition_numbers),
                    repetition_end=max(repetition_numbers),
                    guidance_steps=[
                        PostureGuidanceStep(
                            sequence_order=index,
                            instruction=instruction,
                        )
                        for index, instruction in enumerate(
                            instructions,
                            start=1,
                        )
                    ],
                )
            )
        add_correction(
            repetition_numbers=torso_reps,
            finding_code="excessive_torso_lean",
            title="상체가 많이 숙여져요",
            explanation=(
                "최저점에서 몸통 기울기가 현재 기준인 45도를 넘었습니다."
            ),
            instructions=[
                "가슴을 편 상태에서 시선을 앞쪽 바닥에 두세요.",
                "통증이 없다면 깊이를 줄여 몸통을 안정시킨 뒤 다시 시도하세요.",
            ],
        )
        add_correction(
            repetition_numbers=depth_reps,
            finding_code="insufficient_squat_depth",
            title="스쿼트 깊이가 부족해요",
            explanation=(
                "최저점의 무릎 각도가 현재 깊이 기준인 110도보다 큽니다."
            ),
            instructions=[
                "발 전체로 바닥을 누르며 엉덩이를 뒤로 내려보세요.",
                "통증 없는 범위에서만 조금씩 깊이를 늘리세요.",
            ],
        )
        add_correction(
            repetition_numbers=heel_reps,
            finding_code="heel_lift",
            title="발뒤꿈치가 들려요",
            explanation=(
                "동작 중 발뒤꿈치와 발끝의 높이 차이가 커졌습니다."
            ),
            instructions=[
                "발뒤꿈치와 엄지발가락 뿌리를 함께 바닥에 눌러주세요.",
                "깊이를 줄여 발 전체 접촉을 유지한 뒤 다시 시도하세요.",
            ],
        )

        if not heel_reps:
            findings.append(
                PostureFinding(
                    display_order=len(findings) + 1,
                    finding_type="positive",
                    finding_code="stable_heel_contact",
                    title="발뒤꿈치 접촉이 안정적이에요",
                    explanation=(
                        "인식된 모든 회차에서 발뒤꿈치 들림 기준을 넘지 않았습니다."
                    ),
                    repetition_start=1,
                    repetition_end=len(repetitions),
                    guidance_steps=[],
                )
            )

        if not torso_reps and not depth_reps:
            findings.append(
                PostureFinding(
                    display_order=len(findings) + 1,
                    finding_type="positive",
                    finding_code="stable_squat_depth",
                    title="상체와 스쿼트 깊이가 안정적이에요",
                    explanation=(
                        "인식된 모든 회차가 현재 몸통 기울기와 깊이 기준 안에 있습니다."
                    ),
                    repetition_start=1,
                    repetition_end=len(repetitions),
                    guidance_steps=[],
                )
            )

        # 현재 자세 분석 요청에는 사용 가능 장비·장소·성별 정보가 없다.
        # 구매 운동 자산 CSV 밖의 운동명을 만들지 않도록 보조운동 추천은
        # exercise_key 계약이 확정될 때까지 비워 둔다.
        return findings, []


def _make_descriptor(
    *,
    exercise_code: str,
    display_name_ko: str,
    camera_view: Literal["side", "front"],
    rule_version: str,
    catalog_exercise_keys: tuple[str, ...],
    capture_instructions: tuple[str, ...],
    limitations: tuple[str, ...],
    analysis_side_required: bool = False,
) -> _ExerciseDescriptor:
    return _ExerciseDescriptor(
        exercise_code=exercise_code,
        display_name_ko=display_name_ko,
        camera_view=camera_view,
        validation_status="experimental",
        rule_version=rule_version,
        catalog_exercise_keys=catalog_exercise_keys,
        capture_instructions=capture_instructions,
        limitations=limitations,
        analysis_side_required=analysis_side_required,
    )


def _make_rule(
    *,
    angle_code: str,
    calculation: Literal[
        "joint",
        "torso_lean",
        "body_alignment",
        "upper_arm_drift",
        "joint_asymmetry",
    ] = "joint",
    joints: tuple[str, str, str] | None = None,
    target_min_degrees: float | None = None,
    target_max_degrees: float | None = None,
    penalty_per_degree: float = 1.0,
    maximum_penalty: float = 30.0,
    finding_code: str,
    finding_title: str,
    finding_explanation: str,
    guidance_steps: tuple[str, ...],
) -> _AngleRule:
    if target_min_degrees is None and target_max_degrees is None:
        raise ValueError(f"Angle rule has no target: {angle_code}")
    if (
        target_min_degrees is not None
        and target_max_degrees is not None
        and target_min_degrees > target_max_degrees
    ):
        raise ValueError(f"Invalid angle target range: {angle_code}")
    return _AngleRule(
        angle_code=angle_code,
        calculation=calculation,
        joints=joints,
        target_min_degrees=target_min_degrees,
        target_max_degrees=target_max_degrees,
        penalty_per_degree=penalty_per_degree,
        maximum_penalty=maximum_penalty,
        finding_code=finding_code,
        finding_title=finding_title,
        finding_explanation=finding_explanation,
        guidance_steps=guidance_steps,
    )


_PUSH_UP_PRIMARY_RULE = _make_rule(
    angle_code="elbow_flexion",
    joints=("shoulder", "elbow", "wrist"),
    target_max_degrees=105.0,
    finding_code="insufficient_push_up_depth",
    finding_title="푸시업 가동 범위를 확인해 주세요",
    finding_explanation=(
        "최저점의 팔꿈치 각도가 현재 깊이 기준인 105도보다 큽니다."
    ),
    guidance_steps=(
        "몸통 정렬을 유지할 수 있는 범위에서 천천히 내려가세요.",
        "통증이 있으면 깊이를 늘리지 말고 동작을 중단하세요.",
    ),
)

_BODY_ALIGNMENT_RULE = _make_rule(
    angle_code="body_alignment",
    calculation="body_alignment",
    target_min_degrees=165.0,
    penalty_per_degree=1.5,
    maximum_penalty=25.0,
    finding_code="push_up_body_alignment",
    finding_title="머리부터 발목까지 정렬을 유지해 주세요",
    finding_explanation=(
        "최저점에서 어깨·골반·발목 정렬 각도가 현재 기준인 "
        "165도보다 작습니다."
    ),
    guidance_steps=(
        "복부와 엉덩이에 힘을 주고 몸통을 한 선으로 유지하세요.",
        "정렬이 무너지면 반복 횟수나 깊이를 줄이세요.",
    ),
)

_HIP_EXTENSION_RULE = _make_rule(
    angle_code="hip_extension",
    joints=("shoulder", "hip", "knee"),
    target_min_degrees=160.0,
    finding_code="insufficient_hip_extension",
    finding_title="엉덩이를 조금 더 펴 주세요",
    finding_explanation=(
        "상단의 고관절 각도가 현재 신전 기준인 160도보다 작습니다."
    ),
    guidance_steps=(
        "발 전체를 바닥에 두고 엉덩이를 천천히 들어 올리세요.",
        "허리를 꺾지 말고 통증 없는 범위에서만 수행하세요.",
    ),
)

_BRIDGE_KNEE_RULE = _make_rule(
    angle_code="knee_flexion",
    joints=("hip", "knee", "ankle"),
    target_min_degrees=70.0,
    target_max_degrees=125.0,
    penalty_per_degree=0.8,
    maximum_penalty=15.0,
    finding_code="bridge_foot_position",
    finding_title="발 위치를 확인해 주세요",
    finding_explanation=(
        "상단의 무릎 각도가 현재 확인 범위인 70~125도를 벗어났습니다."
    ),
    guidance_steps=(
        "무릎과 발목이 편안한 범위가 되도록 발 위치를 조절하세요.",
    ),
)

_CURL_PRIMARY_RULE = _make_rule(
    angle_code="elbow_flexion",
    joints=("shoulder", "elbow", "wrist"),
    target_max_degrees=80.0,
    finding_code="insufficient_curl_range",
    finding_title="컬 수축 범위를 확인해 주세요",
    finding_explanation=(
        "최대 수축 지점의 팔꿈치 각도가 현재 기준인 80도보다 큽니다."
    ),
    guidance_steps=(
        "팔꿈치를 몸통 가까이에 두고 통제된 속도로 들어 올리세요.",
        "반동이 필요하면 중량이나 반복 속도를 낮추세요.",
    ),
)

_UPPER_ARM_DRIFT_RULE = _make_rule(
    angle_code="upper_arm_drift",
    calculation="upper_arm_drift",
    target_max_degrees=30.0,
    penalty_per_degree=1.2,
    maximum_penalty=20.0,
    finding_code="upper_arm_drift",
    finding_title="위팔의 흔들림을 줄여 주세요",
    finding_explanation=(
        "최대 수축 지점에서 위팔 기울기가 현재 기준인 30도를 넘었습니다."
    ),
    guidance_steps=(
        "어깨를 편안히 두고 팔꿈치 위치를 가능한 한 고정하세요.",
    ),
)

_CALF_PRIMARY_RULE = _make_rule(
    angle_code="ankle_flexion",
    joints=("knee", "ankle", "foot_index"),
    target_min_degrees=118.0,
    finding_code="insufficient_calf_raise_height",
    finding_title="뒤꿈치 상승 범위를 확인해 주세요",
    finding_explanation=(
        "정규화된 뒤꿈치 상승량 또는 상단 발목 각도가 현재 "
        "카프 레이즈 기준에 미치지 못했습니다."
    ),
    guidance_steps=(
        "벽을 가볍게 짚고 발 앞쪽으로 바닥을 누르며 천천히 올라가세요.",
        "균형이 흔들리면 상승 높이를 줄이세요.",
    ),
)

_STRAIGHT_KNEE_RULE = _make_rule(
    angle_code="knee_flexion",
    joints=("hip", "knee", "ankle"),
    target_min_degrees=155.0,
    penalty_per_degree=0.8,
    maximum_penalty=15.0,
    finding_code="calf_raise_knee_flexion",
    finding_title="무릎 굽힘을 줄여 주세요",
    finding_explanation=(
        "상단의 무릎 각도가 현재 기준인 155도보다 작습니다."
    ),
    guidance_steps=(
        "무릎을 잠그지는 말고 편안하게 편 상태를 유지하세요.",
    ),
)

_LUNGE_PRIMARY_RULE = _make_rule(
    angle_code="knee_flexion",
    joints=("hip", "knee", "ankle"),
    target_max_degrees=110.0,
    finding_code="insufficient_lunge_depth",
    finding_title="런지 깊이를 확인해 주세요",
    finding_explanation=(
        "최저점의 분석 다리 무릎 각도가 현재 기준인 110도보다 큽니다."
    ),
    guidance_steps=(
        "상체를 안정시킨 채 통증 없는 범위에서 천천히 내려가세요.",
        "균형이 불안하면 깊이보다 자세 제어를 우선하세요.",
    ),
)

_LUNGE_TORSO_RULE = _make_rule(
    angle_code="torso_lean",
    calculation="torso_lean",
    target_max_degrees=35.0,
    penalty_per_degree=1.2,
    maximum_penalty=20.0,
    finding_code="lunge_torso_lean",
    finding_title="런지 중 상체 기울기를 줄여 주세요",
    finding_explanation=(
        "최저점의 몸통 기울기가 현재 기준인 35도를 넘었습니다."
    ),
    guidance_steps=(
        "시선을 앞에 두고 몸통을 길게 세운 상태로 내려가세요.",
    ),
)

_SPLIT_SQUAT_PRIMARY_RULE = _make_rule(
    angle_code="knee_flexion",
    joints=("hip", "knee", "ankle"),
    target_max_degrees=110.0,
    finding_code="insufficient_split_squat_depth",
    finding_title="스플릿 스쿼트 깊이를 확인해 주세요",
    finding_explanation=(
        "최저점의 분석 다리 무릎 각도가 현재 기준인 110도보다 큽니다."
    ),
    guidance_steps=(
        "발 위치를 유지하고 통증 없는 범위에서 천천히 내려가세요.",
        "균형이 불안하면 깊이보다 자세 제어를 우선하세요.",
    ),
)

_SPLIT_SQUAT_TORSO_RULE = _make_rule(
    angle_code="torso_lean",
    calculation="torso_lean",
    target_max_degrees=35.0,
    penalty_per_degree=1.2,
    maximum_penalty=20.0,
    finding_code="split_squat_torso_lean",
    finding_title="스플릿 스쿼트 중 상체 기울기를 줄여 주세요",
    finding_explanation=(
        "최저점의 몸통 기울기가 현재 기준인 35도를 넘었습니다."
    ),
    guidance_steps=(
        "시선을 앞에 두고 몸통을 길게 세운 상태로 내려가세요.",
    ),
)

_JUMPING_JACK_PRIMARY_RULE = _make_rule(
    angle_code="shoulder_abduction",
    joints=("elbow", "shoulder", "hip"),
    target_min_degrees=140.0,
    finding_code="incomplete_jumping_jack_arm_range",
    finding_title="팔 올림 범위를 확인해 주세요",
    finding_explanation=(
        "상단의 어깨 벌림 각도가 현재 기준인 140도보다 작습니다."
    ),
    guidance_steps=(
        "양팔을 같은 속도로 올리고 어깨가 불편하면 범위를 줄이세요.",
    ),
)

_JUMPING_JACK_LEG_RULE = _make_rule(
    angle_code="leg_abduction",
    joints=("shoulder", "hip", "ankle"),
    target_max_degrees=155.0,
    finding_code="incomplete_jumping_jack_leg_range",
    finding_title="다리 벌림 범위를 확인해 주세요",
    finding_explanation=(
        "상단의 다리 벌림 각도가 현재 기준인 155도보다 큽니다."
    ),
    guidance_steps=(
        "양발을 같은 속도로 벌리고 착지할 때 무릎을 부드럽게 사용하세요.",
        "관절이 불편하면 점프 범위를 줄이거나 동작을 중단하세요.",
    ),
)

_JUMPING_JACK_ASYMMETRY_RULE = _make_rule(
    angle_code="bilateral_asymmetry",
    calculation="joint_asymmetry",
    joints=("elbow", "shoulder", "hip"),
    target_max_degrees=20.0,
    finding_code="jumping_jack_arm_asymmetry",
    finding_title="양팔 높이를 비슷하게 맞춰 주세요",
    finding_explanation=(
        "상단의 좌우 어깨 벌림 각도 차이가 현재 기준인 20도를 넘었습니다."
    ),
    guidance_steps=(
        "양팔을 같은 속도와 범위로 올려 보세요.",
    ),
)

_PRESS_PRIMARY_RULE = _make_rule(
    angle_code="elbow_flexion",
    joints=("shoulder", "elbow", "wrist"),
    target_min_degrees=155.0,
    finding_code="incomplete_shoulder_press_extension",
    finding_title="프레스 상단 범위를 확인해 주세요",
    finding_explanation=(
        "상단의 팔꿈치 각도가 현재 신전 기준인 155도보다 작습니다."
    ),
    guidance_steps=(
        "양팔을 같은 속도로 올리고 통제된 상태에서 내려오세요.",
        "어깨 통증이 있으면 동작을 중단하세요.",
    ),
)

_OVERHEAD_SHOULDER_RULE = _make_rule(
    angle_code="shoulder_abduction",
    joints=("elbow", "shoulder", "hip"),
    target_min_degrees=140.0,
    penalty_per_degree=0.8,
    maximum_penalty=20.0,
    finding_code="shoulder_press_overhead_range",
    finding_title="팔의 머리 위 위치를 확인해 주세요",
    finding_explanation=(
        "상단의 어깨 각도가 현재 머리 위 범위 기준인 140도보다 작습니다."
    ),
    guidance_steps=(
        "허리를 과하게 젖히지 않는 범위에서 팔을 위로 이동하세요.",
    ),
)

_PRESS_ASYMMETRY_RULE = _make_rule(
    angle_code="bilateral_asymmetry",
    calculation="joint_asymmetry",
    joints=("shoulder", "elbow", "wrist"),
    target_max_degrees=15.0,
    finding_code="shoulder_press_asymmetry",
    finding_title="양팔의 프레스 높이를 맞춰 주세요",
    finding_explanation=(
        "상단의 좌우 팔꿈치 각도 차이가 현재 기준인 15도를 넘었습니다."
    ),
    guidance_steps=(
        "양쪽 중량과 올리는 속도를 맞추고 한쪽이 뒤처지면 반복을 줄이세요.",
    ),
)

_LATERAL_RAISE_PRIMARY_RULE = _make_rule(
    angle_code="shoulder_abduction",
    joints=("elbow", "shoulder", "hip"),
    target_min_degrees=75.0,
    target_max_degrees=110.0,
    finding_code="lateral_raise_range",
    finding_title="레터럴 레이즈 높이를 확인해 주세요",
    finding_explanation=(
        "상단의 어깨 벌림 각도가 현재 확인 범위인 75~110도를 벗어났습니다."
    ),
    guidance_steps=(
        "반동 없이 팔을 어깨 높이 부근까지 천천히 올리세요.",
        "어깨가 불편하면 높이와 중량을 낮추세요.",
    ),
)

_LATERAL_RAISE_ELBOW_RULE = _make_rule(
    angle_code="elbow_flexion",
    joints=("shoulder", "elbow", "wrist"),
    target_min_degrees=145.0,
    penalty_per_degree=0.5,
    maximum_penalty=15.0,
    finding_code="lateral_raise_elbow_flexion",
    finding_title="팔꿈치 굽힘을 일정하게 유지해 주세요",
    finding_explanation=(
        "상단의 팔꿈치 각도가 현재 기준인 145도보다 작습니다."
    ),
    guidance_steps=(
        "팔꿈치를 살짝만 굽힌 상태로 각도를 일정하게 유지하세요.",
    ),
)

_LATERAL_RAISE_ASYMMETRY_RULE = _make_rule(
    angle_code="bilateral_asymmetry",
    calculation="joint_asymmetry",
    joints=("elbow", "shoulder", "hip"),
    target_max_degrees=15.0,
    finding_code="lateral_raise_asymmetry",
    finding_title="양팔 높이를 맞춰 주세요",
    finding_explanation=(
        "상단의 좌우 어깨 벌림 각도 차이가 현재 기준인 15도를 넘었습니다."
    ),
    guidance_steps=(
        "양팔을 같은 속도로 올리고 한쪽이 앞서면 중량을 낮추세요.",
    ),
)


_CYCLIC_EXERCISE_PROFILES = (
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="push_up",
            display_name_ko="푸시업",
            camera_view="side",
            rule_version="push-up-side-rules-v1",
            catalog_exercise_keys=("ex_f6c866501f5ac0",),
            capture_instructions=(
                "머리부터 발목까지 보이도록 측면에서 촬영하세요.",
                "팔을 편 자세로 시작해 2~5회 후 같은 자세로 끝내세요.",
            ),
            limitations=(
                "팔꿈치 벌어짐과 손 간격은 측면 영상으로 판단하지 않습니다.",
            ),
        ),
        required_joints=(
            "shoulder",
            "elbow",
            "wrist",
            "hip",
            "knee",
            "ankle",
        ),
        bilateral=False,
        primary_rule=_PUSH_UP_PRIMARY_RULE,
        additional_rules=(_BODY_ALIGNMENT_RULE,),
        motion_direction="decrease",
        rest_threshold_degrees=150.0,
        activation_threshold_degrees=130.0,
        required_peak_degrees=110.0,
    ),
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="glute_bridge",
            display_name_ko="글루트 브리지",
            camera_view="side",
            rule_version="glute-bridge-side-rules-v1",
            catalog_exercise_keys=("ex_1bb869dd7b0cc4",),
            capture_instructions=(
                "어깨부터 발목까지 보이도록 측면에서 촬영하세요.",
                "바닥 자세로 시작해 2~5회 후 바닥 자세로 끝내세요.",
            ),
            limitations=(
                "골반의 좌우 회전과 허리 분절 움직임은 판단하지 않습니다.",
            ),
        ),
        required_joints=("shoulder", "hip", "knee", "ankle"),
        bilateral=False,
        primary_rule=_HIP_EXTENSION_RULE,
        additional_rules=(_BRIDGE_KNEE_RULE,),
        motion_direction="increase",
        rest_threshold_degrees=145.0,
        activation_threshold_degrees=150.0,
        required_peak_degrees=158.0,
    ),
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="biceps_curl",
            display_name_ko="덤벨 바이셉 컬",
            camera_view="side",
            rule_version="biceps-curl-side-rules-v1",
            catalog_exercise_keys=("ex_a0b65fb7225b0a",),
            capture_instructions=(
                "분석할 팔의 어깨·팔꿈치·손목이 보이도록 측면에서 촬영하세요.",
                "팔을 편 자세로 시작해 3~5회 후 같은 자세로 끝내세요.",
            ),
            limitations=(
                "덤벨 중량, 그립과 손목 회전은 판단하지 않습니다.",
            ),
        ),
        required_joints=("shoulder", "elbow", "wrist", "hip"),
        bilateral=False,
        primary_rule=_CURL_PRIMARY_RULE,
        additional_rules=(_UPPER_ARM_DRIFT_RULE,),
        motion_direction="decrease",
        rest_threshold_degrees=145.0,
        activation_threshold_degrees=125.0,
        required_peak_degrees=100.0,
    ),
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="calf_raise",
            display_name_ko="벽 지지 카프 레이즈",
            camera_view="side",
            rule_version="calf-raise-side-rules-v1",
            catalog_exercise_keys=("ex_4da43055d05edf",),
            capture_instructions=(
                "무릎·발목·발끝이 보이도록 측면에서 촬영하세요.",
                "발바닥을 둔 자세로 시작해 3~5회 후 같은 자세로 끝내세요.",
            ),
            limitations=(
                "발 압력과 발목의 내번·외번은 판단하지 않습니다.",
            ),
        ),
        required_joints=("hip", "knee", "ankle", "heel", "foot_index"),
        bilateral=False,
        primary_rule=_CALF_PRIMARY_RULE,
        additional_rules=(_STRAIGHT_KNEE_RULE,),
        motion_direction="increase",
        rest_threshold_degrees=105.0,
        activation_threshold_degrees=112.0,
        required_peak_degrees=115.0,
    ),
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="lunge",
            display_name_ko="런지",
            camera_view="side",
            rule_version="lunge-side-rules-v1",
            catalog_exercise_keys=("ex_b34acd08bef11a",),
            capture_instructions=(
                "전신과 양발이 보이도록 측면에서 촬영하세요.",
                "같은 방향의 런지를 2~5회 수행하세요.",
            ),
            limitations=(
                "지정한 분석 다리만 평가하며 무릎 정면 외반은 판단하지 않습니다.",
            ),
            analysis_side_required=True,
        ),
        required_joints=("shoulder", "hip", "knee", "ankle"),
        bilateral=False,
        primary_rule=_LUNGE_PRIMARY_RULE,
        additional_rules=(_LUNGE_TORSO_RULE,),
        motion_direction="decrease",
        rest_threshold_degrees=155.0,
        activation_threshold_degrees=140.0,
        required_peak_degrees=125.0,
    ),
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="split_squat",
            display_name_ko="스플릿 스쿼트",
            camera_view="side",
            rule_version="split-squat-side-rules-v1",
            catalog_exercise_keys=("ex_65d9303b043376",),
            capture_instructions=(
                "전신과 양발이 보이도록 측면에서 촬영하세요.",
                "발 위치를 유지한 채 같은 다리로 2~5회 수행하세요.",
            ),
            limitations=(
                "지정한 분석 다리만 평가하며 실제 체중 분배는 판단하지 않습니다.",
            ),
            analysis_side_required=True,
        ),
        required_joints=("shoulder", "hip", "knee", "ankle"),
        bilateral=False,
        primary_rule=_SPLIT_SQUAT_PRIMARY_RULE,
        additional_rules=(_SPLIT_SQUAT_TORSO_RULE,),
        motion_direction="decrease",
        rest_threshold_degrees=155.0,
        activation_threshold_degrees=140.0,
        required_peak_degrees=125.0,
    ),
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="jumping_jack",
            display_name_ko="점핑 잭",
            camera_view="front",
            rule_version="jumping-jack-front-rules-v1",
            catalog_exercise_keys=("ex_3ecaba64725e87",),
            capture_instructions=(
                "전신이 보이도록 정면에서 고정 촬영하세요.",
                "팔을 내린 자세로 시작해 3~5회 후 같은 자세로 끝내세요.",
            ),
            limitations=(
                "착지 충격과 발 압력은 2D 영상으로 판단하지 않습니다.",
            ),
        ),
        required_joints=("shoulder", "elbow", "hip", "knee", "ankle"),
        bilateral=True,
        primary_rule=_JUMPING_JACK_PRIMARY_RULE,
        additional_rules=(
            _JUMPING_JACK_LEG_RULE,
            _JUMPING_JACK_ASYMMETRY_RULE,
        ),
        motion_direction="increase",
        rest_threshold_degrees=35.0,
        activation_threshold_degrees=70.0,
        required_peak_degrees=120.0,
        minimum_repetition_duration_ms=300,
        completion_rule=_JUMPING_JACK_LEG_RULE,
        completion_max_degrees=170.0,
    ),
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="shoulder_press",
            display_name_ko="덤벨 숄더 프레스",
            camera_view="front",
            rule_version="shoulder-press-front-rules-v1",
            catalog_exercise_keys=("ex_b81e8a03ab0cb0",),
            capture_instructions=(
                "양쪽 어깨·팔꿈치·손목이 보이도록 정면에서 촬영하세요.",
                "덤벨을 내린 자세로 시작해 2~5회 후 같은 자세로 끝내세요.",
            ),
            limitations=(
                "허리 과신전과 견갑 움직임은 정면 단일 영상으로 판단하지 않습니다.",
            ),
        ),
        required_joints=("shoulder", "elbow", "wrist", "hip"),
        bilateral=True,
        primary_rule=_PRESS_PRIMARY_RULE,
        additional_rules=(
            _OVERHEAD_SHOULDER_RULE,
            _PRESS_ASYMMETRY_RULE,
        ),
        motion_direction="increase",
        rest_threshold_degrees=120.0,
        activation_threshold_degrees=135.0,
        required_peak_degrees=150.0,
    ),
    _CyclicExerciseProfile(
        descriptor=_make_descriptor(
            exercise_code="lateral_raise",
            display_name_ko="덤벨 레터럴 레이즈",
            camera_view="front",
            rule_version="lateral-raise-front-rules-v1",
            catalog_exercise_keys=("ex_f830e9dd981059",),
            capture_instructions=(
                "양팔과 상체가 보이도록 정면에서 촬영하세요.",
                "팔을 내린 자세로 시작해 2~5회 후 같은 자세로 끝내세요.",
            ),
            limitations=(
                "어깨 회전과 견갑 움직임은 2D 영상으로 판단하지 않습니다.",
            ),
        ),
        required_joints=("shoulder", "elbow", "wrist", "hip"),
        bilateral=True,
        primary_rule=_LATERAL_RAISE_PRIMARY_RULE,
        additional_rules=(
            _LATERAL_RAISE_ELBOW_RULE,
            _LATERAL_RAISE_ASYMMETRY_RULE,
        ),
        motion_direction="increase",
        rest_threshold_degrees=35.0,
        activation_threshold_degrees=55.0,
        required_peak_degrees=70.0,
    ),
)


class CyclicPostureAnalyzer:
    """반복형 동작의 각도 주기와 운동별 판정 규칙을 적용한다."""

    _SMOOTHING_ALPHA = 0.35

    def __init__(
        self,
        settings: Settings,
        profile: _CyclicExerciseProfile,
    ) -> None:
        self.settings = settings
        self.profile = profile
        self.descriptor = profile.descriptor

    def analyze(
        self,
        *,
        posture_analysis_job_id: UUID,
        sample: PoseVideoSample,
        analysis_side: Literal["left", "right"] | None = None,
        progress_callback: ProgressCallback | None = None,
    ) -> PostureAnalysisResult:
        side: Literal["left", "right"] | None = None
        if self.descriptor.camera_view == "side":
            side = analysis_side or _select_visible_side(
                sample.frames,
                joint_names=self.profile.required_joints,
            )

        frames = _prepare_frames_for_analysis(
            sample=sample,
            settings=self.settings,
            required_joint_names=self.profile.required_joints,
            side=side,
            bilateral=self.profile.bilateral,
            smoothing_alpha=self._SMOOTHING_ALPHA,
            exercise_name=self.descriptor.display_name_ko,
        )
        windows = self._find_repetition_windows(frames, side=side)
        if not windows:
            raise PostureAnalysisError(
                f"완료된 {self.descriptor.display_name_ko} 회차를 "
                "인식하지 못했습니다. 촬영 안내에 맞춰 다시 촬영해 주세요."
            )

        if progress_callback:
            progress_callback(
                PostureAnalysisProgress(
                    posture_analysis_job_id=posture_analysis_job_id,
                    analysis_stage="posture_scoring",
                    progress_percent=85,
                    processed_frames=sample.sampled_frame_count,
                    total_frames=sample.sampled_frame_count,
                    detected_repetitions=len(windows),
                )
            )

        measured = [
            self._measure_repetition(
                repetition_number=index,
                window=window,
                frames=frames,
                side=side,
            )
            for index, window in enumerate(windows, start=1)
        ]
        findings = self._build_findings(measured)
        correction_titles = [
            finding.title
            for finding in findings
            if finding.finding_type == "correction"
        ]
        verdict = (
            "needs_correction"
            if correction_titles
            else "within_current_rules"
        )
        overall_score = round(
            sum(item.response.score for item in measured) / len(measured)
        )
        if correction_titles:
            summary = (
                f"{self.descriptor.display_name_ko} {len(measured)}회를 "
                f"분석했습니다. 우선 확인할 교정 항목: "
                f"{', '.join(correction_titles)}."
            )
        else:
            summary = (
                f"{self.descriptor.display_name_ko} {len(measured)}회가 "
                "현재 구현된 각도 규칙 안에서 확인됐습니다."
            )

        result = PostureAnalysisResult(
            schema_version="1.1",
            posture_analysis_job_id=posture_analysis_job_id,
            exercise_code=self.descriptor.exercise_code,
            camera_view=self.descriptor.camera_view,
            model_version=_compose_model_version(
                self.settings,
                self.descriptor.rule_version,
            ),
            assessment=PostureAssessment(
                overall_score=overall_score,
                passing_score=None,
                verdict=verdict,
                repetition_count=len(measured),
                summary=summary,
            ),
            repetitions=[item.response for item in measured],
            findings=findings,
            routine_suggestions=[],
        )

        if progress_callback:
            progress_callback(
                PostureAnalysisProgress(
                    posture_analysis_job_id=posture_analysis_job_id,
                    analysis_stage="result_summary",
                    progress_percent=100,
                    processed_frames=sample.sampled_frame_count,
                    total_frames=sample.sampled_frame_count,
                    detected_repetitions=len(windows),
                )
            )
        return result

    def _find_repetition_windows(
        self,
        frames: list[PoseFrame],
        *,
        side: Literal["left", "right"] | None,
    ) -> list[_RepetitionWindow]:
        windows: list[_RepetitionWindow] = []
        last_rest_index: int | None = None
        start_index: int | None = None
        keyframe_index: int | None = None
        peak_value = (
            180.0 if self.profile.motion_direction == "decrease" else 0.0
        )
        previous_timestamp_ms: int | None = None

        for index, frame in enumerate(frames):
            if (
                previous_timestamp_ms is not None
                and frame.timestamp_ms - previous_timestamp_ms > 500
            ):
                last_rest_index = None
                start_index = None
                keyframe_index = None
                peak_value = (
                    180.0
                    if self.profile.motion_direction == "decrease"
                    else 0.0
                )
            previous_timestamp_ms = frame.timestamp_ms

            value = _measure_angle_rule(
                frame,
                rule=self.profile.primary_rule,
                side=side,
                bilateral=self.profile.bilateral,
            )
            at_rest = self._is_at_rest(value)
            activated = self._is_activated(value)

            if start_index is None:
                if at_rest:
                    last_rest_index = index
                    continue
                if last_rest_index is not None and activated:
                    start_index = last_rest_index
                    keyframe_index = index
                    peak_value = value
                continue

            if self._is_more_extreme(value, peak_value):
                peak_value = value
                keyframe_index = index

            if not at_rest:
                continue

            duration_ms = frame.timestamp_ms - frames[start_index].timestamp_ms
            if (
                keyframe_index is not None
                and self._peak_is_complete(peak_value)
                and duration_ms >= self.profile.minimum_repetition_duration_ms
                and self._completion_rule_is_met(
                    frames[keyframe_index],
                    side=side,
                )
            ):
                windows.append(
                    _RepetitionWindow(
                        start_index=start_index,
                        keyframe_index=keyframe_index,
                        end_index=index,
                    )
                )
                if len(windows) > 20:
                    raise PostureAnalysisError(
                        "한 영상에서는 운동 회차를 최대 20회까지 분석할 수 있습니다."
                    )

            last_rest_index = index
            start_index = None
            keyframe_index = None
            peak_value = (
                180.0
                if self.profile.motion_direction == "decrease"
                else 0.0
            )

        return windows

    def _is_at_rest(self, value: float) -> bool:
        if self.profile.motion_direction == "decrease":
            return value >= self.profile.rest_threshold_degrees
        return value <= self.profile.rest_threshold_degrees

    def _is_activated(self, value: float) -> bool:
        if self.profile.motion_direction == "decrease":
            return value <= self.profile.activation_threshold_degrees
        return value >= self.profile.activation_threshold_degrees

    def _is_more_extreme(self, value: float, peak_value: float) -> bool:
        if self.profile.motion_direction == "decrease":
            return value < peak_value
        return value > peak_value

    def _peak_is_complete(self, value: float) -> bool:
        if self.profile.motion_direction == "decrease":
            return value <= self.profile.required_peak_degrees
        return value >= self.profile.required_peak_degrees

    def _completion_rule_is_met(
        self,
        frame: PoseFrame,
        *,
        side: Literal["left", "right"] | None,
    ) -> bool:
        rule = self.profile.completion_rule
        if rule is None:
            return True
        value = _measure_angle_rule(
            frame,
            rule=rule,
            side=side,
            bilateral=self.profile.bilateral,
            bilateral_aggregation="worst",
        )
        if (
            self.profile.completion_min_degrees is not None
            and value < self.profile.completion_min_degrees
        ):
            return False
        if (
            self.profile.completion_max_degrees is not None
            and value > self.profile.completion_max_degrees
        ):
            return False
        return True

    def _measure_repetition(
        self,
        *,
        repetition_number: int,
        window: _RepetitionWindow,
        frames: list[PoseFrame],
        side: Literal["left", "right"] | None,
    ) -> _MeasuredCyclicRepetition:
        frame = frames[window.keyframe_index]
        rules = (
            self.profile.primary_rule,
            *self.profile.additional_rules,
        )
        angle_items: list[PostureAngle] = []
        failed_rule_codes: list[str] = []
        score = 100.0

        for rule in rules:
            value = _measure_angle_rule(
                frame,
                rule=rule,
                side=side,
                bilateral=self.profile.bilateral,
                bilateral_aggregation=(
                    "worst" if self.profile.bilateral else "mean"
                ),
            )
            deviation = _angle_target_deviation(value, rule=rule)
            if deviation > 0:
                failed_rule_codes.append(rule.finding_code)
                score -= min(
                    rule.maximum_penalty,
                    deviation * rule.penalty_per_degree,
                )
            angle_items.append(
                PostureAngle(
                    angle_code=rule.angle_code,
                    measured_degrees=round(value, 1),
                    target_min_degrees=rule.target_min_degrees,
                    target_max_degrees=rule.target_max_degrees,
                )
            )

        response = PostureRepetition(
            repetition_number=repetition_number,
            start_offset_ms=frames[window.start_index].timestamp_ms,
            keyframe_offset_ms=frame.timestamp_ms,
            end_offset_ms=frames[window.end_index].timestamp_ms,
            score=round(_clamp(score, 0.0, 100.0)),
            keypoints=_build_schema_keypoints(
                frame,
                settings=self.settings,
                joint_names=self.profile.required_joints,
                side=side,
                bilateral=self.profile.bilateral,
            ),
            angles=angle_items,
        )
        return _MeasuredCyclicRepetition(
            response=response,
            failed_rule_codes=tuple(failed_rule_codes),
        )

    def _build_findings(
        self,
        measured: list[_MeasuredCyclicRepetition],
    ) -> list[PostureFinding]:
        findings: list[PostureFinding] = []
        rules = (
            self.profile.primary_rule,
            *self.profile.additional_rules,
        )
        for rule in rules:
            repetition_numbers = [
                item.response.repetition_number
                for item in measured
                if rule.finding_code in item.failed_rule_codes
            ]
            if not repetition_numbers:
                continue
            findings.append(
                PostureFinding(
                    display_order=len(findings) + 1,
                    finding_type="correction",
                    finding_code=rule.finding_code,
                    title=rule.finding_title,
                    explanation=rule.finding_explanation,
                    repetition_start=min(repetition_numbers),
                    repetition_end=max(repetition_numbers),
                    guidance_steps=[
                        PostureGuidanceStep(
                            sequence_order=index,
                            instruction=instruction,
                        )
                        for index, instruction in enumerate(
                            rule.guidance_steps,
                            start=1,
                        )
                    ],
                )
            )

        if not findings:
            findings.append(
                PostureFinding(
                    display_order=1,
                    finding_type="positive",
                    finding_code=(
                        f"stable_{self.descriptor.exercise_code}_pattern"
                    ),
                    title="현재 각도 규칙 안에서 동작이 안정적이에요",
                    explanation=(
                        "인식된 모든 회차가 현재 구현된 각도 기준 안에 있습니다."
                    ),
                    repetition_start=1,
                    repetition_end=len(measured),
                    guidance_steps=[],
                )
            )
        return findings


class CalfRaisePostureAnalyzer(CyclicPostureAnalyzer):
    """뒤꿈치 상승량으로 카프 레이즈 회차를 분리한다."""

    _REST_RATIO = 0.08
    _ACTIVATION_RATIO = 0.14
    _MINIMUM_PEAK_RATIO = 0.18
    _TARGET_PEAK_RATIO = 0.22

    def _find_repetition_windows(
        self,
        frames: list[PoseFrame],
        *,
        side: Literal["left", "right"] | None,
    ) -> list[_RepetitionWindow]:
        if side is None:
            raise PostureAnalysisError(
                "카프 레이즈를 분석할 신체 방향이 없습니다."
            )

        windows: list[_RepetitionWindow] = []
        last_rest_index: int | None = None
        start_index: int | None = None
        keyframe_index: int | None = None
        peak_ratio = 0.0
        previous_timestamp_ms: int | None = None

        for index, frame in enumerate(frames):
            if (
                previous_timestamp_ms is not None
                and frame.timestamp_ms - previous_timestamp_ms > 500
            ):
                last_rest_index = None
                start_index = None
                keyframe_index = None
                peak_ratio = 0.0
            previous_timestamp_ms = frame.timestamp_ms

            ratio = _heel_lift_ratio(frame, side=side)
            if start_index is None:
                if ratio <= self._REST_RATIO:
                    last_rest_index = index
                    continue
                if (
                    last_rest_index is not None
                    and ratio >= self._ACTIVATION_RATIO
                ):
                    start_index = last_rest_index
                    keyframe_index = index
                    peak_ratio = ratio
                continue

            if ratio > peak_ratio:
                peak_ratio = ratio
                keyframe_index = index

            if ratio > self._REST_RATIO:
                continue

            duration_ms = frame.timestamp_ms - frames[start_index].timestamp_ms
            if (
                keyframe_index is not None
                and peak_ratio >= self._MINIMUM_PEAK_RATIO
                and duration_ms >= self.profile.minimum_repetition_duration_ms
            ):
                windows.append(
                    _RepetitionWindow(
                        start_index=start_index,
                        keyframe_index=keyframe_index,
                        end_index=index,
                    )
                )
                if len(windows) > 20:
                    raise PostureAnalysisError(
                        "한 영상에서는 운동 회차를 최대 20회까지 분석할 수 있습니다."
                    )

            last_rest_index = index
            start_index = None
            keyframe_index = None
            peak_ratio = 0.0

        return windows

    def _measure_repetition(
        self,
        *,
        repetition_number: int,
        window: _RepetitionWindow,
        frames: list[PoseFrame],
        side: Literal["left", "right"] | None,
    ) -> _MeasuredCyclicRepetition:
        measured = super()._measure_repetition(
            repetition_number=repetition_number,
            window=window,
            frames=frames,
            side=side,
        )
        if side is None:
            return measured

        peak_ratio = _heel_lift_ratio(
            frames[window.keyframe_index],
            side=side,
        )
        if peak_ratio >= self._TARGET_PEAK_RATIO:
            return measured

        failed_codes = list(measured.failed_rule_codes)
        finding_code = self.profile.primary_rule.finding_code
        if finding_code not in failed_codes:
            failed_codes.append(finding_code)
        penalty = min(
            25,
            round((self._TARGET_PEAK_RATIO - peak_ratio) * 100),
        )
        response = measured.response.model_copy(
            update={
                "score": max(0, measured.response.score - penalty),
            }
        )
        return _MeasuredCyclicRepetition(
            response=response,
            failed_rule_codes=tuple(failed_codes),
        )


class PostureAnalysisService:
    """영상 임시 파일의 생명주기와 실제 자세 분석을 조율한다."""

    def __init__(
        self,
        settings: Settings | None = None,
        extractor: MediaPipeVideoPoseExtractor | None = None,
        analyzer: _PostureAnalyzer | None = None,
        analyzers: Mapping[
            tuple[str, str],
            _PostureAnalyzer,
        ]
        | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.extractor = extractor or MediaPipeVideoPoseExtractor(
            self.settings
        )
        if analyzer is not None and analyzers is not None:
            raise ValueError("analyzer and analyzers cannot be used together")
        if analyzers is not None:
            self.analyzers = dict(analyzers)
        elif analyzer is not None:
            descriptor = analyzer.descriptor
            self.analyzers = {
                (
                    descriptor.exercise_code,
                    descriptor.camera_view,
                ): analyzer
            }
        else:
            self.analyzers = _build_default_analyzer_registry(self.settings)

    def get_capabilities(self) -> PostureCapabilitiesResponse:
        capabilities = [
            _descriptor_to_schema(analyzer.descriptor)
            for analyzer in self.analyzers.values()
        ]
        return PostureCapabilitiesResponse(exercises=capabilities)

    async def analyze_video(
        self,
        *,
        posture_analysis_job_id: UUID,
        exercise_code: str,
        camera_view: str,
        exercise_key: str | None = None,
        analysis_side: str | None = None,
        video_bytes: bytes,
        declared_content_type: str | None,
        progress_callback: ProgressCallback | None = None,
    ) -> PostureAnalysisResult:
        (
            normalized_exercise_code,
            normalized_camera_view,
            normalized_analysis_side,
        ) = self._validate_request(
            exercise_code=exercise_code,
            camera_view=camera_view,
            exercise_key=exercise_key,
            analysis_side=analysis_side,
            video_bytes=video_bytes,
        )
        suffix = _detect_video_suffix(
            video_bytes,
            declared_content_type=declared_content_type,
        )

        return await asyncio.to_thread(
            self._analyze_video_with_slot,
            posture_analysis_job_id,
            video_bytes,
            suffix,
            progress_callback,
            normalized_exercise_code,
            normalized_camera_view,
            normalized_analysis_side,
        )

    def _analyze_video_with_slot(
        self,
        posture_analysis_job_id: UUID,
        video_bytes: bytes,
        suffix: str,
        progress_callback: ProgressCallback | None,
        exercise_code: str = SUPPORTED_EXERCISE_CODE,
        camera_view: str = SUPPORTED_CAMERA_VIEW,
        analysis_side: Literal["left", "right"] | None = None,
    ) -> PostureAnalysisResult:
        with _POSTURE_ANALYSIS_SLOTS:
            return self._analyze_video_sync(
                posture_analysis_job_id,
                video_bytes,
                suffix,
                progress_callback,
                exercise_code,
                camera_view,
                analysis_side,
            )

    def _analyze_video_sync(
        self,
        posture_analysis_job_id: UUID,
        video_bytes: bytes,
        suffix: str,
        progress_callback: ProgressCallback | None,
        exercise_code: str = SUPPORTED_EXERCISE_CODE,
        camera_view: str = SUPPORTED_CAMERA_VIEW,
        analysis_side: Literal["left", "right"] | None = None,
    ) -> PostureAnalysisResult:
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                suffix=suffix,
                prefix="auto_fit_posture_",
                delete=False,
            ) as temporary_file:
                temporary_file.write(video_bytes)
                temporary_path = Path(temporary_file.name)

            sample = self.extractor.extract(
                temporary_path,
                posture_analysis_job_id=posture_analysis_job_id,
                progress_callback=progress_callback,
            )
            analyzer = self.analyzers[(exercise_code, camera_view)]
            return analyzer.analyze(
                posture_analysis_job_id=posture_analysis_job_id,
                sample=sample,
                analysis_side=analysis_side,
                progress_callback=progress_callback,
            )
        finally:
            if temporary_path is not None:
                try:
                    os.unlink(temporary_path)
                except FileNotFoundError:
                    pass

    def _validate_request(
        self,
        *,
        exercise_code: str,
        camera_view: str,
        exercise_key: str | None = None,
        analysis_side: str | None = None,
        video_bytes: bytes,
    ) -> tuple[str, str, Literal["left", "right"] | None]:
        normalized_exercise_code = exercise_code
        normalized_camera_view = camera_view
        analyzer = self.analyzers.get(
            (normalized_exercise_code, normalized_camera_view)
        )
        known_codes = {
            code for code, _camera_view in self.analyzers
        }
        if normalized_exercise_code not in known_codes:
            raise PostureAnalysisError(
                "지원하지 않는 exercise_code입니다. 지원 목록은 "
                "GET /posture-analysis/capabilities에서 확인해 주세요."
            )
        if analyzer is None:
            supported_views = sorted(
                view
                for code, view in self.analyzers
                if code == normalized_exercise_code
            )
            raise PostureAnalysisError(
                f"{normalized_exercise_code}의 camera_view는 "
                f"{', '.join(supported_views)}만 지원합니다."
            )

        descriptor = analyzer.descriptor
        if (
            descriptor.validation_status == "experimental"
            and not self.settings.posture_allow_experimental
        ):
            raise PostureAnalysisError(
                "실험 단계 운동은 운영 분석에서 비활성화되어 있습니다."
            )
        normalized_analysis_side: Literal["left", "right"] | None = None
        if analysis_side is not None:
            if analysis_side not in {"left", "right"}:
                raise PostureAnalysisError(
                    "analysis_side는 left 또는 right만 지원합니다."
                )
            normalized_analysis_side = analysis_side
        if descriptor.camera_view == "front" and analysis_side is not None:
            raise PostureAnalysisError(
                "정면 촬영 운동에는 analysis_side를 보내지 않습니다."
            )
        if (
            descriptor.analysis_side_required
            and normalized_analysis_side is None
        ):
            raise PostureAnalysisError(
                f"{descriptor.exercise_code} 분석에는 analysis_side가 필요합니다."
            )
        if exercise_key is None:
            if normalized_exercise_code != SUPPORTED_EXERCISE_CODE:
                raise PostureAnalysisError(
                    "신규 운동 자세 분석에는 정확한 exercise_key가 필요합니다."
                )
        elif exercise_key not in descriptor.catalog_exercise_keys:
            raise PostureAnalysisError(
                "exercise_key가 exercise_code의 검증된 운동 자산과 "
                "일치하지 않습니다."
            )

        if not video_bytes:
            raise PostureAnalysisError("업로드한 영상이 비어 있습니다.")
        if len(video_bytes) > self.settings.posture_video_max_bytes:
            raise PostureAnalysisError(
                "영상 파일 크기가 허용 범위를 초과했습니다."
            )
        return (
            normalized_exercise_code,
            normalized_camera_view,
            normalized_analysis_side,
        )


def _build_default_analyzer_registry(
    settings: Settings,
) -> dict[tuple[str, str], _PostureAnalyzer]:
    analyzers: list[_PostureAnalyzer] = [
        SquatPostureAnalyzer(settings),
        *[
            (
                CalfRaisePostureAnalyzer(settings, profile)
                if profile.descriptor.exercise_code == "calf_raise"
                else CyclicPostureAnalyzer(settings, profile)
            )
            for profile in _CYCLIC_EXERCISE_PROFILES
        ],
    ]
    registry: dict[tuple[str, str], _PostureAnalyzer] = {}
    for analyzer in analyzers:
        descriptor = analyzer.descriptor
        key = (descriptor.exercise_code, descriptor.camera_view)
        if key in registry:
            raise RuntimeError(
                f"Duplicate posture analyzer registration: {key}"
            )
        registry[key] = analyzer
    return registry


def _descriptor_to_schema(
    descriptor: _ExerciseDescriptor,
) -> PostureExerciseCapability:
    return PostureExerciseCapability(
        exercise_code=descriptor.exercise_code,
        display_name_ko=descriptor.display_name_ko,
        camera_view=descriptor.camera_view,
        analysis_side_required=descriptor.analysis_side_required,
        validation_status=descriptor.validation_status,
        rule_version=descriptor.rule_version,
        catalog_exercise_keys=list(descriptor.catalog_exercise_keys),
        capture_instructions=list(descriptor.capture_instructions),
        limitations=list(descriptor.limitations),
    )


def _compose_model_version(settings: Settings, rule_version: str) -> str:
    landmark_model_version = settings.posture_model_version.split("+", 1)[0]
    return f"{landmark_model_version}+{rule_version}"


def _select_visible_side(
    frames: list[PoseFrame],
    *,
    joint_names: tuple[str, ...],
) -> Literal["left", "right"]:
    if not frames:
        raise PostureAnalysisError(
            "영상에서 사람의 자세를 인식하지 못했습니다."
        )

    def side_score(side: str) -> float:
        codes = [f"{side}_{joint_name}" for joint_name in joint_names]
        scores = [
            min(frame.landmarks[code].confidence for code in codes)
            for frame in frames
            if all(code in frame.landmarks for code in codes)
        ]
        return sum(scores) / len(scores) if scores else 0.0

    left_score = side_score("left")
    right_score = side_score("right")
    return "left" if left_score > right_score else "right"


def _prepare_frames_for_analysis(
    *,
    sample: PoseVideoSample,
    settings: Settings,
    required_joint_names: tuple[str, ...],
    side: Literal["left", "right"] | None,
    bilateral: bool,
    smoothing_alpha: float,
    exercise_name: str,
) -> list[PoseFrame]:
    if bilateral:
        required_codes = [
            f"{candidate_side}_{joint_name}"
            for candidate_side in ("left", "right")
            for joint_name in required_joint_names
        ]
    else:
        if side is None:
            raise PostureAnalysisError(
                "측면 분석에 사용할 신체 방향을 선택하지 못했습니다."
            )
        required_codes = [
            f"{side}_{joint_name}"
            for joint_name in required_joint_names
        ]

    valid_frames = [
        frame
        for frame in sample.frames
        if all(
            code in frame.landmarks
            and frame.landmarks[code].confidence
            >= settings.posture_min_landmark_confidence
            and _point_is_in_frame(frame.landmarks[code])
            for code in required_codes
        )
    ]
    sampled_frame_count = max(1, sample.sampled_frame_count)
    coverage = len(valid_frames) / sampled_frame_count
    if len(valid_frames) < 8 or coverage < settings.posture_min_pose_coverage:
        raise PostureAnalysisError(
            f"{exercise_name} 자세 인식률이 부족합니다. 촬영 안내에 나온 "
            "관절이 프레임 안에 보이고 조명이 충분한 영상을 사용해 주세요."
        )
    return _smooth_pose_frames(
        valid_frames,
        smoothing_alpha=smoothing_alpha,
    )


def _smooth_pose_frames(
    frames: list[PoseFrame],
    *,
    smoothing_alpha: float,
) -> list[PoseFrame]:
    smoothed: list[PoseFrame] = []
    previous: dict[str, PosePoint] = {}

    for frame in frames:
        landmarks: dict[str, PosePoint] = {}
        for code, current in frame.landmarks.items():
            prior = previous.get(code)
            if prior is None:
                point = current
            else:
                point = PosePoint(
                    x=(
                        smoothing_alpha * current.x
                        + (1 - smoothing_alpha) * prior.x
                    ),
                    y=(
                        smoothing_alpha * current.y
                        + (1 - smoothing_alpha) * prior.y
                    ),
                    confidence=current.confidence,
                )
            landmarks[code] = point
        previous = landmarks
        smoothed.append(
            PoseFrame(
                timestamp_ms=frame.timestamp_ms,
                landmarks=landmarks,
            )
        )
    return smoothed


def _measure_angle_rule(
    frame: PoseFrame,
    *,
    rule: _AngleRule,
    side: Literal["left", "right"] | None,
    bilateral: bool,
    bilateral_aggregation: Literal["mean", "worst"] = "mean",
) -> float:
    sides: tuple[Literal["left", "right"], ...]
    if bilateral:
        sides = ("left", "right")
    elif side is not None:
        sides = (side,)
    else:
        raise PostureAnalysisError(
            "관절 각도를 계산할 신체 방향이 없습니다."
        )

    if rule.calculation == "joint_asymmetry":
        if not bilateral or rule.joints is None:
            raise RuntimeError(
                "joint_asymmetry requires bilateral joint landmarks"
            )
        first_name, vertex_name, third_name = rule.joints
        left_value = _required_angle(
            frame.landmarks[f"left_{first_name}"],
            frame.landmarks[f"left_{vertex_name}"],
            frame.landmarks[f"left_{third_name}"],
        )
        right_value = _required_angle(
            frame.landmarks[f"right_{first_name}"],
            frame.landmarks[f"right_{vertex_name}"],
            frame.landmarks[f"right_{third_name}"],
        )
        return abs(left_value - right_value)

    values: list[float] = []
    for candidate_side in sides:
        if rule.calculation == "joint":
            if rule.joints is None:
                raise RuntimeError(
                    f"Joint rule has no joints: {rule.angle_code}"
                )
            first_name, vertex_name, third_name = rule.joints
            values.append(
                _required_angle(
                    frame.landmarks[f"{candidate_side}_{first_name}"],
                    frame.landmarks[f"{candidate_side}_{vertex_name}"],
                    frame.landmarks[f"{candidate_side}_{third_name}"],
                )
            )
        elif rule.calculation == "torso_lean":
            values.append(
                _angle_from_vertical(
                    frame.landmarks[f"{candidate_side}_shoulder"],
                    frame.landmarks[f"{candidate_side}_hip"],
                )
            )
        elif rule.calculation == "body_alignment":
            values.append(
                _required_angle(
                    frame.landmarks[f"{candidate_side}_shoulder"],
                    frame.landmarks[f"{candidate_side}_hip"],
                    frame.landmarks[f"{candidate_side}_ankle"],
                )
            )
        elif rule.calculation == "upper_arm_drift":
            values.append(
                _required_angle(
                    frame.landmarks[f"{candidate_side}_elbow"],
                    frame.landmarks[f"{candidate_side}_shoulder"],
                    frame.landmarks[f"{candidate_side}_hip"],
                )
            )
        else:
            raise RuntimeError(
                f"Unknown angle calculation: {rule.calculation}"
            )

    if bilateral_aggregation == "worst" and len(values) > 1:
        return max(
            values,
            key=lambda value: _angle_target_deviation(
                value,
                rule=rule,
            ),
        )
    return sum(values) / len(values)


def _angle_target_deviation(
    value: float,
    *,
    rule: _AngleRule,
) -> float:
    deviations: list[float] = []
    if rule.target_min_degrees is not None:
        deviations.append(max(0.0, rule.target_min_degrees - value))
    if rule.target_max_degrees is not None:
        deviations.append(max(0.0, value - rule.target_max_degrees))
    return max(deviations, default=0.0)


def _heel_lift_ratio(
    frame: PoseFrame,
    *,
    side: Literal["left", "right"],
) -> float:
    knee = frame.landmarks[f"{side}_knee"]
    ankle = frame.landmarks[f"{side}_ankle"]
    heel = frame.landmarks[f"{side}_heel"]
    foot_index = frame.landmarks[f"{side}_foot_index"]
    lower_leg_length = hypot(
        knee.x - ankle.x,
        knee.y - ankle.y,
    )
    if lower_leg_length <= 1e-6:
        raise PostureAnalysisError(
            "카프 레이즈 뒤꿈치 상승량을 계산할 수 없습니다."
        )
    return max(0.0, foot_index.y - heel.y) / lower_leg_length


def _build_schema_keypoints(
    frame: PoseFrame,
    *,
    settings: Settings,
    joint_names: tuple[str, ...],
    side: Literal["left", "right"] | None,
    bilateral: bool,
) -> list[PostureKeypoint]:
    result: list[PostureKeypoint] = []
    head = frame.landmarks.get("head")
    if head and head.confidence >= settings.posture_min_landmark_confidence:
        result.append(_to_schema_keypoint("head", head))

    left_shoulder = frame.landmarks.get("left_shoulder")
    right_shoulder = frame.landmarks.get("right_shoulder")
    if left_shoulder and right_shoulder:
        neck = PosePoint(
            x=(left_shoulder.x + right_shoulder.x) / 2,
            y=(left_shoulder.y + right_shoulder.y) / 2,
            confidence=min(
                left_shoulder.confidence,
                right_shoulder.confidence,
            ),
        )
        if neck.confidence >= settings.posture_min_landmark_confidence:
            result.append(_to_schema_keypoint("neck", neck))

    if bilateral:
        codes = [
            f"{candidate_side}_{joint_name}"
            for candidate_side in ("left", "right")
            for joint_name in joint_names
        ]
    elif side is not None:
        codes = [f"{side}_{joint_name}" for joint_name in joint_names]
    else:
        codes = []

    for code in codes:
        point = frame.landmarks.get(code)
        if (
            point is not None
            and point.confidence >= settings.posture_min_landmark_confidence
        ):
            result.append(_to_schema_keypoint(code, point))
    return result


def _detect_video_suffix(
    video_bytes: bytes,
    *,
    declared_content_type: str | None,
) -> str:
    declared = (declared_content_type or "").split(";", 1)[0].strip().lower()
    allowed_declared_types = {
        "",
        "application/octet-stream",
        "video/mp4",
        "video/quicktime",
        "video/webm",
        "video/x-msvideo",
    }
    if declared not in allowed_declared_types:
        raise PostureAnalysisError(
            "지원하지 않는 영상 Content-Type입니다."
        )

    if len(video_bytes) >= 12 and video_bytes[4:8] == b"ftyp":
        return ".mov" if declared == "video/quicktime" else ".mp4"
    if video_bytes.startswith(b"\x1a\x45\xdf\xa3"):
        return ".webm"
    if (
        len(video_bytes) >= 12
        and video_bytes.startswith(b"RIFF")
        and video_bytes[8:12] == b"AVI "
    ):
        return ".avi"

    raise PostureAnalysisError(
        "영상 파일 형식을 확인할 수 없습니다. MP4, MOV, WEBM 또는 AVI를 사용해 주세요."
    )


def _point_is_in_frame(point: PosePoint) -> bool:
    return (
        isfinite(point.x)
        and isfinite(point.y)
        and 0.0 <= point.x <= 1.0
        and 0.0 <= point.y <= 1.0
    )


def _joint_angle(
    first: PosePoint,
    vertex: PosePoint,
    third: PosePoint,
) -> float | None:
    first_vector = (first.x - vertex.x, first.y - vertex.y)
    third_vector = (third.x - vertex.x, third.y - vertex.y)
    first_length = hypot(*first_vector)
    third_length = hypot(*third_vector)
    if first_length <= 1e-9 or third_length <= 1e-9:
        return None

    cosine = (
        first_vector[0] * third_vector[0]
        + first_vector[1] * third_vector[1]
    ) / (first_length * third_length)
    return degrees(acos(_clamp(cosine, -1.0, 1.0)))


def _required_angle(
    first: PosePoint,
    vertex: PosePoint,
    third: PosePoint,
) -> float:
    value = _joint_angle(first, vertex, third)
    if value is None:
        raise PostureAnalysisError(
            "관절 각도를 계산할 수 없는 프레임이 포함되어 있습니다."
        )
    return value


def _angle_from_vertical(
    upper: PosePoint,
    lower: PosePoint,
) -> float:
    dx = upper.x - lower.x
    dy = upper.y - lower.y
    length = hypot(dx, dy)
    if length <= 1e-9:
        raise PostureAnalysisError(
            "몸통 기울기를 계산할 수 없습니다."
        )
    return degrees(acos(_clamp(abs(dy) / length, -1.0, 1.0)))


def _to_schema_keypoint(
    joint_code: str,
    point: PosePoint,
) -> PostureKeypoint:
    return PostureKeypoint(
        joint_code=joint_code,
        x_normalized=round(_clamp(point.x, 0.0, 1.0), 6),
        y_normalized=round(_clamp(point.y, 0.0, 1.0), 6),
        confidence=round(_clamp(point.confidence, 0.0, 1.0), 4),
    )


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
