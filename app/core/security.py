import secrets

from fastapi import (
    Depends,
    HTTPException,
    status,
)

from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)

from app.core.config import (
    get_settings,
)


security = HTTPBearer(
    auto_error=False
)


def verify_api_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> None:
    """
    Backend -> AI Server 간 Bearer 인증을 검증한다.

    Authorization:
        Bearer <AI_SERVER_API_KEY>
    """

    settings = get_settings()

    expected_key = (
        settings.ai_server_api_key
    )

    # 서버 자체 인증 설정이 없는 경우
    if not expected_key:
        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "AI server authentication "
                "is not configured."
            ),
        )

    # Authorization Header 없음
    if credentials is None:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Missing authorization credentials."
            ),
        )

    # Bearer Scheme 확인
    if (
        credentials.scheme.lower()
        != "bearer"
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid authorization scheme."
            ),
        )

    provided_key = (
        credentials.credentials
    )

    # timing-safe 문자열 비교
    if not secrets.compare_digest(
        provided_key,
        expected_key,
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid AI server API key."
            ),
        )


# 기존 코드에서 명확한 이름을 사용할 수 있도록 alias 유지
verify_ai_server_key = (
    verify_api_key
)