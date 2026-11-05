"""
자동 채점.

여러 사람 × 여러 문서 × 여러 노이즈 조건으로 OCR+파싱을 돌리고
정답지와 대조해 '항목별·조건별 성적표'를 CSV로 만든다.

이 성적표가 있어야
  · 어느 항목을 고쳐야 하는지 (항목별 정확도)
  · 어떤 사진에서 무너지는지 (조건별 정확도)
  · 상용 OCR API가 정말 더 나은지 (같은 잣대로 비교)
를 말할 수 있다.

사용법 (AutoFit_AI 폴더에서):
    .venv\\Scripts\\python.exe -m ocr.score_batch --people 30
    .venv\\Scripts\\python.exe -m ocr.score_batch --people 100 --workers 3
    .venv\\Scripts\\python.exe -m ocr.score_batch --people 20 --conditions clean

    # 상용 API 비교 (실생활 촬영 조건 7종 × 문서 2종 × 7장 = 98장)
    .venv\\Scripts\\python.exe -m ocr.score_batch --sample realistic --engine clova --workers 2
    .venv\\Scripts\\python.exe -m ocr.score_batch --sample realistic --engine upstage --workers 1
    .venv\\Scripts\\python.exe -m ocr.score_batch --sample realistic --engine kie:upstage --workers 1
"""

import argparse
import csv
import json
import os
import sys
import time
from collections import defaultdict
from multiprocessing import Pool
from pathlib import Path
from typing import List, Optional

from .engines.easyocr_engine import EasyOCREngine
from .parse_one import DATA_DIR, dig, same
from .parser import fields_for, load_schema, parse_boxes

REPORT_DIR = Path(__file__).resolve().parents[1] / "reports"
GROUPS = ["1_underweight", "2_normal", "3_overweight", "4_obese", "5_severe_obese"]

_ENGINE = None
_SCHEMA = None
_MODE = "easyocr"  # 'easyocr' / 'clova' / 'upstage'(글자 인식 + 자체 파서) 또는 'kie:<이름>'

# 실생활 폰 촬영과 닮은 조건. clean 은 스캔본에 가까워 뺀다.
REALISTIC_CONDITIONS = ["tilt", "lighting", "shadow", "perspective", "fold", "lowres", "mixed"]


# ---------------------------------------------------------------- 작업 목록

