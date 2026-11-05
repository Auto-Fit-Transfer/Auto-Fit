"""
Upstage Information Extract (Universal extraction) 어댑터.

글자만 읽는 OCR 과 달리 '항목:값'까지 뽑아 준다(KIE).
뽑을 항목은 schema/health_fields.json 에서 자동으로 만든 명세를 보낸다.

필요한 값: AUTOFIT_UPSTAGE_API_KEY (ocr/secrets.py 참고)

신뢰도: Upstage 는 숫자가 아니라 'high' / 'low' 두 단계만 준다.
  high → 0.9 (자동 저장), low → 0.6 (사용자 확인), 안 주면 0.75 (사용자 확인)
"""

import base64
import json
from pathlib import Path

from ..engines.api_cache import cached_call
from ..engines.clova_engine import post_with_retry
from ..secrets import get_secret
from .base import KIEEngine, default_confidence

API_KEY = "AUTOFIT_UPSTAGE_API_KEY"
ENDPOINT = "https://api.upstage.ai/v1/information-extraction"
MODEL = "information-extract"

CONF_WORD = {"high": 0.9, "low": 0.6}
TYPE_MAP = {"int": "integer", "float": "number", "date": "string", "enum": "string", "string": "string"}


def upstage_schema(spec: dict) -> dict:
    """Upstage 가 받는 스키마. (최상위 속성은 단일 자료형만 허용)"""
    properties = {}
    for f in spec["fields"]:
        parts = [f["name_ko"]]
        if f.get("aliases"):
            parts.append("표기 예: " + ", ".join(f["aliases"][:5]))
        if f.get("unit"):
            parts.append(f"단위 {f['unit']} 기준 숫자만")
        if f["type"] == "date":
            parts.append("YYYY-MM-DD 형식")
        if f.get("enum"):
            parts.append("다음 중 하나: " + ", ".join(map(str, f["enum"])))
        parts.append("문서에 없으면 비워 둘 것")
        properties[f["key"]] = {"type": TYPE_MAP.get(f["type"], "string"), "description": ". ".join(parts)}

    return {
        "type": "json_schema",
        "json_schema": {
            "name": f"autofit_{spec['doc_type']}",
            "schema": {"type": "object", "properties": properties},
        },
    }


class UpstageIE(KIEEngine):
    name = "upstage_ie"

    def __init__(self, timeout: int = 180):
        self.api_key = get_secret(API_KEY)
        self.timeout = timeout

    def is_available(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, f"{API_KEY} 를 .env 에 넣어 주세요."
        return True, "ok"

    def _call(self, image_path: str, response_format: dict) -> dict:
        import requests

        data = base64.b64encode(Path(image_path).read_bytes()).decode("ascii")
        body = {
            "model": MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:application/octet-stream;base64,{data}"}}
                    ],
                }
            ],
            "response_format": response_format,
            "confidence": True,
        }

        def send():
            return requests.post(
                ENDPOINT,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=body,
                timeout=self.timeout,
            )

        return post_with_retry(send)

    def extract(self, image_path: str, doc_type: str, spec: dict) -> dict:
        ok, reason = self.is_available()
        if not ok:
            raise RuntimeError(reason)

        response_format = upstage_schema(spec)
        payload = cached_call(
            self.name,
            image_path,
            lambda: self._call(image_path, response_format),
            extra=json.dumps(response_format, sort_keys=True, ensure_ascii=False),
        )
        return self.read_payload(payload, spec)

    @staticmethod
    def read_payload(payload: dict, spec: dict) -> dict:
        message = ((payload.get("choices") or [{}])[0]).get("message") or {}
        values = json.loads(message.get("content") or "{}")

        # 신뢰도는 tool_calls 의 additional_values 에 들어 있다. 구조가 바뀌어도 죽지 않게 느슨하게 읽는다.
        conf_words = {}
        for call in message.get("tool_calls") or []:
            try:
                extra = json.loads(call["function"]["arguments"])
            except (KeyError, TypeError, ValueError):
                continue
            for key, item in (extra or {}).items():
                if isinstance(item, dict) and isinstance(item.get("confidence"), str):
                    conf_words[key] = item["confidence"].lower()

        out = {}
        for entry in spec["fields"]:
            value = values.get(entry["key"])
            if value in (None, ""):
                continue
            word = conf_words.get(entry["key"])
            out[entry["key"]] = {
                "value": value,
                "confidence": CONF_WORD.get(word) if word else default_confidence(None),
            }
        return out
