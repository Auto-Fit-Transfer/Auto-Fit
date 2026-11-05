"""
학습 / 검증 / 평가 데이터 분할.

⚠️ 학습을 시작하기 전에 반드시 고정해야 한다.

같은 사람의 문서로 학습하고 채점하면 모델이 '읽은' 것인지 '외운' 것인지
구분할 수 없다. 그러면 지금까지 쌓은 정확도 숫자가 전부 의미를 잃는다.
그래서 이미지가 아니라 **사람 단위로** 나눈다.
(한 사람이 문서 3종 × 사진 3장 = 9장을 갖고 있어서,
 이미지 단위로 나누면 같은 사람이 학습과 평가에 동시에 들어간다.)

두 가지를 지킨다.
  1) 체형 5구간 비율 유지 — 비만 구간만 평가에 몰리면 안 된다
  2) 기존 평가 대상 50명은 무조건 test 로 — 지금까지 잰 기준선과
     같은 이미지로 비교해야 개선 여부를 말할 수 있다

사용법 (AutoFit_AI 폴더에서):
    .venv\\Scripts\\python.exe -m ocr.splits            # 분할 생성 및 저장
    .venv\\Scripts\\python.exe -m ocr.splits --show     # 저장된 분할 확인
"""

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Dict, List, Set

from .parse_one import DATA_DIR

SPLIT_PATH = Path(__file__).resolve().parents[1] / "data" / "splits.json"
GROUPS = ["1_underweight", "2_normal", "3_overweight", "4_obese", "5_severe_obese"]

# 기준선 측정에 쓴 사람들. score_batch 의 --people 10 과 같은 방식으로 뽑는다.
BASELINE_PEOPLE_PER_GROUP = 10


def _people(group: str) -> List[str]:
    return sorted(p.stem for p in (DATA_DIR / "labels" / group).glob("P*.json"))


def baseline_people(group: str, per_group: int = BASELINE_PEOPLE_PER_GROUP) -> List[str]:
    """기준선 측정에 사용된 사람 목록 (score_batch.build_tasks 와 동일한 규칙)."""
    people = _people(group)
    step = max(1, len(people) // per_group)
    return people[::step][:per_group]


def build_splits(seed: int = 20260831, val_ratio: float = 0.1, test_ratio: float = 0.1) -> dict:
    rng = random.Random(seed)
    splits: Dict[str, List[str]] = {"train": [], "val": [], "test": []}
    per_group_counts = {}

    for group in GROUPS:
        people = _people(group)
        pinned = set(baseline_people(group))

        rest = [p for p in people if p not in pinned]
        rng.shuffle(rest)

        n_total = len(people)
        n_test = max(int(n_total * test_ratio), len(pinned))
        n_val = int(n_total * val_ratio)

        # 기준선 사람들을 먼저 test 에 넣고 나머지로 채운다
        test = sorted(pinned) + rest[: n_test - len(pinned)]
        remaining = rest[n_test - len(pinned):]
        val = remaining[:n_val]
        train = remaining[n_val:]

        splits["test"] += test
        splits["val"] += val
        splits["train"] += train
        per_group_counts[group] = {
            "train": len(train), "val": len(val), "test": len(test), "total": n_total
        }

    for key in splits:
        splits[key] = sorted(splits[key])

    return {
        "seed": seed,
        "created": "2026-08-31",
        "note": "사람 단위 분할. 학습셋과 평가셋에 같은 사람이 절대 겹치지 않는다.",
        "pinned_to_test": "기준선 측정에 사용된 구간별 10명 (총 50명)",
        "counts": per_group_counts,
        "splits": splits,
    }


def save(data: dict, path: Path = SPLIT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load(path: Path = SPLIT_PATH) -> dict:
    if not path.exists():
        raise FileNotFoundError(
            f"분할 파일이 없습니다: {path}\n"
            "  .venv\\Scripts\\python.exe -m ocr.splits  를 먼저 실행하세요."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def people_in(split_name: str, path: Path = SPLIT_PATH) -> Set[str]:
    """'train' / 'val' / 'test' 에 속한 사람 번호 집합."""
    return set(load(path)["splits"][split_name])


def verify(data: dict) -> List[str]:
    """분할이 제대로 됐는지 스스로 검사한다."""
    problems = []
    s = data["splits"]

    # ① 겹침 없음
    for a, b in (("train", "val"), ("train", "test"), ("val", "test")):
        overlap = set(s[a]) & set(s[b])
        if overlap:
            problems.append(f"{a}/{b} 에 같은 사람 {len(overlap)}명이 겹칩니다: {sorted(overlap)[:5]}")

    # ② 빠진 사람 없음
    total = sum(len(_people(g)) for g in GROUPS)
    assigned = len(s["train"]) + len(s["val"]) + len(s["test"])
    if total != assigned:
        problems.append(f"인원 불일치: 전체 {total}명 vs 배정 {assigned}명")

    # ③ 기준선 50명이 전부 test 에 있음
    pinned = {p for g in GROUPS for p in baseline_people(g)}
    missing = pinned - set(s["test"])
    if missing:
        problems.append(f"기준선 대상 {len(missing)}명이 test 에 없습니다: {sorted(missing)[:5]}")

    return problems


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true", help="저장된 분할만 확인")
    ap.add_argument("--seed", type=int, default=20260831)
    args = ap.parse_args()

    data = load() if args.show else build_splits(args.seed)

    print(f"기준(seed) : {data['seed']}   생성일 {data['created']}")
    print(f"{'체형 구간':<18}{'전체':>7}{'학습':>8}{'검증':>7}{'평가':>7}")
    print("-" * 48)
    for group, c in data["counts"].items():
        print(f"{group:<18}{c['total']:>7}{c['train']:>8}{c['val']:>7}{c['test']:>7}")
    s = data["splits"]
    print("-" * 48)
    print(f"{'합계':<18}{len(s['train'])+len(s['val'])+len(s['test']):>7}"
          f"{len(s['train']):>8}{len(s['val']):>7}{len(s['test']):>7}")
    print(f"\n이미지 환산 (사람당 9장) : 학습 {len(s['train'])*9:,}장 / "
          f"검증 {len(s['val'])*9:,}장 / 평가 {len(s['test'])*9:,}장")

    problems = verify(data)
    print()
    if problems:
        for p in problems:
            print(f"  [문제] {p}")
        return 1
    print("  검사 통과 — 겹치는 사람 없음, 누락 없음, 기준선 50명 모두 평가셋에 포함")

    if not args.show:
        save(data)
        print(f"\n저장: {SPLIT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
