from copy import deepcopy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.posture_analysis import (
    PostureAnalysisProgress,
    PostureAnalysisResult,
)


ROOT = Path(__file__).resolve().parent
EXAMPLES = json.loads(
    (ROOT / "docs" / "posture_analysis_contract_examples.json").read_text(
        encoding="utf-8"
    )
)
PROGRESS_EXAMPLE = EXAMPLES["progress"]
RESULT_EXAMPLE = EXAMPLES["result"]


def test_progress_contract() -> None:
    progress = PostureAnalysisProgress.model_validate(
        PROGRESS_EXAMPLE
    )
    assert progress.processed_frames == 180

    invalid = progress.model_dump(mode="json")
    invalid["processed_frames"] = 301
    with pytest.raises(ValidationError):
        PostureAnalysisProgress.model_validate(invalid)


def test_final_result_contract() -> None:
    result = PostureAnalysisResult.model_validate(RESULT_EXAMPLE)
    assert result.assessment.repetition_count == len(result.repetitions)
    assert result.repetitions[0].keypoints[0].joint_code == "head"
    assert result.routine_suggestions[0].finding_display_order == 1


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("repetitions", 0, "keypoints", 0, "confidence"), 1.1),
        (("repetitions", 0, "keypoints", 0, "joint_code"), "pelvis"),
        (("repetitions", 0, "angles", 0, "angle_code"), "back_angle"),
        (("assessment", "repetition_count"), 2),
        (("routine_suggestions", 0, "finding_display_order"), 99),
    ],
)
def test_invalid_result_is_rejected(
    path: tuple[object, ...],
    value: object,
) -> None:
    payload = deepcopy(RESULT_EXAMPLE)
    target = payload
    for part in path[:-1]:
        target = target[part]  # type: ignore[index]
    target[path[-1]] = value  # type: ignore[index]

    with pytest.raises(ValidationError):
        PostureAnalysisResult.model_validate(payload)


def test_sensitive_or_video_fields_are_rejected() -> None:
    for field_name in ("user_id", "video_url", "original_video"):
        payload = deepcopy(RESULT_EXAMPLE)
        payload[field_name] = "must-not-be-returned"
        with pytest.raises(ValidationError):
            PostureAnalysisResult.model_validate(payload)


def test_repetition_offsets_and_duplicate_codes_are_rejected() -> None:
    invalid_offsets = deepcopy(RESULT_EXAMPLE)
    invalid_offsets["repetitions"][0]["keyframe_offset_ms"] = 4000
    with pytest.raises(ValidationError):
        PostureAnalysisResult.model_validate(invalid_offsets)

    duplicate_joint = deepcopy(RESULT_EXAMPLE)
    duplicate_joint["repetitions"][0]["keypoints"][1][
        "joint_code"
    ] = "right_knee"
    with pytest.raises(ValidationError):
        PostureAnalysisResult.model_validate(duplicate_joint)
