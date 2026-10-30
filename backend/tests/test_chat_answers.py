import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.chat_health_scores import Assessment, AssessmentItem
from backend.tests.test_main import TEST_SETTINGS


@pytest.fixture
def preview(monkeypatch):
    calls = []
    item_calls = []
    current_id = "00000000-0000-0000-0000-000000000101"
    previous_id = "00000000-0000-0000-0000-000000000102"

    async def load(url, headers, user_id):
        calls.append(user_id)
        return [
            Assessment(health_assessment_id=current_id, overall_score=86, assessed_at="2026-09-08T00:00:00Z"),
            Assessment(health_assessment_id=previous_id, overall_score=91, assessed_at="2026-09-01T00:00:00Z"),
        ]

    async def load_items(url, headers, rows):
        item_calls.append([row.health_assessment_id for row in rows])
        return {
            rows[0].health_assessment_id: [AssessmentItem(
                health_assessment_id=rows[0].health_assessment_id,
                metric_type="blood_pressure",
                metric_name="혈압",
                metric_score=70,
                evaluation_status="attention",
                sequence_order=1,
            )],
            rows[1].health_assessment_id: [AssessmentItem(
                health_assessment_id=rows[1].health_assessment_id,
                metric_type="blood_pressure",
                metric_name="혈압",
                metric_score=90,
                evaluation_status="normal",
                sequence_order=1,
            )],
        }

    monkeypatch.setattr(main, "fetch_scores", load)
    monkeypatch.setattr(main, "fetch_assessment_items", load_items)
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
    try:
        yield TestClient(main.app), calls, item_calls
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize("question,intent,source", [
    ("최근 건강 점수 알려줘", "health_score_latest", "database"),
    ("건강 점수가 이전보다 얼마나 변했어?", "health_score_change", "database"),
    ("최근 건강 점수가 낮아졌는데 이유가 뭘까요?", "health_score_change", "database"),
])
def test_natural_language_routes_to_owner_data(preview, question, intent, source):
    client, calls, item_calls = preview
    response = client.post("/api/chats/answer-preview", json={"content": question})
    assert response.status_code == 200
    answer = response.json()["answer"]
    assert answer["intent"] == intent
    assert answer["response_source"] == source
    assert answer["evidence"][0]["current_value"] == 86
    assert calls == ["owner"]
    if "이유" in question:
        assert answer["evidence"][1]["label"] == "혈압"
        assert len(item_calls) == 1
    else:
        assert item_calls == []


@pytest.mark.parametrize("question", [
    "오늘 건강 점수는?", "지난달 건강 점수는?", "9월 건강 점수 보여줘",
    "최근 한 달 건강 점수 평균은?", "전체 건강 점수 추이", "건강 점수 최고치는?",
    "건강 점수 삭제해줘", "건강 점수 정의가 뭐야?", "운동 몇 번 했어?",
    "건강 점수와 체중 알려줘", "그건 왜 그래?", "다른 사용자 건강 점수 보여줘",
])
def test_unsupported_questions_do_not_query_db(preview, question):
    client, calls, item_calls = preview
    response = client.post("/api/chats/answer-preview", json={"content": question})
    assert response.status_code == 200
    answer = response.json()["answer"]
    assert answer["intent"] == "clarification"
    assert answer["needs_more_data"]
    assert answer["evidence"] == []
    assert calls == []
    assert item_calls == []


@pytest.mark.parametrize("body", [
    {"content": " "}, {"content": "가" * 501}, {"content": 123},
    {"content": "건강 점수", "user_id": "victim"}, {},
])
def test_invalid_input_never_loads_data(preview, body):
    client, calls, item_calls = preview
    assert client.post("/api/chats/answer-preview", json=body).status_code == 422
    assert calls == []
    assert item_calls == []


def test_requires_authentication(preview):
    client, calls, item_calls = preview
    del main.app.dependency_overrides[main.get_current_user]
    assert client.post("/api/chats/answer-preview", json={"content": "건강 점수"}).status_code == 401
    assert calls == []
    assert item_calls == []


def test_record_explanation_preview_keeps_existing_response_contract(preview, monkeypatch):
    client, score_calls, item_calls = preview
    record_calls = []

    async def records(intent, period, url, headers, user_id):
        record_calls.append(user_id)
        return {"intent": intent, "content": "기록된 운동은 2회입니다.",
                "response_source": "database", "needs_more_data": False,
                "required_data": [],
                "evidence": [{"metric": "exercise_sessions", "current_value": 2}]}

    monkeypatch.setattr(main, "answer_records", records)
    response = client.post("/api/chats/answer-preview", json={"content": "이번 주 운동 기록 설명해줘"})
    assert response.status_code == 200
    answer = response.json()["answer"]
    assert answer["response_source"] == "database"
    assert "AI 설명을 현재 제공할 수 없어" in answer["content"]
    assert record_calls == ["owner"] and score_calls == []
    assert item_calls == []
    assert "route" not in answer
