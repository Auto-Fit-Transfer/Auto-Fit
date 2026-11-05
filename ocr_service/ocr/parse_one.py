"""
이미지 한 장을 파싱하고 정답지와 나란히 비교한다.

사용법 (AutoFit_AI 폴더에서):
    .venv\\Scripts\\python.exe -m ocr.parse_one
    .venv\\Scripts\\python.exe -m ocr.parse_one P1201 inbody
    .venv\\Scripts\\python.exe -m ocr.parse_one P0007 checkup
"""

import json
import sys
import time
from pathlib import Path
from typing import Optional

from .engines.easyocr_engine import EasyOCREngine
from .parser import fields_for, load_schema, parse_boxes

DATA_DIR = Path(__file__).resolve().parents[2] / "AutoFit_합성데이터"


def find_person(person_id: str) -> tuple[Path, str]:
    """사람 번호로 정답지 파일과 구간 폴더명을 찾는다."""
    hits = list(DATA_DIR.glob(f"labels/*/{person_id}.json"))
    if not hits:
        raise FileNotFoundError(f"정답지를 찾을 수 없습니다: {person_id}")
    return hits[0], hits[0].parent.name


def find_image(person_id: str, doc_type: str, condition: str = "clean") -> Path:
    hits = list(DATA_DIR.glob(f"images/*/{doc_type}/{person_id}_{doc_type}_*_{condition}.jpg"))
    if not hits:
        raise FileNotFoundError(f"이미지를 찾을 수 없습니다: {person_id} / {doc_type} / {condition}")
    return hits[0]


def dig(data: dict, path: str, doc_type: str):
    """정답지에서 label_path 가 가리키는 값을 꺼낸다."""
    if "/" in path:  # 'inbody.date / checkup.date / rx.date'
        path = f"{doc_type}.date"
    cur = data
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def same(expected, got, field: dict) -> bool:
    if expected is None or got is None:
        return False
    if field["type"] in ("int", "float"):
        try:
            decimals = field.get("decimals", 0) or 0
            return round(float(expected), decimals) == round(float(got), decimals)
        except (TypeError, ValueError):
            return False
    return str(expected).strip() == str(got).strip()


def fmt(v) -> str:
    if v is None:
        return "-"
    return str(v)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    person_id = sys.argv[1] if len(sys.argv) > 1 else "P1201"
    doc_type = sys.argv[2] if len(sys.argv) > 2 else "inbody"
    condition = sys.argv[3] if len(sys.argv) > 3 else "clean"

    label_path, group = find_person(person_id)
    image_path = find_image(person_id, doc_type, condition)
    truth = json.loads(label_path.read_text(encoding="utf-8"))
    schema = load_schema()

    print(f"대상   : {person_id} ({group}) · {doc_type} · {condition}")
    print(f"이미지 : {image_path.name}\n")

    engine = EasyOCREngine()
    engine._get_reader()

    t0 = time.time()
    boxes = engine.read(str(image_path))
    result = parse_boxes(boxes, doc_type, schema)
    elapsed = time.time() - t0

    fields = [f for f in fields_for(schema, doc_type) if not f["type"].startswith("list")]

    print(f"{'항목':<14}{'우선':<6}{'정답':<16}{'OCR':<16}{'신뢰':<7}{'상태':<9}판정")
    print("-" * 82)

    stats = {"P1": [0, 0], "P2": [0, 0], "P3": [0, 0]}

    for field in fields:
        key = field["key"]
        item = result.get(key)
        if item is None:
            continue
        expected = dig(truth, field["label_path"], doc_type)
        got = item["value"]
        ok = same(expected, got, field)

        pri = field["priority"]
        stats[pri][1] += 1
        if ok:
            stats[pri][0] += 1

        mark = "O" if ok else ("X" if got is not None else "-")
        print(
            f"{field['name_ko']:<14}{pri:<6}{fmt(expected):<16}{fmt(got):<16}"
            f"{item['confidence']:<7.2f}{item['status']:<9}{mark}"
        )

    print("-" * 82)
    for pri in ("P1", "P2", "P3"):
        hit, total = stats[pri]
        if total:
            print(f"{pri} 정확도 : {hit}/{total}  ({hit / total * 100:.0f}%)")

    total_hit = sum(s[0] for s in stats.values())
    total_all = sum(s[1] for s in stats.values())
    print(f"전체     : {total_hit}/{total_all}  ({total_hit / total_all * 100:.0f}%)")
    print(f"처리 시간: {elapsed:.1f}초")

    notes = result["_meta"]["cross_check_notes"]
    if notes:
        print("\n[교차 검증으로 보정한 항목]")
        for n in notes:
            print(f"  · {n}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
