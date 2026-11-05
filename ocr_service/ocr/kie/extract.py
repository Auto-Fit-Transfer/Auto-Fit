"""
KIE 응답을 우리 표준 결과 형식으로 바꾼다.

자체 파서(parser.parse_boxes)와 완전히 같은 형식을 돌려주므로
채점 스크립트와 사용자 확인 화면은 어느 쪽을 썼는지 몰라도 된다.
"""

from typing import List, Optional

from ..parser import fields_for, load_schema
from ..validate import apply_cross_checks, coerce_value, finalize
from .base import KIEEngine, default_confidence
from .spec import build_spec


def extract_fields(
    image_path: str,
    doc_type: str,
    engine: KIEEngine,
    schema: Optional[dict] = None,
    priorities: Optional[List[str]] = None,
) -> dict:
    """이미지 한 장에서 항목을 뽑아 표준 결과 형식으로 돌려준다."""
    schema = schema or load_schema()
    spec = build_spec(schema, doc_type, priorities)

    raw = engine.extract(image_path, doc_type, spec) or {}

    result: dict = {}
    for field in fields_for(schema, doc_type):
        if field["type"].startswith("list"):
            continue
        if priorities and field["priority"] not in priorities:
            continue

        item = raw.get(field["key"]) or {}
        value = coerce_value(item.get("value"), field)
        conf = default_confidence(item.get("confidence")) if value is not None else 0.0

        result[field["key"]] = finalize(
            field,
            value,
            conf,
            source=f"kie:{engine.name}",
            raw_text=item.get("value"),
        )

    notes = apply_cross_checks(result)

    result["_meta"] = {
        "doc_type": doc_type,
        "engine": f"kie:{engine.name}",
        "requested_fields": len(spec["fields"]),
        "returned_fields": len([k for k, v in raw.items() if (v or {}).get("value") is not None]),
        "cross_check_notes": notes,
    }
    return result
