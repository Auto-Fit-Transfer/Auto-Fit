from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.app import main


USER = "00000000-0000-4000-8000-000000000001"


def test_weekly_source_summary_uses_saved_goal_and_no_daily_recommendations(monkeypatch):
    class Store:
        def __init__(self, _settings, user_id):
            assert user_id == USER

        async def get(self, *, week_start):
            assert week_start.isoformat() == "2026-11-16"
            return {"result": {"daily_target": {
                "calories_kcal": 2000, "carbohydrate_g": 275,
                "protein_g": 100, "fat_g": 56,
            }}}

    async def logs(*_args, **_kwargs):
        return []

    async def daily(*_args, **_kwargs):
        raise AssertionError("weekly source must not read a daily recommendation")

    monkeypatch.setattr(main, "WeeklyDietStore", Store)
    monkeypatch.setattr(main, "fetch_meal_logs", logs)
    monkeypatch.setattr(main, "fetch_diet_recommendation", daily)
    main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=USER)
    main.app.dependency_overrides[main.get_settings] = lambda: SimpleNamespace()
    try:
        with TestClient(main.app) as client:
            one = client.get("/api/diet/nutrition-summary",
                             params={"date": "2026-11-19", "source": "weekly"})
            week = client.get("/api/diet/summary/weekly",
                              params={"start": "2026-11-16", "source": "weekly"})
        assert one.status_code == 200, one.text
        assert one.json()["summary"]["calories"]["target"] == 2000
        assert week.status_code == 200, week.text
        assert len(week.json()["days"]) == 7
        assert {day["calories"]["target"] for day in week.json()["days"]} == {2000}
    finally:
        main.app.dependency_overrides.pop(main.get_current_user, None)
        main.app.dependency_overrides.pop(main.get_settings, None)


def test_old_weekly_plan_without_goal_does_not_fall_back_to_menu_sum(monkeypatch):
    class Store:
        def __init__(self, _settings, _user_id):
            pass

        async def get(self, *, week_start):
            return {"result": {"daily_target": None}}

    monkeypatch.setattr(main, "WeeklyDietStore", Store)
    main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=USER)
    main.app.dependency_overrides[main.get_settings] = lambda: SimpleNamespace()
    try:
        with TestClient(main.app) as client:
            response = client.get("/api/diet/nutrition-summary",
                                  params={"date": "2026-11-19", "source": "weekly"})
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "DIET_TARGET_UNAVAILABLE"
    finally:
        main.app.dependency_overrides.pop(main.get_current_user, None)
        main.app.dependency_overrides.pop(main.get_settings, None)
