from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "supabase/migrations/20260928044131_refresh_health_assessment_personalization.sql"
)


def test_personalization_rpc_merges_json_atomically_and_is_private() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    signature = (
        "function public.refresh_health_assessment_personalization"
        "(uuid, uuid, jsonb, jsonb)"
    )
    assert "create or replace function public.refresh_health_assessment_personalization" in sql
    assert "security invoker" in sql
    assert "set search_path = ''" in sql
    assert "where health_assessment_id = p_assessment_id" in sql
    assert "and user_id = p_user_id" in sql
    assert "jsonb_set(input_snapshot, '{diet_context}'" in sql
    assert "jsonb_set(raw_result, '{total_analysis}'" in sql
    assert f"revoke all on {signature} from public" in sql
    assert f"revoke all on {signature} from anon" in sql
    assert f"revoke all on {signature} from authenticated" in sql
    assert f"grant execute on {signature} to service_role" in sql
