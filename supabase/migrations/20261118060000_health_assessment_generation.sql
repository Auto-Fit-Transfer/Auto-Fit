-- A partial assessment may expose the health-data area without inventing a
-- combined score. Legacy rows keep their existing available total.
alter table public.upload_files
  add column source_purge_requested_at timestamptz,
  add column source_purged_at timestamptz;

create index upload_files_health_source_purge_pending
  on public.upload_files (source_purge_requested_at, uploaded_file_id)
  where document_type in ('health_checkup', 'body_composition')
    and source_purge_requested_at is not null and source_purged_at is null;

-- Two concurrent confirm requests must never create two canonical measurements.
create unique index health_checkups_one_row_per_upload
  on public.health_checkups (uploaded_file_id)
  where uploaded_file_id is not null;
create unique index body_compositions_one_row_per_upload
  on public.body_compositions (uploaded_file_id)
  where uploaded_file_id is not null;

alter table public.health_assessments
  alter column overall_score drop not null,
  add column score_status text not null default 'available',
  add column health_data_status text not null default 'unavailable',
  add column health_data_score numeric(5,2),
  add column needs_score_refresh boolean not null default false,
  add column analysis_key text unique;

alter table public.health_assessments
  add constraint health_assessments_score_status_valid check (
    (score_status = 'available' and overall_score is not null)
    or (score_status = 'partial' and overall_score is null)
  ),
  add constraint health_assessments_health_data_status_valid check (
    (health_data_status = 'available' and health_data_score is not null)
    or (health_data_status = 'unavailable' and health_data_score is null)
  ),
  add constraint health_assessments_health_data_score_range check (
    health_data_score is null or health_data_score between 0 and 100
  ),
  add constraint health_assessments_analysis_key_valid check (
    analysis_key is null or analysis_key ~ '^[0-9a-f]{64}$'
  ),
  add constraint health_assessments_refresh_only_partial check (
    not needs_score_refresh or score_status = 'partial'
  );

comment on column public.health_assessments.health_data_score is
  'Independent health-data area score; never substitute for overall_score.';

create function public.save_generated_health_assessment(
  p_user_id uuid,
  p_health_checkup_id uuid,
  p_body_composition_id uuid,
  p_analysis_key text,
  p_score_status text,
  p_overall_score numeric,
  p_health_data_status text,
  p_health_data_score numeric,
  p_needs_score_refresh boolean,
  p_summary text,
  p_model_name text,
  p_model_version text,
  p_input_snapshot jsonb,
  p_raw_result jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment_id uuid;
  v_created boolean := false;
begin
  if p_user_id is null or p_health_checkup_id is null or p_body_composition_id is null
     or p_analysis_key !~ '^[0-9a-f]{64}$' or p_analysis_key is null then
    raise exception 'Health assessment source and key are required' using errcode = '22023';
  end if;
  if p_score_status not in ('available', 'partial')
     or (p_score_status = 'available') is distinct from (p_overall_score is not null)
     or p_health_data_status not in ('available', 'unavailable')
     or (p_health_data_status = 'available') is distinct from (p_health_data_score is not null)
     or p_needs_score_refresh is null
     or (p_needs_score_refresh and p_score_status <> 'partial')
     or jsonb_typeof(p_input_snapshot) is distinct from 'object'
     or jsonb_typeof(p_raw_result) is distinct from 'object'
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) > 32 then
    raise exception 'Invalid health assessment payload' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.health_checkups
    where health_checkup_id = p_health_checkup_id and user_id = p_user_id
  ) or not exists (
    select 1 from public.body_compositions
    where body_composition_id = p_body_composition_id and user_id = p_user_id
  ) then
    raise exception 'Health assessment sources are not owned by user' using errcode = '23503';
  end if;

  insert into public.health_assessments (
    user_id, health_checkup_id, body_composition_id, overall_score,
    overall_status, score_status, health_data_status, health_data_score,
    needs_score_refresh,
    analysis_key, summary, model_name, model_version, input_snapshot, raw_result
  ) values (
    p_user_id, p_health_checkup_id, p_body_composition_id, p_overall_score,
    p_score_status, p_score_status, p_health_data_status, p_health_data_score,
    p_needs_score_refresh,
    p_analysis_key, p_summary, p_model_name, p_model_version, p_input_snapshot, p_raw_result
  ) on conflict (analysis_key) do nothing
  returning health_assessment_id into v_assessment_id;

  if v_assessment_id is null then
    select health_assessment_id into v_assessment_id
    from public.health_assessments
    where analysis_key = p_analysis_key and user_id = p_user_id
      and health_checkup_id = p_health_checkup_id
      and body_composition_id = p_body_composition_id;
    if v_assessment_id is null then
      raise exception 'Health assessment key conflicts with another source' using errcode = '23505';
    end if;
  else
    v_created := true;
    insert into public.health_assessment_items (
      health_assessment_id, metric_type, metric_name, metric_value,
      metric_unit, metric_score, evaluation_status, evaluation, sequence_order
    )
    select v_assessment_id, item.metric_type, item.metric_name, item.metric_value,
           item.metric_unit, item.metric_score, item.evaluation_status,
           item.evaluation, item.sequence_order
    from jsonb_to_recordset(p_items) as item(
      metric_type text, metric_name text, metric_value numeric,
      metric_unit text, metric_score numeric, evaluation_status text,
      evaluation text, sequence_order integer
    );
  end if;

  return jsonb_build_object('health_assessment_id', v_assessment_id, 'created', v_created);
end;
$$;

revoke all on function public.save_generated_health_assessment(
  uuid, uuid, uuid, text, text, numeric, text, numeric, boolean, text, text,
  text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.save_generated_health_assessment(
  uuid, uuid, uuid, text, text, numeric, text, numeric, boolean, text, text,
  text, jsonb, jsonb, jsonb
) to service_role;

-- A bounded, cursor-based sweep revisits only users whose latest score is
-- partial. Once a later total exists, that user disappears from this list.
create function public.list_pending_health_score_users(
  p_after_user_id uuid default null,
  p_limit integer default 25
)
returns table(user_id uuid)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid pending score page size' using errcode = '22023';
  end if;
  return query
  select newest.user_id
  from (
    select distinct on (ha.user_id) ha.user_id, ha.score_status,
           ha.needs_score_refresh
    from public.health_assessments ha
    where p_after_user_id is null or ha.user_id > p_after_user_id
    order by ha.user_id, ha.assessed_at desc, ha.health_assessment_id desc
  ) newest
  where newest.score_status = 'partial' and newest.needs_score_refresh
  order by newest.user_id
  limit p_limit;
end;
$$;

revoke all on function public.list_pending_health_score_users(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_pending_health_score_users(uuid, integer)
  to service_role;
