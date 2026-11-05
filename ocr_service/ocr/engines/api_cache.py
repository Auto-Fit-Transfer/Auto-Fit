"""
유료 API 응답 저장소.

같은 이미지를 두 번 보내면 돈이 두 번 나간다.
한 번 받은 응답은 파일로 저장해 두고, 파서만 고쳐서 다시 채점할 때는
저장본을 읽는다. (API 를 다시 부르지 않는다)

저장 위치: ocr_service/cache/<엔진이름>/<이미지 지문>.json
이미지 지문은 파일 내용으로 만든다. 같은 이름이라도 내용이 바뀌면 새로 호출한다.
"""

import hashlib
import json
import time
from pathlib import Path
from typing import Callable, Optional

CACHE_DIR = Path(__file__).resolve().parents[2] / "cache"

# 가장 최근 호출에 실제 API 가 걸린 시간(초). 저장본을 읽을 때도 처음 호출했을 때의 시간을 돌려준다.
# 채점기가 '장당 처리 시간'을 잴 때 저장본 읽기 시간(0.01초)이 섞이지 않게 하기 위함.
last_api_seconds: Optional[float] = None
last_was_cached = False


def _fingerprint(file_path: str) -> str:
    return hashlib.sha256(Path(file_path).read_bytes()).hexdigest()[:20]


def cached_call(engine: str, file_path: str, call: Callable[[], dict], extra: str = "") -> dict:
    """저장본이 있으면 그것을, 없으면 call() 로 받아 저장한 뒤 돌려준다.

    extra: 같은 이미지라도 요청 내용(예: 추출 명세)이 다르면 따로 저장하기 위한 구분값.
    """
    key = _fingerprint(file_path)
    if extra:
        key += "_" + hashlib.sha256(extra.encode("utf-8")).hexdigest()[:8]
    path = CACHE_DIR / engine / f"{key}.json"

    global last_api_seconds, last_was_cached

    if path.exists():
        saved = json.loads(path.read_text(encoding="utf-8"))
        last_api_seconds = saved.get("api_seconds")
        last_was_cached = True
        return saved["payload"]

    last_was_cached = False

    t0 = time.time()
    payload = call()
    last_api_seconds = round(time.time() - t0, 2)

    path.parent.mkdir(parents=True, exist_ok=True)
    saved = {"api_seconds": last_api_seconds, "file": Path(file_path).name, "payload": payload}
    path.write_text(json.dumps(saved, ensure_ascii=False), encoding="utf-8")
    return payload
