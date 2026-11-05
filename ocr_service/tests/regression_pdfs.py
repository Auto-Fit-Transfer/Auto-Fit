"""
실제 PDF 회귀 테스트 (2026-09-23 백엔드 보고 건).

  1) InBody270 결과지 PDF (inbody-270-result.pdf) → 값 8개가 문서와 같아야 한다
  2) 값을 적지 않은 공단 일반건강검진 결과통보서 4쪽 PDF → 검사 결과 숫자가 하나도 나오면 안 된다
     (422 NO_FIELDS_FOUND 이거나, 200 이면 extracted_data 가 전부 null)

PDF 는 저장소에 넣지 않는다(InBody 카탈로그는 회사 자료). 가진 파일 위치를 알려 주고 돌린다.

실행 (ocr_server 폴더에서):
    # 배포된 서버에 HTTP 로 보내기 (기본)
    set OCR_TOKEN=<Bearer 토큰>
    python tests/regression_pdfs.py --inbody270 "inbody-270-result.pdf" --blank-checkup "별지6_일반건강검진_결과통보서.pdf"

    # 서버 없이 이 폴더의 코드로 직접 (.env 에 CLOVA 키 필요)
    python tests/regression_pdfs.py --local --inbody270 ... --blank-checkup ...

pytest 로 돌릴 때는 환경변수 INBODY270_PDF, BLANK_CHECKUP_PDF, OCR_TOKEN (또는 OCR_LOCAL=1) 을 쓴다.
"""

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_URL = "http://127.0.0.1:8000"

INBODY270_EXPECTED = {
    "measured_date": "2015-05-04",
    "height_cm": 156.9,
    "weight_kg": 59.1,
    "bmi": 24.0,
    "body_fat_mass_kg": 22.1,
    "body_fat_pct": 37.5,
    "skeletal_muscle_kg": 19.3,
    "body_composition_score": 66,
}


def call_ocr(path: str, local: bool, url: str, token: str):
    """(HTTP 상태 코드, 응답 JSON)"""
    data = Path(path).read_bytes()
    if local:
        from server import pipeline
        from server.app import error_body
        from server.files import FileProblem

        try:
            return 200, pipeline.run(data, None)
        except FileProblem as problem:
            return problem.status, error_body(problem.code, problem.message)

    import requests

    r = requests.post(
        f"{url}/ai/ocr",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": (Path(path).name, data)},
        timeout=90,
    )
    return r.status_code, r.json()


def check_inbody270(status: int, body: dict) -> list:
    problems = []
    if status != 200:
        return [f"HTTP {status} {body.get('error')}"]
    if body.get("document_type") != "body_composition":
        problems.append(f"document_type={body.get('document_type')}")
    got = body.get("extracted_data") or {}
    for key, expected in INBODY270_EXPECTED.items():
        if got.get(key) != expected:
            problems.append(f"{key}: 기대 {expected} / 결과 {got.get(key)}")
    # 값이 모두 맞으므로 교차검증(BMI·체지방률·체성분 합계 등)이 경고를 내면 안 된다
    if body.get("review_required"):
        problems.append(f"맞는 값인데 검수 표시: {body['review_required']}")
    return problems


def check_blank_checkup(status: int, body: dict) -> list:
    if status == 422 and (body.get("error") or {}).get("code") == "NO_FIELDS_FOUND":
        return []
    if status != 200:
        return [f"HTTP {status} {body.get('error')}"]
    filled = {k: v for k, v in (body.get("extracted_data") or {}).items() if v is not None}
    return [f"빈 양식인데 값이 나옴: {k}={v}" for k, v in filled.items()]


def run(inbody270: str, blank_checkup: str, local: bool, url: str, token: str) -> int:
    cases = [
        ("InBody270 PDF", inbody270, check_inbody270),
        ("빈 건강검진 양식 PDF", blank_checkup, check_blank_checkup),
    ]
    failed = 0
    for name, path, check in cases:
        if not path:
            print(f"[건너뜀] {name}: 파일 위치를 주지 않음")
            continue
        status, body = call_ocr(path, local, url, token)
        problems = check(status, body)
        meta = body.get("meta") or {}
        print(f"[{'통과' if not problems else '실패'}] {name}  (HTTP {status}, 양식 {meta.get('templates')})")
        for p in problems:
            print(f"    - {p}")
        failed += bool(problems)
    return 1 if failed else 0


# ---------------------------------------------------------------- pytest

def _env():
    return {
        "local": os.environ.get("OCR_LOCAL") == "1",
        "url": os.environ.get("OCR_URL", DEFAULT_URL),
        "token": os.environ.get("OCR_TOKEN", ""),
    }


def test_inbody270():
    import pytest

    path = os.environ.get("INBODY270_PDF")
    if not path:
        pytest.skip("INBODY270_PDF 없음")
    assert check_inbody270(*call_ocr(path, **_env())) == []


def test_blank_checkup():
    import pytest

    path = os.environ.get("BLANK_CHECKUP_PDF")
    if not path:
        pytest.skip("BLANK_CHECKUP_PDF 없음")
    assert check_blank_checkup(*call_ocr(path, **_env())) == []


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--inbody270", default=os.environ.get("INBODY270_PDF"))
    ap.add_argument("--blank-checkup", default=os.environ.get("BLANK_CHECKUP_PDF"))
    ap.add_argument("--local", action="store_true", help="서버 대신 이 폴더의 코드로 직접 실행")
    ap.add_argument("--url", default=os.environ.get("OCR_URL", DEFAULT_URL))
    args = ap.parse_args()

    token = os.environ.get("OCR_TOKEN", "")
    if not args.local and not token:
        from ocr.secrets import get_secret

        token = get_secret("AUTOFIT_OCR_SERVER_TOKEN") or ""
    raise SystemExit(run(args.inbody270, args.blank_checkup, args.local, args.url, token))
