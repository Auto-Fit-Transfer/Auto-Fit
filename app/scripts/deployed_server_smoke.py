import argparse
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from pydantic import ValidationError

from app.schemas.chat import (
    ChatResponse,
)
from app.schemas.health_analysis import (
    DietContextInput,
    DietRefreshRequest,
    DietRefreshResponse,
    HealthAnalysisRequest,
    HealthAnalysisResponse,
    HealthScoreOutput,
)
from app.services.health_score_service import (
    health_score_service,
)


ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = (
    ROOT
    / "docs"
    / "health_report_api_contract_examples.json"
)

CRITICAL_OPENAPI_OPERATIONS = {
    "/health": "get",
    "/health/analysis": "get",
    "/health-analysis": "post",
    "/health-analysis/diet-refresh": "post",
    "/chat/orchestrate": "post",
}


class DeploymentSmokeError(RuntimeError):
    """배포 Smoke Test의 계약 불일치를 나타낸다."""


@dataclass(frozen=True)
class SmokeCheck:
    name: str
    http_status: int
    elapsed_ms: float


def normalize_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    parsed = urlparse(normalized)

    if (
        not normalized
        or parsed.scheme not in {"http", "https"}
        or not parsed.hostname
    ):
        raise DeploymentSmokeError(
            "AI_SERVER_BASE_URL must be an absolute HTTP(S) URL."
        )

    local_hosts = {
        "localhost",
        "127.0.0.1",
        "::1",
    }
    if (
        parsed.scheme != "https"
        and parsed.hostname not in local_hosts
    ):
        raise DeploymentSmokeError(
            "A deployed AI Server must use HTTPS."
        )

    return normalized


def load_contract_case(
    case_name: str = "initial_baseline",
) -> tuple[
    HealthAnalysisRequest,
    dict[str, Any],
]:
    examples = json.loads(
        CONTRACT_PATH.read_text(
            encoding="utf-8"
        )
    )
    case = examples.get(case_name)

    if not isinstance(case, dict):
        raise DeploymentSmokeError(
            f"Contract case is missing: {case_name}"
        )

    try:
        request = HealthAnalysisRequest.model_validate(
            case["request"]
        )
    except ValidationError as exc:
        raise DeploymentSmokeError(
            "The local health report contract request is invalid."
        ) from exc
    expected = case["expected"]
    return request, expected


def assert_expected_health_score(
    score: HealthScoreOutput,
    expected: dict[str, Any],
) -> None:
    actual = {
        "status": score.status,
        "total_score": score.total_score,
        "tier": score.tier,
        "tier_level": score.tier_level,
        "comparison_status": score.comparison_status,
        "previous_total_score": score.previous_total_score,
        "score_delta": score.score_delta,
        "trend": score.trend,
        "section_scores": {
            "diet": score.diet.score,
            "exercise": score.exercise.score,
            "health_data": score.health_data.score,
        },
        "section_statuses": {
            "diet": score.diet.status,
            "exercise": score.exercise.status,
            "health_data": score.health_data.status,
        },
        "priority_sections": [
            item.section
            for item in score.priority_actions
        ],
        "change_reason_trends": [
            {
                "section": item.section,
                "trend": item.trend,
            }
            for item in score.change_reasons
        ],
    }

    if actual != expected:
        raise DeploymentSmokeError(
            "The deployed health score does not match "
            "the executable contract."
        )


def _timed_request(
    client: httpx.Client,
    method: str,
    path: str,
    **kwargs: Any,
) -> tuple[httpx.Response, float]:
    started = time.perf_counter()
    response = client.request(
        method,
        path,
        **kwargs,
    )
    elapsed_ms = (
        time.perf_counter() - started
    ) * 1000.0
    return response, round(elapsed_ms, 1)


def _require_status(
    response: httpx.Response,
    expected_status: int,
    check_name: str,
) -> None:
    if response.status_code != expected_status:
        raise DeploymentSmokeError(
            f"{check_name} returned HTTP "
            f"{response.status_code}; expected {expected_status}."
        )


def _response_json(
    response: httpx.Response,
    check_name: str,
) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise DeploymentSmokeError(
            f"{check_name} did not return JSON."
        ) from exc

    if not isinstance(payload, dict):
        raise DeploymentSmokeError(
            f"{check_name} returned a non-object JSON payload."
        )

    return payload


