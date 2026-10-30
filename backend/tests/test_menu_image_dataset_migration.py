from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "supabase/migrations/20260930090000_menu_image_dataset_matching.sql"
)


def test_menu_image_dataset_migration_extends_cache_contract() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "add column if not exists meal_type text" in sql
    assert "menu_images_meal_type_check" in sql
    assert "datasets/" not in sql  # storage paths stay data-driven, not batch-specific
    assert "position('..' in image_storage_path) = 0" in sql
    assert "(png|jpg|jpeg|webp)" in sql
    assert "create function public.claim_menu_image" in sql
    assert "p_meal_type text" in sql
    assert "claim_menu_image_generation" in sql
    assert "generation_status = 'generating'" in sql
    assert "metadata ->> 'retryable'" in sql
    assert "interval '30 minutes'" in sql
    assert "to service_role" in sql


def test_daily_diet_rpc_persists_resolved_image_fields() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "create or replace function public.create_diet_recommendation" in sql
    assert "recommendation_note, image_storage_path, menu_image_key, source_type" in sql
    assert "v_meal_input ->> 'image_storage_path'" in sql
    assert "v_meal_input ->> 'menu_image_key'" in sql
    assert "v_ai_meal_count not between 2 and 3" in sql
    assert "from public, anon, authenticated" in sql
