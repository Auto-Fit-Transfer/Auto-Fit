"""
항목 파서.

OCR이 뱉은 '글자 상자 더미'에서 "골격근량 = 35.7" 처럼
항목표(schema/health_fields.json)에 정의된 항목과 값을 짝지어 준다.

핵심 아이디어 3가지
  1) 항목명은 정확히 안 읽힌다 → 비슷하면 통과(유사도 매칭)
     실제 사례: 측정항목→'축정항목', 내장지방레벨→'내장지방래벌', 왼다리→'원다리'
  2) 값의 위치는 두 종류다 → 같은 줄 오른쪽, 또는 바로 아래 칸
  3) 유효범위 검증이 오답을 막아 준다
     실제 사례: 신장 아래에서 'P1201'을 숫자 1201로 읽어도 100~220 밖이라 자동 탈락
"""

import json
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional

from .engines.base import TextBox, boxes_to_lines
from .normalize import clean_label, strip_unit, to_date

# 값 검증·교차검증은 외부 KIE 경로와 공유한다(ocr/validate.py).
# 규칙이 한 곳에만 있어야 두 경로가 다르게 동작하는 일이 없다.
from .validate import apply_cross_checks, parse_value, status_for

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schema" / "health_fields.json"

# 항목명 유사도 기준.
# 상자 하나를 항목 하나에만 배정하는(winner-takes-all) 방식이라
# 기준을 낮춰도 비슷한 이름끼리 충돌하지 않는다.
FUZZY_MIN = 0.62


