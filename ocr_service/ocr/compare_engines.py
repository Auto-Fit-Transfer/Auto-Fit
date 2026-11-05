"""
엔진 비교표 — 기획서 7.1 OCR 목표 기준.

score_batch --sample realistic 로 엔진마다 채점한 결과(raw_results.csv)를 모아
같은 잣대로 나란히 놓는다.

기획서 7.1 [1차] 목표
  · 항목 탐지 F1          95% 이상
  · 숫자·단위 완전일치율   95% 이상
  · 필수 지표 누락률       3% 이하   (필수 = 항목표 P1)
  · 오탐률                 2% 이하   (채운 값 중 틀린 비율 — 사용자가 잡아내기 어려운 오류)
  · OCR 응답              5초 이내  (7.4)

사용법 (AutoFit_AI 폴더에서):
    .venv\\Scripts\\python.exe -m ocr.compare_engines
"""

import csv
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1] / "reports_realistic"

ENGINE_NAMES = {
    "clova": "CLOVA OCR (General) + 자체 파서",
    "upstage": "Upstage Document OCR + 자체 파서",
    "kie_upstage": "Upstage Information Extract (KIE)",
    "easyocr": "EasyOCR + 자체 파서 (무료 기준선)",
}

TARGETS = {"f1": 95.0, "exact": 95.0, "miss": 3.0, "false": 2.0, "sec": 5.0}


def load_rows(engine_dir: Path) -> List[dict]:
    path = engine_dir / "raw_results.csv"
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def metrics(rows: List[dict]) -> Dict[str, float]:
    count = defaultdict(int)
    for r in rows:
        count[r["outcome"]] += 1

    correct, wrong, spurious, missing = (count[k] for k in ("correct", "wrong", "spurious", "missing"))
    expected = correct + wrong + missing          # 정답이 있는 칸
    filled = correct + wrong + spurious           # 엔진이 채운 칸
    tp, fp, fn = correct, wrong + spurious, wrong + missing

    def pct(a, b):
        return round(a / b * 100, 1) if b else None

    return {
        "cells": expected,
        "exact": pct(correct, expected),
        "miss": pct(missing, expected),
        "false": pct(wrong + spurious, filled),
        "f1": pct(2 * tp, 2 * tp + fp + fn),
        "wrong_n": wrong + spurious,
        "miss_n": missing,
    }


def latency(rows: List[dict]) -> Dict[str, float]:
    per_image = {}
    for r in rows:
        if r["field"] != "_ERROR":
            per_image[r["image"]] = float(r["elapsed"] or 0)
    values = sorted(per_image.values())
    if not values:
        return {"avg": None, "p95": None, "max": None}
    return {
        "avg": round(sum(values) / len(values), 2),
        "p95": values[min(len(values) - 1, int(len(values) * 0.95))],
        "max": values[-1],
    }


def mark(value, target, lower_is_better=False) -> str:
    if value is None:
        return "-"
    ok = value <= target if lower_is_better else value >= target
    return f"{value}{' ✅' if ok else ' ❌'}"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    engines = sorted(p for p in ROOT.iterdir() if (p / "raw_results.csv").exists()) if ROOT.exists() else []
    if not engines:
        print(f"채점 결과가 없습니다: {ROOT}")
        return 1

    summary = []
    by_condition = defaultdict(dict)
    for engine_dir in engines:
        rows = load_rows(engine_dir)
        good = [r for r in rows if r["field"] != "_ERROR"]
        images = {r["image"] for r in rows}
        errors = {r["image"] for r in rows if r["field"] == "_ERROR"}
        p1 = [r for r in good if r["priority"] == "P1"]

        m_p1, m_all, lat = metrics(p1), metrics(good), latency(rows)
        summary.append(
            {
                "engine": engine_dir.name,
                "name": ENGINE_NAMES.get(engine_dir.name, engine_dir.name),
                "images": len(images),
                "errors": len(errors),
                "p1": m_p1,
                "all": m_all,
                "lat": lat,
            }
        )
        for cond in sorted({r["condition"] for r in p1}):
            by_condition[cond][engine_dir.name] = metrics([r for r in p1 if r["condition"] == cond])

    # ---------------------------------------------------------- 출력
    lines = ["# OCR 엔진 비교 — 실생활 촬영 조건 (기획서 7.1 기준)", ""]
    lines.append("## 필수 지표(P1) 기준")
    lines.append("")
    lines.append("| 엔진 | 이미지 | 실패 | F1 (≥95) | 완전일치 (≥95) | 누락률 (≤3) | 오탐률 (≤2) | 평균 초 (≤5) | 최대 초 |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for s in summary:
        m, lat = s["p1"], s["lat"]
        lines.append(
            f"| {s['name']} | {s['images']} | {s['errors']} | {mark(m['f1'], TARGETS['f1'])} | "
            f"{mark(m['exact'], TARGETS['exact'])} | {mark(m['miss'], TARGETS['miss'], True)} | "
            f"{mark(m['false'], TARGETS['false'], True)} | {mark(lat['avg'], TARGETS['sec'], True)} | {lat['max']} |"
        )

    lines += ["", "## 전체 항목(P1~P3) 기준", ""]
    lines.append("| 엔진 | 칸 수 | F1 | 완전일치 | 누락률 | 오탐률 | 오탐 건수 | 누락 건수 |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for s in summary:
        m = s["all"]
        lines.append(
            f"| {s['name']} | {m['cells']} | {m['f1']} | {m['exact']} | {m['miss']} | {m['false']} | "
            f"{m['wrong_n']} | {m['miss_n']} |"
        )

    lines += ["", "## 촬영 조건별 필수 지표 — 누락률 / 오탐률 (%)", ""]
    names = [s["engine"] for s in summary]
    lines.append("| 조건 | " + " | ".join(ENGINE_NAMES.get(n, n) for n in names) + " |")
    lines.append("|---|" + "---|" * len(names))
    for cond, per in by_condition.items():
        cells = []
        for n in names:
            m = per.get(n)
            cells.append(f"{m['miss']} / {m['false']}" if m else "-")
        lines.append(f"| {cond} | " + " | ".join(cells) + " |")

    text = "\n".join(lines)
    print(text)

    (ROOT / "comparison.md").write_text(text + "\n", encoding="utf-8")
    with open(ROOT / "comparison.csv", "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["엔진", "범위", "이미지", "실패", "F1", "완전일치", "누락률", "오탐률", "평균초", "p95초", "최대초"])
        for s in summary:
            for scope in ("p1", "all"):
                m = s[scope]
                writer.writerow(
                    [s["name"], "필수(P1)" if scope == "p1" else "전체", s["images"], s["errors"],
                     m["f1"], m["exact"], m["miss"], m["false"],
                     s["lat"]["avg"], s["lat"]["p95"], s["lat"]["max"]]
                )
    print(f"\n저장: {ROOT / 'comparison.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
