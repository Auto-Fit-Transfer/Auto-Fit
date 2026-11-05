import asyncio
from decimal import Decimal

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import analysis_popups as popups, main
from backend.tests.test_main import TEST_SETTINGS

AID = "20260916-0000-4000-8000-000000000006"
BID = "20260916-0000-4000-8000-000000000003"
CID = "20260916-0000-4000-8000-000000000004"


def assessment(criteria=None, context=None):
    return {"health_assessment_id": AID, "body_composition_id": BID, "health_checkup_id": CID,
            "input_snapshot": {"popup_context": context or {}},
            "raw_result": {"popup_criteria": criteria or {}}}


def rule(cid):
    return {"criteria_id": cid, "version": popups.CRITERIA_VERSION}


def indexed(result):
    return {m.key: m for m in result.metrics}


def test_legacy_calculates_values_without_inventing_criteria():
    result = popups.build_popups(assessment(), {"weight_kg": "68.4", "height_cm": "175.14", "body_fat_percentage": "32"}, {})
    m = indexed(result)
    assert m["body_fat_mass_kg"].display_value == "21.9"
    assert m["body_fat_mass_kg"].value_origin == "calculated"
    assert m["bmi"].display_value == "22.3"
    assert all(x.status == "unknown" for x in result.metrics)
    assert result.sources == []
    assert not result.criteria_snapshot_available


@pytest.mark.parametrize("value,status", [("18.49", "low"), ("18.5", "normal"), ("22.95", "normal"), ("23", "caution"), ("25", "high")])
def test_bmi_uses_unrounded_value(value, status):
    a = assessment({"bmi": rule("kr-adult-bmi")}, {"adult_eligibility_confirmed": True})
    result = popups.build_popups(a, {"bmi": value}, {})
    assert indexed(result)["bmi"].status == status
    assert result.sources[0].source_id == "S1"


@pytest.mark.parametrize("value,status", [("17.99", "low"), ("18", "normal"), ("28", "normal"), ("28.01", "high"), ("32", "high")])
def test_manufacturer_boundary_and_source_scope(value, status):
    a = assessment({"body_fat_percentage": rule("inbody-public-pbf-adult-female")},
                   {"adult_eligibility_confirmed": True, "inbody_record_verified": True, "sex": "female"})
    result = popups.build_popups(a, {"body_fat_percentage": value}, {})
    assert indexed(result)["body_fat_percentage"].status == status
    assert [s.source_id for s in result.sources] == ["S2"]
    assert result.sources[0].applied_metric_keys == ["body_fat_percentage"]
    assert result.sources[0].published_at is None


@pytest.mark.parametrize("context", [{}, {"adult_eligibility_confirmed": True},
                                     {"adult_eligibility_confirmed": True, "inbody_record_verified": True}])
def test_missing_eligibility_or_sex_defers(context):
    a = assessment({"body_fat_percentage": rule("inbody-public-pbf-adult-female")}, context)
    assert indexed(popups.build_popups(a, {"body_fat_percentage": 32}, {}))["body_fat_percentage"].status == "unknown"


def test_unknown_version_and_demo_rule_do_not_enable_criteria():
    a = assessment({"bmi": {"criteria_id": "kr-adult-bmi", "version": "future"},
                    "body_fat_percentage": rule("demo-pbf-32")}, {"adult_eligibility_confirmed": True})
    assert popups.build_popups(a, {"bmi": 22.3, "body_fat_percentage": 32}, {}).sources == []


def test_snapshot_values_override_changed_records():
    a = assessment()
    a["input_snapshot"]["body_composition"] = {"weight_kg": "68.4", "body_fat_percentage": "32"}
    result = indexed(popups.build_popups(a, {"weight_kg": 99, "body_fat_percentage": 18}, {}))
    assert result["weight_kg"].display_value == "68.4"
    assert result["body_fat_mass_kg"].display_value == "21.9"


@pytest.mark.parametrize("data,key", [({"weight_kg": 0}, "bmi"), ({"weight_kg": 68, "body_fat_mass_kg": 70}, "body_fat_percentage"),
                                      ({"weight_kg": 68, "skeletal_muscle_mass_kg": 70}, "skeletal_muscle_mass_kg"),
                                      ({"body_fat_percentage": "NaN"}, "body_fat_percentage"),
                                      ({"height_cm": 0, "bmi": 22}, "bmi")])
def test_inconsistent_or_nonfinite_values_are_reviewed(data, key):
    result = popups.build_popups(assessment(), data, {})
    assert indexed(result)[key].status == "review_required"
    assert result.interpretation.rule_id == "confirm_values"


