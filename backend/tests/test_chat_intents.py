import pytest

from backend.app.chat_intents import classify_question


@pytest.mark.parametrize("question,intent", [
    ("내 건강 점수는 몇 점이야?", "health_score_latest"),
    ("지난 건강점수와 비교해 줘", "health_score_change"),
    ("최근 체중 얼마야?", "body_composition"),
    ("최근 혈압 수치 보여줘", "health_checkup"),
    ("오늘 먹은 음식 보여줘", "meal_history"),
    ("이번 주 운동 몇 번 했어?", "exercise_history"),
    ("내 알레르기 목록 보여줘", "allergies"),
    ("냉장고 재료 뭐 있어?", "food_inventory"),
])
def test_supported_questions(question, intent):
    plan = classify_question(question)
    assert plan.intent == intent
    assert plan.tables
    assert not plan.requires_clarification


@pytest.mark.parametrize("question", [
    "안녕", "그건 왜 그래?", "건강점수랑 체중 알려줘", "select * from profiles",
])
def test_ambiguous_questions_do_not_select_personal_tables(question):
    plan = classify_question(question)
    assert plan.requires_clarification
    assert plan.tables == ()


def test_cause_question_requires_more_than_numeric_comparison():
    plan = classify_question("최근 건강 점수가 낮아졌는데 이유가 뭘까요?")
    assert plan.intent == "health_score_change"
    assert plan.requires_explanation


@pytest.mark.parametrize("question", ["운동 추천해줘", "혈당이 무슨 뜻이야?"])
def test_explanation_is_not_a_plain_record_query(question):
    assert classify_question(question).requires_explanation


@pytest.mark.parametrize("question", ["", "   ", "가" * 501])
def test_invalid_question(question):
    with pytest.raises(ValueError):
        classify_question(question)
