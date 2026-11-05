"""
EasyOCR 엔진 (오픈소스 · 무료 · 한국어 지원).

처음 실행할 때 한국어 인식 모델을 인터넷에서 자동으로 내려받는다(수십 MB).
그 뒤로는 내려받은 모델을 재사용하므로 인터넷 없이도 동작한다.
"""

from typing import List, Optional

from ..image_utils import imread_any
from .base import OCREngine, TextBox


class EasyOCREngine(OCREngine):
    name = "easyocr"

    def __init__(self, languages: Optional[List[str]] = None, gpu: bool = False):
        # 한국어 + 영어. 검진표에는 AST, HDL 같은 영문 항목명이 섞여 있다.
        self.languages = languages or ["ko", "en"]
        self.gpu = gpu
        self._reader = None  # 무거우므로 실제 쓸 때 한 번만 만든다

    def is_available(self) -> tuple[bool, str]:
        try:
            import easyocr  # noqa: F401
        except ImportError:
            return False, "easyocr 가 설치되지 않았습니다. pip install easyocr"
        return True, "ok"

    def _get_reader(self):
        if self._reader is None:
            import easyocr

            # 모델 로딩은 몇 초 걸린다. 한 번만 만들고 계속 재사용한다.
            self._reader = easyocr.Reader(self.languages, gpu=self.gpu, verbose=False)
        return self._reader

    def read(self, image_path: str) -> List[TextBox]:
        reader = self._get_reader()

        # 경로를 그대로 넘기면 한글 폴더명에서 실패한다. 직접 읽어서 배열로 넘긴다.
        img = imread_any(image_path)

        # detail=1 → 좌표와 신뢰도까지 함께 받는다. 좌표가 없으면 표 파싱을 못 한다.
        raw = reader.readtext(img, detail=1, paragraph=False)

        boxes: List[TextBox] = []
        for points, text, conf in raw:
            xs = [int(p[0]) for p in points]
            ys = [int(p[1]) for p in points]
            text = text.strip()
            if not text:
                continue
            boxes.append(
                TextBox(
                    text=text,
                    conf=float(conf),
                    x1=min(xs),
                    y1=min(ys),
                    x2=max(xs),
                    y2=max(ys),
                )
            )
        return boxes
