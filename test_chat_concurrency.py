import asyncio
from types import SimpleNamespace

import httpx

import app.core.security as security_module
import app.services.chat_orchestrator_service as orchestrator
from app.main import app
from app.schemas.recommendation import ReplaceMealResponse


API_KEY = "concurrency-test-key"
AUTH_HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
}

DAY_CASES = [
    ("월요일", "monday"),
    ("화요일", "tuesday"),
    ("수요일", "wednesday"),
]

MEAL_CASES = [
    ("아침", "breakfast"),
    ("점심", "lunch"),
    ("저녁", "dinner"),
    ("간식", "snack"),
]


def _diet_context(
    *,
    day: str,
    meal: str,
    marker: str,
) -> dict:
    return {
        "diet_summary": {
            "marker": marker,
            "weekly_plan": [
                {
                    "day": day,
                    "meals": {
                        meal: {
                            "menu_name": f"기존-{marker}",
                            "items": [
                                {
                                    "food_name": f"음식-{marker}",
                                    "portion_g": 100.0,
                                }
                            ],
                        }
                    },
                }
            ],
        }
    }


def _replacement_response(request) -> ReplaceMealResponse:
    marker = request.current_menu_name.removeprefix("기존-")
    return ReplaceMealResponse.model_validate(
        {
            "day": request.target_day,
            "meal_type": request.target_meal,
            "meal": {
                "menu_name": f"대체-{marker}",
                "menu_description": f"{marker} 전용 대체 식사",
                "estimated_calories_kcal": 450.0,
                "nutrition": {
                    "carbohydrate_g": 50.0,
                    "protein_g": 30.0,
                    "fat_g": 14.0,
                },
                "items": [
                    {
                        "food_name": f"대체음식-{marker}",
                        "portion_g": 100.0,
                        "calories_kcal": 450.0,
                        "carbohydrate_g": 50.0,
                        "protein_g": 30.0,
                        "fat_g": 14.0,
                    }
                ],
                "guidance": "검증용 안내",
            },
            "cautions": [],
            "sources": [],
        }
    )


async def _run_all() -> None:
    original_security_settings = security_module.get_settings
    original_diet_answer = orchestrator.answer_diet_question
    original_replacement = orchestrator.generate_replacement_meal

    settings = SimpleNamespace(
        ai_server_api_key=API_KEY,
    )

    answer_calls: list[tuple[str, str, str]] = []
    replacement_calls: list[tuple[str, str, str]] = []

    async def fake_diet_answer(
        message,
        metric_statuses,
        diet_summary,
        history=None,
    ):
        await asyncio.sleep(0)
        history_marker = history[-1].content
        context_marker = diet_summary["marker"]
        answer_calls.append(
            (
                message,
                history_marker,
                context_marker,
            )
        )
        return f"{history_marker}|{context_marker}"

    async def fake_replacement(request):
        await asyncio.sleep(0)
        replacement_calls.append(
            (
                request.target_day,
                request.target_meal,
                request.current_menu_name,
            )
        )
        return _replacement_response(request)

    security_module.get_settings = lambda: settings
    orchestrator.answer_diet_question = fake_diet_answer
    orchestrator.generate_replacement_meal = fake_replacement

    transport = httpx.ASGITransport(
        app=app,
        raise_app_exceptions=False,
    )

    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            history_requests = []
            for index in range(20):
                marker = f"user-{index}"
                history_requests.append(
                    client.post(
                        "/chat/orchestrate",
                        headers=AUTH_HEADERS,
                        json={
                            "content": f"점심 메뉴가 뭐야? {marker}",
                            "history": [
                                {
                                    "role": "user",
                                    "content": f"history-{marker}",
                                }
                            ],
                            "context": {
                                "diet_summary": {
                                    "marker": f"context-{marker}",
                                }
                            },
                        },
                    )
                )

            history_responses = await asyncio.gather(
                *history_requests
            )

            for index, response in enumerate(history_responses):
                marker = f"user-{index}"
                assert response.status_code == 200
                body = response.json()
                assert body["action"] == "diet_context"
                assert body["message"] == (
                    f"history-{marker}|context-{marker}"
                )

            assert len(answer_calls) == 20
            assert len(set(answer_calls)) == 20

            cases = []
            proposal_requests = []
            for day_ko, day_code in DAY_CASES:
                for meal_ko, meal_code in MEAL_CASES:
                    marker = f"{day_code}-{meal_code}"
                    context = _diet_context(
                        day=day_code,
                        meal=meal_code,
                        marker=marker,
                    )
                    cases.append(
                        (
                            day_code,
                            meal_code,
                            marker,
                            context,
                        )
                    )
                    proposal_requests.append(
                        client.post(
                            "/chat/orchestrate",
                            headers=AUTH_HEADERS,
                            json={
                                "content": (
                                    f"{day_ko} {meal_ko}을 바꿔줘"
                                ),
                                "context": context,
                            },
                        )
                    )

            proposal_responses = await asyncio.gather(
                *proposal_requests
            )

            confirmation_requests = []
            for case, response in zip(
                cases,
                proposal_responses,
                strict=True,
            ):
                day_code, meal_code, marker, context = case
                assert response.status_code == 200
                body = response.json()
                assert body["action"] == "confirm_diet_replace"
                assert body["target_day"] == day_code
                assert body["target_meal"] == meal_code
                assert f"기존-{marker}" in body["message"]
                assert body["pending_action"] == {
                    "action": "diet_replace",
                    "target_day": day_code,
                    "target_meal": meal_code,
                }

                confirmation_requests.append(
                    client.post(
                        "/chat/orchestrate",
                        headers=AUTH_HEADERS,
                        json={
                            "content": "네, 진행해줘",
                            "context": context,
                            "pending_action": body["pending_action"],
                        },
                    )
                )

            confirmation_responses = await asyncio.gather(
                *confirmation_requests
            )

            for case, response in zip(
                cases,
                confirmation_responses,
                strict=True,
            ):
                day_code, meal_code, marker, _ = case
                assert response.status_code == 200
                body = response.json()
                assert body["action"] == "diet_replace"
                assert body["action_status"] == (
                    "ready_for_backend_apply"
                )
                assert body["requires_backend_apply"] is True
                assert body["target_day"] == day_code
                assert body["target_meal"] == meal_code
                assert body["data"]["meal"]["menu_name"] == (
                    f"대체-{marker}"
                )

            assert len(replacement_calls) == len(cases)
            assert len(set(replacement_calls)) == len(cases)
    finally:
        security_module.get_settings = original_security_settings
        orchestrator.answer_diet_question = original_diet_answer
        orchestrator.generate_replacement_meal = original_replacement


def main() -> None:
    asyncio.run(_run_all())
    print("Chat concurrent request isolation 테스트: OK")


if __name__ == "__main__":
    main()
