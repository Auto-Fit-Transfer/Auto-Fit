"""
Template OCR 결과(칸 이름 → 글자)를 우리 항목 형식으로 바꾼다.

  General 파서  : 글자 상자 더미에서 항목명을 찾아 값을 짝짓는다 → 어떤 양식이든 읽지만 가끔 옆 칸을 집는다
  Template OCR  : 빌더에 그려 둔 칸 위치에서 글자를 읽는다    → 아는 양식만 읽지만 칸을 헷갈리지 않는다

양식이 맞은 쪽은 **Template 칸 값만** 쓴다. 칸이 비어 있으면 그 항목은 null 이다.
General 값으로 채우지 않는 이유 (실측):
  · 값을 적지 않은 공단 양식에서 기준표 숫자(체중 65, 허리 90, 혈압 120 …)를 결과로 집었다
  · InBody270 에 없는 부위별 근육 % 를 193.0 으로, 공단 2쪽에서 검진기관을 '검사방법'으로 채웠다
  · 체크박스(□)로 표시하는 요단백·종합판정은 첫 보기('정상A')를 집었다 → 칸을 만들지 않았으니 null
값 검사(범위·형식)와 교차검증은 두 경로가 똑같이 ocr/validate.py 를 쓴다.
"""

import re
from typing import Dict, Optional

from .engines.clova_template import TemplateResult
from .parser import fields_for
from .validate import apply_cross_checks, check_range, finalize, parse_value

# 서비스에 쓰는 양식 → 문서 종류. 여기에 없는 양식(합성 데이터 실험용 synthetic_* 등)은 무시한다.
TEMPLATE_DOCS = {
    "nhis2026_p1": "checkup",   # 공단 일반건강검진 결과통보서 (2026 개정) 1쪽: 검진일
    "nhis2026_p2": "checkup",   #                                          2쪽: 계측·혈액검사
    "nhis_old_p1": "checkup",   # 공단 결과통보서 (개정 전) 1쪽
    "nhis_old_p2": "checkup",   #                           2쪽
    "inbody270": "inbody",
    "inbody770": "inbody",
}

# 칸 이름이 항목 key 와 다른 경우
ALIASES = {"checkup_date": "measured_date"}

# 한 칸에 값 두 개가 '/' 로 함께 인쇄되는 경우 → (앞 항목, 뒤 항목)
#   공단 양식: 신장/체중 '172.3 / 48.9', 혈압 '132 / 83 mmHg'
PAIRS = {"height_weight": ("height", "weight"), "bp": ("sbp", "dbp")}

# 시력(좌/우) '1.4 / 0.8'
_VISION_RE = re.compile(r"(\d(?:[.,]\d{1,2})?)\s*/\s*(\d(?:[.,]\d{1,2})?)")
_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")


def doc_of(result: Optional[TemplateResult]) -> Optional[str]:
    """맞은 양식이 서비스용이면 문서 종류('checkup' / 'inbody'), 아니면 None."""
    return TEMPLATE_DOCS.get(result.template) if result else None


def template_items(result: Optional[TemplateResult], schema: dict) -> Dict[str, dict]:
    """Template 칸 값 → {항목 key: finalize() 결과}. 검사를 통과한 값만 담는다."""
    doc = doc_of(result)
    if doc is None:
        return {}
    fields = {f["key"]: f for f in fields_for(schema, doc)}
    items: Dict[str, dict] = {}

    def put(key: str, raw: str, conf: float, value=None):
        field = fields.get(key)
        if field is None or not raw:
            return
        if value is None:
            value = parse_value(raw, field)
        if value is not None:
            items[key] = finalize(field, value, conf, "template", raw)

    for tf in result.fields:
        name = ALIASES.get(tf.name, tf.name)
        # 칸마다 한 줄만 읽도록 그렸다. 혹시 여러 줄이 잡히면 첫 줄이 그 칸의 값이다.
        text = tf.text.splitlines()[0].strip() if tf.text else ""
        if name in PAIRS:
            parts = text.split("/")
            if len(parts) != 2:
                # 양식에 인쇄된 '/' 를 OCR 이 놓치는 경우('166.1 88.5') — 숫자가 딱 두 개면 짝으로 본다
                parts = _NUM_RE.findall(text) if "/" not in text else []
            if len(parts) == 2:
                first, second = PAIRS[name]
                put(first, parts[0].strip(), tf.conf)
                put(second, parts[1].strip(), tf.conf)
        elif name == "vision":
            m = _VISION_RE.search(text)
            if m:
                left, right = (g.replace(",", ".") for g in m.groups())
                put("vision", text, tf.conf, value=f"{left}/{right}")
        else:
            put(name, text, tf.conf)
    return items


def template_is_reliable(result: TemplateResult, items: Dict[str, dict]) -> bool:
    """양식이 맞았다고 해도 칸 위치가 실제로 들어맞았는지 본다.

    InBody 는 값이 비어 있는 결과지가 없으므로, 칸의 절반도 못 읽었으면 '모양만 비슷한 다른 양식'으로 본다
    (실측: 팀이 770 모양으로 만든 이미지 → 770 양식으로 맞았지만 칸이 한 줄씩 밀려 24칸 중 1칸만 정답,
     같은 이미지를 General 로 읽으면 15칸 정답). 이때는 양식 결과를 버리고 General 결과를 쓴다.
    공단 양식은 빈 양식(값 없는 서식)이 실제로 올라오므로 이 검사를 하지 않는다 — General 이 기준표 숫자를 집기 때문.
    """
    if doc_of(result) != "inbody":
        return True
    return len(items) >= 0.5 * len(result.fields)


def template_page(general: dict, items: Dict[str, dict]) -> dict:
    """양식이 맞은 쪽의 결과: General 파서 값은 모두 비우고 Template 칸 값만 남긴 뒤 교차검증을 돌린다.

    General 결과를 받는 이유는 항목 목록과 _meta 모양을 똑같이 맞추기 위해서다.
    """
    merged = {}
    for key, item in general.items():
        if not isinstance(item, dict) or key.startswith("_"):
            merged[key] = item
        else:
            merged[key] = {**item, "value": None, "confidence": 0.0, "status": "fail", "method": "template_empty"}
    merged.update(items)
    notes = apply_cross_checks(merged)
    meta = dict(merged.get("_meta") or {})
    meta["template_fields"] = len(items)
    meta["cross_check_notes"] = notes
    merged["_meta"] = meta
    return merged


def fill_bmi(result: dict, schema: dict, doc: str) -> None:
    """BMI 가 비어 있고 신장·체중이 있으면 계산해서 채운다.

    공단 결과통보서에는 BMI 숫자 칸이 없다(비만 판정만 있음). 앱에는 BMI 가 필요하므로 계산값을 준다.
    신뢰도는 두 값 중 낮은 쪽을 따른다 → 둘 중 하나라도 확인 대상이면 BMI 도 확인 대상.
    """
    def get(key):
        item = result.get(key)
        return item if item and item.get("value") is not None and item.get("status") != "fail" else None

    if get("bmi"):
        return
    height, weight = get("height"), get("weight")
    field = next((f for f in fields_for(schema, doc) if f["key"] == "bmi"), None)
    if not (height and weight and field):
        return
    value = check_range(weight["value"] / ((height["value"] / 100) ** 2), field)
    if value is None:
        return
    conf = min(height["confidence"], weight["confidence"])
    result["bmi"] = finalize(field, value, conf, "computed", None)