def test_reported_and_calculated_bmi_crossing_threshold_requires_review():
    a = assessment({"bmi": rule("kr-adult-bmi")}, {"adult_eligibility_confirmed": True})
    m = indexed(popups.build_popups(a, {"weight_kg": 80, "height_cm": 170, "bmi": 22}, {}))["bmi"]
    assert m.raw_value == "22"
    assert m.discrepancy is not None
    assert m.status == "review_required"


@pytest.mark.parametrize("value,status", [("99.9", "normal"), ("100", "caution"), ("125.9", "caution"), ("126", "high")])
def test_glucose_fasting_and_low_side_review(value, status):
    a = assessment({"fasting_glucose": rule("kdca-fasting-glucose")},
                   {"adult_eligibility_confirmed": True, "fasting_confirmed": True, "glucose_low_side_reviewed": True})
    assert indexed(popups.build_popups(a, {}, {"fasting_glucose": value}))["fasting_glucose"].status == status
    a["input_snapshot"]["popup_context"]["fasting_confirmed"] = False
    assert indexed(popups.build_popups(a, {}, {"fasting_glucose": value}))["fasting_glucose"].status == "unknown"


@pytest.mark.parametrize("sbp,dbp,status", [(119,79,"normal"), (120,79,"caution"), (119,80,"caution"), (140,79,"high"), (119,90,"high")])
def test_bp_uses_both_values(sbp, dbp, status):
    a = assessment({k: rule("kdca-blood-pressure") for k in ["systolic_bp", "diastolic_bp"]},
                   {"adult_eligibility_confirmed": True, "bp_low_side_reviewed": True})
    result = indexed(popups.build_popups(a, {}, {"systolic_bp": sbp, "diastolic_bp": dbp}))
    assert result["systolic_bp"].status == result["diastolic_bp"].status == status
    result = indexed(popups.build_popups(a, {}, {"systolic_bp": sbp}))
    assert result["systolic_bp"].status == "unknown"


def test_decimal_round_half_up_and_no_kg_threshold():
    assert popups.display(Decimal("21.85")) == "21.9"
    m = indexed(popups.build_popups(assessment(), {"body_fat_mass_kg": 21.9, "skeletal_muscle_mass_kg": 21}, {}))
    assert m["body_fat_mass_kg"].status == m["skeletal_muscle_mass_kg"].status == "unknown"


def test_report_reference_range_and_label_only_are_preserved():
    a = assessment({"skeletal_muscle_mass_kg": {"criteria_id": "measurement-report-reference",
                    "version": "measurement-report-v1", "record_id": BID, "report_verified": True,
                    "lower": "22", "upper": "30", "reported_status": "low", "url": "https://unregistered.invalid"}})
    result = popups.build_popups(a, {"skeletal_muscle_mass_kg": 21}, {})
    assert indexed(result)["skeletal_muscle_mass_kg"].status == "low"
    assert len(indexed(result)["skeletal_muscle_mass_kg"].ranges) == 3
    assert result.sources[0].url is None
    a["raw_result"]["popup_criteria"]["skeletal_muscle_mass_kg"].pop("lower")
    a["raw_result"]["popup_criteria"]["skeletal_muscle_mass_kg"].pop("upper")
    result = popups.build_popups(a, {"skeletal_muscle_mass_kg": 21}, {})
    assert indexed(result)["skeletal_muscle_mass_kg"].status == "low"
    assert indexed(result)["skeletal_muscle_mass_kg"].ranges == []


def test_report_requires_verified_matching_record_and_defers_conflicts():
    report = {"criteria_id": "measurement-report-reference", "version": "measurement-report-v1",
              "record_id": "other-record", "report_verified": True, "reported_status": "low"}
    a = assessment({"skeletal_muscle_mass_kg": report})
    assert indexed(popups.build_popups(a, {"skeletal_muscle_mass_kg": 21}, {}))["skeletal_muscle_mass_kg"].status == "unknown"
    report.update(record_id=BID, lower="20", upper="30")
    assert indexed(popups.build_popups(a, {"skeletal_muscle_mass_kg": 21}, {}))["skeletal_muscle_mass_kg"].status == "review_required"


def test_same_rounded_value_on_opposite_sides_still_requires_review():
    a = assessment({"bmi": rule("kr-adult-bmi")}, {"adult_eligibility_confirmed": True})
    m = indexed(popups.build_popups(a, {"bmi": "22.95", "height_cm": "200", "weight_kg": "92"}, {}))["bmi"]
    assert m.display_value == "23.0"
    assert m.status == "review_required"


def test_invalid_sex_and_snapshot_metadata_do_not_leak():
    a = assessment({"body_fat_percentage": rule("inbody-public-pbf-adult-female")},
                   {"adult_eligibility_confirmed": True, "inbody_record_verified": True, "sex": {"secret": "private"}})
    result = popups.build_popups(a, {"body_fat_percentage": 32}, {})
    assert result.sources == []
    assert "private" not in result.model_dump_json()


