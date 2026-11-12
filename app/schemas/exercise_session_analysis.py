"""Contract for AI-generated feedback after a completed exercise session."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


ShortText = Annotated[str, Field(min_length=1, max_length=500)]
BodyArea = Annotated[str, Field(min_length=1, max_length=50)]
ExerciseSymptomType = Literal[
    "pain",
    "fatigue",
    "dizziness",
    "breathing",
    "other",
]


class PerformedExercise(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    completed: bool
    skipped: bool
    duration_minutes: float | None = Field(default=None, ge=0, le=300)


class ExerciseFeedback(StrictModel):
    perceived_difficulty: int = Field(ge=1, le=5)
    post_condition: Literal["very_bad", "bad", "normal", "good", "very_good"]
    uncomfortable_areas: list[BodyArea] = Field(default_factory=list, max_length=10)
    note: str | None = Field(default=None, max_length=500)


class DiscomfortEvent(StrictModel):
    symptom_type: ExerciseSymptomType
    severity: int | None = Field(default=None, ge=0, le=10)
    body_areas: list[BodyArea] = Field(default_factory=list, max_length=10)
    action_taken: Literal["adjust", "stop", "continue"] | None = None


class ExerciseSessionAnalysisRequest(StrictModel):
    status: Literal["completed", "stopped"]
    completion_rate: float = Field(ge=0, le=100)
    duration_minutes: float = Field(ge=0, le=10080)
    calories_burned: float | None = Field(default=None, ge=0)
    planned_item_count: int = Field(ge=0, le=30)
    completed_item_count: int = Field(ge=0, le=30)
    skipped_item_count: int = Field(ge=0, le=30)
    exercises: list[PerformedExercise] = Field(default_factory=list, max_length=30)
    discomfort_events: list[DiscomfortEvent] = Field(default_factory=list, max_length=30)
    feedback: ExerciseFeedback


class ExerciseAnalysisNarrative(StrictModel):
    summary: ShortText
    insights: list[ShortText] = Field(min_length=1, max_length=5)
    next_session_adjustments: list[ShortText] = Field(min_length=1, max_length=5)
    safety_notice: str | None = Field(default=None, max_length=500)


class ExerciseSessionAnalysisResponse(StrictModel):
    ok: Literal[True]
    generator: Literal["auto-fit-ai"]
    result: ExerciseAnalysisNarrative
