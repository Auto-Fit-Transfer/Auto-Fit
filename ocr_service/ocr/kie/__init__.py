"""KIE 엔진 모음. 이름으로 골라 쓴다."""

from .base import KIEEngine


def get_engine(name: str) -> KIEEngine:
    """엔진 이름 -> 엔진 객체.

    새 서비스를 붙이면 여기에 한 줄만 추가하면 채점기까지 그대로 연결된다.
    """
    name = (name or "").lower()

    if name == "mock":
        from .mock import MockKIE

        return MockKIE()

    if name in ("http", "api"):
        from .http_engine import HttpKIE

        return HttpKIE()

    if name in ("upstage", "upstage_ie"):
        from .upstage_ie import UpstageIE

        return UpstageIE()

    raise ValueError(f"모르는 KIE 엔진입니다: {name!r} (쓸 수 있는 값: mock, http, upstage)")
