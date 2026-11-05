import asyncio
from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import chat_health_scores as scores, main
from backend.tests.test_main import TEST_SETTINGS


def assessment(score, day=8):
    return scores.Assessment(overall_score=score, assessed_at=f"2026-09-{day:02}T10:00:00+09:00")


CURRENT_ID = UUID("00000000-0000-0000-0000-000000000101")
PREVIOUS_ID = UUID("00000000-0000-0000-0000-000000000102")


def assessment_item(parent_id, metric_type, name, score, order=0, status=None):
    return scores.AssessmentItem(
        health_assessment_id=parent_id,
        metric_type=metric_type,
        metric_name=name,
        metric_score=score,
        evaluation_status=status,
        sequence_order=order,
    )


@pytest.mark.parametrize("current,previous,expected", [
    (86, 91, "5점 낮아졌습니다"), (91, 86, "5점 높아졌습니다"),
    (86, 86, "동일합니다"), (0, 1, "1점 낮아졌습니다"),
])
def test_changes(current, previous, expected):
    answer = scores.build_score_answer([assessment(current), assessment(previous, 1)], "change")
    assert expected in answer["content"]
    assert "2026-09-01" in answer["content"]
    assert answer["response_source"] == "database"


def test_latest_does_not_claim_a_comparison():
    answer = scores.build_score_answer([assessment(86), assessment(90, 1)], "latest")
    assert answer["evidence"][0]["previous_value"] is None
    assert not answer["needs_more_data"]


def test_latest_explanation_returns_three_lowest_scored_items():
    current = scores.Assessment(
        health_assessment_id=CURRENT_ID,
        overall_score=86,
        assessed_at="2026-09-08T00:00:00Z",
    )
    items = {CURRENT_ID: [
        assessment_item(CURRENT_ID, "bmi", "체질량지수", 88, 1),
        assessment_item(CURRENT_ID, "blood_pressure", "혈압", 70, 2, "attention"),
        assessment_item(CURRENT_ID, "glucose", "혈당", 82, 3),
        assessment_item(CURRENT_ID, "muscle", "근육량", 90, 4),
    ]}
    answer = scores.build_score_answer([current], "latest", True, items)
    item_evidence = [row for row in answer["evidence"] if row["metric"] == "health_assessment_item"]
    assert [row["label"] for row in item_evidence] == ["혈압", "혈당", "체질량지수"]
    assert item_evidence[0]["evaluation_status"] == "attention"
    assert answer["response_source"] == "database"
    assert not answer["needs_more_data"]
    assert "원인이나 개선 방법을 단정할 수는 없습니다" in answer["content"]


def test_change_explanation_compares_matching_items_without_claiming_cause():
    current = scores.Assessment(
        health_assessment_id=CURRENT_ID,
        overall_score=86,
        assessed_at="2026-09-08T00:00:00Z",
    )
    previous = scores.Assessment(
        health_assessment_id=PREVIOUS_ID,
        overall_score=91,
        assessed_at="2026-09-01T00:00:00Z",
    )
    items = {
        CURRENT_ID: [
            assessment_item(CURRENT_ID, "blood_pressure", "혈압", 70, 1),
            assessment_item(CURRENT_ID, "glucose", "혈당", 85, 2),
        ],
        PREVIOUS_ID: [
            assessment_item(PREVIOUS_ID, "blood_pressure", "혈압", 90, 1),
            assessment_item(PREVIOUS_ID, "glucose", "혈당", 80, 2),
        ],
    }
    answer = scores.build_score_answer([current, previous], "change", True, items)
    item_evidence = [row for row in answer["evidence"] if row["metric"] == "health_assessment_item"]
    assert item_evidence[0]["label"] == "혈압"
    assert item_evidence[0]["current_value"] == 70
    assert item_evidence[0]["previous_value"] == 90
    assert "혈압 90→70점" in answer["content"]
    assert "직접 원인으로 단정할 수는 없지만" in answer["content"]
    assert answer["response_source"] == "database"
    assert not answer["needs_more_data"]


@pytest.mark.parametrize("rows,explain,required", [
    ([], False, "health_assessment"),
    ([assessment(86)], False, "previous_health_assessment"),
    ([assessment(86), assessment(91, 1)], True, "assessment_explanation_evidence"),
])
def test_missing_data(rows, explain, required):
    answer = scores.build_score_answer(rows, "change", explain)
    assert answer["response_source"] == "need_more_data"
    assert required in answer["required_data"]


