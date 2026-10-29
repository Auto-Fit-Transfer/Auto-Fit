import asyncio
from datetime import datetime
from uuid import uuid4

import httpx
import pytest

from backend.app import chat_records as records
from backend.app.chat_answers import answer_question

NOW = datetime.fromisoformat("2026-09-08T01:00:00+09:00")
PERIOD = records.record_period("오늘", NOW)
MID = str(uuid4())


@pytest.mark.parametrize("question,start,end", [
    ("오늘", "2026-09-08", "2026-09-08T01:00"),
    ("어제", "2026-09-07", "2026-09-08T00:00"),
    ("이번 주", "2026-09-07", "2026-09-08T01:00"),
    ("지난주", "2026-08-31", "2026-09-07T00:00"),
    ("최근 7일", "2026-09-02", "2026-09-08T01:00"),
])
def test_korean_time_bounds(question, start, end):
    a, b, _ = records.record_period(question, NOW)
    assert a.isoformat().startswith(start)
    assert b.isoformat().startswith(end)
    assert a.utcoffset().total_seconds() == 32400


@pytest.mark.parametrize("question", ["운동", "오늘과 어제", "지난달", "오늘 아침", "이번주 평균", "최근 30일"])
def test_unsupported_period(question):
    assert records.record_period(question, NOW) is None


def mock_remote(monkeypatch, meal_rows, foods=None, exercise_rows=None):
    original = httpx.AsyncClient
    def handler(request):
        table = request.url.path.rsplit("/", 1)[-1]
        p = request.url.params
        assert p["limit"] == "101"
        if table == "meal_log_items":
            assert MID in p["meal_log_id"]
            return httpx.Response(200, json=foods or [])
        assert p["user_id"] == "eq.owner"
        time_key = "started_at" if table == "exercise_sessions" else "eaten_at"
        assert p[time_key] == f"gte.{PERIOD[0].isoformat()}"
        assert p["and"] == f"({time_key}.lt.{PERIOD[1].isoformat()})"
        if table == "exercise_sessions":
            assert p["completed_item_count"] == "gt.0"
            assert p["status"] == "in.(completed,stopped)"
            return httpx.Response(200, json=exercise_rows or [])
        assert p["status"] == "eq.recorded"
        return httpx.Response(200, json=meal_rows)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))


@pytest.mark.parametrize("calories,source", [(250,"database"),(0,"database"),(None,"need_more_data")])
def test_meal_nutrition(monkeypatch, calories, source):
    mock_remote(monkeypatch, [{"meal_log_id":MID,"eaten_at":NOW.isoformat()}], [{"meal_log_id":MID,"food_name":"밥","calories":calories}])
    answer = asyncio.run(records.answer_records("meal_history", PERIOD, "https://example.com", {}, "owner"))
    assert answer["response_source"] == source
    assert "밥" in answer["content"]
    if calories is None:
        assert len(answer["evidence"]) == 1
    else:
        assert answer["evidence"][1]["current_value"] == calories


@pytest.mark.parametrize("intent", ["meal_history", "exercise_history"])
def test_missing_records_are_not_zero_activity(monkeypatch, intent):
    mock_remote(monkeypatch, [])
    answer = asyncio.run(records.answer_records(intent, PERIOD, "https://example.com", {}, "owner"))
    assert answer["needs_more_data"]
    assert answer["evidence"] == []
    assert "의미는 아닙니다" in answer["content"]


def test_exercise_totals(monkeypatch):
    mock_remote(monkeypatch, [], exercise_rows=[{
        "exercise_session_id":str(uuid4()),"started_at":NOW.isoformat(),
        "total_duration_seconds":90,"total_calories_burned":12.5,"completed_item_count":1,
    }])
    answer = asyncio.run(records.answer_records("exercise_history", PERIOD, "https://example.com", {}, "owner"))
    assert [v["current_value"] for v in answer["evidence"]] == [1,1.5,12.5]


def test_truncation_is_not_reported_as_complete_total(monkeypatch):
    mock_remote(monkeypatch, [{"meal_log_id":str(uuid4()),"eaten_at":NOW.isoformat()}]*101)
    answer = asyncio.run(records.answer_records("meal_history", PERIOD, "https://example.com", {}, "owner"))
    assert answer["required_data"] == ["shorter_period"]


@pytest.mark.parametrize("question,intent", [("오늘 먹은 음식 알려줘","meal_history"),("이번 주 운동 몇 번 했어?","exercise_history")])
def test_routing(question, intent):
    async def forbidden():
        pytest.fail("must not query scores")
    async def load(actual_intent, period):
        assert actual_intent == intent and period
        return {"intent":actual_intent}
    assert asyncio.run(answer_question(question, forbidden, load))["intent"] == intent


@pytest.mark.parametrize("question", ["오늘 운동 추천해줘", "어제 식단 단백질 알려줘", "이번 주 운동 목표 알려줘"])
def test_not_a_supported_record_summary(question):
    async def forbidden(*args):
        pytest.fail("no queries for unsupported requests")
    result = asyncio.run(answer_question(question, forbidden, forbidden))
    assert result["intent"] == "clarification"
