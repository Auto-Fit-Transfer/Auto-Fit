"""
내부 항목 key(schema/health_fields.json) → 백엔드 응답 필드명.

백엔드가 보내 준 예시(checkup_date, height_cm, weight_kg, fasting_glucose)의 규칙을 따른다.
  · 단위가 헷갈릴 수 있는 값은 이름 끝에 단위를 붙인다 (_cm, _kg, _pct …)
  · 날짜는 "YYYY-MM-DD" 문자열, 숫자는 JSON 숫자, 못 읽은 값은 null

이름·생년월일·주민번호는 돌려주지 않는다 (기획서 5.6 최소 수집 원칙).
"""

from server.documents import BODY, CHECKUP

# (응답 필드명, 내부 key, 단위 또는 형식)
FIELDS = {
    CHECKUP: [
        ("checkup_date", "measured_date", "YYYY-MM-DD"),
        ("sex", "sex", "M | F"),
        ("age", "age", "세"),
        ("height_cm", "height", "cm"),
        ("weight_kg", "weight", "kg"),
        ("bmi", "bmi", "kg/m²"),
        ("waist_cm", "waist", "cm"),
        ("systolic_bp", "sbp", "mmHg"),
        ("diastolic_bp", "dbp", "mmHg"),
        ("fasting_glucose", "glucose", "mg/dL"),
        ("total_cholesterol", "tc", "mg/dL"),
        ("triglycerides", "tg", "mg/dL"),
        ("hdl_cholesterol", "hdl", "mg/dL"),
        ("ldl_cholesterol", "ldl", "mg/dL"),
        ("ast", "ast", "U/L"),
        ("alt", "alt", "U/L"),
        ("gamma_gtp", "ggt", "U/L"),
        ("hemoglobin", "hb", "g/dL"),
        ("serum_creatinine", "cr", "mg/dL"),
        ("egfr", "egfr", "mL/min/1.73m²"),
        ("urine_protein", "urine_protein", "음성 | 약양성 | 양성"),
        ("vision", "vision", "좌/우 문자열 예: 1.0/0.8"),
        ("overall_verdict", "verdict", "정상A | 정상B(경계) | 일반 질환의심 | 유질환자"),
        ("checkup_center", "center", "문자열"),
    ],
    BODY: [
        ("measured_date", "measured_date", "YYYY-MM-DD"),
        ("sex", "sex", "M | F"),
        ("age", "age", "세"),
        ("height_cm", "height", "cm"),
        ("weight_kg", "weight", "kg"),
        ("bmi", "bmi", "kg/m²"),
        ("body_fat_pct", "pbf", "%"),
        ("skeletal_muscle_kg", "smm", "kg"),
        ("basal_metabolic_rate_kcal", "bmr", "kcal"),
        ("body_fat_mass_kg", "fat", "kg"),
        ("fat_free_mass_kg", "ffm", "kg"),
        ("total_body_water_l", "tbw", "L"),
        ("protein_kg", "protein", "kg"),
        ("mineral_kg", "mineral", "kg"),
        ("waist_hip_ratio", "whr", "비율 예: 0.85"),
        ("visceral_fat_level", "vfl", "레벨(정수)"),
        ("body_composition_score", "score", "점"),
        ("target_weight_kg", "ideal_wt", "kg"),
        ("weight_control_kg", "wt_ctrl", "kg (음수=감량)"),
        ("fat_control_kg", "fat_ctrl", "kg (음수=감량)"),
        ("muscle_control_kg", "mus_ctrl", "kg"),
        ("segmental_muscle_right_arm_pct", "seg_ra", "% (표준 대비)"),
        ("segmental_muscle_left_arm_pct", "seg_la", "% (표준 대비)"),
        ("segmental_muscle_trunk_pct", "seg_tr", "% (표준 대비)"),
        ("segmental_muscle_right_leg_pct", "seg_rl", "% (표준 대비)"),
        ("segmental_muscle_left_leg_pct", "seg_ll", "% (표준 대비)"),
    ],
}

INTERNAL_DOC = {CHECKUP: "checkup", BODY: "inbody"}
