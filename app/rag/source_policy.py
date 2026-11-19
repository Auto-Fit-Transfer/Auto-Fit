from typing import Final


ALLOWED_SOURCE_ORGS: Final[set[str]] = {
    "질병관리청",
    "보건복지부",
    "국민건강보험공단",
    "대한의학회",
    "대한비만학회",
    "대한당뇨병학회",
    "대한고혈압학회",
    "한국지질·동맥경화학회",
    "WHO",
    "CDC",
    "NIH",
    "ACSM",
}


ALLOWED_DOCUMENT_TYPES: Final[set[str]] = {
    "clinical_guideline",
    "official_guideline",
    "public_health_guideline",
    "systematic_review",
    "meta_analysis",
    "peer_reviewed_review",
}


def is_allowed_source(
    source_org: str,
    document_type: str,
    verified: bool,
) -> bool:
    """
    RAG에 저장하거나 사용할 수 있는
    공식/검증 출처인지 확인한다.

    허용 조건:
    1. verified=True
    2. source_org가 허용 기관 목록에 포함
    3. document_type이 허용 문서 유형에 포함
    """

    if not verified:
        return False

    if not isinstance(source_org, str):
        return False

    if not isinstance(document_type, str):
        return False

    source_org = source_org.strip()
    document_type = document_type.strip()

    if not source_org:
        return False

    if not document_type:
        return False

    if source_org not in ALLOWED_SOURCE_ORGS:
        return False

    if document_type not in ALLOWED_DOCUMENT_TYPES:
        return False

    return True


def validate_source_or_raise(
    source_org: str,
    document_type: str,
    verified: bool,
) -> None:
    """
    허용되지 않은 RAG 출처이면 예외를 발생시킨다.
    """

    if not is_allowed_source(
        source_org=source_org,
        document_type=document_type,
        verified=verified,
    ):
        raise ValueError(
            "허용되지 않은 RAG 문서 출처입니다."
        )