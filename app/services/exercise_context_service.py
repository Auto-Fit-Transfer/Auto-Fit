import re
from dataclasses import dataclass
from typing import Any, Literal

from app.schemas.chat import ExerciseAdjustmentStrategy
from app.schemas.exercise_session_analysis import (
    ExerciseSymptomType,
)


NORMAL_STATUSES = {
    None,
    "normal",
    "optimal",
    "desirable",
    "collected",
}


ACTIVE_EXERCISE_PHRASES = {
    "운동 중",
    "운동중",
    "운동하다가",
    "운동하는데",
    "운동하고 있는데",
    "지금 운동",
    "러닝 중",
    "러닝중",
    "달리다가",
    "뛰다가",
    "헬스하다가",
    "홈트하다가",
}


RED_FLAG_PATTERNS: tuple[
    tuple[str, tuple[str, ...]],
    ...,
] = (
    (
        "chest_discomfort",
        (
            "가슴 통증",
            "흉통",
            "가슴 압박",
            "가슴이 조여",
            "가슴 조임",
        ),
    ),
    (
        "fainting_or_severe_dizziness",
        (
            "실신",
            "쓰러질 것 같",
            "쓰러질거 같",
            "정신을 잃",
            "눈앞이 캄캄",
            "어지러",
            "현기증",
            "휘청",
        ),
    ),
    (
        "severe_breathing_difficulty",
        (
            "호흡 곤란",
            "호흡곤란",
            "숨이 안 쉬",
            "숨을 못 쉬",
            "숨쉬기 너무 어려",
            "말하기 힘들 정도로 숨",
        ),
    ),
    (
        "abnormal_palpitations",
        (
            "심장이 이상하게 뛰",
            "심장이 불규칙",
            "불규칙하게 뛰",
            "심계항진",
        ),
    ),
    (
        "neurologic_warning",
        (
            "한쪽이 마비",
            "한쪽 마비",
            "말이 어눌",
        ),
    ),
)


PAIN_PATTERNS = (
    "아파",
    "통증",
    "찌릿",
    "쑤셔",
    "쑤시",
    "저려",
    "뻐근",
    "당겨",
)


FATIGUE_PATTERNS = (
    "피곤",
    "지쳤",
    "지쳐",
    "기운이 없",
    "힘이 없",
    "너무 힘들",
    "컨디션이 안 좋",
    "컨디션이 나쁘",
)


BREATHING_PATTERNS = (
    "숨이 차",
    "숨차",
    "호흡이 불편",
    "숨쉬기 어려",
)


OTHER_DISCOMFORT_PATTERNS = (
    "몸이 이상",
    "몸 상태가 이상",
    "메스꺼",
    "구역질",
    "경련",
)


BODY_AREA_ALIASES: tuple[
    tuple[str, str],
    ...,
] = (
    ("팔꿈치", "팔꿈치"),
    ("손목", "손목"),
    ("발목", "발목"),
    ("무릎", "무릎"),
    ("고관절", "고관절"),
    ("엉덩이", "엉덩이"),
    ("허벅지", "허벅지"),
    ("종아리", "종아리"),
    ("어깨", "어깨"),
    ("허리", "허리"),
    ("가슴", "가슴"),
    ("등", "등"),
    ("목", "목"),
    ("팔", "팔"),
    ("다리", "다리"),
    ("손", "손"),
    ("발", "발"),
)


@dataclass(frozen=True, slots=True)
class ActiveExerciseDiscomfortAssessment:
    has_signal: bool
    risk_level: Literal[
        "unknown",
        "mild",
        "caution",
        "emergency",
    ]
    symptom_type: ExerciseSymptomType | None
    severity: int | None
    body_areas: tuple[str, ...]
    red_flag_codes: tuple[str, ...]
    missing_fields: tuple[str, ...]
    recommended_action: Literal["pause", "adjust", "stop"]
    adjustment_strategy: ExerciseAdjustmentStrategy | None

    def to_response_data(self) -> dict[str, Any]:
        return {
            "risk_level": self.risk_level,
            "symptom_type": self.symptom_type,
            "severity": self.severity,
            "body_areas": list(self.body_areas),
            "red_flag_codes": list(self.red_flag_codes),
            "missing_fields": list(self.missing_fields),
            "recommended_action": self.recommended_action,
            "adjustment_strategy": self.adjustment_strategy,
        }


