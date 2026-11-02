from pathlib import Path


MIGRATION = Path(
    "supabase/migrations/20260916064111_health_document_storage.sql"
)
DELETE_MIGRATION = Path(
    "supabase/migrations/20260928090000_delete_health_document.sql"
)


def test_health_document_bucket_is_private_and_bounded() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "'health-documents'" in sql
    assert "false" in sql
    assert "10485760" in sql
    assert "'application/pdf'" in sql
    assert "'image/png'" in sql
    assert "'image/jpeg'" in sql
    assert "'image/heic'" in sql


def test_only_server_role_receives_health_document_dml() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    for table in (
        "public.upload_files",
        "public.ocr_results",
        "public.health_checkups",
        "public.body_compositions",
    ):
        assert (
            f"grant select, insert, update, delete on table {table} to service_role;"
            in sql
        )
    assert "to authenticated" not in sql
    assert "to anon" not in sql


def test_health_document_deletion_is_owner_scoped_atomic_and_service_only() -> None:
    sql = DELETE_MIGRATION.read_text(encoding="utf-8").lower()

    assert "where uploaded_file_id=p_uploaded_file_id" in sql
    assert "and user_id=p_user_id" in sql
    assert "for update" in sql
    assert "processing_status is distinct from 'manually_confirmed'" in sql
    for table in (
        "public.health_assessment_items",
        "public.report_health_scores",
        "public.health_assessments",
        "public.health_checkups",
        "public.body_compositions",
        "public.ocr_results",
        "public.upload_files",
    ):
        assert f"delete from {table}" in sql
    assert "grant execute on function public.delete_health_document(uuid,uuid) to service_role" in sql
    assert "from public,anon,authenticated" in sql
