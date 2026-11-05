"""
Upstage Document OCR 엔진.

CLOVA 엔진과 마찬가지로 글자와 좌표만 받아 오고, 항목 판단은 우리 파서가 한다.

필요한 값 (ocr/secrets.py 참고):
  AUTOFIT_UPSTAGE_API_KEY : console.upstage.ai > API Keys 에서 발급한 키
"""

from pathlib import Path
from typing import List

from ..secrets import get_secret
from .api_cache import cached_call
from .base import OCREngine, TextBox
from .clova_engine import post_with_retry

API_KEY = "AUTOFIT_UPSTAGE_API_KEY"
ENDPOINT = "https://api.upstage.ai/v1/document-digitization"


class UpstageOCREngine(OCREngine):
    name = "upstage"

    def __init__(self, timeout: int = 180):
        self.api_key = get_secret(API_KEY)
        self.timeout = timeout

    def is_available(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, f"{API_KEY} 를 .env 에 넣어 주세요."
        return True, "ok"

    def _call(self, image_path: str) -> dict:
        import requests

        path = Path(image_path)

        def send():
            with open(path, "rb") as fh:
                return requests.post(
                    ENDPOINT,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    data={"model": "ocr"},
                    files={"document": (path.name, fh)},
                    timeout=self.timeout,
                )

        return post_with_retry(send)

    def read(self, image_path: str) -> List[TextBox]:
        ok, reason = self.is_available()
        if not ok:
            raise RuntimeError(reason)

        payload = cached_call(self.name, image_path, lambda: self._call(image_path))
        return self.to_boxes(payload)

    @staticmethod
    def to_boxes(payload: dict) -> List[TextBox]:
        pages = payload.get("pages") or []
        if not pages:
            raise RuntimeError("Upstage 응답에 페이지가 없습니다")

        boxes: List[TextBox] = []
        for word in pages[0].get("words") or []:
            text = (word.get("text") or "").strip()
            vertices = (word.get("boundingBox") or {}).get("vertices") or []
            if not text or not vertices:
                continue
            xs = [int(v.get("x", 0)) for v in vertices]
            ys = [int(v.get("y", 0)) for v in vertices]
            boxes.append(
                TextBox(
                    text=text,
                    conf=float(word.get("confidence") or 0.0),
                    x1=min(xs), y1=min(ys), x2=max(xs), y2=max(ys),
                )
            )
        return boxes
