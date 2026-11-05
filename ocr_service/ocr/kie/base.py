"""
KIE(Key Information Extraction) 엔진 공통 규격.

KIE 는 '글자를 읽는 것'을 넘어 '어느 값이 어느 항목인지'까지 돌려주는 서비스다.
자체 OCR 파서와의 차이는 이렇다.

    자체 파서 : 이미지 → 글자+좌표 → (우리가 항목 판단) → 값
    KIE      : 이미지 → (서비스가 항목 판단) → 항목:값

어느 쪽을 쓰든 뒤따르는 검증(유효범위·교차검증·신뢰도)은 동일하다.
"""

from typing import Optional


class KIEEngine:
    """모든 KIE 어댑터가 따라야 하는 형태."""

    name = "kie-base"

    def is_available(self) -> tuple[bool, str]:
        """지금 쓸 수 있는지. (가능여부, 이유)"""
        return True, "ok"

    def extract(self, image_path: str, doc_type: str, spec: dict) -> dict:
        """이미지에서 항목별 값을 뽑는다.

        돌려주는 형식:
            {
              "weight": {"value": "73.5 kg", "confidence": 0.97},
              "smm":    {"value": 35.7,      "confidence": 0.88},
              ...
            }

        · value 는 문자열이든 숫자든 상관없다. 뒤에서 우리 형식으로 맞춘다.
        · confidence 를 주지 않는 서비스면 None 으로 두고, 기본값을 쓰게 한다.
        · 못 찾은 항목은 아예 빼거나 value 를 None 으로 둔다.
        """
        raise NotImplementedError


def default_confidence(raw: Optional[float], fallback: float = 0.75) -> float:
    """신뢰도를 주지 않는 서비스를 위한 기본값.

    KIE 가 신뢰도를 안 주면 '확실하다'고 단정하면 안 된다.
    자동 저장(0.85) 아래인 0.75 를 기본으로 두어
    사용자 확인 화면을 거치게 한다.
    """
    if raw is None:
        return fallback
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return fallback
    return min(max(value, 0.0), 1.0)
