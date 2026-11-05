import asyncio
import json
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from backend.app import health_documents as hd

FIXTURES = Path(__file__).parent / "fixtures" / "ocr"


@pytest.mark.parametrize("kind", ["health_checkup", "body_composition"])
@pytest.mark.parametrize("automatic", [True, False])
def test_real_provider_samples(monkeypatch, kind, automatic):
    sample = json.loads((FIXTURES / f"success_{kind}.json").read_text())
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_URL", "https://ocr.internal/ai/ocr")
    async def request(*args):
        return sample
    monkeypatch.setattr(hd, "_request_ocr", request)
    review = {}
    if automatic:
        detected, data, error = asyncio.run(hd._auto_extract_document(b"image", "image/jpeg", review))
        assert detected == kind
    else:
        data, error = asyncio.run(hd._extract_document(b"image", "image/jpeg", kind, review))
    assert error is None
    assert "sex" not in data
    assert review["pages_used"] == [1]
    if kind == "health_checkup":
        assert data["creatinine"] == "0.97"
        assert data["institution_name"] == "한울종합검진센터"
        assert "systolic_bp" in review["review_required"]
    else:
        assert data["measured_at"] == "2025-03-13T00:00:00+09:00"
        assert data["body_fat_percentage"] == "4.0"
        assert data["body_water_liters"] == "37.1"
        assert data["protein_percentage"] is None
        assert review["measurement_time_assumed"] is True
        assert "body_fat_percentage" in review["review_required"]


@pytest.mark.parametrize("code,status,expected_status", [
    ("UNSUPPORTED_DOCUMENT", 422, 422), ("DOCUMENT_TYPE_MISMATCH", 422, 422),
    ("NO_FIELDS_FOUND", 422, 422), ("CORRUPTED_FILE", 400, 422),
    ("UNSUPPORTED_FILE_TYPE", 415, 415), ("UNAUTHORIZED", 401, 502),
    ("OCR_TIMEOUT", 504, 502), ("OCR_ENGINE_ERROR", 502, 502),
])
def test_errors_are_mapped_without_raw_messages(monkeypatch, code, status, expected_status):
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_URL", "https://ocr.internal/ai/ocr")
    async def request(*args):
        response = httpx.Response(status, json={"error": {"code": code, "message": "private OCR text"}},
                                  request=httpx.Request("POST", "https://ocr.internal/ai/ocr"))
        response.raise_for_status()
    monkeypatch.setattr(hd, "_request_ocr", request)
    expected = "OCR_AUTH_FAILED" if code == "UNAUTHORIZED" else code
    with pytest.raises(HTTPException) as exc:
        asyncio.run(hd._auto_extract_document(b"image", "image/jpeg"))
    assert exc.value.status_code == expected_status
    assert exc.value.detail["code"] == expected
    assert "private" not in str(exc.value.detail)
    _, error = asyncio.run(hd._extract_document(b"image", "image/jpeg", "health_checkup"))
    assert error == expected


def test_review_warning_and_confidence_normalization():
    review = {}
    hd._normalize_ocr({"extracted_data": {"weight_kg": 70},
        "field_confidence": {"weight_kg": 1.1, "sex": 0.9},
        "meta": {"pages_total": 6, "pages_read": 5, "pages_used": [1, 3],
                 "warnings": ["앞 5쪽만 처리했습니다."]}}, "body_composition", review)
    assert review["field_confidence"] == {}
    assert review["warnings"] == ["앞 5쪽만 처리했습니다."]
    assert "measured_at" in review["review_required"]


def test_body_composition_cross_checks_flag_implausible_values():
    review = {}
    hd._normalize_ocr({"extracted_data": {
        "measured_date": "2015-05-04", "height_cm": 156.9, "weight_kg": 59.1,
        "bmi": 10.0, "body_fat_mass_kg": 22.1, "body_fat_pct": 8.0,
        "skeletal_muscle_kg": 70.0,
    }}, "body_composition", review)
    assert {"bmi", "body_fat_percentage", "skeletal_muscle_mass_kg"} <= set(review["review_required"])
    assert len(review["warnings"]) == 3


def test_missing_checkup_date_flags_all_populated_values():
    review = {}
    hd._normalize_ocr({"extracted_data": {
        "weight_kg": 65, "fasting_glucose": 100, "total_cholesterol": 200,
    }}, "health_checkup", review)
    assert {"weight_kg", "fasting_glucose", "total_cholesterol"} <= set(review["review_required"])
    assert review["warnings"] == ["검진일을 읽지 못해 추출값 전체를 확인해야 합니다."]


@pytest.mark.parametrize("data", [{"user_id": "injected", "weight_kg": 70},
    {"serum_creatinine": 1, "creatinine": 2}, {"weight_kg": -1}])
def test_unknown_conflicting_or_invalid_values_rejected(data):
    with pytest.raises((TypeError, HTTPException)):
        hd._normalize_ocr({"extracted_data": data}, "health_checkup", {})


@pytest.mark.parametrize("metadata", [
    {"meta": []}, {"meta": ["invalid"]},
    {"field_confidence": [1]}, {"review_required": "weight_kg"},
    {"meta": {"pages_used": "invalid"}},
])
def test_malformed_metadata_is_failed_not_server_error(monkeypatch, metadata):
    monkeypatch.setenv("HEALTH_DOCUMENT_OCR_URL", "https://ocr.internal/ai/ocr")
    async def request(*args):
        return {"document_type": "health_checkup", "extracted_data": {"weight_kg": 70}, **metadata}
    monkeypatch.setattr(hd, "_request_ocr", request)
    _, _, error = asyncio.run(hd._auto_extract_document(b"image", "image/jpeg", {}))
    assert error == "EXTRACTION_FAILED"


def test_invalid_upstream_error_code_does_not_crash():
    response = httpx.Response(500, json={"error": {"code": ["invalid"]}},
                             request=httpx.Request("POST", "https://ocr.internal/ai/ocr"))
    exc = httpx.HTTPStatusError("failed", request=response.request, response=response)
    assert hd._ocr_http_error(exc) == ("OCR_FAILED", 502)
