"""
가짜 KIE 엔진 (배관 점검용).

⚠️ 이 엔진의 점수는 성능 지표가 아닙니다.
   정답지를 그대로 읽어 돌려주므로 당연히 높게 나옵니다.
   오직 '결과가 채점기까지 제대로 흘러가는지' 확인하는 용도입니다.

API 키가 없어도 아래를 미리 검증할 수 있다:
  · 명세 생성 → 추출 → 형식 변환 → 유효범위 검증 → 교차검증 → 채점
  · 값이 비었을 때 / 헛값일 때 사용자 확인 화면 상태가 제대로 붙는지
"""

import json
import random
from pathlib import Path
from typing import Optional

from ..parse_one import DATA_DIR, dig
from .base import KIEEngine


class MockKIE(KIEEngine):
    name = "mock"

    def __init__(self, miss_rate: float = 0.1, error_rate: float = 0.05, seed: int = 0):
        # 실제 서비스처럼 일부는 놓치고 일부는 틀리게 만들어
        # 검증·교차검증 단계가 실제로 동작하는지 확인한다.
        self.miss_rate = miss_rate
        self.error_rate = error_rate
        self.rng = random.Random(seed)

    def is_available(self) -> tuple[bool, str]:
        return True, "ok (가짜 엔진 — 성능 측정용이 아님)"

    def _find_label(self, image_path: str) -> Optional[dict]:
        person_id = Path(image_path).stem.split("_")[0]
        hits = list(DATA_DIR.glob(f"labels/*/{person_id}.json"))
        if not hits:
            return None
        return json.loads(hits[0].read_text(encoding="utf-8"))

    def extract(self, image_path: str, doc_type: str, spec: dict) -> dict:
        truth = self._find_label(image_path)
        if truth is None:
            return {}

        from ..parser import load_schema

        schema = load_schema()
        by_key = {
            f["key"]: f
            for group in ("common", doc_type)
            for f in schema["docs"][group]["fields"]
        }

        out = {}
        for entry in spec["fields"]:
            field = by_key.get(entry["key"])
            if field is None:
                continue
            value = dig(truth, field["label_path"], doc_type)
            if value is None:
                continue

            roll = self.rng.random()
            if roll < self.miss_rate:
                continue  # 못 찾은 척
            if roll < self.miss_rate + self.error_rate and entry["type"] in ("int", "float"):
                value = value * 10  # 자릿수 오인식 흉내 → 유효범위 검증에 걸려야 정상

            out[entry["key"]] = {"value": value, "confidence": round(self.rng.uniform(0.7, 0.99), 2)}
        return out
