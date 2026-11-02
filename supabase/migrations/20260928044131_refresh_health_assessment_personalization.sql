create or replace function public.refresh_health_assessment_personalization(
  p_user_id uuid,
  p_assessment_id uuid,
  p_diet_context jsonb,
  p_total_analysis jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment_id uuid;
begin
  if p_user_id is null or p_assessment_id is null then
    raise exception 'user_id and assessment_id are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_diet_context) is distinct from 'object' then
    raise exception 'diet_context must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_total_analysis) is distinct from 'object' then
    raise exception 'total_analysis must be an object' using errcode = '22023';
  end if;

  update public.health_assessments
  set input_snapshot = jsonb_set(input_snapshot, '{diet_context}', p_diet_context, true),
      raw_result = jsonb_set(raw_result, '{total_analysis}', p_total_analysis, true)
  where health_assessment_id = p_assessment_id
    and user_id = p_user_id
  returning health_assessment_id into v_assessment_id;

  if v_assessment_id is null then
    raise exception 'Health assessment not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('health_assessment_id', v_assessment_id);
end;
$$;

revoke all on function public.refresh_health_assessment_personalization(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.refresh_health_assessment_personalization(uuid, uuid, jsonb, jsonb) from anon;
revoke all on function public.refresh_health_assessment_personalization(uuid, uuid, jsonb, jsonb) from authenticated;
grant execute on function public.refresh_health_assessment_personalization(uuid, uuid, jsonb, jsonb) to service_role;