def _normalize_discomfort_message(message: str) -> str:
    return re.sub(r"\s+", " ", message.strip().lower())


def _is_negated_match(
    message: str,
    start: int,
    end: int,
) -> bool:
    before = message[max(0, start - 5):start]
    after = message[end:min(len(message), end + 10)]

    return bool(
        re.search(r"(?:안|않)\s*$", before)
        or re.match(
            r"\s*(?:은|는|이|가|도)?\s*"
            r"(?:없|아니|않)",
            after,
        )
    )


def _contains_affirmed(
    message: str,
    patterns: tuple[str, ...],
) -> bool:
    for pattern in patterns:
        for match in re.finditer(re.escape(pattern), message):
            if not _is_negated_match(
                message,
                match.start(),
                match.end(),
            ):
                return True
    return False


def _extract_severity(message: str) -> int | None:
    match = re.search(
        r"(?<!\d)(10|[0-9])\s*"
        r"(?:/\s*10|점|단계)",
        message,
    )
    if match is not None:
        return int(match.group(1))

    if _contains_affirmed(
        message,
        ("극심", "견딜 수 없", "견딜수 없", "너무 심"),
    ):
        return 9
    if _contains_affirmed(
        message,
        ("심하게", "심한", "많이 아"),
    ):
        return 7
    if _contains_affirmed(
        message,
        ("조금", "살짝", "약간", "가볍게"),
    ):
        return 3

    return None


def _extract_body_areas(message: str) -> tuple[str, ...]:
    found: list[str] = []
    matched_spans: list[tuple[int, int]] = []

    for alias, canonical in BODY_AREA_ALIASES:
        for match in re.finditer(re.escape(alias), message):
            span = match.span()
            if any(
                span[0] < matched_end
                and span[1] > matched_start
                for matched_start, matched_end in matched_spans
            ):
                continue

            prefix = message[max(0, match.start() - 5):match.start()]
            side_match = re.search(
                r"(오른쪽|왼쪽|양쪽)\s*$",
                prefix,
            )
            value = (
                f"{side_match.group(1)} {canonical}"
                if side_match is not None
                else canonical
            )
            if value not in found:
                found.append(value)
                matched_spans.append(span)
            break

    return tuple(found[:10])


