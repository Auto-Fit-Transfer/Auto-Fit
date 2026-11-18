from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.chat_health_scores import Assessment


def test_history_preserves_same_day_assessments_and_authenticated_owner(monkeypatch):
    owner = "00000000-0000-4000-8000-000000000001"
    seen = []

    async def current_user():
        return main.AuthenticatedUser(id=owner)

    async def fake_scores(url, headers, user_id, client=None, *, limit=2):
        seen.append((url, user_id, limit))
        assert headers["apikey"] == "sb_secret_test"
        return [
            Assessment(
                health_assessment_id=UUID("00000000-0000-4000-8000-000000000011"),
                overall_score=Decimal("82.5"),
                assessed_at=datetime(2026, 11, 10, 2, tzinfo=UTC),
            ),
            Assessment(
                health_assessment_id=UUID("00000000-0000-4000-8000-000000000012"),
                overall_score=Decimal("72"),
                assessed_at=datetime(2026, 11, 9, 15, tzinfo=UTC),
            ),
        ]

    main.app.dependency_overrides[main.get_current_user] = current_user
    main.app.dependency_overrides[main.get_settings] = lambda: SimpleNamespace(
        supabase_url="https://test.invalid", supabase_service_role_key="sb_secret_test",
    )
    monkeypatch.setattr(main, "fetch_scores", fake_scores)
    try:
        with TestClient(main.app) as client:
            response = client.get(
                "/api/health/scores/history?limit=12",
                params={"user_id": "00000000-0000-4000-8000-000000000002"},
            )
            invalid = client.get("/api/health/scores/history?limit=51")
    finally:
        main.app.dependency_overrides.pop(main.get_current_user, None)
        main.app.dependency_overrides.pop(main.get_settings, None)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert seen == [("https://test.invalid", owner, 12)]
    assert response.json() == [
        {"health_assessment_id": "00000000-0000-4000-8000-000000000011",
         "assessed_at": "2026-11-10T02:00:00Z", "measured_on": "2026-11-10", "score": 82.5},
        {"health_assessment_id": "00000000-0000-4000-8000-000000000012",
         "assessed_at": "2026-11-09T15:00:00Z", "measured_on": "2026-11-10", "score": 72.0},
    ]
    assert invalid.status_code == 422


def test_new_history_and_summary_routes_require_login():
    main.app.dependency_overrides[main.get_settings] = lambda: SimpleNamespace(
        supabase_url="https://test.invalid",
        supabase_publishable_key="sb_publishable_test",
        supabase_service_role_key="sb_secret_test",
    )
    try:
        client = TestClient(main.app)
        for path in (
            "/api/health/scores/history",
            "/api/diet/summary/weekly?start=2026-11-16",
            "/api/tier/progress",
        ):
            assert client.get(path).status_code == 401
    finally:
        main.app.dependency_overrides.pop(main.get_settings, None)
