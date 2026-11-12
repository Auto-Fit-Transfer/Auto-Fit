from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


PostureAnalysisStage = Literal[
    "joint_detection",
    "posture_scoring",
    "result_summary",
]

PostureVerdict = Literal[
    "within_current_rules",
    "needs_correction",
]

PostureCameraView = Literal["side", "front"]
PostureValidationStatus = Literal["validated", "experimental"]

PostureJointCode = Literal[
    "head",
    "neck",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
]

PostureAngleCode = Literal[
    "torso_lean",
    "knee_flexion",
    "hip_flexion",
    "ankle_dorsiflexion",
    "elbow_flexion",
    "body_alignment",
    "hip_extension",
    "upper_arm_drift",
    "ankle_flexion",
    "shoulder_abduction",
    "leg_abduction",
    "bilateral_asymmetry",
]

class PostureContractModel(BaseModel):
    model_config = ConfigDict(
        allow_inf_nan=False,
        extra="forbid",
        str_strip_whitespace=True,
    )


class PostureAnalysisProgress(PostureContractModel):
    posture_analysis_job_id: UUID
    analysis_stage: PostureAnalysisStage
    progress_percent: float = Field(ge=0, le=100)
    processed_frames: int = Field(ge=0)
    total_frames: int = Field(ge=0)
    detected_repetitions: int = Field(ge=0, le=20)

    @model_validator(mode="after")
    def validate_frame_progress(self) -> "PostureAnalysisProgress":
        if self.processed_frames > self.total_frames:
            raise ValueError(
                "processed_frames cannot exceed total_frames"
            )
        return self


class PostureExerciseCapability(PostureContractModel):
    exercise_code: str = Field(min_length=1)
    display_name_ko: str = Field(min_length=1)
    camera_view: PostureCameraView
    movement_type: Literal["repetition"] = "repetition"
    analysis_side_required: bool = False
    validation_status: PostureValidationStatus
    rule_version: str = Field(min_length=1)
    catalog_exercise_keys: list[str] = Field(min_length=1)
    capture_instructions: list[str] = Field(min_length=1)
    limitations: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_capability_lists(self) -> "PostureExerciseCapability":
        if len(self.catalog_exercise_keys) != len(
            set(self.catalog_exercise_keys)
        ):
            raise ValueError("catalog_exercise_keys must be unique")
        return self


class PostureCapabilitiesResponse(PostureContractModel):
    schema_version: Literal["1.0"] = "1.0"
    exercises: list[PostureExerciseCapability] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_capabilities(self) -> "PostureCapabilitiesResponse":
        exercise_codes = [item.exercise_code for item in self.exercises]
        if len(exercise_codes) != len(set(exercise_codes)):
            raise ValueError("exercise_code values must be unique")

        catalog_keys = [
            exercise_key
            for item in self.exercises
            for exercise_key in item.catalog_exercise_keys
        ]
        if len(catalog_keys) != len(set(catalog_keys)):
            raise ValueError(
                "catalog exercise keys cannot map to multiple profiles"
            )
        return self


class PostureKeypoint(PostureContractModel):
    joint_code: PostureJointCode
    x_normalized: float = Field(ge=0, le=1)
    y_normalized: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)


class PostureAngle(PostureContractModel):
    angle_code: PostureAngleCode
    measured_degrees: float = Field(ge=0, le=180)
    target_min_degrees: float | None = Field(
        default=None,
        ge=0,
        le=180,
    )
    target_max_degrees: float | None = Field(
        default=None,
        ge=0,
        le=180,
    )

    @model_validator(mode="after")
    def validate_target_range(self) -> "PostureAngle":
        if (
            self.target_min_degrees is None
            and self.target_max_degrees is None
        ):
            raise ValueError(
                "at least one target angle boundary is required"
            )
        if (
            self.target_min_degrees is not None
            and self.target_max_degrees is not None
            and self.target_min_degrees > self.target_max_degrees
        ):
            raise ValueError(
                "target_min_degrees cannot exceed target_max_degrees"
            )
        return self


class PostureRepetition(PostureContractModel):
    repetition_number: int = Field(ge=1, le=20)
    start_offset_ms: int = Field(ge=0, le=30_000)
    keyframe_offset_ms: int = Field(ge=0, le=30_000)
    end_offset_ms: int = Field(ge=0, le=30_000)
    score: int = Field(ge=0, le=100)
    keypoints: list[PostureKeypoint] = Field(
        min_length=1,
        max_length=18,
    )
    angles: list[PostureAngle] = Field(
        min_length=1,
        max_length=4,
    )

    @model_validator(mode="after")
    def validate_repetition(self) -> "PostureRepetition":
        if not (
            self.start_offset_ms
            <= self.keyframe_offset_ms
            <= self.end_offset_ms
        ):
            raise ValueError(
                "repetition offsets must be ordered "
                "start <= keyframe <= end"
            )

        joint_codes = [item.joint_code for item in self.keypoints]
        if len(joint_codes) != len(set(joint_codes)):
            raise ValueError(
                "keypoints cannot contain duplicate joint_code values"
            )

        angle_codes = [item.angle_code for item in self.angles]
        if len(angle_codes) != len(set(angle_codes)):
            raise ValueError(
                "angles cannot contain duplicate angle_code values"
            )

        return self