def _run_with_client(
    client: httpx.Client,
    *,
    api_key: str,
    run_full_health_analysis: bool,
) -> list[SmokeCheck]:
    checks: list[SmokeCheck] = []

    health_response, elapsed = _timed_request(
        client,
        "GET",
        "/health",
    )
    _require_status(
        health_response,
        200,
        "health",
    )
    health_payload = _response_json(
        health_response,
        "health",
    )
    if health_payload.get("status") != "ok":
        raise DeploymentSmokeError(
            "The deployed health endpoint is not ready."
        )
    checks.append(
        SmokeCheck(
            name="health",
            http_status=health_response.status_code,
            elapsed_ms=elapsed,
        )
    )

    resilience_response, elapsed = _timed_request(
        client,
        "GET",
        "/health/analysis",
    )
    _require_status(
        resilience_response,
        200,
        "health_analysis_resilience",
    )
    resilience_payload = _response_json(
        resilience_response,
        "health_analysis_resilience",
    )
    resilience_stats = resilience_payload.get(
        "health_analysis_resilience"
    )
    diet_refresh_stats = resilience_payload.get(
        "diet_refresh_resilience"
    )
    if (
        resilience_payload.get("status") != "ok"
        or not isinstance(resilience_stats, dict)
        or not {
            "llm_successes",
            "llm_fallbacks",
            "llm_timeouts",
            "llm_errors",
            "empty_inventory_fallbacks",
        }.issubset(resilience_stats)
        or not isinstance(diet_refresh_stats, dict)
        or not {
            "llm_successes",
            "llm_fallbacks",
            "llm_timeouts",
            "llm_errors",
            "empty_inventory_fallbacks",
        }.issubset(diet_refresh_stats)
    ):
        raise DeploymentSmokeError(
            "The health analysis resilience endpoint is invalid."
        )
    checks.append(
        SmokeCheck(
            name="health_analysis_resilience",
            http_status=(
                resilience_response.status_code
            ),
            elapsed_ms=elapsed,
        )
    )

    openapi_response, elapsed = _timed_request(
        client,
        "GET",
        "/openapi.json",
    )
    _require_status(
        openapi_response,
        200,
        "openapi",
    )
    openapi = _response_json(
        openapi_response,
        "openapi",
    )
    paths = openapi.get("paths")
    if not isinstance(paths, dict):
        raise DeploymentSmokeError(
            "The deployed OpenAPI document has no paths object."
        )

    for path, method in CRITICAL_OPENAPI_OPERATIONS.items():
        operation = paths.get(path)
        if (
            not isinstance(operation, dict)
            or method not in operation
        ):
            raise DeploymentSmokeError(
                f"OpenAPI operation is missing: "
                f"{method.upper()} {path}"
            )
    checks.append(
        SmokeCheck(
            name="openapi_contract",
            http_status=openapi_response.status_code,
            elapsed_ms=elapsed,
        )
    )

    health_request, expected_score = load_contract_case()
    local_score = health_score_service.calculate(
        health_request
    )
    assert_expected_health_score(
        local_score,
        expected_score,
    )

    chat_request = {
        "content": "내 건강 점수를 알려줘",
        "history": [],
        "context": {
            "health_score": local_score.model_dump(
                mode="json"
            )
        },
        "pending_action": None,
    }

    unauthorized_response, elapsed = _timed_request(
        client,
        "POST",
        "/chat/orchestrate",
        json=chat_request,
    )
    _require_status(
        unauthorized_response,
        401,
        "authentication_boundary",
    )
    checks.append(
        SmokeCheck(
            name="authentication_boundary",
            http_status=unauthorized_response.status_code,
            elapsed_ms=elapsed,
        )
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    diet_refresh_request = DietRefreshRequest(
        schema_version=health_request.schema_version,
        request_id=(
            f"{health_request.request_id}-diet-refresh"
        ),
        goal=health_request.goal,
        health_checkup=(
            health_request.input.health_checkup
        ),
        body_composition=(
            health_request.input.body_composition
        ),
        diet_context=DietContextInput(
            captured_at=None,
            inventory=[],
            allergies=[],
        ),
    )
    diet_refresh_response, elapsed = _timed_request(
        client,
        "POST",
        "/health-analysis/diet-refresh",
        headers=headers,
        json=diet_refresh_request.model_dump(
            mode="json",
            exclude_none=True,
        ),
    )
    _require_status(
        diet_refresh_response,
        200,
        "diet_refresh_fallback",
    )
    try:
        diet_refresh_result = DietRefreshResponse.model_validate(
            _response_json(
                diet_refresh_response,
                "diet_refresh_fallback",
            )
        )
    except ValidationError as exc:
        raise DeploymentSmokeError(
            "The deployed diet refresh fallback schema is invalid."
        ) from exc
    if (
        diet_refresh_result.request_id
        != diet_refresh_request.request_id
        or diet_refresh_result.model.name != "deterministic"
        or diet_refresh_result.model.version
        != "diet-refresh-fallback-v1"
        or diet_refresh_result.refrigerator_context.available_count
        != 0
    ):
        raise DeploymentSmokeError(
            "The deployed diet refresh fallback is invalid."
        )
    checks.append(
        SmokeCheck(
            name="diet_refresh_fallback",
            http_status=diet_refresh_response.status_code,
            elapsed_ms=elapsed,
        )
    )

    chat_response, elapsed = _timed_request(
        client,
        "POST",
        "/chat/orchestrate",
        headers=headers,
        json=chat_request,
    )
    _require_status(
        chat_response,
        200,
        "health_score_chat",
    )
    try:
        chat_result = ChatResponse.model_validate(
            _response_json(
                chat_response,
                "health_score_chat",
            )
        )
    except ValidationError as exc:
        raise DeploymentSmokeError(
            "The deployed health score chat schema is invalid."
        ) from exc
    if (
        chat_result.intent != "health_score_question"
        or chat_result.action != "health_score_context"
        or chat_result.action_status != "completed"
        or chat_result.requires_backend_apply
    ):
        raise DeploymentSmokeError(
            "The deployed health score chat action is invalid."
        )
    if (
        chat_result.data is None
        or chat_result.data.get("total_score")
        != local_score.total_score
        or "health_metric_adjustments"
        in chat_result.data
    ):
        raise DeploymentSmokeError(
            "The deployed health score chat data is invalid."
        )
    checks.append(
        SmokeCheck(
            name="health_score_chat",
            http_status=chat_response.status_code,
            elapsed_ms=elapsed,
        )
    )

    if run_full_health_analysis:
        analysis_response, elapsed = _timed_request(
            client,
            "POST",
            "/health-analysis",
            headers=headers,
            json=health_request.model_dump(
                mode="json",
                exclude_none=True,
            ),
        )
        _require_status(
            analysis_response,
            200,
            "full_health_analysis",
        )
        try:
            analysis_result = (
                HealthAnalysisResponse.model_validate(
                    _response_json(
                        analysis_response,
                        "full_health_analysis",
                    )
                )
            )
        except ValidationError as exc:
            raise DeploymentSmokeError(
                "The deployed health analysis schema is invalid."
            ) from exc
        if (
            analysis_result.request_id
            != health_request.request_id
        ):
            raise DeploymentSmokeError(
                "The health analysis request_id was not preserved."
            )
        assert_expected_health_score(
            analysis_result.analysis.health_score,
            expected_score,
        )
        checks.append(
            SmokeCheck(
                name="full_health_analysis",
                http_status=analysis_response.status_code,
                elapsed_ms=elapsed,
            )
        )

    return checks


def run_deployed_server_smoke(
    *,
    base_url: str,
    api_key: str,
    timeout_seconds: float = 60.0,
    run_full_health_analysis: bool = False,
    client: httpx.Client | None = None,
) -> list[SmokeCheck]:
    normalized_base_url = normalize_base_url(
        base_url
    )
    normalized_api_key = api_key.strip()

    if not normalized_api_key:
        raise DeploymentSmokeError(
            "AI_SERVER_API_KEY is required."
        )
    if timeout_seconds <= 0:
        raise DeploymentSmokeError(
            "AI_SERVER_SMOKE_TIMEOUT_SECONDS must be positive."
        )

    if client is not None:
        return _run_with_client(
            client,
            api_key=normalized_api_key,
            run_full_health_analysis=(
                run_full_health_analysis
            ),
        )

    with httpx.Client(
        base_url=normalized_base_url,
        timeout=httpx.Timeout(timeout_seconds),
        follow_redirects=False,
    ) as owned_client:
        return _run_with_client(
            owned_client,
            api_key=normalized_api_key,
            run_full_health_analysis=(
                run_full_health_analysis
            ),
        )


def _env_flag(name: str) -> bool:
    return os.getenv(
        name,
        "",
    ).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate the deployed Auto-Fit AI Server "
            "without printing secrets."
        )
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help=(
            "Also call POST /health-analysis once. "
            "This may use OpenAI and take longer."
        ),
    )
    return parser.parse_args()


