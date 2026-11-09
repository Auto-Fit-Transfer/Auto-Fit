import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.app.chat_answers import answer_question
from backend.app import main
from backend.app.chat_service import match_service_query, service_answer
from backend.tests.test_chat_answers import preview


NOW = datetime(2026, 11, 2, 12, 0, tzinfo=ZoneInfo("Asia/Seoul"))


def test_service_queries_cover_app_domains_without_user_selected_paths():
    cases = {
        "내 러닝 기록 보여줘": "/api/running/sessions/history",
        "저장한 런닝 코스": "/api/running/saved-courses",
        "내 냉장고 재료": "/api/diet/inventory",
        "오늘 영양 요약": "/api/diet/nutrition-summary",
        "이번 주 식단": "/api/diet/weekly-recommendations",
        "운동 기록 알려줘": "/api/exercise/history",
        "운동 진행 상황": "/api/exercise/progress",
        "내 혈압 기록": "/api/health-report",
        "건강 점수와 체중 알려줘": "/api/home",
        "업로드한 건강 문서": "/api/health-documents",
        "건강 분석 결과": "/api/health-assessments/latest",
        "내 알레르기": "/api/allergies",
        "마일리지 내역": "/api/community/mileage/history",
        "내 티어": "/api/tier/progress",
        "화면 설정": "/api/app/preferences",
    }
    for question, path in cases.items():
        query = match_service_query(question, NOW)
        assert query is not None and query.path == path, question
    assert match_service_query("러닝 기록 삭제해줘", NOW) is None
    today_diet = match_service_query("오늘 식단 보여줘", NOW)
    assert today_diet.path == "/api/diet/recommendations"
    assert dict(today_diet.params) == {"date": "2026-11-02"}


def test_health_report_answers_the_metric_asked_for():
    query = match_service_query("최근 혈압은 어때?", NOW)
    payload = {"body_compositions": [{"weight_kg": 65}],
               "health_checkups": [{"checkup_date": "2026-10-01", "systolic_bp": 120,
                                     "diastolic_bp": 80}]}
    answer = service_answer(query, payload)
    assert "120/80 mmHg" in answer["content"]
    assert not answer["needs_more_data"]


def test_health_score_and_weight_are_combined_from_two_owned_reads():
    query = match_service_query("건강 점수와 체중 알려줘", NOW)
    assert query.secondary_path == "/api/health-report"
    answer = service_answer(query, {"home": {"health_score": {"score": 86}},
                                    "report": {"body_compositions": [{"weight_kg": 65.2}]}})
    assert "86점" in answer["content"]
    assert "65.2" in answer["content"]


def test_chat_reads_service_and_adds_safe_navigation():
    calls = []

    async def forbidden(*args):
        raise AssertionError("unrelated database lookup")

    async def read(query):
        calls.append(query.path)
        return {"sessions": [{"started_at": "2026-11-01T08:00:00+09:00",
                              "distance_meters": 5000, "elapsed_seconds": 1800}]}

    answer = asyncio.run(answer_question(
        "내 러닝 기록 보여줘", forbidden, forbidden, read_service=read,
    ))
    assert calls == ["/api/running/sessions/history"]
    assert answer["intent"] == "running_history"
    assert "거리(m): 5000" in answer["content"]
    assert answer["evidence"] == [{"type": "navigation", "route": "/exercise/running", "label": "최근 러닝 기록 화면 열기"}]


def test_general_exercise_advice_does_not_read_personal_records():
    question = "기능 시험입니다. 운동 후 휴식할 때 참고할 일반적인 생활 습관을 한 문장으로 알려 주세요."

    async def forbidden(*_args):
        raise AssertionError("general advice must not read personal records")

    answer = asyncio.run(answer_question(
        question, forbidden, forbidden, read_service=forbidden,
    ))
    assert answer["intent"] == "clarification"
    assert answer["response_source"] == "need_more_data"
    assert answer["evidence"] == []
    assert "기록" in answer["content"]


def test_exercise_summary_still_requires_explicit_summary_request():
    assert match_service_query("운동 알려줘", NOW) is None
    assert match_service_query("운동 요약 알려줘", NOW).path == "/api/exercise/summary"


def test_general_advice_with_record_word_still_avoids_personal_lookup():
    async def forbidden(*_args):
        raise AssertionError("general advice must not read personal records")

    answer = asyncio.run(answer_question(
        "운동 기록을 꾸준히 남기려면 어떤 일반적인 생활습관이 좋아?",
        forbidden, forbidden, read_service=forbidden,
    ))
    assert answer["intent"] == "clarification"
    assert answer["evidence"] == []
    assert "일반 운동·휴식 생활 습관" in answer["content"]


def test_empty_result_keeps_navigation_and_does_not_invent_data():
    query = match_service_query("저장한 러닝 코스", NOW)
    answer = service_answer(query, {"courses": []})
    assert answer["needs_more_data"]
    assert "저장된 항목이 없습니다" in answer["content"]
    assert answer["evidence"][0]["route"] == "/exercise/running"


def test_nested_service_results_are_rendered_as_useful_answers():
    examples = [
        ("오늘 식단 보여줘", {"result": {"recommendation": {},
          "meals": [{"meal_type": "lunch", "foods": [{"food_name": "현미밥"}]}]}}, "현미밥"),
        ("최근 운동 추천 보여줘", {"result": {"recommendation": {
          "recommendation_summary": "오늘은 가볍게 운동하세요"},
          "items": [{"exercise_name": "스쿼트"}]}}, "스쿼트"),
        ("이번 주 식단", {"ok": True, "result": {"summary": "균형 잡힌 식단",
          "weekly_plan": [{"date": "2026-11-02", "meals": {"lunch": {"menu_name": "생선구이"}}}]}}, "생선구이"),
        ("운동 진행 상황", {"progress": {"summary": {"workout_count": 3,
          "duration_minutes": 90, "goal_achievement_rate": 60}}}, "목표 달성률: 60%"),
        ("건강 분석 결과", {"headline": {"title": "활동을 늘려보세요"},
          "summary": {"description": "현재 기록을 기반으로 분석했습니다."}}, "활동을 늘려보세요"),
    ]
    for question, payload, expected in examples:
        answer = service_answer(match_service_query(question, NOW), payload)
        assert expected in answer["content"], question
        assert not answer["needs_more_data"], question


def test_preview_reuses_authenticated_profile_endpoint(preview, monkeypatch):
    client, score_calls, _ = preview

    async def profile(user_id, settings):
        assert user_id == "owner"
        return {"name": "민지", "nickname": "민지"}

    async def preferences(user_id, settings):
        return None

    monkeypatch.setattr(main, "fetch_profile", profile)
    monkeypatch.setattr(main, "fetch_exercise_preferences", preferences)
    response = client.post("/api/chats/answer-preview", json={"content": "내 프로필 보여줘"})
    assert response.status_code == 200
    assert "민지" in response.json()["answer"]["content"]
    assert score_calls == []
