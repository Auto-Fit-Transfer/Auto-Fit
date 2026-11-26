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
    summary="계획한 운동 4개 중 3개를 마쳤어요.",
    insights=["무릎 불편이 기록됐어요."],
    next_session_adjustments=["다음 운동 전에는 무릎 상태를 먼저 확인해 주세요."],
    safety_notice="통증이 있으면 운동을 중단하고 전문가와 상담하세요.",
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
        assert response.json()["result"] == NARRATIVE.model_dump(mode="json")
        assert client.post(
            "/analyze/exercise-session", json={**REQUEST, "user_id": "someone-else"},
            headers={"Authorization": "Bearer test-key"},
        ).status_code == 422


@pytest.mark.parametrize("has_safety_notice", [True, False])
def test_analysis_service_sends_contract_fields_and_haeyo_instructions(
    monkeypatch, has_safety_notice,
):
    captured = {}
    call_count = 0
    request_payload = {
        **REQUEST,
        "discomfort_events": REQUEST["discomfort_events"] if has_safety_notice else [],
        "feedback": {
            **REQUEST["feedback"],
            "post_condition": "bad" if has_safety_notice else "normal",
            "uncomfortable_areas": ["무릎"] if has_safety_notice else [],
            "note": REQUEST["feedback"]["note"] if has_safety_notice else None,
        },
    }
    expected = NARRATIVE if has_safety_notice else ExerciseAnalysisNarrative(
        summary="계획한 운동 4개 중 3개를 마쳤어요.",
        insights=["한 동작은 건너뛰었어요."],
        next_session_adjustments=["다음 운동 전에도 컨디션을 확인해 주세요."],
        safety_notice=None,
    )

    class FakeResponses:
        async def parse(self, **kwargs):
            nonlocal call_count
            call_count += 1
            captured.update(kwargs)
            return SimpleNamespace(output_parsed=expected)

    class FakeClient:
        def __init__(self, **_kwargs):
            self.responses = FakeResponses()

    monkeypatch.setattr(service_module, "get_settings", lambda: SimpleNamespace(
        openai_api_key="test-key", openai_model="test-model",
        exercise_analysis_openai_timeout_seconds=5,
    ))
    monkeypatch.setattr(service_module, "AsyncOpenAI", FakeClient)
    result = asyncio.run(service_module.analyze_exercise_session(
        ExerciseSessionAnalysisRequest.model_validate(request_payload)
    ))
    assert result == expected
    assert call_count == 1
    assert captured["text_format"] is ExerciseAnalysisNarrative
    assert json.loads(captured["input"]) == request_payload
    instructions = captured["instructions"]
    for field in ("summary", "insights", "next_session_adjustments", "safety_notice"):
        assert field in instructions
    assert "모든 문장을 자연스럽고 정중한 해요체" in instructions
    assert "하십시오체나 반말, 명사형 종결은 사용하지 마세요" in instructions
    assert "필요한 운동 중단 및 상담 안내는 분명하게" in instructions
    assert "safety_notice는 null" in instructions
    assert "의료 진단, 치료 처방, 확정적인 안전 판단을 하지 마세요" in instructions
    assert captured["reasoning"] == {"effort": "low"}
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