def test_inverted_bp_is_reviewed_even_without_criteria():
    result = indexed(popups.build_popups(assessment(), {}, {"systolic_bp": 80, "diastolic_bp": 120}))
    assert result["systolic_bp"].status == result["diastolic_bp"].status == "review_required"


def test_reported_bmi_range_conflict_is_reviewed_even_at_same_display_precision():
    a = assessment({"bmi": {"criteria_id": "measurement-report-reference", "version": "measurement-report-v1",
                             "record_id": BID, "report_verified": True, "lower": "18.5", "upper": "22.99"}})
    m = indexed(popups.build_popups(a, {"bmi": "22.95", "height_cm": "200", "weight_kg": "92"}, {}))["bmi"]
    assert m.status == "review_required"


def test_all_normal_body_summary_has_three_evidence_metrics():
    criteria = {"bmi": rule("kr-adult-bmi"), "body_fat_percentage": rule("inbody-public-pbf-adult-female"),
                "skeletal_muscle_mass_kg": {"criteria_id": "measurement-report-reference", "version": "measurement-report-v1", "record_id": BID, "report_verified": True, "reported_status": "normal"}}
    a = assessment(criteria, {"adult_eligibility_confirmed": True, "inbody_record_verified": True, "sex": "female"})
    result = popups.build_popups(a, {"bmi": 22, "body_fat_percentage": 22, "skeletal_muscle_mass_kg": 25}, {})
    assert result.interpretation.rule_id == "all_body_metrics_normal"
    assert len(result.interpretation.evidence_metric_keys) == 3


def mock_client(monkeypatch, responses, calls):
    real = httpx.AsyncClient
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=responses.pop(0))
    monkeypatch.setattr(popups.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))


def test_every_database_read_is_owner_scoped(monkeypatch):
    calls = []
    mock_client(monkeypatch, [[assessment()], [{"weight_kg": 68}], [{"fasting_glucose": 108}]], calls)
    result = asyncio.run(popups.fetch_popup_data(None, "owner", TEST_SETTINGS))
    assert str(result.assessment_id) == AID
    assert len(calls) == 3
    assert all(r.url.params["user_id"] == "eq.owner" for r in calls)
    assert calls[1].url.params["body_composition_id"] == f"eq.{BID}"
    assert calls[2].url.params["health_checkup_id"] == f"eq.{CID}"
    assert calls[0].url.params["assessed_at"].startswith("lte.")


def test_other_user_or_missing_assessment_returns_404_before_link_reads(monkeypatch):
    calls = []
    mock_client(monkeypatch, [[]], calls)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(popups.fetch_popup_data(AID, "other-user", TEST_SETTINGS))
    assert exc.value.status_code == 404
    assert len(calls) == 1


def test_cross_owner_link_blocks_snapshot_values(monkeypatch):
    calls = []
    a = assessment()
    a["input_snapshot"]["body_composition"] = {"weight_kg": 68}
    mock_client(monkeypatch, [[a], [], [{}]], calls)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(popups.fetch_popup_data(AID, "owner", TEST_SETTINGS))
    assert exc.value.status_code == 404


def test_bad_upstream_payload_becomes_502(monkeypatch):
    calls = []
    mock_client(monkeypatch, [{"secret": "do not return"}], calls)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(popups.fetch_popup_data(AID, "owner", TEST_SETTINGS))
    assert exc.value.status_code == 502
    assert "secret" not in str(exc.value.detail)


def test_endpoints_auth_uuid_and_response_schema(monkeypatch):
    async def fake_fetch(assessment_id, user_id, settings):
        assert user_id == "owner"
        return popups.build_popups(assessment(), {"weight_kg": 68.4}, {})
    monkeypatch.setattr(popups, "fetch_popup_data", fake_fetch)
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        client = TestClient(main.app)
        assert client.get(f"/api/health-assessments/{AID}/popups").status_code == 401
        main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id="owner")
        assert client.get("/api/health-assessments/not-a-uuid/popups").status_code == 422
        for path in [f"/api/health-assessments/{AID}/popups", "/api/health-assessments/latest/popups"]:
            response = client.get(path)
            assert response.status_code == 200
            assert response.json()["assessment_id"] == AID
            assert "input_snapshot" not in response.json()
        schema = main.app.openapi()
        assert "PopupResponse" in schema["components"]["schemas"]
        assert schema["paths"]["/api/health-assessments/{assessment_id}/popups"]["get"]["security"]
    finally:
        main.app.dependency_overrides.clear()
