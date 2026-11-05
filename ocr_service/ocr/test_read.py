"""
OCR 첫 동작 확인용 스크립트.

건강문서 이미지 한 장을 읽어서 '글자가 제대로 인식되는가'만 눈으로 확인한다.
항목을 뽑아내는 파서는 다음 단계에서 만든다.

사용법 (AutoFit_AI 폴더에서):
    .venv\\Scripts\\python.exe -m ocr.test_read
    .venv\\Scripts\\python.exe -m ocr.test_read "이미지경로.jpg"
"""

import sys
import time
from pathlib import Path

from .engines.base import boxes_to_lines
from .engines.easyocr_engine import EasyOCREngine

# 기본 테스트 이미지: 노이즈 없는 깨끗한 체성분 결과지 한 장
DEFAULT_IMAGE = (
    Path(__file__).resolve().parents[2]
    / "AutoFit_합성데이터"
    / "images"
    / "3_overweight"
    / "inbody"
    / "P1201_inbody_0_clean.jpg"
)


def main() -> int:
    # 윈도우 터미널에서 한글이 깨지지 않도록
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    image_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IMAGE

    if not image_path.exists():
        print(f"[오류] 이미지를 찾을 수 없습니다: {image_path}")
        return 1

    engine = EasyOCREngine()
    ok, reason = engine.is_available()
    if not ok:
        print(f"[오류] {reason}")
        return 1

    print(f"대상 이미지 : {image_path.name}")
    print(f"엔진        : {engine.name}")
    print("모델 로딩 중… (처음 한 번은 모델 다운로드로 시간이 걸립니다)")

    # 모델 로딩은 서버가 켜질 때 딱 한 번만 하면 되므로
    # 사용자가 실제로 기다리는 '인식 시간'과 따로 잰다.
    t_load = time.time()
    engine._get_reader()
    load_sec = time.time() - t_load

    t0 = time.time()
    boxes = engine.read(str(image_path))
    elapsed = time.time() - t0

    lines = boxes_to_lines(boxes)

    print(f"모델 로딩 시간     : {load_sec:.1f}초  (서버 시작 때 1회, 사용자는 기다리지 않음)")
    print(f"인식된 글자 덩어리 : {len(boxes)}개")
    print(f"묶인 줄 수         : {len(lines)}줄")
    print(f"실제 인식 시간     : {elapsed:.1f}초  (목표 5초 이내)\n")
    print("-" * 70)

    for i, line in enumerate(lines, 1):
        text = "  ".join(b.text for b in line)
        min_conf = min(b.conf for b in line)
        mark = "  ⚠" if min_conf < 0.5 else ""
        print(f"{i:3d} | {text}{mark}")

    print("-" * 70)

    low = [b for b in boxes if b.conf < 0.5]
    print(f"신뢰도 0.5 미만 : {len(low)}개 / {len(boxes)}개")
    if low:
        print("  예: " + ", ".join(f"{b.text!r}({b.conf:.2f})" for b in low[:8]))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
