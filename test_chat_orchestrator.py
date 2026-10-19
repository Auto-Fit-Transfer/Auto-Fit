import asyncio

import app.services.chat_orchestrator_service as orchestrator
from app.schemas.chat import (
    ChatContext,
    ChatHistoryItem,
    ChatRequest,
)
from app.schemas.recommendation import ReplaceMealResponse
from app.services.chat_intent_service import (
    _extract_day,
    classify_chat_intent,
)


def _diet_summary() -> dict:
    return {
        "weekly_plan": [
            {
                "day": "monday",
                "meals": {
                    "breakfast": {
                        "menu_name": "월요일 아침",
                        "items": [
                            {
                                "food_name": "현미밥",
                                "portion_g": 100.0,
                            }
                        ],
                    },
                    "lunch": {
                        "menu_name": "현재 점심",
                        "ingredients": None,
                        "items": [
                            {
                                "food_name": "닭가슴살구이",
                                "portion_g": 120.0,
                            },
                            {
                                "food_name": "혼합잡곡밥",
                                "portion_g": 100.0,
                            },
                        ],
                    },
                },
            },
            {
                "day": "tuesday",
                "meals": {
                    "dinner": {
                        "menu_name": "화요일 저녁",
                        "items": [
                            {
                                "food_name": "연어구이",
                                "portion_g": 140.0,
                            }
                        ],
                    }
                },
            },
        ]
    }


def _replacement_response() -> ReplaceMealResponse:
    return ReplaceMealResponse.model_validate(
        {
            "day": "monday",
            "meal_type": "lunch",
            "meal": {
                "menu_name": "검증된 대체 점심",
                "menu_description": "공식 후보로 구성한 식사입니다.",
                "estimated_calories_kcal": 490,
                "nutrition": {
                    "carbohydrate_g": 55,
                    "protein_g": 30,
                    "fat_g": 14,
                },
                "items": [
                    {
                        "food_name": "고등어구이",
                        "portion_g": 120.0,
                        "calories_kcal": 250.0,
                        "protein_g": 25.0,
                        "fat_g": 12.0,
                        "carbohydrate_g": 0.0,
                    },
                    {
                        "food_name": "현미밥",
                        "portion_g": 100.0,
                        "calories_kcal": 240.0,
                        "protein_g": 5.0,
                        "fat_g": 2.0,
                        "carbohydrate_g": 55.0,
                    },
                ],
                "guidance": "목표 섭취량에 맞춰 드세요.",
            },
            "cautions": [],
            "sources": [],
        }
    )


async def _run_intent_tests() -> None:
    assert _extract_day("일반 건강식이 궁금해") is None
    assert _extract_day("월 점심을 알려줘") == "monday"
    assert _extract_day("이번 주 일요일 저녁") == "sunday"

    result = await classify_chat_intent(
        message="다른 걸로 바꿔줘",
        history=[
            ChatHistoryItem(
                role="user",
                content="화요일 저녁 메뉴를 보여줘",
            )
        ],
    )
    assert result.intent == "diet_replace_request"
    assert result.target_day == "tuesday"
    assert result.target_meal == "dinner"

    replace_cases = [
        "월요일 점심을 바꿔줘",
        "화요일 저녁을 다른 메뉴로 추천해줘",
        "금요일 아침 메뉴를 교체해",
        "토요일 간식을 다시 추천해줘",
    ]
    for message in replace_cases:
        result = await classify_chat_intent(message=message)
        assert result.intent == "diet_replace_request", message

    question_cases = [
        "다른 음식은 뭐가 있어?",
        "월요일 점심을 바꿔도 괜찮을까?",
        "월요일 점심을 왜 바꿔야 해?",
        "식단을 어떻게 바꿔?",
        "식단 변경 방법을 알려줘",
        "점심 메뉴는 바꾸지 마",
    ]
    for message in question_cases:
        result = await classify_chat_intent(message=message)
        assert result.intent == "diet_question", message

    exercise_replace_result = await classify_chat_intent(
        message="월요일 운동을 다른 것으로 바꿔줘"
    )
    assert exercise_replace_result.intent == "exercise_replace_request"
    assert exercise_replace_result.target_day is None
    assert exercise_replace_result.target_meal is None

    exercise_after_diet_history = await classify_chat_intent(
        message="운동 계획을 바꿔줘",
        history=[
            ChatHistoryItem(
                role="user",
                content="화요일 저녁 메뉴를 보여줘",
            )
        ],
    )
    assert (
        exercise_after_diet_history.intent
        == "exercise_replace_request"
    )

    exercise_question = await classify_chat_intent(
        message="운동을 바꿔도 괜찮을까?"
    )
    assert exercise_question.intent == "exercise_question"

    unavailable = await orchestrator.process_chat(
        ChatRequest(content="운동 계획을 다른 것으로 바꿔줘")
    )
    assert unavailable.intent == "exercise_replace_request"
    assert unavailable.action == "exercise_replace_unavailable"
    assert unavailable.action_status == "unable_to_apply"
    assert unavailable.requires_backend_apply is False
    assert unavailable.data is None


