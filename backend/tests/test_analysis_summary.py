import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import analysis_summary as summary, main
from backend.app import analysis_popups as popups
from backend.tests.test_main import TEST_SETTINGS

AID = "20260916-0000-4000-8000-000000000006"


def saved_analysis():
    return {
        "headline": {"title": "목표는 유지하고, 방향은 더 건강하게"},
        "summary": {"title": "근육을 지키며 감량해요", "description": "저장된 평가 요약"},
        "goal": {"text": "결혼식 준비"},
        "strategy": {"title": "체성분 개선", "tags": ["체지방 감량", "근육 유지"], "message": "식단과 운동을 병행해요"},
        "key_metric_keys": ["body_fat_percentage", "skeletal_muscle_mass_kg", "fasting_glucose"],
        "recommendation_reasons": [
            {"title": "체성분을 확인해요", "description": "저장된 분석 근거", "evidence_metric_keys": ["bmi", "weight_kg", "body_fat_mass_kg"]}
        ],
        "final_direction": {"from": "단기간 체중 감량", "to": "근육 유지 기반 체지방 감량"},
    }


def draft_assessment():
    body_id = "20260916-0000-4000-8000-000000000003"
    checkup_id = "20260916-0000-4000-8000-000000000004"
    return {
        "health_assessment_id": AID,
        "body_composition_id": body_id,
        "health_checkup_id": checkup_id,
        "input_snapshot": {
            "goal": {"text": "단기간 체중 감량", "goal_type": "weight_loss", "short_term": True},
            "popup_context": {"adult_eligibility_confirmed": True, "inbody_record_verified": True,
                              "sex": "female", "fasting_confirmed": True, "glucose_low_side_reviewed": True},
        },
        "raw_result": {"popup_criteria": {
            "body_fat_percentage": {"criteria_id": "inbody-public-pbf-adult-female", "version": popups.CRITERIA_VERSION},
            "skeletal_muscle_mass_kg": {"criteria_id": "measurement-report-reference", "version": "measurement-report-v1",
                                        "record_id": body_id, "report_verified": True, "lower": "22", "upper": "30", "reported_status": "low"},
            "fasting_glucose": {"criteria_id": "kdca-fasting-glucose", "version": popups.CRITERIA_VERSION},
        }},
    }


def draft_popup(assessment=None):
    a = assessment or draft_assessment()
    return popups.build_popups(a, {"body_fat_percentage": "32", "skeletal_muscle_mass_kg": "21"},
                               {"fasting_glucose": "108"})


def mock_fetch(monkeypatch, rows, calls):
    real = httpx.AsyncClient

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=rows)

    monkeypatch.setattr(summary.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))


def test_assessment_writer_merges_validated_analysis_without_losing_popup_snapshot():
    prior = {"popup_criteria": {"bmi": {"criteria_id": "kr-adult-bmi"}}, "model_output": {"version": "v1"}}
    merged = summary.attach_main_analysis(prior, saved_analysis())
    assert merged["popup_criteria"] == prior["popup_criteria"]
    assert merged["model_output"] == prior["model_output"]
    assert merged["total_analysis"]["final_direction"]["from"] == "단기간 체중 감량"
    assert "total_analysis" not in prior

    invalid = saved_analysis()
    invalid["key_metric_keys"] = ["unsupported"]
    with pytest.raises(ValidationError):
        summary.attach_main_analysis(prior, invalid)


def test_inventory_snapshot_excludes_expired_zero_and_unavailable_items():
    rows = [
        {"user_food_inventory_id": "20260916-0000-4000-8000-000000000011", "custom_name": "두부",
         "quantity": "1", "expires_on": "2026-09-30", "is_available": True},
        {"user_food_inventory_id": "20260916-0000-4000-8000-000000000012", "custom_name": "우유",
         "quantity": "1", "expires_on": "2026-09-27", "is_available": True},
        {"user_food_inventory_id": "20260916-0000-4000-8000-000000000013", "custom_name": "달걀",
         "quantity": "0", "expires_on": "2026-10-01", "is_available": True},
        {"user_food_inventory_id": "20260916-0000-4000-8000-000000000014", "custom_name": "브로콜리",
         "quantity": "1", "expires_on": "2026-10-01", "is_available": False},
    ]

    result = summary.prepare_inventory_snapshot(rows, reference_date=summary.date(2026, 9, 28))

    assert [item.name for item in result] == ["두부"]
    assert result[0].freshness_status == "expiring_soon"


