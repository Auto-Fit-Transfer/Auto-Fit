import asyncio
import json
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.core.security as security_module
import app.routers.exercise_session_analysis_router as router_module
import app.services.exercise_session_analysis_service as service_module
from app.schemas.exercise_session_analysis import (
    ExerciseAnalysisNarrative,
    ExerciseSessionAnalysisRequest,
)


REQUEST = {
    "status": "completed",
    "completion_rate": 75,
    "duration_minutes": 30,
    "calories_burned": None,
    "planned_item_count": 4,
    "completed_item_count": 3,
    "skipped_item_count": 1,
    "exercises": [{"name": "걷기", "completed": True, "skipped": False, "duration_minutes": 20}],
    "discomfort_events": [{
        "symptom_type": "pain", "severity": 4, "body_areas": ["무릎"],
        "action_taken": "adjust",
    }],
    "feedback": {
        "perceived_difficulty": 4,
        "post_condition": "bad",
        "uncomfortable_areas": ["무릎"],
        "note": "무릎이 불편했어요",
    },
}
NARRATIVE = ExerciseAnalysisNarrative(
    summary="오늘 운동을 마쳤습니다.",
    insights=["무릎 불편이 기록됐습니다."],
    next_session_adjustments=["다음 운동 전에 강도를 다시 확인하세요."],
    safety_notice="불편이 계속되면 운동을 중단하고 전문가와 상담하세요.",
)
app = FastAPI()
app.include_router(router_module.router)


def test_analysis_api_requires_auth_and_returns_ai_narrative(monkeypatch):
    monkeypatch.setattr(
        security_module, "get_settings",
        lambda: SimpleNamespace(ai_server_api_key="test-key"),
    )

    async def fake_analyze(request):
        assert request.feedback.note == "무릎이 불편했어요"
        return NARRATIVE

    monkeypatch.setattr(router_module, "analyze_exercise_session", fake_analyze)
    with TestClient(app) as client:
        assert client.post("/analyze/exercise-session", json=REQUEST).status_code == 401
        response = client.post(
            "/analyze/exercise-session", json=REQUEST,
            headers={"Authorization": "Bearer test-key"},
        )
        assert response.status_code == 200
        assert response.json()["generator"] == "auto-fit-ai"
        assert response.json()["result"]["insights"] == NARRATIVE.insights
        assert client.post(
            "/analyze/exercise-session", json={**REQUEST, "user_id": "someone-else"},
            headers={"Authorization": "Bearer test-key"},
        ).status_code == 422


def test_analysis_service_sends_only_contract_fields(monkeypatch):
    captured = {}

    class FakeResponses:
        async def parse(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_parsed=NARRATIVE)

    class FakeClient:
        def __init__(self, **_kwargs):
            self.responses = FakeResponses()

    monkeypatch.setattr(service_module, "get_settings", lambda: SimpleNamespace(
        openai_api_key="test-key", openai_model="test-model",
        exercise_analysis_openai_timeout_seconds=5,
    ))
    monkeypatch.setattr(service_module, "AsyncOpenAI", FakeClient)
    result = asyncio.run(service_module.analyze_exercise_session(
        ExerciseSessionAnalysisRequest.model_validate(REQUEST)
    ))
    assert result == NARRATIVE
    assert captured["text_format"] is ExerciseAnalysisNarrative
    assert json.loads(captured["input"]) == REQUEST
    assert "진단" in captured["instructions"]
