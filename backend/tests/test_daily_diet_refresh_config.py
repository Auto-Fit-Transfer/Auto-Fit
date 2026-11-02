from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_github_action_runs_at_kst_midnight() -> None:
    workflow = (ROOT / ".github/workflows/daily-diet-refresh.yml").read_text()

    assert "- cron: \"0 15 * * *\"" in workflow
    assert "secrets.DIET_REFRESH_CRON_TOKEN" in workflow
    assert "inputs.all_ai" in workflow
    assert "X-Diet-Refresh-Mode" in workflow
    assert "/internal/diet-refresh" in workflow


def test_diet_migration_enforces_ai_source_mix() -> None:
    sql = (
        ROOT
        / "supabase/migrations/20260928082133_daily_ai_diet_refresh.sql"
    ).read_text()

    assert "source_type in ('db_catalog', 'ai_generated')" in sql
    assert "v_ai_meal_count not between 2 and 3" in sql
    assert "nullif(v_food_input ->> 'food_item_id', '')::uuid" in sql


def test_latest_diet_migration_allows_four_ai_meals_and_serializes_writes() -> None:
    sql = (
        ROOT
        / "supabase/migrations/20260929013617_allow_four_ai_diet_meals.sql"
    ).read_text()
    assert "v_ai_meal_count not between 2 and 4" in sql
    assert "pg_catalog.pg_advisory_xact_lock" in sql


def test_regeneration_migration_updates_source_type_with_safe_rollout() -> None:
    sql = (
        ROOT
        / "supabase/migrations/20260929044540_update_regenerated_meal_source_type.sql"
    ).read_text()

    assert "security invoker" in sql
    assert "v_source_type := coalesce(v_source_type, v_meal.source_type)" in sql
    assert "source_type = v_source_type" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql


def test_render_blueprint_declares_ai_regeneration_settings() -> None:
    blueprint = (ROOT / "render.yaml").read_text()

    assert "key: CHAT_AI_ENABLED" in blueprint
    assert "key: CHAT_AI_URL" in blueprint
    assert "key: CHAT_AI_API_KEY" in blueprint