def test_diet_personalization_uses_only_snapshot_inventory_ids():
    context = {
        "captured_at": "2026-09-28T10:00:00+09:00",
        "inventory": [
            {"inventory_item_id": "20260916-0000-4000-8000-000000000011", "name": "두부",
             "quantity": "1", "unit": "모", "expires_on": "2026-09-29", "freshness_status": "expiring_soon"},
            {"inventory_item_id": "20260916-0000-4000-8000-000000000012", "name": "브로콜리",
             "quantity": "200", "unit": "g", "expires_on": "2026-10-03", "freshness_status": "fresh"},
        ],
        "allergies": ["우유"],
    }

    suggestion, refrigerator = summary.build_diet_personalization(
        context, ["body_fat_percentage", "skeletal_muscle_mass_kg"]
    )

    assert suggestion is not None
    assert "두부" in suggestion.message
    assert [str(value) for value in suggestion.used_inventory_item_ids] == [
        "20260916-0000-4000-8000-000000000011",
        "20260916-0000-4000-8000-000000000012",
    ]
    assert refrigerator is not None
    assert refrigerator.available_count == 2
    assert refrigerator.expiring_soon_items == ["두부"]


def test_diet_personalization_excludes_allergy_conflicts():
    context = {
        "captured_at": "2026-09-28T10:00:00+09:00",
        "inventory": [
            {"inventory_item_id": "20260916-0000-4000-8000-000000000011", "name": "우유",
             "freshness_status": "expiring_soon"},
            {"inventory_item_id": "20260916-0000-4000-8000-000000000012", "name": "브로콜리",
             "freshness_status": "fresh"},
        ],
        "allergies": ["유제품"],
    }

    suggestion, refrigerator = summary.build_diet_personalization(context, ["body_fat_percentage"])

    assert suggestion is not None
    assert suggestion.action_items == ["브로콜리 활용하기"]
    assert "우유" not in suggestion.message
    assert refrigerator is not None
    assert refrigerator.available_count == 2
    assert refrigerator.allergy_excluded_count == 1
    assert refrigerator.expiring_soon_count == 0


def test_verified_snapshot_generates_provisional_copy_and_evidence():
    assessment = draft_assessment()
    result = summary.build_draft_analysis(assessment, draft_popup(assessment))
    assert result is not None
    assert result.summary.title == "이번 분석에서는 체성분과 공복혈당을 함께 확인했어요"
    assert result.key_metric_keys == ["body_fat_percentage", "skeletal_muscle_mass_kg", "fasting_glucose"]
    assert [reason.evidence_metric_keys for reason in result.recommendation_reasons] == [
        ["body_fat_percentage", "skeletal_muscle_mass_kg"], ["fasting_glucose"]]
    assert result.final_direction.from_ == "단기간 체중 감량"


def test_verified_snapshot_adds_refrigerator_personalization_when_captured():
    assessment = draft_assessment()
    assessment["input_snapshot"]["diet_context"] = {
        "captured_at": "2026-09-28T10:00:00+09:00",
        "inventory": [{
            "inventory_item_id": "20260916-0000-4000-8000-000000000011",
            "name": "두부",
            "quantity": "1",
            "unit": "모",
            "expires_on": "2026-09-29",
            "freshness_status": "expiring_soon",
        }],
        "allergies": [],
    }

    result = summary.build_draft_analysis(assessment, draft_popup(assessment))

    assert result is not None
    assert result.diet_suggestion is not None
    assert result.diet_suggestion.evidence_metric_keys == result.key_metric_keys
    assert result.refrigerator_context.expiring_soon_items == ["두부"]


def test_draft_uses_generic_copy_for_other_goal_and_defers_unverified_metrics():
    assessment = draft_assessment()
    assessment["input_snapshot"]["goal"] = {"text": "건강 유지", "goal_type": "maintenance"}
    result = summary.build_draft_analysis(assessment, draft_popup(assessment))
    assert result is not None
    assert result.strategy.title == "확인된 지표를 함께 고려한 목표 점검"
    assert "감량" not in result.final_direction.to
    assessment["input_snapshot"]["popup_context"] = {}
    assessment["raw_result"]["popup_criteria"] = {}
    assert summary.build_draft_analysis(assessment, draft_popup(assessment)) is None
    assessment["input_snapshot"].pop("goal")
    assert summary.build_draft_analysis(assessment, draft_popup(assessment)) is None