def build_tasks(
    people_per_group: int,
    docs: List[str],
    conditions: str,
    split: Optional[str] = None,
) -> List[dict]:
    """채점할 이미지 목록을 만든다. 체형 5구간에서 고르게 뽑는다.

    split 을 주면 그 분할에 속한 사람만 쓴다.
    학습에 쓴 사람으로 채점하는 사고를 막는 안전장치다.
    """
    allowed = None
    if split:
        from .splits import people_in

        allowed = people_in(split)

    tasks = []
    for group in GROUPS:
        labels = sorted((DATA_DIR / "labels" / group).glob("P*.json"))

        if allowed is not None:
            labels = [p for p in labels if p.stem in allowed]
            # 기준선 측정에 쓴 사람을 앞에 두어, 같은 이미지로 계속 비교할 수 있게 한다.
            from .splits import baseline_people

            pinned = baseline_people(group)
            order = {name: i for i, name in enumerate(pinned)}
            labels.sort(key=lambda p: (order.get(p.stem, len(order)), p.stem))
            picked = labels[:people_per_group]
        else:
            step = max(1, len(labels) // people_per_group)
            picked = labels[::step][:people_per_group]

        for label_path in picked:
            person_id = label_path.stem
            for doc in docs:
                images = sorted((DATA_DIR / "images" / group / doc).glob(f"{person_id}_{doc}_*.jpg"))
                for image in images:
                    condition = image.stem.split("_")[-1]
                    if conditions == "clean" and condition != "clean":
                        continue
                    if conditions == "noisy" and condition == "clean":
                        continue
                    tasks.append(
                        {
                            "person": person_id,
                            "group": group,
                            "doc": doc,
                            "condition": condition,
                            "image": str(image),
                            "label": str(label_path),
                        }
                    )
    return tasks


def build_realistic_tasks(per_cell: int, docs: List[str]) -> List[dict]:
    """실생활 촬영 조건만 골라 (문서 × 조건) 칸마다 per_cell 장씩 뽑는다.

    · 평가용(test) 사람만 쓴다
    · 체형 5구간을 돌아가며 뽑아 한 구간에 몰리지 않게 한다
    · 매번 같은 이미지가 뽑히도록 순서를 고정한다 (엔진끼리 같은 시험지로 비교)
    """
    from .splits import people_in

    allowed = people_in("test")
    tasks = []
    cell = 0
    for doc in docs:
        for condition in REALISTIC_CONDITIONS:
            cell += 1
            pools = []
            for group in GROUPS:
                images = sorted((DATA_DIR / "images" / group / doc).glob(f"*_{doc}_*_{condition}.jpg"))
                pools.append([(group, im) for im in images if im.stem.split("_")[0] in allowed])

            # 칸마다 시작 구간을 바꿔 전체적으로 5구간이 고르게 섞이게 한다
            picked, i = [], cell * per_cell
            while len(picked) < per_cell and any(pools):
                pool = pools[i % len(pools)]
                if pool:
                    picked.append(pool.pop(0))
                i += 1

            for group, image in picked:
                person_id = image.stem.split("_")[0]
                tasks.append(
                    {
                        "person": person_id,
                        "group": group,
                        "doc": doc,
                        "condition": condition,
                        "image": str(image),
                        "label": str(DATA_DIR / "labels" / group / f"{person_id}.json"),
                    }
                )
    return tasks


def outcome_of(expected, got, status: str, field: dict) -> str:
    """기획서 7.1 기준으로 칸 하나를 분류한다.

    채움 = 값이 있고 status 가 fail 이 아님 (fail 은 화면에서 빈칸으로 보인다)
      correct  : 채웠고 정답과 같음
      wrong    : 채웠는데 틀림                      → 오탐
      spurious : 정답이 없는 칸인데 채움             → 오탐
      missing  : 정답이 있는데 비움                  → 누락
      blank_ok : 정답도 없고 비움
    """
    filled = got is not None and status != "fail"
    if expected is None:
        return "spurious" if filled else "blank_ok"
    if not filled:
        return "missing"
    return "correct" if same(expected, got, field) else "wrong"


# ---------------------------------------------------------------- 워커

def _init_worker(threads: int, mode: str):
    global _ENGINE, _SCHEMA, _MODE
    _MODE = mode
    _SCHEMA = load_schema()

    if mode.startswith("kie:"):
        from .kie import get_engine

        _ENGINE = get_engine(mode.split(":", 1)[1])
        return

    if mode == "clova":
        from .engines.clova_engine import ClovaOCREngine

        _ENGINE = ClovaOCREngine()
        return

    if mode == "upstage":
        from .engines.upstage_engine import UpstageOCREngine

        _ENGINE = UpstageOCREngine()
        return

    try:
        import torch

        torch.set_num_threads(max(1, threads))
    except Exception:
        pass
    _ENGINE = EasyOCREngine()
    _ENGINE._get_reader()


def _score_one(task: dict) -> List[dict]:
    """이미지 한 장을 채점해 항목별 결과 줄을 돌려준다."""
    truth = json.loads(Path(task["label"]).read_text(encoding="utf-8"))

    from .engines import api_cache

    api_cache.last_api_seconds = None
    api_cache.last_was_cached = False
    t0 = time.time()
    try:
        if _MODE.startswith("kie:"):
            from .kie.extract import extract_fields

            result = extract_fields(task["image"], task["doc"], _ENGINE, _SCHEMA)
        else:
            boxes = _ENGINE.read(task["image"])
            result = parse_boxes(boxes, task["doc"], _SCHEMA)
    except Exception as exc:  # 한 장이 실패해도 전체 채점은 계속한다
        return [
            {
                **{k: task[k] for k in ("person", "group", "doc", "condition")},
                "image": Path(task["image"]).name,
                "field": "_ERROR",
                "priority": "-",
                "expected": "",
                "got": str(exc)[:120],
                "status": "error",
                "correct": 0,
                "outcome": "error",
                "elapsed": round(time.time() - t0, 2),
            }
        ]
    elapsed = round(time.time() - t0, 2)
    if api_cache.last_was_cached and api_cache.last_api_seconds is not None:
        # 저장본을 읽었더라도 처음 API 를 불렀을 때 걸린 시간을 쓴다
        elapsed = round(api_cache.last_api_seconds + elapsed, 2)

    rows = []
    for field in fields_for(_SCHEMA, task["doc"]):
        if field["type"].startswith("list"):
            continue
        item = result.get(field["key"])
        if item is None:
            continue
        expected = dig(truth, field["label_path"], task["doc"])
        got = item["value"]
        rows.append(
            {
                **{k: task[k] for k in ("person", "group", "doc", "condition")},
                "image": Path(task["image"]).name,
                "field": field["key"],
                "priority": field["priority"],
                "expected": "" if expected is None else expected,
                "got": "" if got is None else got,
                "status": item["status"],
                "correct": int(same(expected, got, field)),
                "outcome": outcome_of(expected, got, item["status"], field),
                "elapsed": elapsed,
            }
        )
    return rows


# ---------------------------------------------------------------- 집계

def write_reports(rows: List[dict], out_dir: Optional[Path] = None) -> None:
    REPORT_DIR = out_dir or globals()["REPORT_DIR"]
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    # 원본 (엑셀에서 바로 열리도록 utf-8-sig)
    raw_path = REPORT_DIR / "raw_results.csv"
    with open(raw_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    conditions = sorted({r["condition"] for r in rows})

    # ① 항목별 정확도
    per_field = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # (doc,field) -> cond -> [맞음, 전체]
    meta = {}
    for r in rows:
        if r["field"] == "_ERROR":
            continue
        key = (r["doc"], r["field"])
        meta[key] = r["priority"]
        per_field[key]["전체"][1] += 1
        per_field[key]["전체"][0] += r["correct"]
        per_field[key][r["condition"]][1] += 1
        per_field[key][r["condition"]][0] += r["correct"]

    field_path = REPORT_DIR / "field_accuracy.csv"
    with open(field_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["문서", "항목", "우선순위", "표본수", "정확도(%)"] + [f"{c}(%)" for c in conditions])
        for key in sorted(per_field, key=lambda k: (k[0], -per_field[k]["전체"][0] / max(per_field[k]["전체"][1], 1))):
            hit, total = per_field[key]["전체"]
            row = [key[0], key[1], meta[key], total, round(hit / total * 100, 1) if total else 0]
            for c in conditions:
                h, t = per_field[key][c]
                row.append(round(h / t * 100, 1) if t else "")
            writer.writerow(row)

    # ② 노이즈 조건별 정확도
    per_cond = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # cond -> priority -> [맞음, 전체]
    for r in rows:
        if r["field"] == "_ERROR":
            continue
        per_cond[r["condition"]][r["priority"]][1] += 1
        per_cond[r["condition"]][r["priority"]][0] += r["correct"]
        per_cond[r["condition"]]["전체"][1] += 1
        per_cond[r["condition"]]["전체"][0] += r["correct"]

    cond_path = REPORT_DIR / "condition_accuracy.csv"
    with open(cond_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["노이즈조건", "P1(%)", "P2(%)", "P3(%)", "전체(%)", "표본수"])
        for cond in conditions:
            row = [cond]
            for pri in ("P1", "P2", "P3", "전체"):
                h, t = per_cond[cond][pri]
                row.append(round(h / t * 100, 1) if t else "")
            row.append(per_cond[cond]["전체"][1])
            writer.writerow(row)

    print(f"\n저장 위치: {REPORT_DIR}")
    for p in (raw_path, field_path, cond_path):
        print(f"  · {p.name}")


def print_summary(rows: List[dict], wall: float, images: int) -> None:
    errors = [r for r in rows if r["field"] == "_ERROR"]
    good = [r for r in rows if r["field"] != "_ERROR"]

    print("\n" + "=" * 62)
    print(f"채점 이미지 : {images}장   (실패 {len(errors)}장)")
    if good:
        elapsed = {r["image"]: r["elapsed"] for r in good}
        print(f"장당 처리   : 평균 {sum(elapsed.values()) / len(elapsed):.1f}초")
    print(f"총 소요     : {wall / 60:.1f}분")
    print("-" * 62)

    for pri in ("P1", "P2", "P3"):
        sel = [r for r in good if r["priority"] == pri]
        if sel:
            hit = sum(r["correct"] for r in sel)
            print(f"{pri} 정확도 : {hit}/{len(sel)}  ({hit / len(sel) * 100:.1f}%)")
    hit = sum(r["correct"] for r in good)
    print(f"전체     : {hit}/{len(good)}  ({hit / len(good) * 100:.1f}%)")

    print("-" * 62)
    print("가장 약한 항목 10개 (표본 5개 이상)")
    per_field = defaultdict(lambda: [0, 0])
    for r in good:
        per_field[(r["doc"], r["field"])][1] += 1
        per_field[(r["doc"], r["field"])][0] += r["correct"]
    weak = sorted(
        ((k, v) for k, v in per_field.items() if v[1] >= 5),
        key=lambda kv: kv[1][0] / kv[1][1],
    )[:10]
    for (doc, field), (h, t) in weak:
        print(f"  {doc:<9}{field:<16}{h}/{t}  ({h / t * 100:.0f}%)")
    print("=" * 62)


# ---------------------------------------------------------------- 실행

def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--people", type=int, default=6, help="체형 구간마다 뽑을 사람 수")
    ap.add_argument(
        "--sample",
        default="people",
        choices=["people", "realistic"],
        help="people: 사람 단위로 뽑기 / realistic: 실생활 촬영 조건 7종만 (문서×조건마다 --per-cell 장)",
    )
    ap.add_argument("--per-cell", type=int, default=7, help="--sample realistic 일 때 칸마다 뽑을 장수")
    ap.add_argument("--limit", type=int, default=0, help="앞에서부터 이 장수만 채점 (API 연결 시험용)")
    ap.add_argument("--docs", default="inbody,checkup")
    ap.add_argument("--conditions", default="all", choices=["all", "clean", "noisy"])
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument(
        "--engine",
        default="easyocr",
        help="easyocr / clova / upstage (글자 인식 + 자체 파서) 또는 kie:mock / kie:http / kie:upstage",
    )
    ap.add_argument("--out", default=None, help="성적표를 저장할 폴더")
    ap.add_argument(
        "--split",
        default=None,
        choices=["train", "val", "test"],
        help="이 분할에 속한 사람만 채점. 학습한 모델은 반드시 test 로 잴 것",
    )
    args = ap.parse_args()

    docs = [d.strip() for d in args.docs.split(",") if d.strip()]
    if args.sample == "realistic":
        tasks = build_realistic_tasks(args.per_cell, docs)
    else:
        tasks = build_tasks(args.people, docs, args.conditions, args.split)
    if args.limit:
        tasks = tasks[: args.limit]

    # 엔진마다 폴더를 나눠 이전 성적표를 덮어쓰지 않게 한다.
    out_dir = Path(args.out) if args.out else (
        REPORT_DIR if args.engine == "easyocr"
        else REPORT_DIR.with_name("reports_" + args.engine.replace(":", "_"))
    )
    if args.sample == "realistic" and not args.out:
        out_dir = REPORT_DIR.with_name("reports_realistic") / args.engine.replace(":", "_")

    print(f"채점 대상 : {len(tasks)}장  (구간별 {args.people}명 × {len(docs)}종 문서)")
    print(f"엔진      : {args.engine}")
    print(f"저장 위치 : {out_dir.name}")
    print(f"동시 실행 : {args.workers}개\n")

    threads = max(1, (os.cpu_count() or 4) // max(args.workers, 1))
    t0 = time.time()
    rows: List[dict] = []

    with Pool(args.workers, initializer=_init_worker, initargs=(threads, args.engine)) as pool:
        for i, result in enumerate(pool.imap_unordered(_score_one, tasks), 1):
            rows.extend(result)
            if i % 10 == 0 or i == len(tasks):
                done = time.time() - t0
                eta = done / i * (len(tasks) - i)
                print(f"  {i}/{len(tasks)}장  경과 {done / 60:.1f}분  남은시간 약 {eta / 60:.1f}분")

    wall = time.time() - t0
    if not rows:
        print("채점 결과가 없습니다.")
        return 1

    print_summary(rows, wall, len(tasks))
    write_reports(rows, out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
