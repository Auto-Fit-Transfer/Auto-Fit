from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    ROOT / "supabase/migrations/20260930002750_preserve_diet_food_order.sql"
)


def test_migration_persists_and_backfills_diet_food_order() -> None:
    sql = MIGRATION.read_text()

    assert "add column if not exists food_order integer" in sql
    assert "partition by diet_meal_id" in sql
    assert "before insert on public.diet_meal_foods" in sql
    assert "unique (diet_meal_id, food_order)" in sql
