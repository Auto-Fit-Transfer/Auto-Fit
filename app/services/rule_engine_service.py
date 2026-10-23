from app.schemas.analysis import (
    BodyData,
    HealthData,
    MetricResult,
)


class RuleEngineService:
    """
    Auto-Fit Rule Engine

    - 질환을 확정 진단하지 않는다.
    - 상태 범주만 생성한다.
    - None 값은 분석에서 제외한다.
    """

    # =====================================================
    # Body
    # =====================================================

    def analyze_body(
        self,
        body_data: BodyData | None,
    ) -> dict[str, MetricResult]:
        if body_data is None:
            return {}

        result: dict[str, MetricResult] = {}

        if body_data.bmi is not None:
            result["bmi"] = self._analyze_bmi(
                body_data.bmi
            )

        if body_data.body_fat_percentage is not None:
            result["body_fat_percentage"] = self._collected(
                value=body_data.body_fat_percentage,
                name="체지방률",
            )

        if body_data.skeletal_muscle_mass_kg is not None:
            result["skeletal_muscle_mass_kg"] = self._collected(
                value=body_data.skeletal_muscle_mass_kg,
                name="골격근량",
            )

        if body_data.visceral_fat_level is not None:
            result["visceral_fat_level"] = self._collected(
                value=body_data.visceral_fat_level,
                name="내장지방 레벨",
            )

        if body_data.waist_hip_ratio is not None:
            result["waist_hip_ratio"] = self._collected(
                value=body_data.waist_hip_ratio,
                name="허리-엉덩이 비율",
            )

        if body_data.basal_metabolic_rate is not None:
            result["basal_metabolic_rate"] = self._collected(
                value=body_data.basal_metabolic_rate,
                name="기초대사량",
            )

        return result

    # =====================================================
    # Health
    # =====================================================

    def analyze_health(
        self,
        health_data: HealthData | None,
    ) -> dict[str, MetricResult]:
        if health_data is None:
            return {}

        result: dict[str, MetricResult] = {}

        # 혈압
        if (
            health_data.systolic_bp is not None
            or health_data.diastolic_bp is not None
        ):
            bp_result = self._analyze_blood_pressure(
                systolic_bp=health_data.systolic_bp,
                diastolic_bp=health_data.diastolic_bp,
            )

            if bp_result is not None:
                result["blood_pressure"] = bp_result

        # 공복혈당
        if health_data.fasting_glucose is not None:
            result["fasting_glucose"] = (
                self._analyze_fasting_glucose(
                    health_data.fasting_glucose
                )
            )

        # HbA1c
        if health_data.hba1c is not None:
            result["hba1c"] = self._analyze_hba1c(
                health_data.hba1c
            )

        # 총콜레스테롤
        if health_data.total_cholesterol is not None:
            result["total_cholesterol"] = (
                self._analyze_total_cholesterol(
                    health_data.total_cholesterol
                )
            )

        # LDL
        if health_data.ldl is not None:
            result["ldl"] = self._analyze_ldl(
                health_data.ldl
            )

        # HDL
        if health_data.hdl is not None:
            result["hdl"] = self._analyze_hdl(
                health_data.hdl
            )

        # 중성지방
        if health_data.triglyceride is not None:
            result["triglyceride"] = (
                self._analyze_triglyceride(
                    health_data.triglyceride
                )
            )

        # 수집만 하는 항목
        if health_data.ast is not None:
            result["ast"] = self._collected(
                health_data.ast,
                "AST",
            )

        if health_data.alt is not None:
            result["alt"] = self._collected(
                health_data.alt,
                "ALT",
            )

        if health_data.gamma_gtp is not None:
            result["gamma_gtp"] = self._collected(
                health_data.gamma_gtp,
                "Gamma-GTP",
            )

        if health_data.creatinine is not None:
            result["creatinine"] = self._collected(
                health_data.creatinine,
                "크레아티닌",
            )

        return result

    # =====================================================
    # BMI
    # =====================================================

    def _analyze_bmi(
        self,
        value: float,
    ) -> MetricResult:
        if value < 18.5:
            return MetricResult(
                value=value,
                status="underweight",
                message="BMI가 저체중 범위에 해당합니다.",
                criterion="BMI < 18.5 kg/m²",
                source="대한비만학회",
                reference="대한비만학회 비만 진료지침 2022 8판",
            )

        if value < 23:
            return MetricResult(
                value=value,
                status="normal",
                message="BMI가 정상 범위에 해당합니다.",
                criterion="18.5 ≤ BMI < 23.0 kg/m²",
                source="대한비만학회",
                reference="대한비만학회 비만 진료지침 2022 8판",
            )

        if value < 25:
            return MetricResult(
                value=value,
                status="overweight",
                message="BMI가 비만 전단계 범위에 해당합니다.",
                criterion="23.0 ≤ BMI < 25.0 kg/m²",
                source="대한비만학회",
                reference="대한비만학회 비만 진료지침 2022 8판",
            )

        if value < 30:
            return MetricResult(
                value=value,
                status="obesity_class_1",
                message="BMI가 1단계 비만 범위에 해당합니다.",
                criterion="25.0 ≤ BMI < 30.0 kg/m²",
                source="대한비만학회",
                reference="대한비만학회 비만 진료지침 2022 8판",
            )

        if value < 35:
            return MetricResult(
                value=value,
                status="obesity_class_2",
                message="BMI가 2단계 비만 범위에 해당합니다.",
                criterion="30.0 ≤ BMI < 35.0 kg/m²",
                source="대한비만학회",
                reference="대한비만학회 비만 진료지침 2022 8판",
            )

        return MetricResult(
            value=value,
            status="obesity_class_3",
            message="BMI가 3단계 비만 범위에 해당합니다.",
            criterion="BMI ≥ 35.0 kg/m²",
            source="대한비만학회",
            reference="대한비만학회 비만 진료지침 2022 8판",
        )

    # =====================================================
    # Blood Pressure
    # =====================================================

    def _analyze_blood_pressure(
        self,
        systolic_bp: float | None,
        diastolic_bp: float | None,
    ) -> MetricResult | None:
        """
        수축기/이완기 중 더 높은 위험 범주를 적용한다.
        """

        if (
            systolic_bp is None
            and diastolic_bp is None
        ):
            return None

        value = {
            "systolic": systolic_bp,
            "diastolic": diastolic_bp,
        }

        if (
            systolic_bp is not None
            and systolic_bp >= 140
        ) or (
            diastolic_bp is not None
            and diastolic_bp >= 90
        ):
            return MetricResult(
                value=value,
                status="hypertension_range",
                message="혈압이 고혈압 범위에 해당합니다.",
                criterion=(
                    "수축기 ≥ 140 mmHg 또는 "
                    "이완기 ≥ 90 mmHg"
                ),
                source="대한고혈압학회",
                reference="대한고혈압학회 고혈압 진료지침",
            )

        if (
            systolic_bp is not None
            and 130 <= systolic_bp <= 139
        ) or (
            diastolic_bp is not None
            and 85 <= diastolic_bp <= 89
        ):
            return MetricResult(
                value=value,
                status="prehypertension_stage_2",
                message="혈압이 전고혈압 2단계 범위에 해당합니다.",
                criterion=(
                    "수축기 130~139 mmHg 또는 "
                    "이완기 85~89 mmHg"
                ),
                source="대한고혈압학회",
                reference="대한고혈압학회 고혈압 진료지침",
            )

        if (
            systolic_bp is not None
            and 120 <= systolic_bp <= 129
        ) or (
            diastolic_bp is not None
            and 80 <= diastolic_bp <= 84
        ):
            return MetricResult(
                value=value,
                status="prehypertension_stage_1",
                message="혈압이 전고혈압 1단계 범위에 해당합니다.",
                criterion=(
                    "수축기 120~129 mmHg 또는 "
                    "이완기 80~84 mmHg"
                ),
                source="대한고혈압학회",
                reference="대한고혈압학회 고혈압 진료지침",
            )

        return MetricResult(
            value=value,
            status="normal",
            message="혈압이 정상 범위에 해당합니다.",
            criterion=(
                "수축기 < 120 mmHg 및 "
                "이완기 < 80 mmHg"
            ),
            source="대한고혈압학회",
            reference="대한고혈압학회 고혈압 진료지침",
        )

    # =====================================================
    # Fasting Glucose
    # =====================================================

    def _analyze_fasting_glucose(
        self,
        value: float,
    ) -> MetricResult:
        if value < 100:
            return MetricResult(
                value=value,
                status="normal",
                message="공복혈당이 정상 범위에 해당합니다.",
                criterion="공복혈당 < 100 mg/dL",
                source="대한당뇨병학회",
                reference="대한당뇨병학회 당뇨병 진단기준",
            )

        if value <= 125:
            return MetricResult(
                value=value,
                status="impaired_fasting_glucose",
                message="공복혈당장애 범위에 해당합니다.",
                criterion="100 ≤ 공복혈당 ≤ 125 mg/dL",
                source="대한당뇨병학회",
                reference="대한당뇨병학회 당뇨병 진단기준",
            )

        return MetricResult(
            value=value,
            status="diabetes_range",
            message="공복혈당이 당뇨병 진단 기준 범위에 해당합니다.",
            criterion="공복혈당 ≥ 126 mg/dL",
            source="대한당뇨병학회",
            reference="대한당뇨병학회 당뇨병 진단기준",
        )

    # =====================================================
    # HbA1c
    # =====================================================

    def _analyze_hba1c(
        self,
        value: float,
    ) -> MetricResult:
        if value < 5.7:
            return MetricResult(
                value=value,
                status="normal",
                message="HbA1c가 정상 범위에 해당합니다.",
                criterion="HbA1c < 5.7%",
                source="대한당뇨병학회",
                reference="대한당뇨병학회 당뇨병 진단기준",
            )

        if value <= 6.4:
            return MetricResult(
                value=value,
                status="prediabetes_range",
                message="HbA1c가 당뇨병 전단계 범위에 해당합니다.",
                criterion="5.7% ≤ HbA1c ≤ 6.4%",
                source="대한당뇨병학회",
                reference="대한당뇨병학회 당뇨병 진단기준",
            )

        return MetricResult(
            value=value,
            status="diabetes_range",
            message="HbA1c가 당뇨병 진단 기준 범위에 해당합니다.",
            criterion="HbA1c ≥ 6.5%",
            source="대한당뇨병학회",
            reference="대한당뇨병학회 당뇨병 진단기준",
        )

    # =====================================================
    # Total Cholesterol
    # =====================================================

    def _analyze_total_cholesterol(
        self,
        value: float,
    ) -> MetricResult:
        if value < 200:
            status = "desirable"
            message = "총콜레스테롤이 바람직한 범위에 해당합니다."
            criterion = "총콜레스테롤 < 200 mg/dL"

        elif value < 240:
            status = "borderline_high"
            message = "총콜레스테롤이 경계 범위에 해당합니다."
            criterion = "200 ≤ 총콜레스테롤 < 240 mg/dL"

        else:
            status = "high"
            message = "총콜레스테롤이 높은 범위에 해당합니다."
            criterion = "총콜레스테롤 ≥ 240 mg/dL"

        return MetricResult(
            value=value,
            status=status,
            message=message,
            criterion=criterion,
            source="한국지질·동맥경화학회",
            reference="이상지질혈증 진료지침",
        )

    # =====================================================
    # LDL
    # =====================================================

    def _analyze_ldl(
        self,
        value: float,
    ) -> MetricResult:
        if value < 100:
            status = "optimal"
            message = "LDL 콜레스테롤이 최적 범위에 해당합니다."
            criterion = "LDL < 100 mg/dL"

        elif value < 130:
            status = "near_optimal"
            message = "LDL 콜레스테롤이 준최적 범위에 해당합니다."
            criterion = "100 ≤ LDL < 130 mg/dL"

        elif value < 160:
            status = "borderline_high"
            message = "LDL 콜레스테롤이 경계 범위에 해당합니다."
            criterion = "130 ≤ LDL < 160 mg/dL"

        elif value < 190:
            status = "high"
            message = "LDL 콜레스테롤이 높은 범위에 해당합니다."
            criterion = "160 ≤ LDL < 190 mg/dL"

        else:
            status = "very_high"
            message = "LDL 콜레스테롤이 매우 높은 범위에 해당합니다."
            criterion = "LDL ≥ 190 mg/dL"

        return MetricResult(
            value=value,
            status=status,
            message=message,
            criterion=criterion,
            source="한국지질·동맥경화학회",
            reference="이상지질혈증 진료지침",
        )

    # =====================================================
    # HDL
    # =====================================================

    def _analyze_hdl(
        self,
        value: float,
    ) -> MetricResult:
        if value < 40:
            return MetricResult(
                value=value,
                status="low",
                message="HDL 콜레스테롤이 낮은 범위에 해당합니다.",
                criterion="HDL < 40 mg/dL",
                source="한국지질·동맥경화학회",
                reference="이상지질혈증 진료지침",
            )

        return MetricResult(
            value=value,
            status="normal",
            message="HDL 콜레스테롤이 정상 범위에 해당합니다.",
            criterion="HDL ≥ 40 mg/dL",
            source="한국지질·동맥경화학회",
            reference="이상지질혈증 진료지침",
        )

    # =====================================================
    # Triglyceride
    # =====================================================

    def _analyze_triglyceride(
        self,
        value: float,
    ) -> MetricResult:
        if value < 150:
            status = "normal"
            message = "중성지방이 정상 범위에 해당합니다."
            criterion = "중성지방 < 150 mg/dL"

        elif value < 200:
            status = "borderline_high"
            message = "중성지방이 경계 범위에 해당합니다."
            criterion = "150 ≤ 중성지방 < 200 mg/dL"

        elif value < 500:
            status = "high"
            message = "중성지방이 높은 범위에 해당합니다."
            criterion = "200 ≤ 중성지방 < 500 mg/dL"

        else:
            status = "very_high"
            message = "중성지방이 매우 높은 범위에 해당합니다."
            criterion = "중성지방 ≥ 500 mg/dL"

        return MetricResult(
            value=value,
            status=status,
            message=message,
            criterion=criterion,
            source="한국지질·동맥경화학회",
            reference="이상지질혈증 진료지침",
        )

    # =====================================================
    # Collected
    # =====================================================

    def _collected(
        self,
        value,
        name: str,
    ) -> MetricResult:
        return MetricResult(
            value=value,
            status="collected",
            message=f"{name} 데이터가 수집되었습니다.",
            criterion=None,
            source=None,
            reference=None,
        )