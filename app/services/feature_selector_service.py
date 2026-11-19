from typing import Any


class FeatureSelectorService:
    """
    Auto-Fit 분석 파이프라인에 필요한 필드만 선별한다.

    역할:
    1. Rule Engine에서 사용할 필드 선택
    2. RAG에서 참고할 수 있는 안전한 메타정보 생성
    3. 지원하지 않는 입력 필드 식별

    개인정보나 인증정보는 분석 입력에 포함하지 않는다.
    """

    # =====================================================
    # Rule Engine 지원 필드
    # =====================================================

    BODY_FIELDS = {
        "bmi",
        "body_fat_percentage",
        "skeletal_muscle_mass_kg",
        "visceral_fat_level",
        "waist_hip_ratio",
        "basal_metabolic_rate",
    }

    HEALTH_FIELDS = {
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

    # =====================================================
    # 절대 분석에 포함하지 않을 필드
    # =====================================================

    FORBIDDEN_FIELDS = {
        "user_id",
        "name",
        "username",
        "email",
        "phone",
        "phone_number",
        "address",
        "birth_date",
        "birthday",
        "resident_number",
        "rrn",
        "password",
        "token",
        "access_token",
        "refresh_token",
        "api_key",
        "authorization",
    }

    # =====================================================
    # Main
    # =====================================================

    def build_safe_analysis_inputs(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """
        AnalysisRequest payload에서
        Rule Engine / RAG용 안전 입력을 생성한다.

        예상 payload:

        {
            "body_data": {...},
            "health_data": {...}
        }
        """

        if not isinstance(
            payload,
            dict,
        ):
            payload = {}

        # -------------------------------------------------
        # 1. body / health 데이터 꺼내기
        # -------------------------------------------------

        raw_body_data = payload.get(
            "body_data",
            {},
        )

        raw_health_data = payload.get(
            "health_data",
            {},
        )

        if not isinstance(
            raw_body_data,
            dict,
        ):
            raw_body_data = {}

        if not isinstance(
            raw_health_data,
            dict,
        ):
            raw_health_data = {}

        # -------------------------------------------------
        # 2. Rule Engine 입력 생성
        # -------------------------------------------------

        safe_body_data = self._filter_supported_fields(
            data=raw_body_data,
            allowed_fields=self.BODY_FIELDS,
        )

        safe_health_data = self._filter_supported_fields(
            data=raw_health_data,
            allowed_fields=self.HEALTH_FIELDS,
        )

        rule_engine_input = {
            "body_data": safe_body_data,
            "health_data": safe_health_data,
        }

        # -------------------------------------------------
        # 3. RAG 입력 생성
        #
        # 원본 건강 수치를 넣지 않는다.
        # 현재 어떤 metric이 존재하는지만 전달한다.
        # -------------------------------------------------

        available_metrics = sorted(
            list(
                safe_body_data.keys()
            )
            + list(
                safe_health_data.keys()
            )
        )

        rag_input = {
            "available_metrics": (
                available_metrics
            ),
        }

        # -------------------------------------------------
        # 4. 지원하지 않는 필드 찾기
        # -------------------------------------------------

        unsupported_fields = (
            self._collect_unsupported_fields(
                raw_body_data,
                raw_health_data,
            )
        )

        return {
            "rule_engine_input": (
                rule_engine_input
            ),

            "rag_input": (
                rag_input
            ),

            "unsupported_fields": (
                unsupported_fields
            ),
        }

    # =====================================================
    # Supported Field Filter
    # =====================================================

    def _filter_supported_fields(
        self,
        data: dict[str, Any],
        allowed_fields: set[str],
    ) -> dict[str, Any]:
        """
        허용된 필드만 전달한다.

        None은 Rule Engine 분석에 사용할 수 없으므로
        입력 단계에서 제외한다.
        """

        result: dict[str, Any] = {}

        for key, value in data.items():

            if key in self.FORBIDDEN_FIELDS:
                continue

            if key not in allowed_fields:
                continue

            if value is None:
                continue

            result[key] = value

        return result

    # =====================================================
    # Unsupported Fields
    # =====================================================

    def _collect_unsupported_fields(
        self,
        body_data: dict[str, Any],
        health_data: dict[str, Any],
    ) -> list[str]:
        """
        값이 존재하지만 현재 Rule Engine에서
        사용하지 않는 필드를 찾는다.

        개인정보 필드는 unsupported_fields에도
        노출하지 않는다.
        """

        unsupported: set[str] = set()

        for key, value in body_data.items():

            if value is None:
                continue

            if key in self.FORBIDDEN_FIELDS:
                continue

            if key not in self.BODY_FIELDS:
                unsupported.add(
                    f"body_data.{key}"
                )

        for key, value in health_data.items():

            if value is None:
                continue

            if key in self.FORBIDDEN_FIELDS:
                continue

            if key not in self.HEALTH_FIELDS:
                unsupported.add(
                    f"health_data.{key}"
                )

        return sorted(
            unsupported
        )


feature_selector_service = (
    FeatureSelectorService()
)