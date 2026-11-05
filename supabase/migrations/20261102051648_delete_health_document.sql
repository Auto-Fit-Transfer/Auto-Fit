-- Atomically remove one user-owned health document and all database rows
-- derived from it. Storage bytes are removed by FastAPI before this RPC.
create function public.delete_health_document(
  p_uploaded_file_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_upload public.upload_files%rowtype;
  v_health_checkup_id uuid;
  v_body_composition_id uuid;
begin
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Health document deletion requires READ COMMITTED'
      using errcode='0A000';
  end if;

  select * into v_upload
  from public.upload_files
  where uploaded_file_id=p_uploaded_file_id
    and user_id=p_user_id
    and document_type in ('health_checkup','body_composition')
  for update;

  if not found then
    raise exception 'Health document not found' using errcode='P0002';
  end if;
  if v_upload.processing_status is distinct from 'manually_confirmed' then
    raise exception 'Only confirmed health documents can be deleted'
      using errcode='23514';
  end if;

  select health_checkup_id into v_health_checkup_id
  from public.health_checkups
  where uploaded_file_id=p_uploaded_file_id and user_id=p_user_id
  limit 1;

  select body_composition_id into v_body_composition_id
  from public.body_compositions
  where uploaded_file_id=p_uploaded_file_id and user_id=p_user_id
  limit 1;

  -- An assessment becomes invalid when either of its source measurements is
  -- removed. Delete its children first to satisfy the repository's logical
  -- reference guards, then remove the document-owned rows.
  delete from public.health_assessment_items
  where health_assessment_id in (
    select health_assessment_id from public.health_assessments
    where user_id=p_user_id
      and (health_checkup_id=v_health_checkup_id
        or body_composition_id=v_body_composition_id)
  );

  delete from public.report_health_scores
  where health_assessment_id in (
    select health_assessment_id from public.health_assessments
    where user_id=p_user_id
      and (health_checkup_id=v_health_checkup_id
        or body_composition_id=v_body_composition_id)
  );

  delete from public.health_assessments
  where user_id=p_user_id
    and (health_checkup_id=v_health_checkup_id
      or body_composition_id=v_body_composition_id);

  delete from public.health_checkups
  where uploaded_file_id=p_uploaded_file_id and user_id=p_user_id;

  delete from public.body_compositions
  where uploaded_file_id=p_uploaded_file_id and user_id=p_user_id;

  delete from public.ocr_results
  where uploaded_file_id=p_uploaded_file_id;

  delete from public.upload_files
  where uploaded_file_id=p_uploaded_file_id and user_id=p_user_id;

  return jsonb_build_object(
    'uploaded_file_id', p_uploaded_file_id,
    'document_type', v_upload.document_type,
    'health_checkup_id', v_health_checkup_id,
    'body_composition_id', v_body_composition_id
  );
end $$;

revoke all on function public.delete_health_document(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.delete_health_document(uuid,uuid) to service_role;
