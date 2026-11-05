"""
KIE 서비스에 넘길 '뽑을 항목 명세'를 항목표에서 자동으로 만든다.

KIE 를 쓰려면 "이 문서에서 무엇을 뽑아라"를 서비스에 알려 줘야 한다.
그 명세를 손으로 또 쓰면 항목표와 어긋나므로,
schema/health_fields.json 하나에서 자동 생성한다.

서비스마다 받는 형식이 달라서 세 가지로 뽑을 수 있게 했다.
  · build_spec()      : 우리 내부 표준 (어댑터가 알아서 변환)
  · to_json_schema()  : JSON 스키마를 받는 서비스용
  · to_instruction()  : 지시문(프롬프트)을 받는 서비스용
"""

import json
from typing import List, Optional

DOC_TITLE = {
    "inbody": "체성분 분석 결과지 (인바디 형식)",
    "checkup": "일반건강검진 결과통보서",
    "rx": "처방전",
}


def build_spec(schema: dict, doc_type: str, priorities: Optional[List[str]] = None) -> dict:
    """KIE 요청용 명세를 만든다.

    priorities 로 P1 만 요청할 수도 있다.
    요청 항목이 적을수록 서비스가 헷갈릴 여지가 줄고 비용도 준다.
    """
    from ..parser import fields_for  # 순환 참조를 피하려고 여기서 불러온다

    fields = []
    for field in fields_for(schema, doc_type):
        if field["type"].startswith("list"):
            continue
        if priorities and field["priority"] not in priorities:
            continue

        entry = {
            "key": field["key"],
            "name_ko": field["name_ko"],
            "type": field["type"],
            "unit": field.get("unit"),
            "aliases": field["anchors"],
            "priority": field["priority"],
        }
        if field.get("min") is not None:
            entry["min"] = field["min"]
        if field.get("max") is not None:
            entry["max"] = field["max"]
        if field.get("enum"):
            entry["enum"] = field["enum"]
        fields.append(entry)

    return {
        "doc_type": doc_type,
        "doc_title": DOC_TITLE.get(doc_type, doc_type),
        "fields": fields,
    }


def to_json_schema(spec: dict) -> dict:
    """JSON 스키마 형식을 요구하는 서비스용."""
    type_map = {"int": "integer", "float": "number", "date": "string",
                "enum": "string", "string": "string"}

    properties = {}
    for f in spec["fields"]:
        prop = {
            "type": [type_map.get(f["type"], "string"), "null"],
            "description": _describe(f),
        }
        if f.get("enum"):
            prop["enum"] = f["enum"] + [None]
        if f.get("min") is not None:
            prop["minimum"] = f["min"]
        if f.get("max") is not None:
            prop["maximum"] = f["max"]
        properties[f["key"]] = prop

    return {
        "type": "object",
        "title": spec["doc_title"],
        "properties": properties,
        "required": [f["key"] for f in spec["fields"] if f["priority"] == "P1"],
    }


def _describe(f: dict) -> str:
    parts = [f["name_ko"]]
    if f.get("unit"):
        parts.append(f"단위 {f['unit']}")
    if f.get("min") is not None and f.get("max") is not None:
        parts.append(f"정상 입력 범위 {f['min']}~{f['max']}")
    aliases = [a for a in f.get("aliases", []) if a != f["name_ko"]]
    if aliases:
        parts.append("문서 표기: " + " / ".join(aliases[:3]))
    return ". ".join(parts)


def to_instruction(spec: dict) -> str:
    """지시문(프롬프트)을 받는 서비스용.

    값을 지어내지 말라는 지시가 가장 중요하다.
    없는 값을 그럴듯하게 채우는 것이 값이 비는 것보다 훨씬 위험하다.
    """
    lines = [
        f"다음은 한국의 {spec['doc_title']} 이미지입니다.",
        "아래 항목의 값을 문서에 인쇄된 그대로 읽어 JSON 하나로만 답하세요.",
        "",
        "규칙",
        "1. 문서에 없거나 읽을 수 없는 항목은 반드시 null 로 두세요. 절대 추측하거나 지어내지 마세요.",
        "2. 표준범위·참고치 칸의 값(예: '150 미만', '18.5~22.9')을 결과값으로 쓰지 마세요.",
        "3. 마이너스 부호를 빠뜨리지 마세요.",
        "4. 숫자는 단위를 떼고 숫자만 쓰세요.",
        "",
        "뽑을 항목",
    ]
    for f in spec["fields"]:
        mark = "필수" if f["priority"] == "P1" else "선택"
        lines.append(f"- {f['key']} ({mark}): {_describe(f)}")
    return "\n".join(lines)


def dump(schema: dict, doc_type: str, out_dir) -> None:
    """명세 파일 3종을 저장한다. 서비스 연동할 때 그대로 쓰면 된다."""
    from pathlib import Path

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    spec = build_spec(schema, doc_type)

    (out / f"{doc_type}_spec.json").write_text(
        json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out / f"{doc_type}_json_schema.json").write_text(
        json.dumps(to_json_schema(spec), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out / f"{doc_type}_instruction.txt").write_text(
        to_instruction(spec), encoding="utf-8"
    )
