from app.schemas.health_analysis import (
    HealthAnalysisRequest,
)


class HealthAnalysisValidationError(Exception):
    def __init__(
        self,
        message: str,
        fields: list[str],
    ):
        super().__init__(
            message
        )

        self.message = message
        self.fields = fields


def validate_health_analysis_request(
    request: HealthAnalysisRequest,
) -> None:
    """
    Backend -> Model Server 건강 분석 요청을 검증한다.

    Backend는 ready=true일 때만 호출하는 것이 원칙이지만,
    모델 서버에서도 방어적으로 입력값을 다시 검증한다.
    """

    missing_fields: list[str] = []

    health_checkup = (
        request.input.health_checkup
    )

    body_composition = (
        request.input.body_composition
    )

    # =====================================================
    # Health Checkup
    # =====================================================

    if health_checkup is None:
        missing_fields.append(
            "input.health_checkup"
        )

    else:
        health_values = (
            health_checkup.model_dump(
                exclude_none=True
            )
        )

        # {} 같은 빈 객체 차단
        if not health_values:
            missing_fields.append(
                "input.health_checkup"
            )

    # =====================================================
    # Body Composition
    # =====================================================

    if body_composition is None:
        missing_fields.append(
            "input.body_composition"
        )

    else:
        body_values = (
            body_composition.model_dump(
                exclude_none=True
            )
        )

        # {} 같은 빈 객체 차단
        if not body_values:
            missing_fields.append(
                "input.body_composition"
            )

    # =====================================================
    # Missing Required Input
    # =====================================================

    if missing_fields:
        raise HealthAnalysisValidationError(
            message=(
                "Required health analysis "
                "input is missing."
            ),
            fields=missing_fields,
        )

    # =====================================================
    # request_id
    # =====================================================

    if not request.request_id.strip():
        raise HealthAnalysisValidationError(
            message=(
                "request_id is required."
            ),
            fields=[
                "request_id"
            ],
        )

    # =====================================================
    # schema_version
    # =====================================================

    if (
        request.schema_version
        != "1.0"
    ):
        raise HealthAnalysisValidationError(
            message=(
                "Unsupported schema_version."
            ),
            fields=[
                "schema_version"
            ],
        )