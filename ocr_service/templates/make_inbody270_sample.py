"""
InBody270 카탈로그 결과지(PDF 1쪽) → CLOVA Template OCR 대표 샘플 이미지.

  1) 300dpi 로 렌더링 (벡터라 선명함)
  2) 결과지 테두리 안쪽만 잘라냄 ('결과지' 제목 등 카탈로그 여백 제거)
  3) 카탈로그 설명용 번호 동그라미(①~⑪)를 주변 배경색으로 지움 (실제 출력지에는 없음)
  4) A4 200dpi 크기(가로 1654px)로 맞춰 저장

실행 (AutoFit_AI 폴더에서):
    .venv\\Scripts\\python.exe templates_source\\make_inbody270_sample.py <inbody-270-result.pdf>
출력: templates_source\\inbody270\\inbody270_sample.png
"""

import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import ImageDraw

OUT_DIR = Path(__file__).resolve().parent / "inbody270"
DPI = 300
# 150dpi 렌더 기준으로 눈으로 잡은 좌표 → 300dpi 로 두 배
SHEET_BOX_150 = (142, 268, 1110, 1640)
CIRCLES_150 = [(175, 690), (175, 895), (175, 1065), (175, 1409),
               (760, 733), (760, 838), (760, 910), (760, 976), (760, 1098), (760, 1379), (760, 1501)]
CIRCLE_R_150 = 12
TARGET_W = 1654


def main(pdf_path: str) -> None:
    page = pdfium.PdfDocument(pdf_path)[0]
    img = page.render(scale=DPI / 72).to_pil().convert("RGB")
    k = DPI / 150

    draw = ImageDraw.Draw(img)
    r = int(CIRCLE_R_150 * k)
    for cx150, cy150 in CIRCLES_150:
        cx, cy = int(cx150 * k), int(cy150 * k)
        # 동그라미 바로 왼쪽의 배경색으로 덮는다
        bg = img.getpixel((cx - r - 6, cy))
        draw.rectangle([cx - r, cy - r, cx + r, cy + r], fill=bg)

    x0, y0, x1, y1 = (int(v * k) for v in SHEET_BOX_150)
    sheet = img.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2))
    scale = TARGET_W / sheet.width
    sheet = sheet.resize((TARGET_W, round(sheet.height * scale)))

    OUT_DIR.mkdir(exist_ok=True)
    out = OUT_DIR / "inbody270_sample.png"
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main(sys.argv[1])
