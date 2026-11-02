from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    ROOT
    / "supabase/migrations/20260930055817_persist_diet_used_ingredients.sql"
)
LATER_CREATE_MIGRATION = (
    ROOT
    / "supabase/migrations/20260930090000_menu_image_dataset_matching.sql"
)


def test_migration_persists_diet_used_ingredients_snapshots() -> None:
    sql = MIGRATION.read_text()

    assert "add column if not exists used_ingredients jsonb" in sql
    assert "used_ingredients is null" in sql
    assert "or jsonb_typeof(used_ingredients) = 'array'" in sql
    assert "v_meal_input -> 'used_ingredients'" in sql
    assert "used_ingredients = v_used_ingredients" in sql
    assert "security invoker" in sql
    assert "to service_role" in sql


def test_later_create_rpc_keeps_used_ingredients_snapshot() -> None:
    sql = LATER_CREATE_MIGRATION.read_text()

    assert "v_meal_input -> 'used_ingredients'" in sql
    assert "used_ingredients, status" in sql
    assert "v_used_ingredients" in sql
