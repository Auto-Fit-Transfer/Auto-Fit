"""
업로드 파일 한 개를 백엔드 응답 JSON 으로 바꾸는 전체 흐름.

  파일 → 페이지 이미지 → CLOVA General + CLOVA Template (페이지마다 둘을 동시 호출)
       → 문서 종류 판별 → 항목 추출 → 페이지 결과 합치기 → 백엔드 필드명으로 변환

항목 추출
  · 양식이 맞은 쪽(공단 결과통보서 신·구, InBody270·770)은 Template 칸 값만 쓴다. 빈칸은 null
    → 값을 적지 않은 양식이면 NO_FIELDS_FOUND
  · 양식이 안 맞는 쪽은 General 글자 + 자체 파서로 읽는다
  · Template 키가 없거나 호출이 실패해도 General 만으로 계속 답한다

값 규칙 (기획서 5.3 "모르면 비워둔다")
  · 신뢰도 0.85 이상       → 값 채움
  · 신뢰도 0.5 ~ 0.85      → 값 채우고 review_required 에 이름을 올림 (검수 화면에서 강조)
  · 그 밖 / 못 찾음 / 범위 밖 → null
"""

import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from ocr.engines.clova_engine import ClovaOCREngine
from ocr.engines.clova_template import ClovaTemplateEngine
from ocr.parser import load_schema, parse_boxes
from ocr.template_fields import doc_of, fill_bmi, template_is_reliable, template_items, template_page
from ocr.validate import apply_cross_checks
from server.documents import BODY, CHECKUP, classify
from server.field_map import FIELDS, INTERNAL_DOC
from server.files import MAX_PDF_PAGES, FileProblem, to_pages

VALID_TYPES = (CHECKUP, BODY)
API_DOC = {internal: api for api, internal in INTERNAL_DOC.items()}
_ENGINE: Optional[ClovaOCREngine] = None
_TEMPLATE: Optional[ClovaTemplateEngine] = None
_SCHEMA: Optional[dict] = None


class OcrProblem(FileProblem):
    """판독 실패. FileProblem 과 같은 형태(code, status, message)."""


def _engine() -> ClovaOCREngine:
    global _ENGINE, _SCHEMA
    if _ENGINE is None:
        _ENGINE = ClovaOCREngine(timeout=30)
        _SCHEMA = load_schema()
    return _ENGINE


def _read_page(jpeg: bytes):
    try:
        return _engine().read_bytes(jpeg, "jpg")
    except Exception as exc:  # 네트워크·인증·CLOVA 장애
        name = type(exc).__name__
        if "Timeout" in name:
            raise OcrProblem("OCR_TIMEOUT", 504, "OCR 서비스 응답이 늦습니다. 잠시 후 다시 시도해 주세요.")
        raise OcrProblem("OCR_ENGINE_ERROR", 502, f"OCR 서비스 호출에 실패했습니다 ({name}).")


def template_engine() -> Optional[ClovaTemplateEngine]:
    """Template 키가 있으면 엔진, 없으면 None (General 만으로 동작)."""
    global _TEMPLATE
    if _TEMPLATE is None:
        _TEMPLATE = ClovaTemplateEngine(timeout=30)
    return _TEMPLATE if _TEMPLATE.is_available()[0] else None


def _read_template(jpeg: bytes):
    """(양식 결과 또는 None, 오류 이름 또는 None). 실패해도 요청 전체를 실패시키지 않는다."""
    engine = template_engine()
    if engine is None:
        return None, None
    try:
        return engine.read_bytes(jpeg, "jpg"), None
    except Exception as exc:
        return None, type(exc).__name__


def _merge(page_results: List[dict]) -> dict:
    """여러 페이지에서 같은 항목이 나오면 Template 값을, 그다음 신뢰도가 가장 높은 값을 쓴다."""
    def rank(item):
        return (item.get("method") == "template", item["confidence"])

    merged = {}
    for result in page_results:
        for key, item in result.items():
            if key.startswith("_") or not isinstance(item, dict):
                continue
            if item.get("value") is None or item.get("status") == "fail":
                continue
            if key not in merged or rank(item) > rank(merged[key]):
                merged[key] = item
    return merged


