"""
공단 공식 양식(별지 제6호서식) 합성 결과통보서로 'General 만' vs 'Template + General' 을 채점한다.

같은 이미지에 CLOVA General 과 Template 을 한 번씩만 부르고(응답은 cache/ 에 저장),
  · general  : General 글자 + 자체 파서            (지금까지의 서버)
  · template : 양식이 맞으면 Template 칸 값만 쓴 것 (새 서버, server/pipeline.py 와 같은 함수)
두 결과를 같은 정답지로 채점한다.

사용법 (AutoFit_AI 폴더에서):
    .venv\\Scripts\\python.exe -m ocr.score_nhis
    .venv\\Scripts\\python.exe -m ocr.score_nhis --limit 6     # 앞 6장만 (연결 시험)

정답지: AutoFit_합성데이터/nhis_form6/labels/<구간>/P####.json
  · 쪽마다 인쇄된 항목만 채점한다 (page_fields)
  · 성별·나이는 양식에 칸이 없어 성명 칸에 임시로 적은 더미라 채점하지 않는다
  · 판정 체크박스(비만 판정 등)는 아직 추출 대상이 아니라 뺀다
"""

import argparse
import csv
import json
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .engines.clova_engine import ClovaOCREngine
from .engines.clova_template import ClovaTemplateEngine
from .parse_one import DATA_DIR
from .parser import fields_for, load_schema, parse_boxes
from .score_batch import outcome_of
from .template_fields import doc_of, template_items, template_page

NHIS_DIR = DATA_DIR / "nhis_form6"
REPORT_DIR = Path(__file__).resolve().parents[1] / "reports_nhis"
DOC = "checkup"


def build_tasks(schema: dict) -> list:
    scorable = {f["key"] for f in fields_for(schema, DOC)}
    tasks = []
    for label_path in sorted(NHIS_DIR.glob("labels/*/P*.json")):
        label = json.loads(label_path.read_text(encoding="utf-8"))
        dummy = set(label.get("dummy_fields", []))
        for image in label["images"]:
            keys = [k for k in label["page_fields"][str(image["page"])] if k in scorable and k not in dummy]
            tasks.append({
                "person": label["id"],
                "page": image["page"],
                "condition": image["condition"],
                "image": str(DATA_DIR / image["file"]),
                "expected": {k: label["values"].get(k) for k in keys},
                # 이 쪽에 인쇄되지 않는 항목. 값이 채워지면 오탐이다 (BMI 는 신장·체중으로 계산해 주므로 제외)
                "absent": sorted(scorable - set(label["page_fields"][str(image["page"])]) - dummy - {"bmi"}),
            })
    return tasks


def score_one(task: dict, general_engine, template_engine, schema: dict) -> list:
    fields = {f["key"]: f for f in fields_for(schema, DOC)}
    boxes = general_engine.read(task["image"])
    general = parse_boxes(boxes, DOC, schema)
    template = template_engine.read(task["image"])
    if doc_of(template) == DOC:
        combined = template_page(general, template_items(template, schema))
    else:
        combined = general

    rows = []
    for mode, result in (("general", general), ("template", combined)):
        for key, expected in task["expected"].items():
            item = result.get(key) or {}
            got, status = item.get("value"), item.get("status", "fail")
            rows.append({
                "mode": mode,
                "person": task["person"],
                "page": task["page"],
                "condition": task["condition"],
                "image": Path(task["image"]).name,
                "matched_template": template.template if template else "",
                "field": key,
                "expected": "" if expected is None else expected,
                "got": "" if got is None else got,
                "status": status,
                "method": item.get("method", ""),
                "outcome": outcome_of(expected, got, status, fields[key]),
            })
        for key in task["absent"]:
            item = result.get(key) or {}
            if item.get("value") is not None and item.get("status") != "fail":
                rows.append({
                    "mode": mode, "person": task["person"], "page": task["page"],
                    "condition": task["condition"], "image": Path(task["image"]).name,
                    "matched_template": template.template if template else "",
                    "field": key, "expected": "", "got": item["value"], "status": item["status"],
                    "method": item.get("method", ""), "outcome": "extra",
                })
    return rows


def pct(n: int, d: int) -> str:
    return f"{n}/{d} ({n / d * 100:.1f}%)" if d else "-"