def test_latest_reads_only_owners_saved_analysis(monkeypatch):
    calls = []
    saved = saved_analysis()
    saved["assessment_id"] = "20260916-0000-4000-8000-000000000099"
    mock_fetch(monkeypatch, [{"health_assessment_id": AID, "raw_result": {"total_analysis": saved, "private": "never return"}}], calls)
    result = asyncio.run(summary.fetch_main_analysis("owner", TEST_SETTINGS))
    assert result.assessment_id.hex == AID.replace("-", "")
    assert result.final_direction.from_ == "단기간 체중 감량"
    assert "private" not in result.model_dump_json()
    assert calls[0].url.params["user_id"] == "eq.owner"
    assert calls[0].url.params["assessed_at"].startswith("lte.")
    assert calls[0].url.params["order"] == "assessed_at.desc,health_assessment_id.desc"
    assert calls[0].url.params["limit"] == "1"


@pytest.mark.parametrize("rows,status", [
    ([], 404),
    ([{"health_assessment_id": AID, "raw_result": {}}], 404),
    ([{"health_assessment_id": AID, "raw_result": {"total_analysis": {"headline": {"title": "partial"}}}}], 502),
])
def test_missing_or_incomplete_analysis_has_no_fabricated_fallback(monkeypatch, rows, status):
    async def unverified_popup(assessment_id, user_id, settings):
        return popups.build_popups({"health_assessment_id": AID}, {}, {})

    monkeypatch.setattr(summary, "fetch_popup_data", unverified_popup)
    mock_fetch(monkeypatch, rows, [])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(summary.fetch_main_analysis("owner", TEST_SETTINGS))
    assert exc.value.status_code == status


def test_latest_generates_from_verified_snapshot_when_not_saved(monkeypatch):
    assessment = draft_assessment()
    calls = []
    mock_fetch(monkeypatch, [assessment], calls)

    async def verified_popup(assessment_id, user_id, settings):
        assert str(assessment_id) == AID
        assert user_id == "owner"
        return draft_popup(assessment)

    monkeypatch.setattr(summary, "fetch_popup_data", verified_popup)
    result = asyncio.run(summary.fetch_main_analysis("owner", TEST_SETTINGS))
    assert result.key_metric_keys == ["body_fat_percentage", "skeletal_muscle_mass_kg", "fasting_glucose"]
    assert calls[0].url.params["user_id"] == "eq.owner"


def test_rejects_unresolvable_metric_references(monkeypatch):
    saved = saved_analysis()
    saved["recommendation_reasons"][0]["evidence_metric_keys"] = ["basal_metabolic_rate"]
    mock_fetch(monkeypatch, [{"health_assessment_id": AID, "raw_result": {"total_analysis": saved}}], [])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(summary.fetch_main_analysis("owner", TEST_SETTINGS))
    assert exc.value.status_code == 502


def test_supported_metric_keys_match_popup_output():
    from backend.app import analysis_popups

    popup = analysis_popups.build_popups({"health_assessment_id": AID}, {}, {})
    assert {metric.key for metric in popup.metrics} == analysis_popups.POPUP_METRIC_KEYS


def test_endpoint_auth_and_openapi(monkeypatch):
    async def fake_fetch(user_id, settings):
        assert user_id == "owner"
        return summary.MainAnalysisResponse.model_validate({"assessment_id": AID, **saved_analysis()})

    monkeypatch.setattr(summary, "fetch_main_analysis", fake_fetch)
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        client = TestClient(main.app)
        assert client.get("/api/health-assessments/latest").status_code == 401
        main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
        response = client.get("/api/health-assessments/latest")
        assert response.status_code == 200
        assert response.json()["assessment_id"] == AID
        assert response.json()["final_direction"]["from"] == "단기간 체중 감량"
        schema = main.app.openapi()
        assert schema["paths"]["/api/health-assessments/latest"]["get"]["security"]
        assert "MainAnalysisResponse" in schema["components"]["schemas"]
    finally:
        main.app.dependency_overrides.clear()