@pytest.mark.parametrize("status,payload", [
    (200, [{"overall_score": 86, "assessed_at": "2026-09-01T00:00:00Z"}]),
    (403, {"secret": "must not leak"}),
    (200, {"wrong": "shape"}),
    (200, [{"overall_score": 101, "assessed_at": "2026-09-01T00:00:00Z"}]),
])
def test_query_is_scoped_and_errors_are_sanitized(monkeypatch, status, payload):
    original = httpx.AsyncClient

    def handler(request):
        assert request.url.params["user_id"] == "eq.owner"
        assert request.url.params["select"] == "health_assessment_id,overall_score,assessed_at"
        assert request.url.params["limit"] == "2"
        assert request.url.params["assessed_at"].startswith("lte.")
        assert request.url.params["order"] == "assessed_at.desc,health_assessment_id.desc"
        return httpx.Response(status, json=payload)

    monkeypatch.setattr(scores.httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    call = scores.fetch_scores("https://example.supabase.co", {}, "owner")
    if status == 200 and isinstance(payload, list) and payload[0]["overall_score"] == 86:
        assert asyncio.run(call)[0].overall_score == 86
    else:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(call)
        assert exc.value.status_code == 502
        assert exc.value.detail["code"] == "DATA_SOURCE_ERROR"
        assert "secret" not in str(exc.value.detail)


def test_assessment_items_are_limited_to_confirmed_parent_ids(monkeypatch):
    original = httpx.AsyncClient
    rows = [
        scores.Assessment(
            health_assessment_id=CURRENT_ID,
            overall_score=86,
            assessed_at="2026-09-08T00:00:00Z",
        ),
        scores.Assessment(
            health_assessment_id=PREVIOUS_ID,
            overall_score=91,
            assessed_at="2026-09-01T00:00:00Z",
        ),
    ]

    def handler(request):
        assert request.url.params["health_assessment_id"] == f"in.({CURRENT_ID},{PREVIOUS_ID})"
        assert request.url.params["limit"] == "101"
        return httpx.Response(200, json=[{
            "health_assessment_id": str(CURRENT_ID),
            "metric_type": "blood_pressure",
            "metric_name": "혈압",
            "metric_score": 72,
            "evaluation_status": "attention",
            "sequence_order": 1,
        }])

    monkeypatch.setattr(
        scores.httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(handler), **kw),
    )
    result = asyncio.run(scores.fetch_assessment_items("https://example.supabase.co", {}, rows))
    assert result[CURRENT_ID][0].metric_name == "혈압"
    assert result[PREVIOUS_ID] == []


@pytest.mark.parametrize("status,payload", [
    (403, {"secret": "must not leak"}),
    (200, {"wrong": "shape"}),
    (200, [{
        "health_assessment_id": str(CURRENT_ID),
        "metric_type": "blood_pressure",
        "metric_name": "혈압",
        "metric_score": 101,
        "evaluation_status": "attention",
        "sequence_order": 1,
    }]),
])
def test_assessment_item_errors_are_sanitized(monkeypatch, status, payload):
    original = httpx.AsyncClient
    rows = [scores.Assessment(
        health_assessment_id=CURRENT_ID,
        overall_score=86,
        assessed_at="2026-09-08T00:00:00Z",
    )]
    monkeypatch.setattr(
        scores.httpx,
        "AsyncClient",
        lambda **kw: original(
            transport=httpx.MockTransport(lambda request: httpx.Response(status, json=payload)),
            **kw,
        ),
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(scores.fetch_assessment_items("https://example.supabase.co", {}, rows))
    assert exc.value.status_code == 502
    assert exc.value.detail["code"] == "DATA_SOURCE_ERROR"
    assert "secret" not in str(exc.value.detail)


def test_preview_auth_and_validation(monkeypatch):
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    calls = []

    async def fake_fetch(url, headers, user_id):
        calls.append(user_id)
        return [assessment(86), assessment(91, 1)]

    monkeypatch.setattr(main, "fetch_scores", fake_fetch)
    try:
        client = TestClient(main.app)
        path = "/api/chats/health-score-preview"
        assert client.post(path, json={}).status_code == 401
        assert calls == []
        main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
        assert client.post(path, json={"user_id": "victim"}).status_code == 422
        assert client.post(path, json={"mode": "unknown"}).status_code == 422
        assert calls == []
        response = client.post(path, json={"mode": "change"})
        assert response.status_code == 200
        assert response.json()["answer"]["evidence"][0]["previous_value"] == 91
        assert calls == ["owner"]
    finally:
        main.app.dependency_overrides.clear()