def summarize(all_rows: list, tasks: list) -> str:
    lines = []
    rows = [r for r in all_rows if r["outcome"] != "extra"]
    by_mode = defaultdict(list)
    for r in rows:
        by_mode[r["mode"]].append(r)

    lines.append(f"채점 이미지 {len(tasks)}장 (1쪽 {sum(t['page'] == 1 for t in tasks)}장, 2쪽 {sum(t['page'] == 2 for t in tasks)}장)")
    matched = {r["image"]: r["matched_template"] for r in rows}
    lines.append(f"양식 인식(Template 매칭) : {pct(sum(1 for v in matched.values() if v), len(matched))}")
    lines.append("")
    lines.append(f"{'':12}{'정답':>22}{'오탐(틀린 값)':>22}{'누락(빈칸)':>20}")
    for mode, label in (("general", "General만"), ("template", "Template+G")):
        sel = by_mode[mode]
        c = sum(r["outcome"] == "correct" for r in sel)
        w = sum(r["outcome"] in ("wrong", "spurious") for r in sel)
        m = sum(r["outcome"] == "missing" for r in sel)
        lines.append(f"{label:12}{pct(c, len(sel)):>22}{pct(w, len(sel)):>22}{pct(m, len(sel)):>20}")
    for mode, label in (("general", "General만"), ("template", "Template+G")):
        extra = [r for r in all_rows if r["mode"] == mode and r["outcome"] == "extra"]
        fields = ", ".join(sorted({r["field"] for r in extra})) or "-"
        lines.append(f"  {label}: 양식에 없는 항목을 채운 오탐 {len(extra)}건 ({fields})")

    lines.append("")
    lines.append("조건별 정답률 (General만 → Template+G)")
    conds = sorted({r["condition"] for r in rows})
    for cond in conds:
        vals = []
        for mode in ("general", "template"):
            sel = [r for r in by_mode[mode] if r["condition"] == cond]
            vals.append(sum(r["outcome"] == "correct" for r in sel) / len(sel) * 100 if sel else 0)
        imgs = {r["image"] for r in rows if r["condition"] == cond}
        hit = sum(1 for i in imgs if matched[i])
        lines.append(f"  {cond:<12}{vals[0]:6.1f}% → {vals[1]:6.1f}%   (양식 인식 {hit}/{len(imgs)})")

    lines.append("")
    lines.append("항목별 정답률 (General만 → Template+G)")
    for key in dict.fromkeys(r["field"] for r in rows):
        vals = []
        for mode in ("general", "template"):
            sel = [r for r in by_mode[mode] if r["field"] == key]
            vals.append((sum(r["outcome"] == "correct" for r in sel), len(sel)))
        lines.append(f"  {key:<15}{vals[0][0]:>3}/{vals[0][1]:<3} → {vals[1][0]:>3}/{vals[1][1]:<3}")

    wrong = [r for r in by_mode["template"] if r["outcome"] in ("wrong", "spurious")]
    if wrong:
        lines.append("")
        lines.append("Template+G 오탐 사례")
        for r in wrong[:20]:
            lines.append(f"  {r['image']:<34}{r['field']:<14}정답 {r['expected']!s:<12} 결과 {r['got']!s:<12} ({r['method']})")
    return "\n".join(lines)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    schema = load_schema()
    general_engine, template_engine = ClovaOCREngine(), ClovaTemplateEngine()
    for engine in (general_engine, template_engine):
        ok, reason = engine.is_available()
        if not ok:
            print(reason)
            return 1

    tasks = build_tasks(schema)
    if args.limit:
        tasks = tasks[: args.limit]
    print(f"채점 대상 {len(tasks)}장 (API 응답은 cache/ 에 저장, 다시 돌리면 호출 없음)")

    rows = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i, result in enumerate(pool.map(lambda t: score_one(t, general_engine, template_engine, schema), tasks), 1):
            rows.extend(result)
            if i % 10 == 0 or i == len(tasks):
                print(f"  {i}/{len(tasks)}장")

    REPORT_DIR.mkdir(exist_ok=True)
    with open(REPORT_DIR / "raw_results.csv", "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    summary = summarize(rows, tasks)
    (REPORT_DIR / "summary.txt").write_text(summary, encoding="utf-8")
    print("\n" + summary)
    print(f"\n저장 위치: {REPORT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
