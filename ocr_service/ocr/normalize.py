"""
OCR이 읽은 글자를 '쓸 수 있는 값'으로 바꾸는 규칙들.

실제 테스트에서 나온 문제를 그대로 반영했다:
  46.0  → '46,0'    (소수점을 쉼표로 읽음)
  4.52  → '4,52'
  14.5  → '14,.5'   (구분자가 두 개 붙음)
  1727  → '1,727'   (이건 진짜 천 단위 쉼표 -> 지워야 함)
  -4.7  → '4.7'     (마이너스 부호 소실)
"""

import re
from typing import Optional

# 숫자처럼 보이는 덩어리. 앞에 부호가 붙을 수 있다.
_NUM_RE = re.compile(r"[+\-−–]?\s?\d[\d.,\s]*")

# 표준범위·참고치 표기는 값이 아니다.
#   체성분: '(38.5-47.1)', '(10.3~12.6)'
#   검진표: '150 미만', '40 이하', '60 이상'
_RANGE_HINT = ("~", "(", ")", "〜", "∼", "미만", "이하", "이상", "초과")

# 숫자 칸에서 자주 나오는 글자 오인식
_CHAR_FIX = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "|": "1"})

# 날짜: 2026.03.16 / 26.01.15 / 2026-03-16 / 2026/03/16 / 2026년 03월 16일 (공단 결과통보서 검진일)
_DATE_RE = re.compile(r"(\d{2,4})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})")


def looks_like_range(text: str) -> bool:
    """표준범위 표기인지. 값으로 쓰면 안 되는 토큰을 걸러낸다."""
    return any(h in text for h in _RANGE_HINT)


def to_number(
    text: str,
    max_value: Optional[float] = None,
    as_int: bool = False,
) -> Optional[float]:
    """글자에서 숫자 하나를 뽑아낸다. 못 뽑으면 None.

    max_value 는 쉼표가 '천 단위 구분'인지 '소수점'인지 판단하는 데 쓴다.
    예) 기초대사량은 최대 3500 이므로 '1,727' 의 쉼표는 천 단위.
        무기질은 최대 10 이므로 '4,52' 의 쉼표는 소수점.
    """
    if not text or looks_like_range(text):
        return None

    # 진짜 숫자가 하나도 없으면 값이 아니다.
    # 이 검사가 없으면 'Minerals' 가 글자보정(l→1)을 거쳐 숫자 1 로 둔갑한다.
    if not any(c.isdigit() for c in text):
        return None

    s = text.translate(_CHAR_FIX)

    m = _NUM_RE.search(s)
    if not m:
        return None

    token = m.group(0).replace(" ", "")

    sign = -1.0 if token[0] in "-−–" else 1.0
    token = token.lstrip("+-−–")

    # '14,.5' 처럼 구분자가 겹친 경우 하나로 정리
    token = re.sub(r"[.,]{2,}", ".", token)
    token = token.strip(".,")
    if not token:
        return None

    if "," in token and "." in token:
        # 둘 다 있으면 쉼표는 천 단위
        token = token.replace(",", "")
    elif "," in token:
        head, _, tail = token.rpartition(",")
        is_thousands = (
            len(tail) == 3
            and head.isdigit()
            and (max_value is None or max_value > 999)
        )
        token = token.replace(",", "" if is_thousands else ".")

    # 소수점이 여러 개면 마지막 것만 소수점으로 본다 (1.727.5 같은 오인식 대비)
    if token.count(".") > 1:
        head, _, tail = token.rpartition(".")
        token = head.replace(".", "") + "." + tail

    try:
        value = sign * float(token)
    except ValueError:
        return None

    return round(value) if as_int else value


def to_date(text: str) -> Optional[str]:
    """글자에서 날짜를 뽑아 'YYYY-MM-DD' 로 돌려준다."""
    m = _DATE_RE.search(text)
    if not m:
        return None

    y, mo, d = m.groups()
    year = int(y)
    if year < 100:  # '26.01.15' 형태
        year += 2000

    def fix(part: str) -> Optional[int]:
        """월·일을 숫자로. 범위를 벗어나면 1을 7로 잘못 읽은 경우를 의심해 본다.

        이 문서들의 글꼴에서는 1이 7처럼 읽히는 일이 잦다('14일' -> '74').
        고친 값이 달력상 말이 될 때만 받아들인다.
        """
        for candidate in (part, part.replace("7", "1")):
            try:
                n = int(candidate)
            except ValueError:
                continue
            if 1 <= n <= 31:
                return n
        return None

    mo_i, d_i = fix(mo), fix(d)
    if mo_i is None or d_i is None or mo_i > 12:
        return None
    return f"{year:04d}-{mo_i:02d}-{d_i:02d}"


def strip_unit(text: str) -> str:
    """항목명 뒤의 단위 표기를 떼어낸다. '혈청크레아티닌 (mg/dL)' -> '혈청크레아티닌'"""
    return text.split("(")[0]


def clean_label(text: str) -> str:
    """항목명 비교용으로 글자를 다듬는다(공백·기호 제거)."""
    return re.sub(r"[\s:：.·,()]", "", text)