class PostureAssessment(PostureContractModel):
    overall_score: int = Field(ge=0, le=100)
    passing_score: int | None = Field(default=None, ge=0, le=100)
    verdict: PostureVerdict
    repetition_count: int = Field(ge=1, le=20)
    summary: str = Field(min_length=1)


class PostureGuidanceStep(PostureContractModel):
    sequence_order: int = Field(ge=1)
    instruction: str = Field(min_length=1)


class PostureFinding(PostureContractModel):
    display_order: int = Field(ge=1)
    finding_type: Literal["correction", "positive"]
    finding_code: str = Field(min_length=1)
    title: str = Field(min_length=1)
    explanation: str = Field(min_length=1)
    repetition_start: int | None = Field(default=None, ge=1, le=20)
    repetition_end: int | None = Field(default=None, ge=1, le=20)
    guidance_steps: list[PostureGuidanceStep]

    @model_validator(mode="after")
    def validate_repetition_range(self) -> "PostureFinding":
        has_start = self.repetition_start is not None
        has_end = self.repetition_end is not None
        if has_start != has_end:
            raise ValueError(
                "repetition_start and repetition_end must be provided together"
            )
        if (
            self.repetition_start is not None
            and self.repetition_end is not None
            and self.repetition_start > self.repetition_end
        ):
            raise ValueError(
                "repetition_start cannot exceed repetition_end"
            )

        guidance_orders = [
            step.sequence_order for step in self.guidance_steps
        ]
        if len(guidance_orders) != len(set(guidance_orders)):
            raise ValueError(
                "guidance_steps cannot contain duplicate sequence_order values"
            )
        return self


class PostureRoutineSuggestion(PostureContractModel):
    display_order: int = Field(ge=1)
    finding_display_order: int = Field(ge=1)
    exercise_name: str = Field(min_length=1)
    prescription: str = Field(min_length=1)
    target_sets: int = Field(ge=1)
    target_repetitions: int = Field(ge=1)


class PostureAnalysisResult(PostureContractModel):
    schema_version: Literal["1.1"]
    posture_analysis_job_id: UUID
    exercise_code: str = Field(min_length=1)
    camera_view: str = Field(min_length=1)
    model_version: str = Field(min_length=1)
    assessment: PostureAssessment
    repetitions: list[PostureRepetition] = Field(
        min_length=1,
        max_length=20,
    )
    findings: list[PostureFinding]
    routine_suggestions: list[PostureRoutineSuggestion]

    @model_validator(mode="after")
    def validate_result_references(self) -> "PostureAnalysisResult":
        repetition_count = len(self.repetitions)
        if self.assessment.repetition_count != repetition_count:
            raise ValueError(
                "assessment.repetition_count must match repetitions length"
            )

        expected_repetition_numbers = list(
            range(1, repetition_count + 1)
        )
        repetition_numbers = [
            item.repetition_number for item in self.repetitions
        ]
        if repetition_numbers != expected_repetition_numbers:
            raise ValueError(
                "repetition_number values must be sequential from 1"
            )

        finding_orders = [item.display_order for item in self.findings]
        if len(finding_orders) != len(set(finding_orders)):
            raise ValueError(
                "findings cannot contain duplicate display_order values"
            )

        for finding in self.findings:
            if (
                finding.repetition_end is not None
                and finding.repetition_end > repetition_count
            ):
                raise ValueError(
                    "finding repetition range exceeds repetition_count"
                )

        suggestion_orders = [
            item.display_order for item in self.routine_suggestions
        ]
        if len(suggestion_orders) != len(set(suggestion_orders)):
            raise ValueError(
                "routine_suggestions cannot contain duplicate "
                "display_order values"
            )

        known_finding_orders = set(finding_orders)
        for suggestion in self.routine_suggestions:
            if suggestion.finding_display_order not in known_finding_orders:
                raise ValueError(
                    "routine suggestion must reference an existing finding"
                )

        has_correction = any(
            finding.finding_type == "correction"
            for finding in self.findings
        )
        expected_verdict = (
            "needs_correction"
            if has_correction
            else "within_current_rules"
        )
        if self.assessment.verdict != expected_verdict:
            raise ValueError(
                "assessment.verdict must match correction findings"
            )

        return self