def test_analysis_input_combines_latest_confirmed_checkup_and_inbody(monkeypatch):
    calls = []
    real = httpx.AsyncClient

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("/health_checkups"):
            return httpx.Response(200, json=[{
                "health_checkup_id": "20260916-0000-4000-8000-000000000004",
                "checkup_date": "2026-09-16",
                "fasting_glucose": "108",
                "systolic_bp": 128,
                "diastolic_bp": 82,
            }])
        if request.url.path.endswith("/body_compositions"):
            return httpx.Response(200, json=[{
                "body_composition_id": "20260916-0000-4000-8000-000000000003",
                "measured_at": "2026-09-17T09:00:00+09:00",
                "weight_kg": "68.4",
                "body_fat_percentage": "32",
                "skeletal_muscle_mass_kg": "21",
            }])
        if request.url.path.endswith("/user_food_inventory"):
            return httpx.Response(200, json=[{
                "user_food_inventory_id": "20260916-0000-4000-8000-000000000011",
                "food_item_id": None,
                "custom_name": "두부",
                "quantity": "1",
                "unit": "모",
                "expires_on": "2099-09-30",
                "is_available": True,
            }])
        if request.url.path.endswith("/user_allergies"):
            return httpx.Response(200, json=[{"allergy_type_id": "allergy-1", "custom_name": None}])
        if request.url.path.endswith("/allergy_types"):
            return httpx.Response(200, json=[{"allergy_type_id": "allergy-1", "name": "우유"}])
        raise AssertionError(f"Unexpected request: {request.url.path}")

    monkeypatch.setattr(summary.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    result = asyncio.run(summary.fetch_analysis_input("owner", TEST_SETTINGS))

    assert result.ready is True
    assert result.missing == []
    assert result.health_checkup.health_checkup_id.hex == "20260916000040008000000000000004"
    assert result.health_checkup.fasting_glucose == 108
    assert result.body_composition.body_composition_id.hex == "20260916000040008000000000000003"
    assert result.body_composition.body_fat_percentage == 32
    assert result.diet_context.inventory[0].name == "두부"
    assert result.diet_context.allergies == ["우유"]
    assert {call.url.params["user_id"] for call in calls if "user_id" in call.url.params} == {"eq.owner"}
    health_calls = [call for call in calls if call.url.path.endswith(("/health_checkups", "/body_compositions"))]
    assert all(call.url.params["limit"] == "1" for call in health_calls)
    assert "raw_data" not in result.model_dump_json()
    assert "user_id" not in result.model_dump_json()


def test_analysis_input_reports_missing_source_without_fabricating_values(monkeypatch):
    real = httpx.AsyncClient

    def handler(request):
        if request.url.path.endswith("/health_checkups"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/body_compositions"):
            return httpx.Response(200, json=[{
                "body_composition_id": "20260916-0000-4000-8000-000000000003",
                "measured_at": "2026-09-17T09:00:00+09:00",
                "weight_kg": "68.4",
            }])
        return httpx.Response(200, json=[])

    monkeypatch.setattr(summary.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    result = asyncio.run(summary.fetch_analysis_input("owner", TEST_SETTINGS))

    assert result.ready is False
    assert result.missing == ["health_checkup"]
    assert result.health_checkup is None
    assert result.body_composition is not None


def test_analysis_input_endpoint_is_authenticated_and_documented(monkeypatch):
    async def fake_fetch(user_id, settings):
        assert user_id == "owner"
        return summary.AnalysisInputResponse(
            ready=False,
            missing=["health_checkup", "body_composition"],
            diet_context=summary.DietContextAnalysisInput(
                captured_at="2026-09-28T10:00:00+09:00",
            ),
        )

    monkeypatch.setattr(summary, "fetch_analysis_input", fake_fetch)
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        client = TestClient(main.app)
        assert client.get("/api/health-assessments/input").status_code == 401
        main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
        response = client.get("/api/health-assessments/input")
        assert response.status_code == 200
        assert response.json() == {
            "ready": False,
            "missing": ["health_checkup", "body_composition"],
            "health_checkup": None,
            "body_composition": None,
            "diet_context": {
                "captured_at": "2026-09-28T10:00:00+09:00",
                "inventory": [],
                "allergies": [],
            },
        }
        operation = main.app.openapi()["paths"]["/api/health-assessments/input"]["get"]
        assert operation["security"]
        assert "AnalysisInputResponse" in main.app.openapi()["components"]["schemas"]
    finally:
        main.app.dependency_overrides.clear()


def test_refresh_diet_personalization_snapshots_and_merges_without_losing_results(monkeypatch):
    calls = []
    real = httpx.AsyncClient
    existing = {
        "health_assessment_id": AID,
        "input_snapshot": {"goal": {"text": "건강 유지"}},
        "raw_result": {"popup_criteria": {"bmi": {"criteria_id": "kr-adult-bmi"}},
                       "total_analysis": saved_analysis()},
    }

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("/health_assessments"):
            return httpx.Response(200, json=[existing])
        assert request.method == "POST"
        assert request.url.path.endswith("/rpc/refresh_health_assessment_personalization")
        payload = json.loads(request.content)
        assert payload["p_user_id"] == "owner"
        assert payload["p_assessment_id"] == AID
        assert payload["p_diet_context"]["inventory"][0]["name"] == "두부"
        assert payload["p_total_analysis"]["diet_suggestion"]["used_inventory_item_ids"] == [
            "20260916-0000-4000-8000-000000000011"
        ]
        return httpx.Response(200, json={"health_assessment_id": AID})

    async def fake_input(user_id, settings):
        assert user_id == "owner"
        return summary.AnalysisInputResponse(
            ready=True,
            missing=[],
            health_checkup={"health_checkup_id": "20260916-0000-4000-8000-000000000004",
                            "checkup_date": "2026-09-16"},
            body_composition={"body_composition_id": "20260916-0000-4000-8000-000000000003",
                              "measured_at": "2026-09-17T09:00:00+09:00"},
            diet_context={
                "captured_at": "2026-09-28T10:00:00+09:00",
                "inventory": [{"inventory_item_id": "20260916-0000-4000-8000-000000000011",
                               "name": "두부", "freshness_status": "fresh"}],
                "allergies": [],
            },
        )

    monkeypatch.setattr(summary.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    monkeypatch.setattr(summary, "fetch_analysis_input", fake_input)

    result = asyncio.run(summary.refresh_diet_personalization(summary.UUID(AID), "owner", TEST_SETTINGS))

    assert result.diet_suggestion is not None
    assert result.refrigerator_context.used_items == ["두부"]
    assert calls[0].url.params["health_assessment_id"] == f"eq.{AID}"
    assert calls[0].url.params["user_id"] == "eq.owner"
    assert calls[1].url.path.endswith("/rpc/refresh_health_assessment_personalization")


def test_refresh_diet_personalization_returns_404_for_missing_owner_row(monkeypatch):
    real = httpx.AsyncClient
    monkeypatch.setattr(
        summary.httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[])), **kwargs),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(summary.refresh_diet_personalization(summary.UUID(AID), "owner", TEST_SETTINGS))

    assert exc.value.status_code == 404


def test_refresh_diet_personalization_endpoint_is_authenticated(monkeypatch):
    async def fake_refresh(assessment_id, user_id, settings):
        assert str(assessment_id) == AID
        assert user_id == "owner"
        return summary.MainAnalysisResponse.model_validate({"assessment_id": AID, **saved_analysis()})

    monkeypatch.setattr(summary, "refresh_diet_personalization", fake_refresh)
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        client = TestClient(main.app)
        path = f"/api/health-assessments/{AID}/diet-personalization/refresh"
        assert client.post(path).status_code == 401
        main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
        response = client.post(path)
        assert response.status_code == 200
        assert response.json()["assessment_id"] == AID
        assert main.app.openapi()["paths"][path.replace(AID, "{assessment_id}")]["post"]["security"]
    finally:
        main.app.dependency_overrides.clear()


def test_main_and_popup_routes_join_on_one_assessment(monkeypatch):
    body_id = "20260916-0000-4000-8000-000000000003"
    checkup_id = "20260916-0000-4000-8000-000000000004"
    row = {
        "health_assessment_id": AID,
        "body_composition_id": body_id,
        "health_checkup_id": checkup_id,
        "input_snapshot": {},
        "raw_result": {"total_analysis": saved_analysis()},
    }
    real = httpx.AsyncClient

    def handler(request):
        assert request.url.params["user_id"] == "eq.owner"
        if request.url.path.endswith("/health_assessments"):
            return httpx.Response(200, json=[row])
        if request.url.path.endswith("/body_compositions"):
            return httpx.Response(200, json=[{"weight_kg": "68.4", "body_fat_percentage": "32", "skeletal_muscle_mass_kg": "21"}])
        if request.url.path.endswith("/health_checkups"):
            return httpx.Response(200, json=[{"fasting_glucose": "108"}])
        raise AssertionError(f"Unexpected request: {request.url.path}")

    monkeypatch.setattr(summary.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
    try:
        client = TestClient(main.app)
        analysis_response = client.get("/api/health-assessments/latest")
        assert analysis_response.status_code == 200
        analysis = analysis_response.json()
        popup_response = client.get(f"/api/health-assessments/{analysis['assessment_id']}/popups")
        assert popup_response.status_code == 200
        popup = popup_response.json()
        assert popup["assessment_id"] == analysis["assessment_id"]
        popup_keys = {metric["key"] for metric in popup["metrics"]}
        assert set(analysis["key_metric_keys"]).issubset(popup_keys)
        assert all(set(reason["evidence_metric_keys"]).issubset(popup_keys) for reason in analysis["recommendation_reasons"])
    finally:
        main.app.dependency_overrides.clear()