def load_schema(path: Path = SCHEMA_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def fields_for(schema: dict, doc_type: str) -> List[dict]:
    """해당 문서에서 뽑을 항목 목록(공통 인적사항 포함).

    only_docs 가 지정된 항목은 그 문서에서만 쓴다.
    예) 생년월일은 체성분 결과지에 인쇄되지 않으므로 검진표·처방전에서만 찾는다.
    also_docs 는 반대로 다른 문서 소속 항목을 이 문서에서도 찾게 한다.
    예) 신장·체중·BMI 는 체성분 항목이지만 검진표 계측검사 표에도 인쇄된다.
    """
    fields = list(schema["docs"]["common"]["fields"])
    for group, spec in schema["docs"].items():
        if group in ("common", doc_type):
            continue
        fields += [f for f in spec["fields"] if doc_type in f.get("also_docs", [])]
    fields += schema["docs"][doc_type]["fields"]
    return [f for f in fields if doc_type in f.get("only_docs", [doc_type])]


# ---------------------------------------------------------------- 항목명 찾기

UNIT_WORDS = {
    "kg", "cm", "%", "mg/dl", "u/l", "mmhg", "l", "kcal", "g/dl", "kg/m2", "kg/m²",
    "ml/min", "ml/min/173m2", "ml/min/1.73m²", "세", "점", "level", "좌/우",
}


def is_unit_only(text: str) -> bool:
    """'(mg/dL)', 'kg', '(좌/우)' 처럼 단위·보조 표기만 있는 상자인가."""
    if not clean_label(strip_unit(text)):
        return True
    return clean_label(text).lower() in UNIT_WORDS


def match_score(box_text: str, anchor: str) -> float:
    """글자 상자가 이 항목명과 얼마나 비슷한지. 1.0 = 정확히 같음."""
    a, b = clean_label(box_text), clean_label(anchor)
    if not a or not b:
        return 0.0

    # 단위만 있는 상자('(mg/dL)', '(U/L)', 'kg')는 항목명이 아니다.
    # CLOVA 는 '중성지방 (mg/dL)' 을 두 상자로 나눠 읽는데, 단위 상자가 '중성지방 (mg/dL)' 과
    # 0.71 로 비슷하다고 나와 공복혈당 줄의 값을 중성지방으로 가져가는 오탐이 났다.
    # 'kg' 상자도 '체중 (kg)' 과 0.67 로 맞아 윗줄 '적정체중' 값을 체중으로 가져갔다.
    if is_unit_only(box_text):
        return 0.0
    if a == b:
        return 1.0

    # 항목명 뒤에 단위가 붙는 경우: 'AST(U/L)' 안의 'AST'
    if a.startswith(b) or b.startswith(a):
        return 0.95

    # 항목명 앞에 글자가 덧붙는 경우: '신사구체여과율' 안의 '사구체여과율'
    # 짧은 항목명(체중 등)에 적용하면 '적정체중'까지 걸리므로 4글자 이상만 허용한다.
    if len(b) >= 4 and b in a:
        return 0.88

    # 단위가 붙은 채로 비교할 때와 떼고 비교할 때 중 더 잘 맞는 쪽을 쓴다.
    # '총?레스템감 (mg/dL)' 은 단위까지 함께 볼 때, '철청크레아티년 (mg/dL)' 은
    # 단위를 뗐을 때 각각 제 항목을 찾는다.
    bare_a, bare_b = clean_label(strip_unit(box_text)), clean_label(strip_unit(anchor))
    scores = [SequenceMatcher(None, a, b).ratio()]
    if bare_a and bare_b:
        scores.append(SequenceMatcher(None, bare_a, bare_b).ratio())
    return max(scores)


def assign_anchors(boxes: List[TextBox], fields: List[dict]) -> Dict[str, List[tuple]]:
    """어느 상자가 어느 항목의 '이름표'인지 한꺼번에 정한다.

    항목마다 따로 찾으면 '체지방률'과 '체지방량'처럼 비슷한 이름이 서로 붙는다.
    상자 하나당 가장 잘 맞는 항목 하나에만 배정하면 그런 충돌이 사라지고,
    덕분에 유사도 기준을 낮춰 심하게 깨진 항목명까지 잡을 수 있다.
    실제 사례: '총콜레스테롤'이 '총?레스템감' 으로 읽힌 경우.
    """
    assigned: Dict[str, List[tuple]] = {}

    for box in boxes:
        scores = {
            f["key"]: max((match_score(box.text, a) for a in f["anchors"]), default=0.0)
            for f in fields
        }
        best_score = max(scores.values(), default=0.0)
        if best_score < FUZZY_MIN:
            continue
        # 수축기·이완기 혈압처럼 항목명을 공유하는 항목은 함께 배정한다.
        for key, score in scores.items():
            if score == best_score:
                assigned.setdefault(key, []).append((box, score))

    for key in assigned:
        assigned[key].sort(key=lambda t: (t[0].cy, t[0].x1))
    return assigned


def detect_result_column(boxes: List[TextBox]) -> Optional[float]:
    """검진표처럼 '검사항목 | 결과 | 참고치 | 판정' 표가 있으면 결과 열의 오른쪽 경계를 돌려준다.

    이게 없으면 참고치 열의 '150 미만' 을 결과값으로 잘못 가져온다.
    체성분 결과지처럼 이 머리글이 없는 문서에서는 None(열 구분 안 함).
    """
    result_hdr = [b for b in boxes if clean_label(b.text) == "결과"]
    ref_hdr = [b for b in boxes if clean_label(b.text) in ("참고치", "참고치범위")]
    if not result_hdr or not ref_hdr:
        return None

    rc = sum(b.cx for b in result_hdr) / len(result_hdr)
    fc = sum(b.cx for b in ref_hdr) / len(ref_hdr)
    if fc <= rc:
        return None
    return (rc + fc) / 2


# ---------------------------------------------------------------- 값 찾기

def _value_candidates(
    anchor: TextBox,
    lines: List[List[TextBox]],
    line_of: Dict[int, int],
) -> List[tuple]:
    """항목명 상자 주변에서 값이 있을 만한 상자들을 가까운 순서로 모은다.

    돌려주는 형태: (상자, 찾은 방법, 거리감점)
    """
    out: List[tuple] = []
    idx = line_of.get(id(anchor))
    if idx is None:
        return out

    # ① 같은 줄에서 항목명 오른쪽
    same = [b for b in lines[idx] if b.x1 > anchor.x1 and b is not anchor]
    for order, b in enumerate(sorted(same, key=lambda b: b.x1)):
        out.append((b, "right", order))

    # ② 바로 아래 줄에서 가로 위치가 가까운 것
    #    검진표 상단처럼 '항목명 줄 / 값 줄'로 나뉜 표,
    #    그리고 부위별근육분석처럼 값이 다음 줄로 밀린 표에서 필요하다.
    for depth in (1, 2):
        if idx + depth >= len(lines):
            break
        below = sorted(lines[idx + depth], key=lambda b: abs(b.cx - anchor.cx))
        for order, b in enumerate(below[:5]):
            if abs(b.cx - anchor.cx) > max(anchor.h * 12, 260):
                continue
            out.append((b, "below", 10 * depth + order))

    return out


def _owner_label(box: TextBox, line: List[TextBox], label_texts: set) -> Optional[str]:
    """이 값 상자가 '누구의 값'인지 판단한다.

    표에서 값은 바로 왼쪽 항목명에 속한다.
    이 규칙이 없으면 '적정체중 68.8 kg' 의 68.8 을
    바로 위에 있던 '체중조절' 값으로 잘못 가져간다.
    """
    left = [b for b in line if b.x2 <= box.x1 + 3 and b is not box]
    if not left:
        return None
    nearest = max(left, key=lambda b: b.x2)
    label = clean_label(nearest.text)
    return label if label in label_texts else None


def extract_field(
    field: dict,
    boxes: List[TextBox],
    lines: List[List[TextBox]],
    line_of: Dict[int, int],
    label_texts: Optional[set] = None,
    anchors: Optional[List[tuple]] = None,
    result_edge: Optional[float] = None,
) -> dict:
    """항목 하나를 뽑아낸다."""
    anchors = anchors or []
    label_texts = label_texts or set()

    # 혈압처럼 한 줄에 값이 둘인 항목(129 / 77)은 몇 번째 값인지 지정한다.
    want_index = field.get("value_index", 0)
    is_number = field["type"] in ("int", "float")

    for anchor_box, anchor_score in anchors:
        # 날짜는 CLOVA 가 '2026. | 05. | 18' 처럼 조각내 읽는다. 같은 줄 오른쪽 조각을 이어 붙여 본다.
        if field["type"] == "date" and id(anchor_box) in line_of:
            right = sorted(
                (b for b in lines[line_of[id(anchor_box)]] if b.x1 > anchor_box.x1 and b is not anchor_box),
                key=lambda b: b.x1,
            )[:6]
            for n in range(1, len(right) + 1):
                value = to_date(" ".join(b.text for b in right[:n]))
                if value:
                    conf = min(b.conf for b in right[:n])
                    conf *= 1.0 if anchor_score >= 0.999 else 0.9
                    conf = round(min(conf, 1.0), 3)
                    return {
                        "value": value,
                        "confidence": conf,
                        "status": status_for(conf, value),
                        "raw_text": " ".join(b.text for b in right[:n]),
                        "anchor": anchor_box.text,
                        "method": "right_joined",
                    }

        seen = 0
        for value_box, method, penalty in _value_candidates(anchor_box, lines, line_of):
            # 옆 칸의 '다른 항목명'을 값으로 착각하지 않도록 거른다.
            # 이 검사가 없으면 성명 오른쪽의 '신장' 을 이름으로 읽는다.
            if clean_label(value_box.text) in label_texts:
                continue

            # 검진표 표에서는 '결과' 열만 본다. 참고치 열의 '150 미만' 을 막는다.
            if (
                is_number
                and result_edge is not None
                and anchor_box.cx < result_edge
                and value_box.cx > result_edge
            ):
                continue

            # 아래 줄을 볼 때는 그 값이 다른 항목의 값인지 확인한다.
            if method == "below":
                owner = _owner_label(
                    value_box, lines[line_of[id(value_box)]], label_texts
                )
                if owner and owner != clean_label(anchor_box.text):
                    continue

            value = parse_value(value_box.text, field)
            if value is None:
                continue

            if seen < want_index:
                seen += 1
                continue

            conf = value_box.conf
            conf *= 1.0 if anchor_score >= 0.999 else 0.9   # 항목명이 흐릿하면 감점
            conf *= 1.0 if method == "right" else 0.95      # 아래 칸 참조는 조금 덜 확실
            conf = round(min(conf, 1.0), 3)

            return {
                "value": value,
                "confidence": conf,
                "status": status_for(conf, value),
                "raw_text": value_box.text,
                "anchor": anchor_box.text,
                "method": method,
            }

    # 예비 규칙: 보기가 정해진 항목(성별, 종합판정 등)은 항목명 없이 값만으로도 찾는다.
    # 실제 사례: OCR이 '성별' 이라는 글자를 통째로 놓쳤지만 '여성' 은 정확히 읽었다.
    if field["type"] == "enum":
        for box in boxes:
            value = parse_value(box.text, field)
            if value is not None:
                conf = round(box.conf * 0.9, 3)
                return {
                    "value": value,
                    "confidence": conf,
                    "status": status_for(conf, value),
                    "raw_text": box.text,
                    "anchor": None,
                    "method": "value_only",
                }

    return {
        "value": None,
        "confidence": 0.0,
        "status": "fail",
        "raw_text": None,
        "anchor": anchors[0][0].text if anchors else None,
        "method": "not_found" if not anchors else "anchor_only",
    }


# ---------------------------------------------------------------- 전체 실행

def parse_boxes(boxes: List[TextBox], doc_type: str, schema: Optional[dict] = None) -> dict:
    """OCR 결과(글자 상자 목록)를 항목표 형식의 결과로 바꾼다."""
    schema = schema or load_schema()
    lines = boxes_to_lines(boxes)

    line_of = {id(b): i for i, line in enumerate(lines) for b in line}

    doc_fields = fields_for(schema, doc_type)

    # 이 문서에 등장할 수 있는 모든 항목명 (값으로 착각하지 않기 위한 목록)
    label_texts = {
        clean_label(a) for f in doc_fields for a in f["anchors"]
    }

    parse_fields = [f for f in doc_fields if not f["type"].startswith("list")]
    anchor_map = assign_anchors(boxes, parse_fields)
    result_edge = detect_result_column(boxes)

    result: dict = {}
    for field in parse_fields:  # 처방 의약품 표 파싱은 다음 단계
        result[field["key"]] = extract_field(
            field,
            boxes,
            lines,
            line_of,
            label_texts,
            anchors=anchor_map.get(field["key"], []),
            result_edge=result_edge,
        )

    notes = apply_cross_checks(result)

    result["_meta"] = {
        "doc_type": doc_type,
        "boxes": len(boxes),
        "lines": len(lines),
        "cross_check_notes": notes,
    }
    return result
