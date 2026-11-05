"""
문서 종류 자동 판별 — 건강검진표인지 체성분(인바디) 결과지인지.

OCR 로 읽은 글자에 각 문서에만 나오는 단어가 몇 개 있는지 센다.
한쪽이 충분히 많고 다른 쪽보다 확실히 많을 때만 판별하고,
애매하면 '모름'으로 돌려 엉뚱한 문서로 해석하는 일을 막는다.
"""

import re
from typing import List, Optional, Tuple

from ocr.engines.base import TextBox

CHECKUP = "health_checkup"
BODY = "body_composition"

KEYWORDS = {
    CHECKUP: [
        "건강검진", "결과통보서", "공복혈당", "총콜레스테롤", "중성지방", "혈색소",
        "요단백", "종합판정", "검진기관", "감마지티피", "사구체여과율", "크레아티닌", "허리둘레",
    ],
    BODY: [
        "체성분", "골격근량", "체지방률", "기초대사량", "체수분", "제지방량", "내장지방",
        "부위별", "근육조절", "지방조절", "복부지방률", "인바디", "inbody", "적정체중",
    ],
}

MIN_HITS = 2      # 이보다 적게 맞으면 지원하지 않는 문서로 본다 (흐린 사진 실측 최저 3개)
MIN_MARGIN = 2.0  # 1등이 2등의 2배 이상일 때만 확정


def _normalize(text: str) -> str:
    return re.sub(r"\s+", "", text).lower()


def keyword_scores(boxes: List[TextBox]) -> dict:
    text = _normalize("".join(b.text for b in boxes))
    return {doc: sum(1 for k in words if k.lower() in text) for doc, words in KEYWORDS.items()}


def classify(boxes: List[TextBox]) -> Tuple[Optional[str], dict]:
    """(문서 종류 또는 None, 점수) 를 돌려준다."""
    scores = keyword_scores(boxes)
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    (best, top), (_, second) = ranked[0], ranked[1]
    if top < MIN_HITS or top < second * MIN_MARGIN:
        return None, scores
    return best, scores
