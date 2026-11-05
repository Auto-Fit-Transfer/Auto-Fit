"""Structured home data; changes compare the latest two assessments, not weeks."""
from datetime import datetime

from pydantic import BaseModel

from backend.app.chat_health_scores import Assessment


class HomeHealthScore(BaseModel):
    score: float | None
    total_score: int = 100
    assessed_at: datetime | None


class HomeScoreChange(BaseModel):
    change: float | None
    previous_score: float | None
    previous_assessed_at: datetime | None
    comparison: str = "previous_assessment"
    message: str


class HomeResponse(BaseModel):
    user_name: str
    health_score: HomeHealthScore
    score_change: HomeScoreChange


def build_home_response(profile: dict, rows: list[Assessment]) -> HomeResponse:
    current = rows[0] if rows else None
    previous = rows[1] if len(rows) > 1 else None
    change = current.overall_score - previous.overall_score if previous else None
    message = "비교할 이전 평가가 없습니다."
    if current is None:
        message = "저장된 건강 평가가 없습니다."
    elif change is not None:
        message = (
            "이전 평가와 건강 점수가 같습니다."
            if change == 0 else
            f"이전 평가보다 건강 점수가 {abs(change):g}점 {'높아졌습니다' if change > 0 else '낮아졌습니다'}."
        )
    return HomeResponse(
        user_name=(profile.get("name") or "").strip() or "회원",
        health_score=HomeHealthScore(
            score=float(current.overall_score) if current else None,
            assessed_at=current.assessed_at if current else None,
        ),
        score_change=HomeScoreChange(
            change=float(change) if change is not None else None,
            previous_score=float(previous.overall_score) if previous else None,
            previous_assessed_at=previous.assessed_at if previous else None,
            message=message,
        ),
    )