def run(data: bytes, requested_type: Optional[str]) -> dict:
    t0 = time.time()
    warnings: List[str] = []

    if requested_type and requested_type not in VALID_TYPES:
        raise FileProblem("INVALID_DOCUMENT_TYPE", 400, "document_type 은 health_checkup 또는 body_composition 입니다.")

    ok, reason = _engine().is_available()
    if not ok:
        raise OcrProblem("OCR_ENGINE_ERROR", 502, "OCR 서버 설정 오류(키 없음). 관리자에게 알려 주세요.")

    file_type, pages, total_pages = to_pages(data)
    if total_pages > MAX_PDF_PAGES:
        warnings.append(f"PDF {total_pages}쪽 중 앞 {MAX_PDF_PAGES}쪽만 읽었습니다.")

    with ThreadPoolExecutor(max_workers=min(6, 2 * len(pages))) as pool:
        template_jobs = [pool.submit(_read_template, page) for page in pages]
        page_boxes = list(pool.map(_read_page, pages))
        template_out = [job.result() for job in template_jobs]
    templates = [result for result, _ in template_out]
    template_errors = [err for _, err in template_out if err]

    # 페이지별 문서 종류 → 전체 문서 종류
    # 양식이 맞으면 양식을 따른다. 단, 글자 내용이 다른 문서를 가리키면 양식 결과를 버린다(엉뚱한 양식 오탐 방지).
    page_types = []
    for i, boxes in enumerate(page_boxes):
        general_type = classify(boxes)[0]
        template_type = API_DOC.get(doc_of(templates[i]))
        if template_type and general_type and template_type != general_type:
            templates[i], template_type = None, None
        page_types.append(template_type or general_type)
    votes = {t: page_types.count(t) for t in VALID_TYPES}
    detected = max(votes, key=votes.get) if any(votes.values()) else None
    if detected and votes[CHECKUP] == votes[BODY]:
        detected = None

    if requested_type and detected and requested_type != detected:
        raise OcrProblem(
            "DOCUMENT_TYPE_MISMATCH", 422,
            f"요청한 문서 종류({requested_type})와 실제 문서({detected})가 다릅니다. 문서 종류를 다시 선택해 주세요.",
        )
    doc_type = requested_type or detected
    if doc_type is None:
        raise OcrProblem("UNSUPPORTED_DOCUMENT", 422, "건강검진 결과지나 체성분 결과지로 인식되지 않았습니다. 직접 입력해 주세요.")
    if not detected:
        warnings.append("문서 종류를 자동으로 확인하지 못해 요청한 종류로 읽었습니다. 값을 꼭 확인해 주세요.")

    internal_doc = INTERNAL_DOC[doc_type]
    # 종류가 확인된 페이지만 읽는다. 처방전 같은 다른 페이지가 빈칸을 엉뚱한 값으로 채우는 오탐을 막기 위함.
    # (자동 판별이 전부 실패하고 요청 종류로 읽는 경우에만 모든 페이지를 쓴다)
    used = [i for i, t in enumerate(page_types) if t == doc_type] or list(range(len(pages)))
    results = []
    templates_rejected: List[str] = []
    for i in used:
        general = parse_boxes(page_boxes[i], internal_doc, _SCHEMA)
        matched = doc_of(templates[i]) == internal_doc
        items = template_items(templates[i], _SCHEMA) if matched else {}
        if matched and template_is_reliable(templates[i], items):
            results.append(template_page(general, items))
        else:
            if matched:
                templates_rejected.append(templates[i].template)  # 모양은 맞았지만 칸이 안 맞음 → General 사용
            results.append(general)
    merged = _merge(results)
    apply_cross_checks(merged)  # 여러 쪽에서 모은 값끼리 한 번 더 대조
    fill_bmi(merged, _SCHEMA, internal_doc)

    extracted, confidence, review = {}, {}, []
    from_template = 0
    for api_key, internal_key, _unit in FIELDS[doc_type]:
        item = merged.get(internal_key)
        extracted[api_key] = item["value"] if item else None
        confidence[api_key] = item["confidence"] if item else 0.0
        if item and item["status"] == "review":
            review.append(api_key)
        if item and item.get("method") == "template":
            from_template += 1

    found = sum(v is not None for v in extracted.values())
    meta = {
        "engine": "clova-template+general" if template_engine() else "clova-general",
        "templates": [templates[i].template if templates[i] else None for i in used],
        "template_field_count": from_template,
        "file_type": file_type,
        "pages_total": total_pages,
        "pages_read": len(pages),
        "pages_used": [i + 1 for i in used],
        "requested_document_type": requested_type,
        "detected_document_type": detected,
        "extracted_count": found,
        "field_count": len(extracted),
        "elapsed_ms": int((time.time() - t0) * 1000),
        "warnings": warnings,
    }
    if template_errors:
        meta["template_errors"] = template_errors
    if templates_rejected:
        meta["templates_rejected"] = templates_rejected  # 양식 모양은 맞았지만 칸 위치가 안 맞아 General 로 읽음
    if found == 0:
        raise OcrProblem("NO_FIELDS_FOUND", 422, "문서는 확인했지만 읽을 수 있는 값이 없습니다. 더 밝고 선명하게 다시 찍어 주세요.")

    return {
        "document_type": doc_type,
        "extracted_data": extracted,
        "field_confidence": confidence,
        "review_required": review,
        "meta": meta,
    }
