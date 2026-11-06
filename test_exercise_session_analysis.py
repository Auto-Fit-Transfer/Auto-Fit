import asyncio
import json
import logging
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

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
    assert captured["reasoning"] == {"effort": "minimal"}
    assert captured["max_output_tokens"] == 2200


def test_analysis_service_logs_incomplete_metadata_without_health_payload(
    monkeypatch,
    caplog,
):
    class FakeResponses:
        async def parse(self, **_kwargs):
            return SimpleNamespace(
                id="resp_test",
                status="incomplete",
                incomplete_details=SimpleNamespace(
                    reason="max_output_tokens"
                ),
                usage=SimpleNamespace(
                    output_tokens=2200,
                    output_tokens_details=SimpleNamespace(
                        reasoning_tokens=2100
                    ),
                ),
                output_parsed=None,
            )

    class FakeClient:
        def __init__(self, **_kwargs):
            self.responses = FakeResponses()

    monkeypatch.setattr(service_module, "get_settings", lambda: SimpleNamespace(
        openai_api_key="test-key", openai_model="test-model",
        exercise_analysis_openai_timeout_seconds=5,
    ))
    monkeypatch.setattr(service_module, "AsyncOpenAI", FakeClient)

    with caplog.at_level(logging.WARNING):
        with pytest.raises(
            RuntimeError,
            match="structured output is empty",
        ):
            asyncio.run(service_module.analyze_exercise_session(
                ExerciseSessionAnalysisRequest.model_validate(REQUEST)
            ))

    assert "response_id=resp_test" in caplog.text
    assert "status=incomplete" in caplog.text
    assert "max_output_tokens" in caplog.text
    assert "output_tokens=2200" in caplog.text
    assert "reasoning_tokens=2100" in caplog.text
    assert REQUEST["feedback"]["note"] not in caplog.text
    assert REQUEST["exercises"][0]["name"] not in caplog.text
    assert REQUEST["feedback"]["uncomfortable_areas"][0] not in caplog.text


def test_analysis_service_converts_parse_validation_error_without_input_log(
    monkeypatch,
    caplog,
):
    try:
        ExerciseAnalysisNarrative.model_validate({})
    except ValidationError as exc:
        parse_error = exc

    class FakeResponses:
        async def parse(self, **_kwargs):
            raise parse_error

    class FakeClient:
        def __init__(self, **_kwargs):
            self.responses = FakeResponses()

    monkeypatch.setattr(service_module, "get_settings", lambda: SimpleNamespace(
        openai_api_key="test-key", openai_model="test-model",
        exercise_analysis_openai_timeout_seconds=5,
    ))
    monkeypatch.setattr(service_module, "AsyncOpenAI", FakeClient)

    with caplog.at_level(logging.WARNING):
        with pytest.raises(
            RuntimeError,
            match="structured output parsing failed",
        ):
            asyncio.run(service_module.analyze_exercise_session(
                ExerciseSessionAnalysisRequest.model_validate(REQUEST)
            ))

    assert "exception_type=ValidationError" in caplog.text
    assert "missing" in caplog.text
    assert REQUEST["feedback"]["note"] not in caplog.text


def test_analysis_service_converts_response_contract_validation_error(
    monkeypatch,
    caplog,
):
    class FakeResponses:
        async def parse(self, **_kwargs):
            return SimpleNamespace(
                id="resp_invalid",
                status="completed",
                incomplete_details=None,
                usage=None,
                output_parsed={
                    "summary": REQUEST["feedback"]["note"],
                },
            )

    class FakeClient:
        def __init__(self, **_kwargs):
            self.responses = FakeResponses()

    monkeypatch.setattr(service_module, "get_settings", lambda: SimpleNamespace(
        openai_api_key="test-key", openai_model="test-model",
        exercise_analysis_openai_timeout_seconds=5,
    ))
    monkeypatch.setattr(service_module, "AsyncOpenAI", FakeClient)

    with caplog.at_level(logging.WARNING):
        with pytest.raises(
            RuntimeError,
            match="response contract validation failed",
        ):
            asyncio.run(service_module.analyze_exercise_session(
                ExerciseSessionAnalysisRequest.model_validate(REQUEST)
            ))

    assert "response_id=resp_invalid" in caplog.text
    assert "exception_type=ValidationError" in caplog.text
    assert REQUEST["feedback"]["note"] not in caplog.text


@pytest.mark.parametrize(
    ("service_error", "expected_status"),
    [
        (RuntimeError("private runtime diagnostic"), 503),
        (TimeoutError("private timeout diagnostic"), 503),
        (ValueError("private internal diagnostic"), 500),
    ],
)
def test_analysis_api_maps_service_errors_without_exposing_details(
    monkeypatch,
    caplog,
    service_error,
    expected_status,
):
    request = ExerciseSessionAnalysisRequest.model_validate(REQUEST)

    async def unavailable(_request):
        raise service_error

    monkeypatch.setattr(
        router_module,
        "analyze_exercise_session",
        unavailable,
    )

    with caplog.at_level(logging.WARNING):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(router_module.analyze_session(request, None))

    assert exc_info.value.status_code == expected_status
    assert "private" not in str(exc_info.value.detail)
    assert type(service_error).__name__ in caplog.text
    assert str(service_error) not in caplog.text
