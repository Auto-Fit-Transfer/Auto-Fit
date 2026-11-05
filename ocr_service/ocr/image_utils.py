"""
이미지 읽기 유틸.

윈도우에서 OpenCV(cv2.imread)는 경로에 한글이 있으면 파일을 열지 못한다.
사용자가 '건강검진표.jpg' 같은 한글 파일명으로 올릴 수 있으므로
아래 방식(파일을 바이트로 읽어 메모리에서 디코딩)으로 항상 우회한다.
"""

from pathlib import Path

import cv2
import numpy as np


def imread_any(path) -> np.ndarray:
    """경로에 한글·공백·특수문자가 있어도 이미지를 읽어 준다.

    돌려주는 값은 OpenCV 형식의 이미지 배열(BGR).
    파일이 없거나 이미지가 깨졌으면 예외를 낸다.
    """
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"이미지 파일이 없습니다: {p}")

    buf = np.fromfile(str(p), dtype=np.uint8)  # 한글 경로 OK
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"이미지를 해석할 수 없습니다(파일 손상 가능): {p}")
    return img


def imwrite_any(path, img) -> None:
    """한글 경로에도 저장되는 이미지 쓰기."""
    p = Path(path)
    ext = p.suffix or ".jpg"
    ok, buf = cv2.imencode(ext, img)
    if not ok:
        raise ValueError(f"이미지를 저장할 수 없습니다: {p}")
    p.parent.mkdir(parents=True, exist_ok=True)
    buf.tofile(str(p))
