"""
외부 KIE 서비스 연결용 어댑터 (공통 뼈대).

서비스가 정해지면 아래 세 곳만 채우면 된다.
  1) ENDPOINT      : 호출 주소
  2) _build_request: 파일과 명세를 어떤 형태로 보낼지
  3) _read_response: 응답 JSON에서 항목:값을 어떻게 꺼낼지

API 키는 코드에 절대 적지 않는다. 환경변수에서 읽는다.
윈도우에서 키를 등록하는 방법(PowerShell, 사용자 계정 범위):

    setx AUTOFIT_KIE_API_KEY "발급받은키"

등록 후에는 터미널을 새로 열어야 적용된다.
"""

import json
import os
from typing import Optional

from .base import KIEEngine, default_confidence

ENV_KEY = "AUTOFIT_KIE_API_KEY"
ENV_ENDPOINT = "AUTOFIT_KIE_ENDPOINT"


class HttpKIE(KIEEngine):
    name = "http"

    def __init__(self, endpoint: Optional[str] = None, timeout: int = 30):
        self.endpoint = endpoint or os.environ.get(ENV_ENDPOINT, "")
        self.api_key = os.environ.get(ENV_KEY, "")
        self.timeout = timeout

    def is_available(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, (
                f"API 키가 없습니다. 환경변수 {ENV_KEY} 를 등록하세요.\n"
                f'  setx {ENV_KEY} "발급받은키"   (등록 후 터미널을 새로 열 것)'
            )
        if not self.endpoint:
            return False, f"호출 주소가 없습니다. 환경변수 {ENV_ENDPOINT} 를 등록하세요."
        try:
            import requests  # noqa: F401
        except ImportError:
            return False, "requests 가 필요합니다.  .venv\\Scripts\\python.exe -m pip install requests"
        return True, "ok"

    # ------------------------------------------------ 서비스별로 채울 부분

    def _build_request(self, image_path: str, spec: dict) -> dict:
        """서비스가 요구하는 형태로 요청을 만든다.

        대부분 아래 둘 중 하나다.
          · 파일 업로드(multipart) + 명세를 JSON 문자열로 동봉
          · 이미지를 base64 로 넣은 JSON 한 덩어리
        """
        from .spec import to_json_schema

        return {
            "files": {"document": open(image_path, "rb")},
            "data": {"schema": json.dumps(to_json_schema(spec), ensure_ascii=False)},
            "headers": {"Authorization": f"Bearer {self.api_key}"},
        }

    def _read_response(self, payload: dict, spec: dict) -> dict:
        """응답에서 {항목: {value, confidence}} 를 꺼낸다.

        서비스마다 응답 구조가 달라 여기서 흡수한다.
        아래는 '{"fields": {"weight": {"value": ..., "confidence": ...}}}' 형태 가정.
        """
        fields = payload.get("fields") or payload.get("data") or payload
        out = {}
        for entry in spec["fields"]:
            item = fields.get(entry["key"])
            if item is None:
                continue
            if isinstance(item, dict):
                out[entry["key"]] = {
                    "value": item.get("value"),
                    "confidence": default_confidence(item.get("confidence")),
                }
            else:
                out[entry["key"]] = {"value": item, "confidence": default_confidence(None)}
        return out

    # ------------------------------------------------ 공통 실행

    def extract(self, image_path: str, doc_type: str, spec: dict) -> dict:
        ok, reason = self.is_available()
        if not ok:
            raise RuntimeError(reason)

        import requests

        req = self._build_request(image_path, spec)
        files = req.get("files")
        try:
            response = requests.post(
                self.endpoint,
                headers=req.get("headers"),
                data=req.get("data"),
                files=files,
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        finally:
            for handle in (files or {}).values():
                try:
                    handle.close()
                except Exception:
                    pass

        return self._read_response(payload, spec)
