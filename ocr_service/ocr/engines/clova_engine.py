"""
네이버 CLOVA OCR (General) 엔진.

글자와 좌표만 받아 오고, 항목 판단은 EasyOCR 때와 똑같이 우리 파서가 한다.
그래서 Upstage OCR 과 '글자를 얼마나 잘 읽는가'만 공정하게 비교할 수 있다.

필요한 값 (ocr/secrets.py 참고):
  AUTOFIT_CLOVA_OCR_URL    : 네이버 클라우드 콘솔 > CLOVA OCR > Domain > API Gateway 연동의 'APIGW Invoke URL'
                             (끝이 /general 인 주소)
  AUTOFIT_CLOVA_OCR_SECRET : 같은 화면의 'Secret Key'
"""

import json
import time
import uuid
from pathlib import Path
from typing import List

from ..secrets import get_secret
from .api_cache import cached_call
from .base import OCREngine, TextBox

URL_KEY = "AUTOFIT_CLOVA_OCR_URL"
SECRET_KEY = "AUTOFIT_CLOVA_OCR_SECRET"


def post_with_retry(send, tries: int = 3):
    """요청 한도 초과(429)나 일시 장애(5xx)면 잠깐 쉬었다가 다시 보낸다."""
    import requests

    for attempt in range(tries):
        response = send()
        if response.status_code == 429 or response.status_code >= 500:
            if attempt < tries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
        if response.status_code >= 400:
            raise requests.HTTPError(
                f"HTTP {response.status_code}: {response.text[:300]}", response=response
            )
        return response.json()
    raise RuntimeError("재시도 횟수를 넘었습니다")


class ClovaOCREngine(OCREngine):
    name = "clova"

    def __init__(self, timeout: int = 60):
        self.url = get_secret(URL_KEY)
        self.secret = get_secret(SECRET_KEY)
        self.timeout = timeout

    def is_available(self) -> tuple[bool, str]:
        if not self.url or not self.secret:
            return False, f"{URL_KEY}, {SECRET_KEY} 를 .env 에 넣어 주세요."
        return True, "ok"

    def _call_bytes(self, data: bytes, fmt: str = "jpg", name: str = "page") -> dict:
        import requests

        message = {
            "version": "V2",
            "requestId": str(uuid.uuid4()),
            "timestamp": int(time.time() * 1000),
            "lang": "ko",
            "images": [{"format": fmt, "name": name}],
        }

        def send():
            return requests.post(
                self.url,
                headers={"X-OCR-SECRET": self.secret},
                data={"message": json.dumps(message)},
                files={"file": (f"{name}.{fmt}", data)},
                timeout=self.timeout,
            )

        return post_with_retry(send)

    def read(self, image_path: str) -> List[TextBox]:
        """채점용: 응답을 cache/ 에 저장해 두고 재사용한다 (합성 데이터 전용)."""
        ok, reason = self.is_available()
        if not ok:
            raise RuntimeError(reason)

        path = Path(image_path)
        fmt = path.suffix.lower().lstrip(".") or "jpg"
        payload = cached_call(
            self.name, image_path, lambda: self._call_bytes(path.read_bytes(), fmt, path.stem)
        )
        return self.to_boxes(payload)

    def read_bytes(self, data: bytes, fmt: str = "jpg") -> List[TextBox]:
        """서버용: 실제 사용자 문서. 디스크에 아무것도 남기지 않는다."""
        ok, reason = self.is_available()
        if not ok:
            raise RuntimeError(reason)
        return self.to_boxes(self._call_bytes(data, fmt))

    @staticmethod
    def to_boxes(payload: dict) -> List[TextBox]:
        images = payload.get("images") or []
        if not images:
            raise RuntimeError("CLOVA 응답에 결과가 없습니다")
        image = images[0]
        if image.get("inferResult") != "SUCCESS":
            raise RuntimeError(f"CLOVA 판독 실패: {image.get('inferResult')} {image.get('message')}")

        boxes: List[TextBox] = []
        for field in image.get("fields") or []:
            text = (field.get("inferText") or "").strip()
            vertices = (field.get("boundingPoly") or {}).get("vertices") or []
            if not text or not vertices:
                continue
            xs = [int(v.get("x", 0)) for v in vertices]
            ys = [int(v.get("y", 0)) for v in vertices]
            boxes.append(
                TextBox(
                    text=text,
                    conf=float(field.get("inferConfidence") or 0.0),
                    x1=min(xs), y1=min(ys), x2=max(xs), y2=max(ys),
                )
            )
        return boxes
