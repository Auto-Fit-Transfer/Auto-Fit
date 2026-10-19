import re
from typing import Any


ALLOWED_HEALTH_FIELDS = {
    "age",
    "age_group",
    "gender",
    "height_cm",
    "weight_kg",
    "bmi",
    "body_fat_percentage",
    "skeletal_muscle_mass_kg",
    "visceral_fat_level",
    "waist_hip_ratio",
    "basal_metabolic_rate",
    "systolic_bp",
    "diastolic_bp",
    "fasting_glucose",
    "hba1c",
    "total_cholesterol",
    "ldl",
    "hdl",
    "triglyceride",
    "ast",
    "alt",
    "gamma_gtp",
    "creatinine",
}


FORBIDDEN_FIELDS = {
    "name",
    "full_name",
    "phone",
    "phone_number",
    "email",
    "address",
    "resident_number",
    "ssn",
    "password",
    "access_token",
    "refresh_token",
    "api_key",
    "authorization",
    "patient_number",
    "medical_record_number",
    "birth_date",
    "birthdate",
}


class PrivacyService:

    @staticmethod
    def contains_forbidden_field(data: Any) -> bool:

        if isinstance(data, dict):
            for key, value in data.items():

                if key.lower() in FORBIDDEN_FIELDS:
                    return True

                if PrivacyService.contains_forbidden_field(value):
                    return True

        elif isinstance(data, list):
            for item in data:
                if PrivacyService.contains_forbidden_field(item):
                    return True

        return False

    @staticmethod
    def sanitize_dict(
        data: dict[str, Any],
    ) -> dict[str, Any]:

        safe_data: dict[str, Any] = {}

        for key, value in data.items():

            if key.lower() in FORBIDDEN_FIELDS:
                continue

            if isinstance(value, dict):
                safe_data[key] = PrivacyService.sanitize_dict(value)

            elif isinstance(value, list):
                safe_data[key] = [
                    PrivacyService.sanitize_dict(item)
                    if isinstance(item, dict)
                    else item
                    for item in value
                ]

            else:
                safe_data[key] = value

        return safe_data

    @staticmethod
    def filter_health_data(
        data: dict[str, Any],
    ) -> dict[str, Any]:

        return {
            key: value
            for key, value in data.items()
            if key in ALLOWED_HEALTH_FIELDS
        }

    # --------------------------------------------------
    # 자유 텍스트 개인정보 제거
    # --------------------------------------------------

    @staticmethod
    def sanitize_text(text: str) -> str:

        if not text:
            return text

        safe_text = text

        # 이메일
        safe_text = re.sub(
            (
                r"(?<![A-Za-z0-9._%+-])"
                r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
                r"(?![A-Za-z0-9.-])"
            ),
            "[EMAIL_REMOVED]",
            safe_text,
        )

        # 대한민국 휴대전화 번호
        safe_text = re.sub(
            r"(?<!\d)01[016789][-\s]?\d{3,4}[-\s]?\d{4}(?!\d)",
            "[PHONE_REMOVED]",
            safe_text,
        )

        # 주민등록번호 형태
        safe_text = re.sub(
            r"(?<!\d)\d{6}[-\s]?[1-4]\d{6}(?!\d)",
            "[RESIDENT_NUMBER_REMOVED]",
            safe_text,
        )

        # Bearer Token
        safe_text = re.sub(
            r"Bearer\s+[A-Za-z0-9._\-]+",
            "[TOKEN_REMOVED]",
            safe_text,
            flags=re.IGNORECASE,
        )

        # OpenAI 스타일 API Key
        safe_text = re.sub(
            r"(?<![A-Za-z0-9_\-])sk-[A-Za-z0-9_\-]{10,}(?![A-Za-z0-9_\-])",
            "[API_KEY_REMOVED]",
            safe_text,
        )

        return safe_text


privacy_service = PrivacyService()