def assess_active_exercise_discomfort(
    message: str,
) -> ActiveExerciseDiscomfortAssessment:
    """운동 중 증상을 외부 LLM 없이 보수적으로 판정한다."""

    normalized = _normalize_discomfort_message(message)
    red_flag_codes = tuple(
        code
        for code, patterns in RED_FLAG_PATTERNS
        if _contains_affirmed(normalized, patterns)
    )

    has_pain = _contains_affirmed(
        normalized,
        PAIN_PATTERNS,
    )
    has_fatigue = _contains_affirmed(
        normalized,
        FATIGUE_PATTERNS,
    )
    has_breathing = _contains_affirmed(
        normalized,
        BREATHING_PATTERNS,
    )
    has_other = _contains_affirmed(
        normalized,
        OTHER_DISCOMFORT_PATTERNS,
    )

    if "fainting_or_severe_dizziness" in red_flag_codes:
        symptom_type: ExerciseSymptomType | None = "dizziness"
    elif (
        "severe_breathing_difficulty" in red_flag_codes
        or has_breathing
    ):
        symptom_type = "breathing"
    elif has_pain or "chest_discomfort" in red_flag_codes:
        symptom_type = "pain"
    elif has_fatigue:
        symptom_type = "fatigue"
    elif red_flag_codes or has_other:
        symptom_type = "other"
    else:
        symptom_type = None

    severity = _extract_severity(normalized)
    body_areas = _extract_body_areas(normalized)
    red_flags = list(red_flag_codes)

    if symptom_type == "pain" and severity is not None and severity >= 8:
        if "severe_pain" not in red_flags:
            red_flags.append("severe_pain")

    has_signal = bool(
        symptom_type is not None
        or red_flags
    )

    if red_flags:
        return ActiveExerciseDiscomfortAssessment(
            has_signal=True,
            risk_level="emergency",
            symptom_type=symptom_type,
            severity=severity,
            body_areas=body_areas,
            red_flag_codes=tuple(red_flags),
            missing_fields=(),
            recommended_action="stop",
            adjustment_strategy=None,
        )

    missing_fields: list[str] = []
    if symptom_type is None:
        missing_fields.append("symptom_type")
    if severity is None:
        missing_fields.append("severity")
    if symptom_type == "pain" and not body_areas:
        missing_fields.append("body_areas")

    if missing_fields:
        return ActiveExerciseDiscomfortAssessment(
            has_signal=has_signal,
            risk_level=(
                "caution"
                if symptom_type is not None
                else "unknown"
            ),
            symptom_type=symptom_type,
            severity=severity,
            body_areas=body_areas,
            red_flag_codes=(),
            missing_fields=tuple(missing_fields),
            recommended_action="pause",
            adjustment_strategy=None,
        )

    if severity is not None and severity >= 8:
        return ActiveExerciseDiscomfortAssessment(
            has_signal=True,
            risk_level="emergency",
            symptom_type=symptom_type,
            severity=severity,
            body_areas=body_areas,
            red_flag_codes=("severe_symptom",),
            missing_fields=(),
            recommended_action="stop",
            adjustment_strategy=None,
        )

    risk_level = (
        "mild"
        if severity is not None and severity <= 3
        else "caution"
    )
    adjustment_strategy: ExerciseAdjustmentStrategy = (
        "skip_current_and_reduce_remaining"
        if symptom_type in {"pain", "breathing"}
        else "reduce_remaining_volume"
    )

    return ActiveExerciseDiscomfortAssessment(
        has_signal=True,
        risk_level=risk_level,
        symptom_type=symptom_type,
        severity=severity,
        body_areas=body_areas,
        red_flag_codes=(),
        missing_fields=(),
        recommended_action="adjust",
        adjustment_strategy=adjustment_strategy,
    )


def has_active_exercise_discomfort_signal(
    message: str,
    *,
    active_session_available: bool,
) -> bool:
    assessment = assess_active_exercise_discomfort(message)
    if not assessment.has_signal:
        return False
    if active_session_available:
        return True

    normalized = _normalize_discomfort_message(message)
    return any(
        phrase in normalized
        for phrase in ACTIVE_EXERCISE_PHRASES
    )


def build_exercise_safety_tags(
    metric_statuses: dict[str, Any],
) -> list[str]:
    """
    Rule Engine의 상태값을
    외부 LLM에 전달 가능한 일반화된 운동 안전 tag로 변환한다.

    원본 건강 수치는 사용하지 않는다.
    """

    tags: set[str] = set()

    # --------------------------------------------------
    # 체중
    # --------------------------------------------------

    bmi_status = metric_statuses.get(
        "bmi"
    )

    if bmi_status in {
        "overweight",
        "obesity_class_1",
        "obesity_class_2",
        "obesity_class_3",
    }:
        tags.add(
            "weight_management"
        )

    # --------------------------------------------------
    # 혈압
    # --------------------------------------------------

    blood_pressure_status = (
        metric_statuses.get(
            "blood_pressure"
        )
    )

    if blood_pressure_status not in (
        NORMAL_STATUSES
    ):
        tags.add(
            "blood_pressure_caution"
        )

    # --------------------------------------------------
    # 혈당
    # --------------------------------------------------

    fasting_glucose_status = (
        metric_statuses.get(
            "fasting_glucose"
        )
    )

    hba1c_status = metric_statuses.get(
        "hba1c"
    )

    if (
        fasting_glucose_status
        not in NORMAL_STATUSES
        or hba1c_status
        not in NORMAL_STATUSES
    ):
        tags.add(
            "glucose_management"
        )

    # --------------------------------------------------
    # 지질
    # --------------------------------------------------

    lipid_metrics = (
        "total_cholesterol",
        "ldl",
        "hdl",
        "triglyceride",
    )

    for metric in lipid_metrics:
        status = metric_statuses.get(
            metric
        )

        if status not in NORMAL_STATUSES:
            tags.add(
                "lipid_management"
            )
            break

    return sorted(
        tags
    )
