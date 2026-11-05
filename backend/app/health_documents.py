from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any, Callable, Literal
import os
from uuid import UUID, uuid4

import httpx
from fastapi.routing import APIRoute
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


HEALTH_DOCUMENT_BUCKET = "health-documents"
MAX_HEALTH_DOCUMENT_BYTES = 10 * 1024 * 1024
DocumentType = Literal["health_checkup", "body_composition"]


class HealthCheckupData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    checkup_date: date | None = Field(default=None, description="검진일 YYYY-MM-DD. 확정 시 필수")
    height_cm: Decimal | None = Field(default=None, ge=50, le=300, description="단위: cm. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    weight_kg: Decimal | None = Field(default=None, ge=1, le=500, description="단위: kg. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    bmi: Decimal | None = Field(default=None, ge=1, le=100, description="단위: kg/m². Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    systolic_bp: int | None = Field(default=None, ge=30, le=300, description="단위: mmHg. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    diastolic_bp: int | None = Field(default=None, ge=20, le=200, description="단위: mmHg. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    fasting_glucose: Decimal | None = Field(default=None, ge=0, le=2000, description="단위: mg/dL. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    total_cholesterol: Decimal | None = Field(default=None, ge=0, le=2000, description="단위: mg/dL. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    hdl_cholesterol: Decimal | None = Field(default=None, ge=0, le=1000, description="단위: mg/dL. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    ldl_cholesterol: Decimal | None = Field(default=None, ge=0, le=2000, description="단위: mg/dL. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    triglycerides: Decimal | None = Field(default=None, ge=0, le=5000, description="단위: mg/dL. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    ast: Decimal | None = Field(default=None, ge=0, le=10000, description="단위: U/L. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    alt: Decimal | None = Field(default=None, ge=0, le=10000, description="단위: U/L. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    gamma_gtp: Decimal | None = Field(default=None, ge=0, le=10000, description="단위: U/L. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    hemoglobin: Decimal | None = Field(default=None, ge=0, le=100, description="단위: g/dL. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    creatinine: Decimal | None = Field(default=None, ge=0, le=100, description="단위: mg/dL. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    institution_name: str | None = Field(default=None, max_length=200)
    checkup_type: str | None = Field(default=None, max_length=100)

    @field_validator("institution_name", "checkup_type", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        return value.strip() or None


class BodyCompositionData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measured_at: datetime | None = Field(default=None, description="측정 시각 ISO 8601. 시간대 포함 권장. 확정 시 필수")
    height_cm: Decimal | None = Field(default=None, ge=50, le=300, description="단위: cm. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    weight_kg: Decimal | None = Field(default=None, ge=1, le=500, description="단위: kg. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    skeletal_muscle_mass_kg: Decimal | None = Field(default=None, ge=0, le=300, description="단위: kg. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    body_fat_mass_kg: Decimal | None = Field(default=None, ge=0, le=300, description="단위: kg. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    body_fat_percentage: Decimal | None = Field(default=None, ge=0, le=100, description="단위: %. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    bmi: Decimal | None = Field(default=None, ge=1, le=100, description="단위: kg/m². Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    basal_metabolic_rate: Decimal | None = Field(default=None, ge=0, le=10000, description="단위: kcal/day. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    visceral_fat_level: Decimal | None = Field(default=None, ge=0, le=100, description="단위: level. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    body_water_percentage: Decimal | None = Field(default=None, ge=0, le=100, description="단위: %. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    body_water_liters: Decimal | None = Field(default=None, ge=0, le=300, description="단위: L. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    protein_percentage: Decimal | None = Field(default=None, ge=0, le=100, description="단위: %. Decimal 값은 응답에서 문자열로 직렬화됩니다.")
    device_name: str | None = Field(default=None, max_length=200)

    @field_validator("device_name", mode="before")
    @classmethod
    def normalize_device_name(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        return value.strip() or None


class OCRResultUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extracted_data: HealthCheckupData | BodyCompositionData = Field(
        description="문서 종류에 맞는 필드만 허용. 보낸 필드만 갱신; null은 해당 값을 비웁니다."
    )


class DocumentErrorDetail(BaseModel):
    code: str
    message: str
    fields: list[str] | None = None


class DocumentError(BaseModel):
    detail: DocumentErrorDetail


class UploadMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")
    uploaded_file_id: UUID
    document_type: DocumentType
    original_file_name: str | None = Field(default=None, description="업로드 시 DB에 보존한 사용자 표시용 원본 파일명")


class OCRMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")
    status: Literal["pending", "processing", "completed", "failed"]


class OCRReview(BaseModel):
    field_confidence: dict[str, float] = Field(default_factory=dict)
    review_required: list[str] = Field(default_factory=list)
    pages_total: int | None = None
    pages_read: int | None = None
    pages_used: list[int] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    measurement_time_assumed: bool = False


class DocumentResponseBase(BaseModel):
    uploaded_file_id: UUID
    file_name: str
    original_file_name: str = Field(description="사용자 표시용 원본 파일명. 기존 문서에 값이 없으면 file_name 사용")
    uploaded_at: datetime
    ocr_status: Literal["pending", "processing", "completed", "failed"]
    status: Literal["awaiting_review", "confirmed", "failed"]
    ocr_review: OCRReview | None = None
    error: DocumentErrorDetail | None = None
    file: UploadMetadata = Field(description="기존 클라이언트 호환용 파일 메타데이터")
    ocr_result: OCRMetadata | None = None


class HealthCheckupDocumentResponse(DocumentResponseBase):
    document_type: Literal["health_checkup"]
    extracted_data: HealthCheckupData


class BodyCompositionDocumentResponse(DocumentResponseBase):
    document_type: Literal["body_composition"]
    extracted_data: BodyCompositionData


DocumentResponse = Annotated[
    HealthCheckupDocumentResponse | BodyCompositionDocumentResponse,
    Field(discriminator="document_type"),
]


class DocumentListItem(BaseModel):
    uploaded_file_id: UUID
    original_file_name: str
    file_name: str
    document_type: DocumentType
    uploaded_at: datetime
    status: Literal["awaiting_review", "confirmed", "failed"]


class DocumentListResponse(BaseModel):
    items: list[DocumentListItem]
    limit: int
    offset: int
    has_more: bool


class ConfirmationResponse(BaseModel):
    uploaded_file_id: UUID
    document_type: DocumentType
    status: Literal["confirmed"]
    health_checkup_id: UUID | None = None
    body_composition_id: UUID | None = None
    already_confirmed: bool
    file: UploadMetadata
    health_data: dict[str, Any] = Field(description="저장된 DB 레코드; 생성 ID는 최상위 필드 사용")


class DocumentDeletionResponse(BaseModel):
    uploaded_file_id: UUID
    document_type: DocumentType
    status: Literal["deleted"]
    health_checkup_id: UUID | None = None
    body_composition_id: UUID | None = None


DOCUMENT_ERRORS = {
    code: {"model": DocumentError, "description": description}
    for code, description in {
        401: "AUTH_REQUIRED: 인증 실패 또는 세션 만료",
        404: "DOCUMENT_NOT_FOUND: 문서 없음 또는 다른 사용자 소유",
        409: "DOCUMENT_CONFIRMED / DOCUMENT_NOT_CONFIRMED / OCR_NOT_READY / OCR_REVIEW_REQUIRED: 문서 상태 충돌",
        413: "FILE_TOO_LARGE: 최대 10 MiB",
        415: "UNSUPPORTED_FILE_TYPE: PDF/PNG/JPEG/HEIC만 허용",
        422: "VALIDATION_ERROR / UNKNOWN_DOCUMENT / UNSUPPORTED_DOCUMENT / DOCUMENT_TYPE_MISMATCH / NO_FIELDS_FOUND / CORRUPTED_FILE: 입력 오류 또는 문서 종류 판별 불가",
        502: "DATA_SOURCE_ERROR / OCR_FAILED / OCR_INVALID_RESPONSE / OCR_NOT_CONFIGURED / OCR_AUTH_FAILED / OCR_TIMEOUT / OCR_ENGINE_ERROR: 저장소/DB/OCR 호출 실패",
    }.items()
}


def _document_status(processing_status: str | None, ocr_status: str) -> str:
    if processing_status == "manually_confirmed":
        return "confirmed"
    return "failed" if ocr_status == "failed" else "awaiting_review"


def _document_response(document: dict[str, Any]) -> dict[str, Any]:
    file = document["file"]
    ocr = document["ocr_result"]
    ocr_status = ocr["status"] if ocr else "pending"
    return {
        **document,
        "uploaded_file_id": file["uploaded_file_id"],
        "document_type": file["document_type"],
        "file_name": file["file_name"],
        "original_file_name": file.get("original_file_name") or file["file_name"],
        "uploaded_at": file["uploaded_at"],
        "ocr_status": ocr_status,
        "status": _document_status(file.get("processing_status"), ocr_status),
        "extracted_data": (ocr or {}).get("extracted_data") or _empty_extracted_data(file["document_type"]),
        "error": {"code": (ocr or {}).get("error_message") or "OCR_FAILED",
                  "message": "OCR 결과를 추출하지 못했습니다. 다시 업로드하거나 직접 입력해 주세요.",
                  "fields": None} if ocr_status == "failed" else None,
    }


OCR_FIELD_ALIASES = {
    "health_checkup": {"serum_creatinine": "creatinine", "checkup_center": "institution_name"},
    "body_composition": {
        "measured_date": "measured_at", "body_fat_pct": "body_fat_percentage",
        "skeletal_muscle_kg": "skeletal_muscle_mass_kg",
        "basal_metabolic_rate_kcal": "basal_metabolic_rate", "total_body_water_l": "body_water_liters",
    },
}
OCR_EXTRA_FIELDS = {
    "health_checkup": {"sex", "age", "waist_cm", "egfr", "urine_protein", "vision", "overall_verdict"},
    "body_composition": {"sex", "age", "fat_free_mass_kg", "protein_kg", "mineral_kg", "waist_hip_ratio",
        "body_composition_score", "target_weight_kg", "weight_control_kg", "fat_control_kg", "muscle_control_kg",
        "segmental_muscle_right_arm_pct", "segmental_muscle_left_arm_pct", "segmental_muscle_trunk_pct",
        "segmental_muscle_right_leg_pct", "segmental_muscle_left_leg_pct"},
}


def _normalize_ocr(result: dict[str, Any], kind: DocumentType, review: dict[str, Any] | None) -> dict[str, Any]:
    data = result["extracted_data"]
    if not isinstance(data, dict):
        raise TypeError("Invalid extraction")
    model = HealthCheckupData if kind == "health_checkup" else BodyCompositionData
    aliases = OCR_FIELD_ALIASES[kind]
    normalized = {}
    for key, value in data.items():
        target = aliases.get(key, key)
        if key in OCR_EXTRA_FIELDS[kind]:
            continue
        if target not in model.model_fields or (target in normalized and normalized[target] != value):
            raise TypeError("Unexpected or conflicting OCR field")
        if key == "measured_date" and value is not None:
            # OCR supplies a date only. Store Korea-local midnight, explicitly marked as assumed.
            value = date.fromisoformat(value).isoformat() + "T00:00:00+09:00"
        normalized[target] = value
    validated = _validate_extracted_data(kind, normalized, require_measurement_date=False)
    if review is not None:
        meta = result.get("meta", {})
        if not isinstance(meta, dict):
            raise TypeError("Invalid OCR metadata")
        source_confidence = result.get("field_confidence", {})
        source_required = result.get("review_required", [])
        if not isinstance(source_confidence, dict) or not isinstance(source_required, list):
            raise TypeError("Invalid OCR review metadata")
        confidence = {aliases.get(k, k): v for k, v in source_confidence.items()
                      if aliases.get(k, k) in model.model_fields and isinstance(v, (int, float))
                      and not isinstance(v, bool) and 0 <= v <= 1}
        required = [aliases.get(k, k) for k in source_required
                    if isinstance(k, str) and aliases.get(k, k) in model.model_fields]
        for key, value in validated.items():
            if value is None and key not in required:
                required.append(key)
        warnings = meta.get("warnings", [])
        if not isinstance(warnings, list) or not all(isinstance(item, str) for item in warnings):
            raise TypeError("Invalid OCR warnings")
        warnings = list(warnings)

        def flag_review(key: str, warning: str) -> None:
            if validated.get(key) is not None and key not in required:
                required.append(key)
            if warning not in warnings:
                warnings.append(warning)

        if kind == "health_checkup" and validated.get("checkup_date") is None:
            warning = "검진일을 읽지 못해 추출값 전체를 확인해야 합니다."
            for key, value in validated.items():
                if value is not None:
                    flag_review(key, warning)
        elif kind == "body_composition":
            height = validated.get("height_cm")
            weight = validated.get("weight_kg")
            bmi = validated.get("bmi")
            if height is not None and weight is not None and bmi is not None:
                expected_bmi = Decimal(str(weight)) / (Decimal(str(height)) / 100) ** 2
                if abs(Decimal(str(bmi)) - expected_bmi) > max(Decimal("1"), expected_bmi * Decimal("0.1")):
                    flag_review("bmi", "신장·체중과 BMI가 서로 일치하지 않습니다.")
            fat_mass = validated.get("body_fat_mass_kg")
            fat_pct = validated.get("body_fat_percentage")
            if weight is not None and Decimal(str(weight)) > 0 and fat_mass is not None and fat_pct is not None:
                expected_fat_pct = Decimal(str(fat_mass)) / Decimal(str(weight)) * 100
                if abs(Decimal(str(fat_pct)) - expected_fat_pct) > Decimal("3"):
                    flag_review("body_fat_percentage", "체중·체지방량과 체지방률이 서로 일치하지 않습니다.")
            muscle = validated.get("skeletal_muscle_mass_kg")
            if weight is not None and muscle is not None and Decimal(str(muscle)) > Decimal(str(weight)):
                flag_review("skeletal_muscle_mass_kg", "골격근량이 체중보다 커서 확인이 필요합니다.")
        review.update(OCRReview(field_confidence=confidence, review_required=required,
            pages_total=meta.get("pages_total"), pages_read=meta.get("pages_read"),
            pages_used=meta.get("pages_used", []), warnings=warnings,
            measurement_time_assumed=kind == "body_composition" and data.get("measured_date") is not None).model_dump(mode="json"))
    return validated


def _ocr_http_error(exc: httpx.HTTPStatusError) -> tuple[str, int]:
    try:
        payload = exc.response.json()
        code = payload.get("error", {}).get("code") if isinstance(payload, dict) else None
    except (ValueError, AttributeError):
        code = None
    allowed = {
        "CORRUPTED_FILE": 422, "EMPTY_FILE": 422, "UNSUPPORTED_DOCUMENT": 422,
        "DOCUMENT_TYPE_MISMATCH": 422, "NO_FIELDS_FOUND": 422,
        "UNSUPPORTED_FILE_TYPE": 415, "FILE_TOO_LARGE": 413,
        "UNAUTHORIZED": 502, "OCR_ENGINE_ERROR": 502, "OCR_TIMEOUT": 502,
    }
    if isinstance(code, str) and code in allowed:
        return ("OCR_AUTH_FAILED" if code == "UNAUTHORIZED" else code), allowed[code]
    return ("UNSUPPORTED_DOCUMENT", 422) if exc.response.status_code == 422 else ("OCR_FAILED", 502)


async def _extract_document(content: bytes, media_type: str, document_type: DocumentType, review: dict[str, Any] | None = None) -> tuple[dict[str, Any], str | None]:
    """Trusted configured OCR adapter; never forward Supabase/user credentials."""
    endpoint = os.getenv("HEALTH_DOCUMENT_OCR_URL", "")
    if not endpoint:
        if os.getenv("HEALTH_DOCUMENT_OCR_MOCK_ENABLED", "true").lower() == "true":
            return _mock_extracted_data(document_type), None
        return _empty_extracted_data(document_type), "OCR_NOT_CONFIGURED"
    try:
        result = await _request_ocr(content, media_type, document_type)
        if not isinstance(result, dict):
            return _empty_extracted_data(document_type), "EXTRACTION_FAILED"
        if result.get("document_type") != document_type:
            return _empty_extracted_data(document_type), "DOCUMENT_TYPE_MISMATCH"
        validated = _normalize_ocr(result, document_type, review)
        if not any(value is not None for value in validated.values()):
            return validated, "EXTRACTION_FAILED"
        return validated, None
    except httpx.HTTPStatusError as exc:
        return _empty_extracted_data(document_type), _ocr_http_error(exc)[0]
    except httpx.TimeoutException:
        return _empty_extracted_data(document_type), "OCR_TIMEOUT"
    except (HTTPException, ValidationError, TypeError):
        return _empty_extracted_data(document_type), "EXTRACTION_FAILED"
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return _empty_extracted_data(document_type), "OCR_FAILED"


async def _request_ocr(content: bytes, media_type: str, document_type: DocumentType | None) -> Any:
    headers = {}
    token = os.getenv("HEALTH_DOCUMENT_OCR_TOKEN", "").strip()
    if len(token) >= 2 and token[0] == token[-1] and token[0] in {"'", '"'}:
        token = token[1:-1]
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
        response = await client.post(os.environ["HEALTH_DOCUMENT_OCR_URL"], headers=headers,
            files={"file": ("document", content, media_type)},
            data={"document_type": document_type} if document_type is not None else {})
    response.raise_for_status()
    return response.json()


def _classification_error(code: str, message: str, status_code: int = 422) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


async def _auto_extract_document(content: bytes, media_type: str, review: dict[str, Any] | None = None) -> tuple[DocumentType, dict[str, Any], str | None]:
    if not os.getenv("HEALTH_DOCUMENT_OCR_URL", ""):
        if os.getenv("HEALTH_DOCUMENT_OCR_MOCK_ENABLED", "true").lower() != "true":
            raise _classification_error("OCR_NOT_CONFIGURED", "문서 자동 판별 OCR 서버가 설정되지 않았습니다.", 502)
        detected = os.getenv("HEALTH_DOCUMENT_OCR_MOCK_DOCUMENT_TYPE", "health_checkup")
        if detected not in ("health_checkup", "body_composition"):
            raise _classification_error("OCR_NOT_CONFIGURED", "임시 OCR 문서 종류 설정이 올바르지 않습니다.", 502)
        return detected, _mock_extracted_data(detected), None
    try:
        result = await _request_ocr(content, media_type, None)
    except httpx.HTTPStatusError as exc:
        code, status_code = _ocr_http_error(exc)
        raise _classification_error(code, "OCR 문서를 처리하지 못했습니다. 파일 또는 서버 설정을 확인해 주세요.", status_code) from exc
    except httpx.TimeoutException:
        raise _classification_error("OCR_TIMEOUT", "OCR 응답 시간이 초과되었습니다. 다시 시도해 주세요.", 502)
    except (httpx.HTTPError, ValueError):
        raise _classification_error("OCR_FAILED", "OCR 서버 호출 또는 응답 해석에 실패했습니다.", 502)
    if not isinstance(result, dict):
        raise _classification_error("OCR_INVALID_RESPONSE", "OCR 서버 응답 형식이 올바르지 않습니다.", 502)
    detected = result.get("document_type")
    if detected in (None, "unknown", "unsupported", "other"):
        raise _classification_error("UNKNOWN_DOCUMENT", "건강검진 또는 체성분 문서로 판별할 수 없습니다.")
    if detected not in ("health_checkup", "body_composition"):
        raise _classification_error("OCR_INVALID_RESPONSE", "OCR 서버가 유효하지 않은 문서 종류를 반환했습니다.", 502)
    try:
        validated = _normalize_ocr(result, detected, review)
    except (HTTPException, ValidationError, KeyError, TypeError, ValueError):
        return detected, _empty_extracted_data(detected), "EXTRACTION_FAILED"
    return detected, validated, None if any(value is not None for value in validated.values()) else "EXTRACTION_FAILED"


def _mock_extracted_data(document_type: DocumentType) -> dict[str, Any]:
    """Fixed integration fixtures, independent of uploaded contents."""
    common = {"height_cm": "175", "weight_kg": "70", "bmi": "22.9"}
    if document_type == "health_checkup":
        model = HealthCheckupData(**common, checkup_date="2026-09-17",
            systolic_bp=120, diastolic_bp=80, fasting_glucose="92",
            total_cholesterol="180", hdl_cholesterol="55", ldl_cholesterol="105",
            triglycerides="100", ast="22", alt="20", gamma_gtp="25",
            hemoglobin="14.5", creatinine="0.9", institution_name="테스트 검진기관",
            checkup_type="일반건강검진")
    else:
        model = BodyCompositionData(**common, measured_at="2026-09-17T09:00:00+09:00",
            skeletal_muscle_mass_kg="31", body_fat_mass_kg="14",
            body_fat_percentage="20", basal_metabolic_rate="1580",
            visceral_fat_level="5", body_water_percentage="57",
            body_water_liters="39.9", protein_percentage="16", device_name="테스트 InBody")
    return model.model_dump(mode="json")


def _service_headers(settings: Any, *, return_representation: bool = False) -> dict[str, str]:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    if return_representation:
        headers["Prefer"] = "return=representation"
    return headers


def _clean_filename(filename: str | None) -> str:
    cleaned = (filename or "health-document").replace("\x00", "")
    cleaned = cleaned.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip()
    return (cleaned or "health-document")[:255]


def _detect_media_type(content: bytes) -> tuple[str, str] | None:
    if content.startswith(b"%PDF-"):
        return "application/pdf", ".pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if len(content) >= 12 and content[4:8] == b"ftyp" and content[8:12] in {
        b"heic",
        b"heix",
        b"mif1",
        b"msf1",
    }:
        return "image/heic", ".heic"
    return None


async def _read_validated_upload(file: UploadFile) -> tuple[bytes, str, str]:
    content = bytearray()
    while chunk := await file.read(1024 * 1024):
        content.extend(chunk)
        if len(content) > MAX_HEALTH_DOCUMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Health document must be 10 MB or smaller",
            )
    detected = _detect_media_type(bytes(content))
    if detected is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF, PNG, JPEG, and HEIC health documents are supported",
        )
    return bytes(content), *detected


def _empty_extracted_data(document_type: DocumentType) -> dict[str, Any]:
    model = HealthCheckupData if document_type == "health_checkup" else BodyCompositionData
    return model().model_dump(mode="json")


def _validate_extracted_data(
    document_type: DocumentType,
    data: dict[str, Any],
    *,
    require_measurement_date: bool,
) -> dict[str, Any]:
    model = HealthCheckupData if document_type == "health_checkup" else BodyCompositionData
    try:
        validated = model.model_validate(data)
    except ValidationError as exc:
        fields = ["extracted_data." + ".".join(map(str, error["loc"])) for error in exc.errors()]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Invalid health document data", "fields": fields},
        ) from exc
    if require_measurement_date:
        required_field = "checkup_date" if document_type == "health_checkup" else "measured_at"
        if getattr(validated, required_field) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": f"{required_field} is required before confirmation",
                    "fields": [f"extracted_data.{required_field}"],
                },
            )
    return validated.model_dump(mode="json")


async def _fetch_document(
    uploaded_file_id: UUID,
    user_id: str,
    settings: Any,
) -> dict[str, Any]:
    headers = _service_headers(settings)
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        upload_response = await client.get(
            f"{settings.supabase_url}/rest/v1/upload_files",
            headers=headers,
            params={
                "select": (
                    "uploaded_file_id,file_name,original_file_name,storage_path,mime_type,"
                    "file_size,document_type,upload_status,processing_status,uploaded_at"
                ),
                "uploaded_file_id": f"eq.{uploaded_file_id}",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
        )
        if not upload_response.is_success:
            raise HTTPException(status_code=502, detail="Supabase upload query failed")
        uploads = upload_response.json()
        if not uploads:
            raise HTTPException(status_code=404, detail="Health document was not found")
        ocr_response = await client.get(
            f"{settings.supabase_url}/rest/v1/ocr_results",
            headers=headers,
            params={
                "select": "ocr_result_id,status,extracted_data,error_message,created_at,completed_at",
                "uploaded_file_id": f"eq.{uploaded_file_id}",
                "limit": "1",
            },
        )
    if not ocr_response.is_success:
        raise HTTPException(status_code=502, detail="Supabase OCR result query failed")
    ocr_rows = ocr_response.json()
    ocr = ocr_rows[0] if ocr_rows else None
    review = None
    if ocr and isinstance(ocr.get("extracted_data"), dict):
        extracted = dict(ocr["extracted_data"])
        review = extracted.pop("_ocr_review", None)
        ocr = {**ocr, "extracted_data": extracted}
    return {"file": uploads[0], "ocr_result": ocr, "ocr_review": review}


async def _delete_storage_object(storage_path: str, settings: Any) -> None:
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        await client.delete(
            f"{settings.supabase_url}/storage/v1/object/{HEALTH_DOCUMENT_BUCKET}/{storage_path}",
            headers=_service_headers(settings),
        )


async def _list_documents(user_id: str, settings: Any, *, limit: int, offset: int, confirmed_only: bool = False) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/upload_files",
            headers=_service_headers(settings),
            params={
                "select": "uploaded_file_id,original_file_name,file_name,document_type,uploaded_at,processing_status",
                "user_id": f"eq.{user_id}",
                "document_type": "in.(health_checkup,body_composition)",
                "order": "uploaded_at.desc,uploaded_file_id.desc",
                "limit": str(limit + 1),
                "offset": str(offset),
                **({"processing_status": "eq.manually_confirmed"} if confirmed_only else {}),
            },
        )
    if not response.is_success:
        raise HTTPException(status_code=502, detail="Health document list query failed")
    rows = response.json()
    ocr_statuses = {}
    if rows:
        file_ids = ",".join(str(row["uploaded_file_id"]) for row in rows[:limit])
        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            ocr_response = await client.get(f"{settings.supabase_url}/rest/v1/ocr_results",
                headers=_service_headers(settings),
                params={"select": "uploaded_file_id,status", "uploaded_file_id": f"in.({file_ids})"})
        if not ocr_response.is_success:
            raise HTTPException(status_code=502, detail="Health document list OCR query failed")
        ocr_statuses = {row["uploaded_file_id"]: row["status"] for row in ocr_response.json()}
    items = []
    for row in rows[:limit]:
        ocr_status = ocr_statuses.get(row["uploaded_file_id"], "pending")
        items.append({**row, "original_file_name": row.get("original_file_name") or row["file_name"],
                      "status": _document_status(row.get("processing_status"), ocr_status)})
    return {
        "items": items,
        "limit": limit, "offset": offset, "has_more": len(rows) > limit,
    }


async def _delete_upload_row(uploaded_file_id: UUID, settings: Any) -> None:
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        await client.delete(
            f"{settings.supabase_url}/rest/v1/upload_files",
            headers=_service_headers(settings),
            params={"uploaded_file_id": f"eq.{uploaded_file_id}"},
        )


async def _delete_document(
    uploaded_file_id: UUID,
    user_id: str,
    settings: Any,
) -> dict[str, Any]:
    document = await _fetch_document(uploaded_file_id, user_id, settings)
    file_record = document["file"]
    if file_record.get("processing_status") != "manually_confirmed":
        raise HTTPException(status_code=409, detail={
            "code": "DOCUMENT_NOT_CONFIRMED",
            "message": "Only confirmed health documents can be deleted",
            "fields": None,
        })
    storage_path = file_record["storage_path"]
    headers = _service_headers(settings)

    # Storage is not part of the Postgres transaction. Remove it first so a
    # database failure remains retryable without leaving sensitive file bytes.
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        storage_response = await client.delete(
            f"{settings.supabase_url}/storage/v1/object/{HEALTH_DOCUMENT_BUCKET}/{storage_path}",
            headers=headers,
        )
        if not storage_response.is_success and storage_response.status_code != 404:
            raise HTTPException(status_code=502, detail="Health document storage deletion failed")

        delete_response = await client.post(
            f"{settings.supabase_url}/rest/v1/rpc/delete_health_document",
            headers=headers,
            json={"p_uploaded_file_id": str(uploaded_file_id), "p_user_id": user_id},
        )
    if not delete_response.is_success:
        raise HTTPException(status_code=502, detail="Health document database deletion failed")
    try:
        deleted = delete_response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Health document deletion returned an invalid response") from None
    if not isinstance(deleted, dict) or deleted.get("uploaded_file_id") != str(uploaded_file_id):
        raise HTTPException(status_code=502, detail="Health document deletion returned an invalid response")
    return {**deleted, "status": "deleted"}


async def _create_document(
    *,
    file: UploadFile,
    document_type: DocumentType | None,
    user_id: str,
    settings: Any,
    original_file_name: str | None = None,
) -> dict[str, Any]:
    content, media_type, extension = await _read_validated_upload(file)
    automatic_result = None
    review: dict[str, Any] = {}
    if document_type is None:
        document_type, extracted_data, ocr_error = await _auto_extract_document(content, media_type, review)
        automatic_result = extracted_data, ocr_error
    uploaded_file_id = uuid4()
    now = datetime.now(UTC)
    storage_path = f"{user_id}/{now:%Y/%m}/{uploaded_file_id}{extension}"
    filename = _clean_filename(original_file_name if original_file_name and original_file_name.strip() else file.filename)
    storage_headers = _service_headers(settings)
    storage_headers.update({"Content-Type": media_type, "x-upsert": "false"})

    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        storage_response = await client.post(
            f"{settings.supabase_url}/storage/v1/object/{HEALTH_DOCUMENT_BUCKET}/{storage_path}",
            headers=storage_headers,
            content=content,
        )
    if not storage_response.is_success:
        raise HTTPException(status_code=502, detail="Health document storage upload failed")

    upload_payload = {
        "uploaded_file_id": str(uploaded_file_id),
        "user_id": user_id,
        "file_name": filename,
        "original_file_name": filename,
        "storage_path": storage_path,
        "file_type": extension.removeprefix("."),
        "mime_type": media_type,
        "file_size": len(content),
        "document_type": document_type,
        "upload_status": "processing",
        "source_type": "file",
        "processing_type": "ocr",
        "processing_status": "awaiting_review",
    }
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        upload_response = await client.post(
            f"{settings.supabase_url}/rest/v1/upload_files",
            headers=_service_headers(settings, return_representation=True),
            params={"select": "*"},
            json=upload_payload,
        )
    if not upload_response.is_success:
        await _delete_storage_object(storage_path, settings)
        raise HTTPException(status_code=502, detail="Health document metadata creation failed")

    extracted_data, ocr_error = automatic_result if automatic_result is not None else await _extract_document(content, media_type, document_type, review)
    ocr_payload = {
        "ocr_result_id": str(uuid4()),
        "uploaded_file_id": str(uploaded_file_id),
        "status": "failed" if ocr_error else "completed",
        "error_message": ocr_error,
        "raw_text": None,
        "extracted_data": {**extracted_data, **({"_ocr_review": review} if review else {})},
        "started_at": now.isoformat(),
        "completed_at": datetime.now(UTC).isoformat(),
    }
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        ocr_response = await client.post(
            f"{settings.supabase_url}/rest/v1/ocr_results",
            headers=_service_headers(settings, return_representation=True),
            params={"select": "*"},
            json=ocr_payload,
        )
    if not ocr_response.is_success:
        await _delete_upload_row(uploaded_file_id, settings)
        await _delete_storage_object(storage_path, settings)
        raise HTTPException(status_code=502, detail="Temporary OCR result creation failed")
    return await _fetch_document(uploaded_file_id, user_id, settings)


async def _update_ocr_result(
    uploaded_file_id: UUID,
    extracted_data: dict[str, Any],
    user_id: str,
    settings: Any,
) -> dict[str, Any]:
    document = await _fetch_document(uploaded_file_id, user_id, settings)
    document_type = document["file"]["document_type"]
    table = "health_checkups" if document_type == "health_checkup" else "body_compositions"
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        existing = await client.get(f"{settings.supabase_url}/rest/v1/{table}",
            headers=_service_headers(settings), params={"select": "uploaded_file_id",
            "uploaded_file_id": f"eq.{uploaded_file_id}", "user_id": f"eq.{user_id}", "limit": "1"})
    if not existing.is_success:
        raise HTTPException(status_code=502, detail="Health data lookup failed")
    if existing.json() or document["file"].get("processing_status") == "manually_confirmed":
        raise HTTPException(status_code=409, detail={"code": "DOCUMENT_CONFIRMED", "message": "Confirmed documents cannot be edited", "fields": None})
    ocr = document["ocr_result"]
    if not ocr or ocr["status"] in {"pending", "processing"}:
        raise HTTPException(status_code=409, detail={"code": "OCR_NOT_READY", "message": "OCR is not ready for review", "fields": None})
    review = document.get("ocr_review")
    if review:
        review = dict(review)
        review["review_required"] = [key for key in review.get("review_required", []) if key not in extracted_data or extracted_data[key] is None]
        review["field_confidence"] = {key: value for key, value in review.get("field_confidence", {}).items() if key not in extracted_data}
        if "measured_at" in extracted_data:
            review["measurement_time_assumed"] = False
        document["ocr_review"] = review
    extracted_data = {**(ocr.get("extracted_data") or {}), **extracted_data}
    validated = _validate_extracted_data(
        document_type,
        extracted_data,
        require_measurement_date=False,
    )
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        response = await client.patch(
            f"{settings.supabase_url}/rest/v1/ocr_results",
            headers=_service_headers(settings, return_representation=True),
            params={"uploaded_file_id": f"eq.{uploaded_file_id}", "select": "ocr_result_id"},
            json={"extracted_data": {**validated, **({"_ocr_review": document["ocr_review"]} if document.get("ocr_review") else {})}, "status": "completed", "error_message": None},
        )
    if not response.is_success or not response.json():
        raise HTTPException(status_code=502, detail="Temporary OCR result update failed")
    return await _fetch_document(uploaded_file_id, user_id, settings)


async def _confirm_document(
    uploaded_file_id: UUID,
    user_id: str,
    settings: Any,
) -> dict[str, Any]:
    document = await _fetch_document(uploaded_file_id, user_id, settings)
    file_record = document["file"]
    ocr_result = document["ocr_result"]
    if ocr_result is None or ocr_result["status"] != "completed":
        raise HTTPException(status_code=409, detail={"code": "OCR_NOT_READY", "message": "OCR must be completed or manually corrected", "fields": None})
    review = document.get("ocr_review") or {}
    extracted = ocr_result.get("extracted_data") or {}
    unresolved = [key for key in review.get("review_required", []) if extracted.get(key) is not None]
    if unresolved:
        raise HTTPException(status_code=409, detail={
            "code": "OCR_REVIEW_REQUIRED",
            "message": "Review or acknowledge flagged OCR values before confirmation",
            "fields": unresolved,
        })
    document_type: DocumentType = file_record["document_type"]
    validated = _validate_extracted_data(
        document_type,
        extracted,
        require_measurement_date=True,
    )
    table = "health_checkups" if document_type == "health_checkup" else "body_compositions"
    id_field = "health_checkup_id" if document_type == "health_checkup" else "body_composition_id"
    headers = _service_headers(settings)
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        existing_response = await client.get(
            f"{settings.supabase_url}/rest/v1/{table}",
            headers=headers,
            params={
                "select": "*",
                "uploaded_file_id": f"eq.{uploaded_file_id}",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
        )
    if not existing_response.is_success:
        raise HTTPException(status_code=502, detail="Health data lookup failed")
    existing = existing_response.json()
    if existing:
        if file_record.get("processing_status") != "manually_confirmed":
            await _mark_document_confirmed(uploaded_file_id, user_id, settings)
            file_record = {**file_record, "upload_status": "completed", "processing_status": "manually_confirmed"}
        return {"file": file_record, "health_data": existing[0], "already_confirmed": True}

    payload = {
        id_field: str(uuid4()),
        "uploaded_file_id": str(uploaded_file_id),
        "user_id": user_id,
        "source_type": "manual",
        "raw_data": validated,
        **{key: value for key, value in validated.items() if value is not None},
    }
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        create_response = await client.post(
            f"{settings.supabase_url}/rest/v1/{table}",
            headers=_service_headers(settings, return_representation=True),
            params={"select": "*"},
            json=payload,
        )
    if not create_response.is_success or not create_response.json():
        raise HTTPException(status_code=502, detail="Confirmed health data creation failed")

    await _mark_document_confirmed(uploaded_file_id, user_id, settings)
    return {
        "file": {**file_record, "upload_status": "completed", "processing_status": "manually_confirmed"},
        "health_data": create_response.json()[0],
        "already_confirmed": False,
    }


async def _mark_document_confirmed(uploaded_file_id: UUID, user_id: str, settings: Any) -> None:
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        response = await client.patch(
            f"{settings.supabase_url}/rest/v1/upload_files",
            headers=_service_headers(settings, return_representation=True),
            params={
                "uploaded_file_id": f"eq.{uploaded_file_id}",
                "user_id": f"eq.{user_id}",
                "select": "uploaded_file_id,upload_status,processing_status",
            },
            json={"upload_status": "completed", "processing_status": "manually_confirmed"},
        )
    if not response.is_success or not response.json():
        raise HTTPException(status_code=502, detail="Health document status update failed")


class HealthDocumentRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()
        async def handler(request):
            try:
                return await original(request)
            except httpx.RequestError as exc:
                raise HTTPException(status_code=502, detail="Health document data source unavailable") from exc
        return handler


def create_health_documents_router(
    *,
    current_user_dependency: Callable[..., Any],
    settings_dependency: Callable[..., Any],
) -> APIRouter:
    router = APIRouter(prefix="/api/health-documents", tags=["health-documents"], route_class=HealthDocumentRoute)

    @router.post("", status_code=status.HTTP_201_CREATED, response_model=DocumentResponse, responses=DOCUMENT_ERRORS, description="파일 1개당 호출. document_type 생략 시 서버가 종류 판별과 동기 OCR을 수행해 판별된 document_type과 extracted_data 반환. 판별 불가 시 422 UNKNOWN_DOCUMENT/UNSUPPORTED_DOCUMENT이며 파일/DB에 저장하지 않음. OCR URL 미설정 시 임시 모드는 파일 내용 판별 없이 고정 샘플 반환. 종류 생략 시 HEALTH_DOCUMENT_OCR_MOCK_DOCUMENT_TYPE(기본 health_checkup) 사용; PDF/PNG/JPEG/HEIC 모두 동일하게 처리. 실제 판별은 OCR 서버 연결 후 수행. 명시적 document_type은 기존 호환 유지. 종류 판별 후 추출 실패는 파일 ID와 ocr_status=failed 반환. 재업로드는 파일만 다시 전송하며 새 ID 생성; 이전 문서는 유지되고 confirm 전에는 분석 DB에 저장되지 않음.")
    async def upload_health_document(
        file: Annotated[UploadFile, File(description="PDF, PNG, JPEG, or HEIC; max 10 MB")],
        document_type: Annotated[DocumentType | None, Form(description="선택: 생략하면 파일 내용으로 서버가 자동 판별합니다. 기존 클라이언트 호환을 위한 명시적 종류 지정.")] = None,
        original_file_name: Annotated[str | None, Form(max_length=255, description="선택: DocumentPickerAsset.name 등 사용자 원본 파일명. DB에 영구 보존. 생략/공백 시 multipart 파일명 사용. 경로/NUL 제거 및 앞뒤 공백 정리.")] = None,
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        document = await _create_document(
            file=file,
            document_type=document_type,
            user_id=user.id,
            settings=settings,
            original_file_name=original_file_name,
        )
        return _document_response(document)

    @router.get("", response_model=DocumentListResponse, responses=DOCUMENT_ERRORS,
                description="로그인 사용자의 건강 문서 목록. 최신 업로드 순(동일 시각은 파일 ID 내림차순). 원본 파일명 반환. 미확정/실패 문서 포함; 다른 사용자와 기타 문서 종류 제외. limit 기본 20, 최대 100; offset 기본 0. has_more로 다음 페이지 확인.")
    async def list_health_documents(
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        offset: Annotated[int, Query(ge=0)] = 0,
        status: Annotated[Literal["confirmed"] | None, Query(description="선택: confirmed 지정 시 확정 문서만 조회. 로그인 분기는 status=confirmed&limit=1의 items 유무로 한 번에 판정.")] = None,
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        return await _list_documents(user.id, settings, limit=limit, offset=offset, confirmed_only=status == "confirmed")

    @router.get("/{uploaded_file_id}", response_model=DocumentResponse, responses=DOCUMENT_ERRORS)
    async def get_health_document(
        uploaded_file_id: UUID,
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        return _document_response(await _fetch_document(uploaded_file_id, user.id, settings))

    @router.delete(
        "/{uploaded_file_id}",
        response_model=DocumentDeletionResponse,
        responses=DOCUMENT_ERRORS,
        description=(
            "로그인 사용자가 소유한 confirmed 건강 문서를 영구 삭제합니다. 원본 파일, OCR 결과, confirm으로 생성된 "
            "health_checkups/body_compositions 레코드와 이를 참조하는 파생 분석 데이터도 함께 삭제합니다."
        ),
    )
    async def delete_health_document(
        uploaded_file_id: UUID,
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        return await _delete_document(uploaded_file_id, user.id, settings)

    @router.patch("/{uploaded_file_id}/ocr-result", response_model=DocumentResponse, responses=DOCUMENT_ERRORS)
    async def update_health_document_result(
        uploaded_file_id: UUID,
        body: OCRResultUpdateRequest,
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        document = await _update_ocr_result(
            uploaded_file_id,
            body.extracted_data.model_dump(mode="json", exclude_unset=True),
            user.id,
            settings,
        )
        return _document_response(document)

    @router.post("/{uploaded_file_id}/confirm", response_model=ConfirmationResponse, responses=DOCUMENT_ERRORS, description="검진은 health_checkups, 체성분은 body_compositions에 저장. 재호출은 기존 ID 반환. 날짜 필수.")
    async def confirm_health_document(
        uploaded_file_id: UUID,
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        result = await _confirm_document(uploaded_file_id, user.id, settings)
        return {**result, "uploaded_file_id": uploaded_file_id,
                "document_type": result["file"]["document_type"], "status": "confirmed",
                "health_checkup_id": result["health_data"].get("health_checkup_id"),
                "body_composition_id": result["health_data"].get("body_composition_id")}

    return router
