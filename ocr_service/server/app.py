"""
AutoFit OCR 서버.

실행 (ocr_service 폴더에서):
    python -m uvicorn server.app:app --host 0.0.0.0 --port 8000

  · POST /ai/ocr   : 건강검진표·체성분 결과지 → 항목별 JSON
  · GET  /health   : 서버 살아 있는지 확인
  · GET  /docs     : Swagger 문서 (브라우저로 열어 바로 시험 가능)

인증: 환경변수(.env) AUTOFIT_OCR_SERVER_TOKEN 이 있으면
      요청 헤더 'Authorization: Bearer <토큰>' 이 일치해야 한다. 없으면 인증 없이 받는다(로컬 개발용).

로그 정책(기획서 5.6): 파일과 건강 수치는 저장하지도, 로그에 남기지도 않는다.
"""

import hmac
from typing import Optional

from fastapi import FastAPI, File, Form, Header, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from ocr.secrets import get_secret
from server import pipeline
from server.files import FileProblem

TOKEN_KEY = "AUTOFIT_OCR_SERVER_TOKEN"

app = FastAPI(
    title="AutoFit OCR API",
    version="0.2.4",
    description="건강검진 결과통보서 / 체성분(인바디) 결과지에서 항목별 값을 추출합니다.",
)


def error_body(code: str, message: str) -> dict:
    return {"document_type": None, "extracted_data": None, "error": {"code": code, "message": message}}


def _authorized(authorization: Optional[str]) -> bool:
    expected = get_secret(TOKEN_KEY)
    if not expected:
        return True
    given = (authorization or "").removeprefix("Bearer ").strip()
    return hmac.compare_digest(given, expected)


@app.middleware("http")
async def authenticate_before_upload(request: Request, call_next):
    """Reject unauthorized OCR uploads before multipart bodies are parsed."""
    if request.method == "POST" and request.url.path == "/ai/ocr":
        if not _authorized(request.headers.get("authorization")):
            return JSONResponse(
                error_body("UNAUTHORIZED", "인증 토큰이 없거나 틀렸습니다."),
                status_code=401,
            )
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def bad_request(_request: Request, _exc: RequestValidationError):
    """file 필드를 빠뜨리는 등 요청 형식이 틀리면 FastAPI 기본 형식 대신 우리 오류 형식으로 답한다."""
    return JSONResponse(error_body("INVALID_REQUEST", "multipart/form-data 로 file 필드를 보내 주세요."), status_code=400)


@app.get("/health")
def health():
    ok, _ = pipeline._engine().is_available()
    engine = "clova-template+general" if pipeline.template_engine() else "clova-general"
    return {"status": "ok" if ok else "misconfigured", "engine": engine}


@app.post("/ai/ocr")
async def ocr(
    file: UploadFile = File(..., description="JPEG / PNG / HEIC / PDF, 20MB 이하"),
    document_type: Optional[str] = Form(
        None, description="health_checkup | body_composition. 비우면 자동 판별"
    ),
    authorization: Optional[str] = Header(None),
):
    if not _authorized(authorization):
        return JSONResponse(error_body("UNAUTHORIZED", "인증 토큰이 없거나 틀렸습니다."), status_code=401)

    data = await file.read()
    try:
        result = await run_in_threadpool(pipeline.run, data, (document_type or "").strip() or None)
    except FileProblem as problem:  # OcrProblem 포함
        return JSONResponse(error_body(problem.code, problem.message), status_code=problem.status)
    except Exception:
        return JSONResponse(error_body("INTERNAL_ERROR", "서버 내부 오류입니다."), status_code=500)
    finally:
        del data
    return result
