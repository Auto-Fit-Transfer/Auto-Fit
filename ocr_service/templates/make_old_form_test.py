"""
개정 전 공단 양식(빈 양식 200dpi)에 합성 인물 값을 써넣어 Template OCR 검증용 이미지를 만든다.

좌표는 개정 전 PDF 의 글자 위치(검사항목 이름 행 가운데, '/' 위치)에서 뽑았다.
실행 (AutoFit_AI 폴더에서):
    .venv\\Scripts\\python.exe templates_source\\make_old_form_test.py P0001
출력: templates_source\\nhis_form6_old\\test_<ID>_p1.jpg, test_<ID>_p2.jpg
"""

import glob
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OLD = HERE / "nhis_form6_old"
LABELS = Path(r"C:\Users\user\Desktop\AutoFit_합성데이터\labels")
FONT = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 30)
INK = (25, 25, 60)

# 2쪽 혈액검사 값: 결과 열 가운데 x=803, 행 가운데 y (200dpi)
BLOOD_Y = {"hb": 545, "glucose": 611, "tc": 667, "hdl": 707, "tg": 759, "ldl": 805,
           "cr": 854, "egfr": 898, "ast": 960, "alt": 1011, "ggt": 1057}


def fmt(v, decimals=0):
    return f"{v:.{decimals}f}" if decimals else str(int(round(v)))


def main(pid: str) -> None:
    label = json.loads(Path(glob.glob(str(LABELS / "*" / f"{pid}.json"))[0]).read_text(encoding="utf-8"))
    c = label["checkup"]

    p1 = Image.open(OLD / "page1_200dpi.png").convert("RGB")
    d = ImageDraw.Draw(p1)
    y, m, dd = c["date"].split("-")
    d.text((560, 338), f"{y}. {m}. {dd}.", font=FONT, fill=INK, anchor="mm")
    p1.save(OLD / f"test_{pid}_p1.jpg", quality=92)

    p2 = Image.open(OLD / "page2_200dpi.png").convert("RGB")
    d = ImageDraw.Draw(p2)
    d.text((1100, 146), fmt(label["height"], 1), font=FONT, fill=INK, anchor="rm")
    d.text((1136, 146), fmt(label["weight"], 1), font=FONT, fill=INK, anchor="lm")
    d.text((800, 266), fmt(c["waist"], 1), font=FONT, fill=INK, anchor="mm")
    left, right = c["vision"].split("/")
    d.text((820, 311), left, font=FONT, fill=INK, anchor="rm")
    d.text((852, 311), right, font=FONT, fill=INK, anchor="lm")
    d.text((515, 437), str(c["sbp"]), font=FONT, fill=INK, anchor="rm")
    d.text((548, 437), str(c["dbp"]), font=FONT, fill=INK, anchor="lm")
    decimals = {"hb": 1, "cr": 2}
    for key, yy in BLOOD_Y.items():
        d.text((803, yy), fmt(c[key], decimals.get(key, 0)), font=FONT, fill=INK, anchor="mm")
    p2.save(OLD / f"test_{pid}_p2.jpg", quality=92)
    print(OLD / f"test_{pid}_p1.jpg", OLD / f"test_{pid}_p2.jpg")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "P0001")