async def _run_missing_context_tests() -> None:
    missing_day = await orchestrator.process_chat(
        ChatRequest(content="점심을 다른 메뉴로 바꿔줘")
    )
    assert missing_day.action == "need_target_day"
    assert missing_day.action_status == "needs_input"
    assert missing_day.requires_backend_apply is False

    missing_meal = await orchestrator.process_chat(
        ChatRequest(content="월요일 메뉴를 바꿔줘")
    )
    assert missing_meal.action == "need_target_meal"
    assert missing_meal.action_status == "needs_input"

    missing_context = await orchestrator.process_chat(
        ChatRequest(
            content="월요일 점심을 바꿔줘",
            context=ChatContext(
                metric_statuses={"blood_pressure": "high"}
            ),
        )
    )
    assert missing_context.action == "need_diet_context"
    assert missing_context.action_status == "needs_input"


async def _run_replacement_action_test() -> None:
    captured = {}

    async def fake_generate_replacement(request):
        captured["request"] = request
        return _replacement_response()

    original_generate = orchestrator.generate_replacement_meal
    orchestrator.generate_replacement_meal = fake_generate_replacement

    try:
        proposal = await orchestrator.process_chat(
            ChatRequest(
                content="월요일 점심을 다른 메뉴로 바꿔줘",
                context=ChatContext(
                    metric_statuses={"blood_pressure": "high"},
                    food_allergens=["계란"],
                    disliked_foods=["버섯"],
                    diet_summary=_diet_summary(),
                ),
            )
        )

        assert "request" not in captured
        assert proposal.action == "confirm_diet_replace"
        assert proposal.action_status == "awaiting_confirmation"
        assert proposal.pending_action is not None
        assert proposal.requires_backend_apply is False

        result = await orchestrator.process_chat(
            ChatRequest(
                content="네, 진행해줘",
                pending_action=proposal.pending_action,
                context=ChatContext(
                    metric_statuses={"blood_pressure": "high"},
                    food_allergens=["계란"],
                    disliked_foods=["버섯"],
                    diet_summary=_diet_summary(),
                ),
            )
        )
    finally:
        orchestrator.generate_replacement_meal = original_generate

    request = captured["request"]
    assert request.current_menu_name == "현재 점심"
    assert request.current_ingredients == [
        "닭가슴살구이",
        "혼합잡곡밥",
    ]
    assert request.excluded_menu_names == [
        "월요일 아침",
        "현재 점심",
        "화요일 저녁",
    ]
    assert request.food_allergens == ["계란"]
    assert request.disliked_foods == ["버섯"]

    assert result.action == "diet_replace"
    assert result.action_status == "ready_for_backend_apply"
    assert result.requires_backend_apply is True
    assert result.target_day == "monday"
    assert result.target_meal == "lunch"
    assert result.data is not None
    assert result.data["meal"]["menu_name"] == "검증된 대체 점심"
    assert "변경할 준비" in result.message


async def _run_cancellation_test() -> None:
    called = False

    async def fake_generate_replacement(request):
        nonlocal called
        called = True
        return _replacement_response()

    original_generate = orchestrator.generate_replacement_meal
    orchestrator.generate_replacement_meal = fake_generate_replacement

    try:
        proposal = await orchestrator.process_chat(
            ChatRequest(
                content="월요일 점심을 바꿔줘",
                context=ChatContext(
                    diet_summary=_diet_summary()
                ),
            )
        )
        assert proposal.pending_action is not None

        cancelled = await orchestrator.process_chat(
            ChatRequest(
                content="아니요, 취소해줘",
                pending_action=proposal.pending_action,
                context=ChatContext(
                    diet_summary=_diet_summary()
                ),
            )
        )
    finally:
        orchestrator.generate_replacement_meal = original_generate

    assert called is False
    assert cancelled.action == "diet_replace_cancelled"
    assert cancelled.action_status == "completed"
    assert cancelled.pending_action is None
    assert cancelled.requires_backend_apply is False


async def _run_answer_history_forwarding_test() -> None:
    captured = {}

    async def fake_answer_diet_question(
        message,
        metric_statuses,
        diet_summary,
        history=None,
    ):
        captured["message"] = message
        captured["history"] = history
        return "저장된 식단 기준 답변"

    original_answer = orchestrator.answer_diet_question
    orchestrator.answer_diet_question = fake_answer_diet_question

    history = [
        ChatHistoryItem(
            role="user",
            content="이번 주 식단을 확인하고 있어.",
        )
    ]

    try:
        result = await orchestrator.process_chat(
            ChatRequest(
                content="월요일 점심 메뉴가 뭐야?",
                history=history,
                context=ChatContext(
                    diet_summary=_diet_summary()
                ),
            )
        )
    finally:
        orchestrator.answer_diet_question = original_answer

    assert result.action == "diet_context"
    assert result.message == "저장된 식단 기준 답변"
    assert captured["message"] == "월요일 점심 메뉴가 뭐야?"
    assert captured["history"] == history


async def _run_all() -> None:
    await _run_intent_tests()
    await _run_missing_context_tests()
    await _run_replacement_action_test()
    await _run_cancellation_test()
    await _run_answer_history_forwarding_test()


def main() -> None:
    asyncio.run(_run_all())
    print("Chat orchestration 식단 변경 테스트: OK")


if __name__ == "__main__":
    main()
