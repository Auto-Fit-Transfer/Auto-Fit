from __future__ import annotations

import asyncio
from dataclasses import dataclass
from math import acos, degrees, hypot, isfinite
from pathlib import Path
import os
import tempfile
from threading import BoundedSemaphore
from typing import Callable, Literal
from uuid import UUID

from app.core.config import Settings, get_settings
from app.schemas.posture_analysis import (
    PostureAnalysisProgress,
    PostureAnalysisResult,
    PostureAngle,
    PostureAssessment,
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
        progress_callback: ProgressCallback | None = None,
    ) -> PostureAnalysisResult:
        side = self._select_visible_side(sample.frames)
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
            1,
        )
        correction_titles = [
            item.title
            for item in findings
            if item.finding_type == "correction"
        ]
        if correction_titles:
            summary = (
                f"스쿼트 {len(measured)}회를 분석했습니다. "
                f"우선 교정할 항목은 {', '.join(correction_titles)}입니다."
            )
        else:
            summary = (
                f"스쿼트 {len(measured)}회에서 깊이, 상체 기울기와 "
                "발뒤꿈치 접촉이 안정적으로 확인됐습니다."
            )

        result = PostureAnalysisResult(
            schema_version="1.0",
            posture_analysis_job_id=posture_analysis_job_id,
            exercise_code=SUPPORTED_EXERCISE_CODE,
            camera_view=SUPPORTED_CAMERA_VIEW,
            model_version=self.settings.posture_model_version,
            assessment=PostureAssessment(
                overall_score=overall_score,
                passing_score=None,
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
        if not frames:
            raise PostureAnalysisError(
                "영상에서 사람의 자세를 인식하지 못했습니다."
            )

        def side_score(side: str) -> float:
            codes = [
                f"{side}_shoulder",
                f"{side}_hip",
                f"{side}_knee",
                f"{side}_ankle",
                f"{side}_heel",
                f"{side}_foot_index",
            ]
            scores = [
                min(frame.landmarks[code].confidence for code in codes)
                for frame in frames
                if all(code in frame.landmarks for code in codes)
            ]
            return sum(scores) / len(scores) if scores else 0.0

        left_score = side_score("left")
        right_score = side_score("right")
        return "left" if left_score > right_score else "right"

    def _prepare_frames(
        self,
        *,
        sample: PoseVideoSample,
        side: Literal["left", "right"],
    ) -> list[PoseFrame]:
        required_codes = [
            f"{side}_shoulder",
            f"{side}_hip",
            f"{side}_knee",
            f"{side}_ankle",
            f"{side}_heel",
            f"{side}_foot_index",
        ]
        valid_frames = [
            frame
            for frame in sample.frames
            if all(
                code in frame.landmarks
                and frame.landmarks[code].confidence
                >= self.settings.posture_min_landmark_confidence
                and _point_is_in_frame(frame.landmarks[code])
                for code in required_codes
            )
        ]

        coverage = len(valid_frames) / sample.sampled_frame_count
        if (
            len(valid_frames) < 8
            or coverage < self.settings.posture_min_pose_coverage
        ):
            raise PostureAnalysisError(
                "자세 인식률이 부족합니다. 전신과 발이 프레임 안에 보이고 "
                "조명이 충분한 측면 영상을 사용해 주세요."
            )

        return self._smooth_frames(valid_frames)

    def _smooth_frames(
        self,
        frames: list[PoseFrame],
    ) -> list[PoseFrame]:
        smoothed: list[PoseFrame] = []
        previous: dict[str, PosePoint] = {}
        alpha = self._SMOOTHING_ALPHA

        for frame in frames:
            landmarks: dict[str, PosePoint] = {}
            for code, current in frame.landmarks.items():
                prior = previous.get(code)
                if prior is None:
                    point = current
                else:
                    point = PosePoint(
                        x=alpha * current.x + (1 - alpha) * prior.x,
                        y=alpha * current.y + (1 - alpha) * prior.y,
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
        hip_flexion = _required_angle(shoulder, hip, knee)
        ankle_dorsiflexion = _required_angle(knee, ankle, foot_index)
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
        score = round(_clamp(score, 0.0, 100.0), 1)

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
                PostureAngle(
                    angle_code="hip_flexion",
                    measured_degrees=round(hip_flexion, 1),
                    target_min_degrees=None,
                    target_max_degrees=None,
                ),
                PostureAngle(
                    angle_code="ankle_dorsiflexion",
                    measured_degrees=round(ankle_dorsiflexion, 1),
                    target_min_degrees=None,
                    target_max_degrees=None,
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
        result: list[PostureKeypoint] = []

        head = frame.landmarks.get("head")
        if head and head.confidence >= self.settings.posture_min_landmark_confidence:
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
            if neck.confidence >= self.settings.posture_min_landmark_confidence:
                result.append(_to_schema_keypoint("neck", neck))

        for joint_name in (
            "shoulder",
            "elbow",
            "wrist",
            "hip",
            "knee",
            "ankle",
            "heel",
            "foot_index",
        ):
            code = f"{side}_{joint_name}"
            point = frame.landmarks.get(code)
            if (
                point is not None
                and point.confidence
                >= self.settings.posture_min_landmark_confidence
            ):
                result.append(_to_schema_keypoint(code, point))

        return result

    def _build_findings(
        self,
        repetitions: list[_MeasuredRepetition],
    ) -> tuple[list[PostureFinding], list[PostureRoutineSuggestion]]:
        findings: list[PostureFinding] = []
        suggestions: list[PostureRoutineSuggestion] = []

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
            exercise_name: str,
            prescription: str,
            target_sets: int,
            target_repetitions: int,
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
            suggestions.append(
                PostureRoutineSuggestion(
                    display_order=len(suggestions) + 1,
                    finding_display_order=display_order,
                    exercise_name=exercise_name,
                    prescription=prescription,
                    target_sets=target_sets,
                    target_repetitions=target_repetitions,
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
            exercise_name="고블릿 스쿼트",
            prescription="가벼운 중량을 가슴 앞에 들고 천천히 수행하세요.",
            target_sets=3,
            target_repetitions=10,
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
            exercise_name="박스 스쿼트",
            prescription="안정적인 높이의 박스를 기준으로 천천히 앉았다 일어나세요.",
            target_sets=3,
            target_repetitions=10,
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
            exercise_name="벽 발목 가동성 운동",
            prescription="발뒤꿈치를 붙인 채 무릎을 벽 쪽으로 천천히 이동하세요.",
            target_sets=2,
            target_repetitions=10,
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

        return findings, suggestions


class PostureAnalysisService:
    """영상 임시 파일의 생명주기와 실제 자세 분석을 조율한다."""

    def __init__(
        self,
        settings: Settings | None = None,
        extractor: MediaPipeVideoPoseExtractor | None = None,
        analyzer: SquatPostureAnalyzer | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.extractor = extractor or MediaPipeVideoPoseExtractor(
            self.settings
        )
        self.analyzer = analyzer or SquatPostureAnalyzer(self.settings)

    async def analyze_video(
        self,
        *,
        posture_analysis_job_id: UUID,
        exercise_code: str,
        camera_view: str,
        video_bytes: bytes,
        declared_content_type: str | None,
        progress_callback: ProgressCallback | None = None,
    ) -> PostureAnalysisResult:
        self._validate_request(
            exercise_code=exercise_code,
            camera_view=camera_view,
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
        )

    def _analyze_video_with_slot(
        self,
        posture_analysis_job_id: UUID,
        video_bytes: bytes,
        suffix: str,
        progress_callback: ProgressCallback | None,
    ) -> PostureAnalysisResult:
        with _POSTURE_ANALYSIS_SLOTS:
            return self._analyze_video_sync(
                posture_analysis_job_id,
                video_bytes,
                suffix,
                progress_callback,
            )

    def _analyze_video_sync(
        self,
        posture_analysis_job_id: UUID,
        video_bytes: bytes,
        suffix: str,
        progress_callback: ProgressCallback | None,
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
            return self.analyzer.analyze(
                posture_analysis_job_id=posture_analysis_job_id,
                sample=sample,
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
        video_bytes: bytes,
    ) -> None:
        if exercise_code != SUPPORTED_EXERCISE_CODE:
            raise PostureAnalysisError(
                "현재 지원하는 exercise_code는 squat뿐입니다."
            )
        if camera_view != SUPPORTED_CAMERA_VIEW:
            raise PostureAnalysisError(
                "스쿼트 자세 분석은 camera_view=side만 지원합니다."
            )
        if not video_bytes:
            raise PostureAnalysisError("업로드한 영상이 비어 있습니다.")
        if len(video_bytes) > self.settings.posture_video_max_bytes:
            raise PostureAnalysisError(
                "영상 파일 크기가 허용 범위를 초과했습니다."
            )


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
