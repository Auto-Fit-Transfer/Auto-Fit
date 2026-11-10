"""Validated AI capabilities used for posture job admission."""

from __future__ import annotations

import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


EXERCISE_KEY_PATTERN = re.compile(r"ex_[0-9a-f]{8,64}\Z")


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class CreatePostureJobRequest(ContractModel):
    exercise_key: str = Field(pattern=r"^ex_[0-9a-f]{8,64}$")
    exercise_code: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    camera_view: Literal["side", "front"]
    analysis_side: Literal["left", "right"] | None = None


class CreatedPostureJob(BaseModel):
    posture_analysis_job_id: UUID
    exercise_key: str
    exercise_code: str
    camera_view: Literal["side", "front"]
    analysis_side: Literal["left", "right"] | None
    rule_version: str
    validation_status: Literal["validated"]
    status: Literal["awaiting_upload"]


class PostureExerciseCapability(ContractModel):
    exercise_code: str = Field(min_length=1)
    display_name_ko: str = Field(min_length=1)
    camera_view: Literal["side", "front"]
    movement_type: Literal["repetition"]
    analysis_side_required: bool
    validation_status: Literal["validated", "experimental"]
    rule_version: str = Field(min_length=1)
    catalog_exercise_keys: list[str] = Field(min_length=1)
    capture_instructions: list[str] = Field(min_length=1)
    limitations: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_keys(self) -> "PostureExerciseCapability":
        if any(not EXERCISE_KEY_PATTERN.fullmatch(key)
               for key in self.catalog_exercise_keys):
            raise ValueError("invalid catalog_exercise_key")
        if len(self.catalog_exercise_keys) != len(set(self.catalog_exercise_keys)):
            raise ValueError("duplicate catalog_exercise_key")
        if self.camera_view == "front" and self.analysis_side_required:
            raise ValueError("front view cannot require analysis_side")
        return self


class OperationalPostureCapabilitiesResponse(ContractModel):
    schema_version: Literal["1.0"]
    exercises: list[PostureExerciseCapability]


class PostureCapabilitiesResponse(ContractModel):
    # The capabilities payload has its own 1.0 schema; analysis results use 1.1.
    schema_version: Literal["1.0"]
    exercises: list[PostureExerciseCapability] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_profiles(self) -> "PostureCapabilitiesResponse":
        codes = [item.exercise_code for item in self.exercises]
        keys = [key for item in self.exercises for key in item.catalog_exercise_keys]
        if len(codes) != len(set(codes)) or len(keys) != len(set(keys)):
            raise ValueError("duplicate exercise_code or catalog_exercise_key")
        return self

    def operational(self) -> OperationalPostureCapabilitiesResponse:
        return OperationalPostureCapabilitiesResponse(
            schema_version=self.schema_version,
            exercises=[item for item in self.exercises
                       if item.validation_status == "validated"],
        )

    def validated_profile(self, *, exercise_key: str, exercise_code: str,
                          camera_view: str, analysis_side: str | None
                          ) -> PostureExerciseCapability:
        """New Backend jobs require a catalog key; AI-only legacy squat calls do not."""
        for item in self.exercises:
            if exercise_key not in item.catalog_exercise_keys:
                continue
            if (item.exercise_code != exercise_code or item.camera_view != camera_view
                    or item.validation_status != "validated"):
                break
            if item.analysis_side_required and analysis_side not in ("left", "right"):
                break
            if not item.analysis_side_required and analysis_side is not None:
                break
            return item
        raise ValueError("unsupported posture exercise combination")
