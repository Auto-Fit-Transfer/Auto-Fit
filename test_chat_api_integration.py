import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import httpx

import app.core.security as security_module
import app.routers.chat_router as chat_router
import app.services.chat_orchestrator_service as orchestrator
from app.main import app
from app.schemas.running import RunningCourseRecommendationResponse


API_KEY = "integration-test-key"
AUTH_HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
}
RUNNING_EXAMPLES_PATH = (
    Path(__file__).resolve().parent
    / "docs"
    / "running_api_contract_examples.json"
)


def _diet_summary() -> dict:
    return {
        "weekly_plan": [
            {
                "day": "monday",
                "meals": {
                    "lunch": {
                        "menu_name": "기존 점심",
                        "items": [
                            {
                                "food_name": "현미밥",
                                "portion_g": 100.0,
                            },
                            {
                                "food_name": "닭가슴살구이",
                                "portion_g": 120.0,
                            },
                        ],
                    }
                },
            }
        ]
    }


async def _run_all() -> None:
    original_security_settings = security_module.get_settings
    original_router_settings = chat_router.get_settings
    original_backend_answer = (
        chat_router.generate_backend_chat_response
    )
    original_running_recommendation = (
        orchestrator.recommend_running_courses
    )

    settings = SimpleNamespace(
        ai_server_api_key=API_KEY,
        openai_model="integration-test-model",
    )

    async def fake_backend_answer(request):
        assert request.question == "안녕하세요"
        return "정상 호환 응답"

    async def fake_running_recommendation(request):
        assert request.latitude == 37.3948
        assert request.longitude == 127.1112
        assert request.distance_option == "5km"
        examples = json.loads(
            RUNNING_EXAMPLES_PATH.read_text(encoding="utf-8")
        )
        return RunningCourseRecommendationResponse.model_validate(
            examples["official_metadata_recommendation"]["response"]
        )

    security_module.get_settings = lambda: settings
    chat_router.get_settings = lambda: settings
    chat_router.generate_backend_chat_response = fake_backend_answer
    orchestrator.recommend_running_courses = (
        fake_running_recommendation
    )

    transport = httpx.ASGITransport(
        app=app,
        raise_app_exceptions=False,
    )

    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            missing_auth = await client.post(
                "/chat",
                json={"question": "안녕하세요"},
            )
            assert missing_auth.status_code == 401

            invalid_auth = await client.post(
                "/chat",
                headers={"Authorization": "Bearer wrong-key"},
                json={"question": "안녕하세요"},
            )
            assert invalid_auth.status_code == 401

            legacy = await client.post(
                "/chat",
                headers=AUTH_HEADERS,
                json={
                    "question": "안녕하세요",
                    "user_info": {},
                    "chat_history": [],
                },
            )
            assert legacy.status_code == 200
            assert legacy.json() == {
                "answer": "정상 호환 응답",
                "model": "integration-test-model",
            }

            invalid_request = await client.post(
                "/chat/orchestrate",
                headers=AUTH_HEADERS,
                json={"content": ""},
            )
            assert invalid_request.status_code == 422

            exercise_change = await client.post(
                "/chat/orchestrate",
                headers=AUTH_HEADERS,
                json={
                    "content": "운동 계획을 다른 것으로 바꿔줘",
                    "history": [],
                },
            )
            assert exercise_change.status_code == 200
            exercise_body = exercise_change.json()
            assert exercise_body["intent"] == "exercise_replace_request"
            assert exercise_body["action"] == (
                "exercise_replace_unavailable"
            )
            assert exercise_body["action_status"] == "unable_to_apply"
            assert exercise_body["requires_backend_apply"] is False
            assert exercise_body["sources"] == []

            running_recommendation = await client.post(
                "/chat/orchestrate",
                headers=AUTH_HEADERS,
                json={
                    "content": (
                        "현재 위치에서 쉬운 5km 러닝 코스를 "
                        "추천해줘"
                    ),
                    "history": [],
                    "context": {
                        "running": {
                            "latitude": 37.3948,
                            "longitude": 127.1112,
                            "pace_minutes_per_km": 6.5,
                        }
                    },
                },
            )
            assert running_recommendation.status_code == 200
            running_body = running_recommendation.json()
            assert running_body["intent"] == (
                "running_recommend_request"
            )
            assert running_body["action"] == (
                "running_courses_recommended"
            )
            assert running_body["action_status"] == "completed"
            assert running_body["requires_backend_apply"] is False
            assert running_body["data"]["resolved_region"] == "성남시"
            assert running_body["data"]["courses"][0][
                "distance_to_user_km"
            ] == 0.8

            diet_context = {
                "diet_summary": _diet_summary(),
            }
            diet_proposal = await client.post(
                "/chat/orchestrate",
                headers=AUTH_HEADERS,
                json={
                    "content": "월요일 점심을 바꿔줘",
                    "context": diet_context,
                },
            )
            assert diet_proposal.status_code == 200
            proposal_body = diet_proposal.json()
            assert proposal_body["action"] == "confirm_diet_replace"
            assert proposal_body["action_status"] == (
                "awaiting_confirmation"
            )
            assert proposal_body["requires_backend_apply"] is False
            assert proposal_body["pending_action"] == {
                "action": "diet_replace",
                "target_day": "monday",
                "target_meal": "lunch",
            }

            cancellation = await client.post(
                "/chat/orchestrate",
                headers=AUTH_HEADERS,
                json={
                    "content": "취소해줘",
                    "context": diet_context,
                    "pending_action": proposal_body["pending_action"],
                },
            )
            assert cancellation.status_code == 200
            cancellation_body = cancellation.json()
            assert cancellation_body["action"] == (
                "diet_replace_cancelled"
            )
            assert cancellation_body["action_status"] == "completed"
            assert cancellation_body["pending_action"] is None
            assert cancellation_body["requires_backend_apply"] is False
    finally:
        security_module.get_settings = original_security_settings
        chat_router.get_settings = original_router_settings
        chat_router.generate_backend_chat_response = (
            original_backend_answer
        )
        orchestrator.recommend_running_courses = (
            original_running_recommendation
        )


def main() -> None:
    asyncio.run(_run_all())
    print("Chat API integration 테스트: OK")


if __name__ == "__main__":
    main()
