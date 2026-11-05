"""
OCR 엔진 공통 규격.

어떤 OCR 프로그램을 쓰든(EasyOCR / 네이버 CLOVA / Google Vision …)
이 파일의 형식으로 결과를 돌려주게 만든다.
그래야 나중에 엔진을 바꿔도 파서 코드를 고칠 필요가 없다.
"""

from dataclasses import dataclass
import math
from typing import List, Optional


@dataclass
class TextBox:
    """OCR이 찾아낸 글자 덩어리 하나."""

    text: str          # 읽어낸 글자
    conf: float        # 신뢰도 0.0 ~ 1.0
    x1: int            # 글자 상자의 왼쪽 x 좌표
    y1: int            # 위쪽 y 좌표
    x2: int            # 오른쪽 x 좌표
    y2: int            # 아래쪽 y 좌표

    @property
    def cx(self) -> float:
        """상자 가로 중심. '이 항목명 오른쪽에 있는 숫자'를 찾을 때 쓴다."""
        return (self.x1 + self.x2) / 2

    @property
    def cy(self) -> float:
        """상자 세로 중심. '같은 줄에 있는가'를 판단할 때 쓴다."""
        return (self.y1 + self.y2) / 2

    @property
    def h(self) -> int:
        """상자 높이. 줄 간격 기준으로 쓴다."""
        return self.y2 - self.y1

    def __repr__(self) -> str:
        return f"TextBox({self.text!r}, conf={self.conf:.2f}, at=({self.x1},{self.y1}))"


class OCREngine:
    """모든 OCR 엔진이 따라야 하는 형태."""

    name = "base"

    def read(self, image_path: str) -> List[TextBox]:
        """이미지 파일 경로를 받아 TextBox 목록을 돌려준다."""
        raise NotImplementedError

    def is_available(self) -> tuple[bool, str]:
        """이 엔진을 지금 쓸 수 있는지. (가능여부, 이유) 를 돌려준다."""
        return True, "ok"


def _group_by_y(boxes: List[TextBox], keys: dict, tol_ratio: float) -> List[List[TextBox]]:
    """주어진 세로 좌표(keys)를 기준으로 상자를 줄로 묶는다."""
    remaining = sorted(boxes, key=lambda b: keys[id(b)])
    lines: List[List[TextBox]] = []
    current = [remaining[0]]

    for box in remaining[1:]:
        ref_h = max(current[0].h, box.h, 1)
        if abs(keys[id(box)] - keys[id(current[0])]) <= ref_h * tol_ratio:
            current.append(box)
        else:
            lines.append(sorted(current, key=lambda b: b.x1))
            current = [box]

    lines.append(sorted(current, key=lambda b: b.x1))
    return lines


def estimate_skew(boxes: List[TextBox], limit_deg: float = 7.0, step_deg: float = 0.5) -> float:
    """사진이 몇 도 기울어졌는지 추정한다(도 단위).

    사진을 실제로 회전시키지 않고, '어느 각도로 보면 글자들이 줄로 가장 잘 뭉치는가'
    를 찾는다. 기울어진 사진에서는 이 보정이 없으면 한 줄이 여러 줄로 쪼개진다.
    5도만 기울어도 가로 1,240픽셀 문서에서 세로로 108픽셀이 밀리는데,
    이는 글자 높이(약 25픽셀)의 네 배가 넘는다.
    """
    if len(boxes) < 12:
        return 0.0

    heights = sorted(b.h for b in boxes)
    bin_h = max(heights[len(heights) // 2] * 0.5, 2.0)

    def sharpness(angle: float) -> float:
        """이 각도에서 글자들이 얼마나 또렷한 가로줄을 이루는지.

        세로 좌표를 잘게 나눈 칸에 상자를 담고, 각 칸에 담긴 개수의 제곱을 더한다.
        같은 줄 글자들이 한 칸에 모일수록 값이 커진다.
        칸 크기를 글자 높이의 절반으로 고정했기 때문에
        서로 다른 줄이 억지로 합쳐지는 일은 생기지 않는다.
        """
        rad = math.radians(angle)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        total = 0.0
        for offset in (0.0, bin_h / 2):  # 칸 경계에 걸치는 경우를 완화
            counts: dict = {}
            for b in boxes:
                key = int((b.cy * cos_a - b.cx * sin_a + offset) // bin_h)
                counts[key] = counts.get(key, 0) + 1
            total += sum(c * c for c in counts.values())
        return total

    best_angle, best_score = 0.0, sharpness(0.0)
    steps = int(limit_deg / step_deg)

    for i in range(-steps, steps + 1):
        angle = i * step_deg
        if angle == 0.0:
            continue
        score = sharpness(angle)
        # 확실히 기울어진 경우에만 보정한다.
        # 실측: 똑바른 사진은 어느 각도로 돌려도 4~5% 개선에 그치지만,
        #       실제로 기울어진 사진은 65%까지 좋아진다. 그 사이에 선을 긋는다.
        # 기준이 낮으면 멀쩡한 사진까지 0.5도씩 틀어 오히려 값을 놓친다.
        if score > best_score * 1.20:
            best_angle, best_score = angle, score

    return best_angle


def boxes_to_lines(
    boxes: List[TextBox],
    tol_ratio: float = 0.6,
    skew_deg: Optional[float] = None,
) -> List[List[TextBox]]:
    """
    글자 상자들을 '같은 줄'끼리 묶어 준다.

    OCR은 글자 덩어리를 순서 없이 돌려주기 때문에,
    표에서 '항목명 → 그 오른쪽 숫자'를 찾으려면 먼저 줄로 묶어야 한다.
    사진이 기울어진 경우를 대비해 기울기를 먼저 추정하고 그 각도로 보정해 묶는다.
    skew_deg 를 직접 주면 추정을 건너뛴다(0.0 을 주면 보정 없음).
    """
    if not boxes:
        return []

    angle = estimate_skew(boxes) if skew_deg is None else skew_deg
    rad = math.radians(angle)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    keys = {id(b): b.cy * cos_a - b.cx * sin_a for b in boxes}
    return _group_by_y(boxes, keys, tol_ratio)
