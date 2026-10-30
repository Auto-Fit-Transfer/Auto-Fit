from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "supabase/migrations/20260916042556_replace_diet_meal.sql"
)


def test_replace_diet_meal_rpc_is_atomic_and_private() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "create or replace function public.replace_diet_meal" in sql
    assert "security invoker" in sql
    assert "set search_path = ''" in sql
    assert "for update of dr" in sql
    assert "for update;" in sql
    assert "dr.user_id = p_user_id" in sql
    assert "v_recommendation.status <> 'active'" in sql
    assert "v_meal.status <> 'recommended'" in sql
    assert "delete from public.diet_meal_foods" in sql
    assert "insert into public.diet_meal_foods" in sql
    assert (
        "revoke all on function public.replace_diet_meal(uuid, uuid, jsonb)"
        in sql
    )
    assert "from public, anon, authenticated" in sql
    assert (
        "grant execute on function public.replace_diet_meal(uuid, uuid, jsonb)"
        in sql
    )
    assert "to service_role" in sql
