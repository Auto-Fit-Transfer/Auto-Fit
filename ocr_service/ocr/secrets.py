"""
API 키 읽기.

키는 코드에 적지 않는다. 아래 두 곳 중 하나에 둔다.
  1) OCR 서비스 루트의 .env 파일
       AUTOFIT_UPSTAGE_API_KEY=up_xxxxxxxx
       AUTOFIT_CLOVA_OCR_URL=https://xxxx.apigw.ntruss.com/custom/v1/.../general
       AUTOFIT_CLOVA_OCR_SECRET=xxxxxxxx
  2) 프로세스 환경변수 (같은 이름). 둘 다 있으면 환경변수가 이긴다.

⚠️ .env 파일은 팀원에게 폴더를 통째로 넘기거나 깃허브에 올릴 때 반드시 빼야 한다.
"""

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


@lru_cache(maxsize=1)
def _file_values() -> dict:
    values = {}
    if not ENV_FILE.exists():
        return values
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get_secret(name: str) -> Optional[str]:
    value = os.environ.get(name, "").strip() or _file_values().get(name, "").strip()
    return value or None