def _run_from_environment() -> int:
    args = _parse_args()
    load_dotenv(
        dotenv_path=ROOT / ".env",
        override=False,
    )

    base_url = os.getenv(
        "AI_SERVER_BASE_URL",
        "",
    )
    api_key = os.getenv(
        "AI_SERVER_API_KEY",
        "",
    )
    timeout_raw = os.getenv(
        "AI_SERVER_SMOKE_TIMEOUT_SECONDS",
        "60",
    )

    try:
        timeout_seconds = float(timeout_raw)
    except ValueError as exc:
        raise DeploymentSmokeError(
            "AI_SERVER_SMOKE_TIMEOUT_SECONDS must be numeric."
        ) from exc

    checks = run_deployed_server_smoke(
        base_url=base_url,
        api_key=api_key,
        timeout_seconds=timeout_seconds,
        run_full_health_analysis=(
            args.full
            or _env_flag(
                "RUN_FULL_AI_SERVER_SMOKE"
            )
        ),
    )

    for check in checks:
        print(
            f"PASS {check.name}: "
            f"HTTP {check.http_status}, "
            f"{check.elapsed_ms:.1f} ms"
        )
    print(
        "Deployment smoke test completed. "
        "Secret values were not printed."
    )
    return 0


def main() -> int:
    try:
        return _run_from_environment()
    except (
        DeploymentSmokeError,
        httpx.HTTPError,
    ) as exc:
        print(
            f"Deployment smoke test failed: {exc}",
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
