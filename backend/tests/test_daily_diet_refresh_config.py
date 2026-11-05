import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

from backend.app import diet_refresh


ROOT = Path(__file__).resolve().parents[2]


def test_refresh_user_query_includes_every_profile(monkeypatch) -> None:
    requested_params: list[dict[str, str]] = []

    class Response:
        def raise_for_status(self) -> None:
            pass

        def json(self) -> list[dict[str, str]]:
            return [{"user_id": "complete"}, {"user_id": "incomplete"}]

    class Client:
        async def get(self, _url, *, headers, params):
            requested_params.append(params)
            return Response()

    @asynccontextmanager
    async def fake_client_scope():
        yield Client()

    monkeypatch.setattr(
        diet_refresh,
        "get_settings",
        lambda: SimpleNamespace(supabase_url="https://example.supabase.co"),
    )
    monkeypatch.setattr(diet_refresh, "service_headers", lambda _settings: {})
    monkeypatch.setattr(diet_refresh, "client_scope", fake_client_scope)

    user_ids = asyncio.run(diet_refresh.fetch_refresh_user_ids())

    assert user_ids == ["complete", "incomplete"]
    assert requested_params == [{
        "select": "user_id",
        "order": "user_id.asc",
        "limit": "1000",
        "offset": "0",
    }]


def test_github_action_runs_at_kst_midnight() -> None:
    workflow = (ROOT / ".github/workflows/daily-diet-refresh.yml").read_text()

    assert '- cron: "0 15 * * *"' in workflow
    assert "secrets.DIET_REFRESH_CRON_TOKEN" in workflow
    assert "/internal/diet-refresh" in workflow
    assert "--retry-all-errors" not in workflow


def test_integrated_stack_keeps_daily_refresh_disabled_until_configured() -> None:
    workflow = (ROOT / ".github/workflows/daily-diet-refresh.yml").read_text()
    compose = (ROOT / "deploy/stack/compose.yaml").read_text()
    example = (ROOT / "deploy/stack/api.env.example").read_text()

    assert "vars.DIET_REFRESH_SCHEDULE_ENABLED == 'true'" in workflow
    assert "API_BASE_URL: ${{ vars.API_BASE_URL }}" in workflow
    assert "onrender.com" not in workflow
    assert "AI_SERVER_BASE_URL:" in compose
    assert "HEALTH_DOCUMENT_OCR_URL:" in compose
    assert "DIET_REFRESH_CRON_TOKEN=" in example


def test_diet_migration_enforces_ai_source_mix() -> None:
    sql = (
        ROOT
        / "supabase/migrations/20261104060214_reconcile_live_diet_functions.sql"
    ).read_text().lower()

    assert "source_type' not in ('db_catalog', 'ai_generated', 'rules_based')" in sql
    assert "v_ai_meal_count not between 2 and 3" in sql
    assert "nullif(v_food_input ->> 'food_item_id', '')::uuid" in sql


def test_regenerate_migration_updates_ai_source_type() -> None:
    sql = (
        ROOT
        / "supabase/migrations/20261104060214_reconcile_live_diet_functions.sql"
    ).read_text().lower()

    assert "v_source_type is not null" in sql
    assert "coalesce(v_source_type, v_meal.source_type)" in sql
    assert "v_source_type not in ('db_catalog', 'ai_generated')" in sql
    assert "source_type = v_source_type" in sql
    assert "security invoker" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
