import json

import httpx

from app.schemas.health_analysis import (
    DietRefreshRequest,
    HealthAnalysisRequest,
)
from app.scripts.deployed_server_smoke import (
    DeploymentSmokeError,
    load_contract_case,
    normalize_base_url,
    run_deployed_server_smoke,
)
from app.services.health_score_service import (
    health_score_service,
)


def _health_analysis_response(
    request: HealthAnalysisRequest,
) -> dict:
    score = health_score_service.calculate(
        request
    )
    return {
        "schema_version": request.schema_version,
        "request_id": request.request_id,
        "analysis": {
            "health_score": score.model_dump(
                mode="json"
            ),
            "headline": {
                "title": "건강 리포트",
            },
            "summary": {
                "title": "주간 건강 요약",
                "description": "계약 검증용 응답입니다.",
            },
            "goal": {
                "text": "건강 습관 유지",
            },
            "strategy": {
                "title": "기본 전략",
                "tags": [],
                "message": "점수를 기준으로 관리합니다.",
            },
            "key_metric_keys": [],
            "recommendation_reasons": [],
            "final_direction": {
                "from": "기준 상태",
                "to": "건강 습관 유지",
            },
            "diet_suggestion": {
                "title": "식단 관리",
                "message": "주간 목표를 확인하세요.",
                "action_items": [],
                "evidence_metric_keys": [],
                "used_inventory_item_ids": [],
            },
            "refrigerator_context": {
                "captured_at": None,
                "available_count": 0,
                "expiring_soon_count": 0,
                "allergy_excluded_count": 0,
                "used_items": [],
                "expiring_soon_items": [],
            },
        },
        "model": {
            "name": "contract-test",
            "version": "1.0",
        },
    }


def _chat_response() -> dict:
    request, _expected = load_contract_case()
    score = health_score_service.calculate(
        request
    )
    return {
        "intent": "health_score_question",
        "message": "현재 건강 점수는 32점입니다.",
        "action": "health_score_context",
        "action_status": "completed",
        "requires_backend_apply": False,
        "pending_action": None,
        "target_day": None,
        "target_meal": None,
        "data": {
            "status": score.status,
            "scoring_version": score.scoring_version,
            "total_score": score.total_score,
            "tier": score.tier,
            "tier_level": score.tier_level,
            "comparison_status": (
                score.comparison_status
            ),
        },
        "sources": [],
    }


def _mock_handler(
    request: httpx.Request,
) -> httpx.Response:
    if request.url.path == "/health":
        return httpx.Response(
            200,
            json={
                "status": "ok",
                "service": "healthcare-ai-server",
            },
        )

    if request.url.path == "/health/analysis":
        return httpx.Response(
            200,
            json={
                "status": "ok",
                "service": "healthcare-ai-server",
                "health_analysis_resilience": {
                    "llm_successes": 1,
                    "llm_fallbacks": 0,
                    "llm_timeouts": 0,
                    "llm_errors": 0,
                    "empty_inventory_fallbacks": 1,
                },
                "diet_refresh_resilience": {
                    "llm_successes": 1,
                    "llm_fallbacks": 0,
                    "llm_timeouts": 0,
                    "llm_errors": 0,
                    "empty_inventory_fallbacks": 1,
                },
            },
        )

    if request.url.path == "/openapi.json":
        return httpx.Response(
            200,
            json={
                "paths": {
                    "/health": {"get": {}},
                    "/health/analysis": {"get": {}},
                    "/health-analysis": {"post": {}},
                    "/health-analysis/diet-refresh": {
                        "post": {}
                    },
                    "/chat/orchestrate": {"post": {}},
                }
            },
        )

    if request.url.path == "/chat/orchestrate":
        if request.headers.get("Authorization") is None:
            return httpx.Response(
                401,
                json={
                    "detail": (
                        "Missing authorization credentials."
                    )
                },
            )
        return httpx.Response(
            200,
            json=_chat_response(),
        )

    if request.url.path == "/health-analysis":
        body = json.loads(
            request.content.decode("utf-8")
        )
        validated = HealthAnalysisRequest.model_validate(
            body
        )
        return httpx.Response(
            200,
            json=_health_analysis_response(
                validated
            ),
        )

    if request.url.path == "/health-analysis/diet-refresh":
        body = json.loads(
            request.content.decode("utf-8")
        )
        validated = DietRefreshRequest.model_validate(
            body
        )
        return httpx.Response(
            200,
            json={
                "schema_version": validated.schema_version,
                "request_id": validated.request_id,
                "diet_suggestion": {
                    "title": "냉장고 재료를 등록해 보세요",
                    "message": "사용 가능한 재료가 없습니다.",
                    "action_items": [],
                    "evidence_metric_keys": [],
                    "used_inventory_item_ids": [],
                },
                "refrigerator_context": {
                    "captured_at": None,
                    "available_count": 0,
                    "expiring_soon_count": 0,
                    "allergy_excluded_count": 0,
                    "used_items": [],
                    "expiring_soon_items": [],
                },
                "model": {
                    "name": "deterministic",
                    "version": "diet-refresh-fallback-v1",
                },
            },
        )

    return httpx.Response(404)


def test_deployed_server_smoke_contract() -> None:
    transport = httpx.MockTransport(
        _mock_handler
    )
    with httpx.Client(
        transport=transport,
        base_url="https://ai.example.test",
    ) as client:
        checks = run_deployed_server_smoke(
            base_url="https://ai.example.test",
            api_key="contract-test-key",
            run_full_health_analysis=True,
            client=client,
        )

    assert [
        check.name
        for check in checks
    ] == [
        "health",
        "health_analysis_resilience",
        "openapi_contract",
        "authentication_boundary",
        "diet_refresh_fallback",
        "health_score_chat",
        "full_health_analysis",
    ]
    assert all(
        check.elapsed_ms >= 0
        for check in checks
    )


def test_deployed_url_requires_https() -> None:
    assert normalize_base_url(
        "https://ai.example.test/"
    ) == "https://ai.example.test"
    assert normalize_base_url(
        "http://localhost:8000/"
    ) == "http://localhost:8000"

    try:
        normalize_base_url(
            "http://ai.example.test"
        )
    except DeploymentSmokeError as exc:
        assert "HTTPS" in str(exc)
    else:
        raise AssertionError(
            "Remote HTTP URL must be rejected."
        )
