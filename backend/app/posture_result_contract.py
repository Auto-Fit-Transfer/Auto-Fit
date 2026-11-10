"""Validate AI posture result Schema 1.1 before any database write."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


JOINT_CODES = (
    "head", "neck", "left_shoulder", "right_shoulder", "left_elbow",
    "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel",
    "right_heel", "left_foot_index", "right_foot_index",
)
ANGLE_CODES = (
    "torso_lean", "knee_flexion", "hip_flexion", "ankle_dorsiflexion",
    "elbow_flexion", "body_alignment", "hip_extension", "upper_arm_drift",
    "ankle_flexion", "shoulder_abduction", "leg_abduction",
    "bilateral_asymmetry",
)


class ResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Keypoint(ResultModel):
    joint_code: Literal[*JOINT_CODES]
    x_normalized: float = Field(ge=0, le=1)
    y_normalized: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)


class Angle(ResultModel):
    angle_code: Literal[*ANGLE_CODES]
    measured_degrees: float = Field(ge=0, le=180)
    target_min_degrees: float | None = Field(ge=0, le=180)
    target_max_degrees: float | None = Field(ge=0, le=180)

    @model_validator(mode="after")
    def target(self) -> "Angle":
        if self.target_min_degrees is None and self.target_max_degrees is None:
            raise ValueError("angle target required")
        if (self.target_min_degrees is not None
                and self.target_max_degrees is not None
                and self.target_min_degrees > self.target_max_degrees):
            raise ValueError("angle target range invalid")
        return self


class Repetition(ResultModel):
    repetition_number: int = Field(ge=1, le=20)
    start_offset_ms: int = Field(ge=0, le=30_000)
    keyframe_offset_ms: int = Field(ge=0, le=30_000)
    end_offset_ms: int = Field(ge=0, le=30_000)
    score: int = Field(ge=0, le=100)
    keypoints: list[Keypoint] = Field(min_length=1, max_length=18)
    angles: list[Angle] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def ordered(self) -> "Repetition":
        if not (self.start_offset_ms <= self.keyframe_offset_ms
                <= self.end_offset_ms):
            raise ValueError("repetition offsets invalid")
        if len({item.joint_code for item in self.keypoints}) != len(self.keypoints):
            raise ValueError("duplicate keypoint")
        if len({item.angle_code for item in self.angles}) != len(self.angles):
            raise ValueError("duplicate angle")
        return self


class Assessment(ResultModel):
    overall_score: int = Field(ge=0, le=100)
    passing_score: None
    verdict: Literal["within_current_rules", "needs_correction"]
    repetition_count: int = Field(ge=1, le=20)
    summary: str = Field(min_length=1, max_length=1000)


class GuidanceStep(ResultModel):
    sequence_order: int = Field(ge=1, le=10)
    instruction: str = Field(min_length=1, max_length=500)


class Finding(ResultModel):
    display_order: int = Field(ge=1, le=30)
    finding_type: Literal["correction", "positive"]
    finding_code: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    title: str = Field(min_length=1, max_length=160)
    explanation: str = Field(min_length=1, max_length=2000)
    repetition_start: int | None = Field(ge=1, le=20)
    repetition_end: int | None = Field(ge=1, le=20)
    guidance_steps: list[GuidanceStep] = Field(max_length=10)

    @model_validator(mode="after")
    def valid_range(self) -> "Finding":
        if (self.repetition_start is None) != (self.repetition_end is None):
            raise ValueError("finding range incomplete")
        if (self.repetition_start is not None and self.repetition_end is not None
                and self.repetition_start > self.repetition_end):
            raise ValueError("finding range invalid")
        if len({item.sequence_order for item in self.guidance_steps}) != len(self.guidance_steps):
            raise ValueError("duplicate guidance order")
        return self


class Suggestion(ResultModel):
    display_order: int = Field(ge=1, le=20)
    finding_display_order: int = Field(ge=1, le=30)
    exercise_name: str = Field(min_length=1, max_length=160)
    prescription: str = Field(min_length=1, max_length=1000)
    target_sets: int = Field(ge=1, le=20)
    target_repetitions: int = Field(ge=1, le=100)


class PostureAnalysisResult(ResultModel):
    schema_version: Literal["1.1"]
    posture_analysis_job_id: UUID
    exercise_code: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    camera_view: Literal["side", "front"]
    model_version: str = Field(min_length=1, max_length=80)
    assessment: Assessment
    repetitions: list[Repetition] = Field(min_length=1, max_length=20)
    findings: list[Finding] = Field(max_length=30)
    routine_suggestions: list[Suggestion] = Field(max_length=20)

    @model_validator(mode="after")
    def references(self) -> "PostureAnalysisResult":
        count = len(self.repetitions)
        if self.assessment.repetition_count != count:
            raise ValueError("repetition count mismatch")
        if [rep.repetition_number for rep in self.repetitions] != list(range(1, count + 1)):
            raise ValueError("repetition numbers invalid")
        finding_orders = [finding.display_order for finding in self.findings]
        if len(set(finding_orders)) != len(finding_orders):
            raise ValueError("duplicate finding order")
        if any(finding.repetition_end is not None and finding.repetition_end > count
               for finding in self.findings):
            raise ValueError("finding exceeds repetition count")
        suggestion_orders = [item.display_order for item in self.routine_suggestions]
        if len(set(suggestion_orders)) != len(suggestion_orders):
            raise ValueError("duplicate suggestion order")
        if any(item.finding_display_order not in finding_orders
               for item in self.routine_suggestions):
            raise ValueError("suggestion references missing finding")
        # The current AI contract has no catalog exercise_key for suggestions.
        if self.routine_suggestions:
            raise ValueError("routine suggestions are not yet supported")
        correction = any(item.finding_type == "correction" for item in self.findings)
        if self.assessment.verdict != ("needs_correction" if correction
                                       else "within_current_rules"):
            raise ValueError("verdict mismatch")
        return self

    def validate_job(self, job: dict, duration_ms: int) -> None:
        if (str(self.posture_analysis_job_id) != job["posture_analysis_job_id"]
                or self.exercise_code != job["exercise_code"]
                or self.camera_view != job["camera_view"]
                or not self.model_version.endswith("+" + job["rule_version"])
                or any(rep.end_offset_ms > duration_ms for rep in self.repetitions)):
            raise ValueError("result does not match job or video")
