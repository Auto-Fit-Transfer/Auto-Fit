"""
네이버 CLOVA OCR (Template) 엔진.

빌더에서 만든 양식(공단 결과통보서 신·구, InBody270·770)과 모양이 맞으면
'이 칸에는 이 글자' 형태로 칸마다 값을 바로 돌려준다.
맞는 양식이 없으면 None 을 돌려주고, 서버는 General 결과만 쓴다.

필요한 값 (ocr/secrets.py 참고):
  AUTOFIT_CLOVA_TEMPLATE_URL    : Template 도메인 > API Gateway 연동의 'APIGW Invoke URL' (끝이 /infer)
  AUTOFIT_CLOVA_TEMPLATE_SECRET : 같은 화면의 'Secret Key'
"""

import json
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from ..secrets import get_secret
from .api_cache import cached_call
from .clova_engine import post_with_retry

URL_KEY = "AUTOFIT_CLOVA_TEMPLATE_URL"
SECRET_KEY = "AUTOFIT_CLOVA_TEMPLATE_SECRET"


@dataclass
class TemplateField:
    name: str   # 빌더에서 붙인 칸 이름 (= 내부 항목 key, 일부는 'bp' 처럼 두 값이 한 칸)
    text: str
    conf: float


@dataclass
class TemplateResult:
    template: str       # 맞은 양식 이름 (예: nhis2026_p2, inbody270)
    template_id: int
    fields: List[TemplateField] = field(default_factory=list)


class ClovaTemplateEngine:
    name = "clova_template"

    def __init__(self, timeout: int = 30):
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

    def read(self, image_path: str) -> Optional[TemplateResult]:
        """채점용: 응답을 cache/ 에 저장해 두고 재사용한다 (합성 데이터 전용)."""
        path = Path(image_path)
        fmt = path.suffix.lower().lstrip(".") or "jpg"
        payload = cached_call(
            self.name, image_path, lambda: self._call_bytes(path.read_bytes(), fmt, path.stem)
        )
        return self.to_result(payload)

    def read_bytes(self, data: bytes, fmt: str = "jpg") -> Optional[TemplateResult]:
        """서버용: 실제 사용자 문서. 디스크에 아무것도 남기지 않는다."""
        return self.to_result(self._call_bytes(data, fmt))

    @staticmethod
    def to_result(payload: dict) -> Optional[TemplateResult]:
        images = payload.get("images") or []
        if not images:
            raise RuntimeError("CLOVA Template 응답에 결과가 없습니다")
        image = images[0]
        matched = image.get("matchedTemplate")
        # 맞는 양식이 없으면 inferResult=FAILURE, message='NOT_FOUND: not found matched template'
        if image.get("inferResult") != "SUCCESS" or not matched:
            return None
        return TemplateResult(
            template=matched.get("name", ""),
            template_id=int(matched.get("id", 0)),
            fields=[
                TemplateField(
                    name=(f.get("name") or "").strip(),
                    text=(f.get("inferText") or "").strip(),
                    conf=float(f.get("inferConfidence") or 0.0),
                )
                for f in image.get("fields") or []
            ],
        )
