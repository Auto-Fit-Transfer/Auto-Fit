create or replace function public.record_exercise_discomfort(
  p_user_id uuid,
  p_session_id uuid,
  p_item_id uuid,
  p_symptom_type text,
  p_severity smallint,
  p_body_areas jsonb,
  p_detail text,
  p_action_taken text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_discomfort public.exercise_discomfort_logs%rowtype;
  v_adjusted_items jsonb := '[]'::jsonb;
  v_completed_count integer;
  v_skipped_count integer;
begin
  if p_symptom_type not in ('pain', 'fatigue', 'dizziness', 'breathing', 'other') then
    raise exception 'Invalid symptom type';
  end if;
  if p_severity is not null and (p_severity < 0 or p_severity > 10) then
    raise exception 'Severity must be between 0 and 10';
  end if;
  if p_action_taken not in ('adjust', 'stop', 'continue') then
    raise exception 'Invalid action';
  end if;
  if jsonb_typeof(coalesce(p_body_areas, '[]'::jsonb)) <> 'array' then
    raise exception 'Body areas must be a JSON array';
  end if;

  select * into v_session
  from public.exercise_sessions
  where exercise_session_id = p_session_id
    and user_id = p_user_id
    and status = 'in_progress'
  for update;

  if v_session.exercise_session_id is null then
    raise exception 'In-progress exercise session not found';
  end if;

  if p_item_id is not null and not exists (
    select 1
    from public.exercise_items i
    where i.exercise_item_id = p_item_id
      and i.exercise_recommendation_id = v_session.exercise_recommendation_id
  ) then
    raise exception 'Exercise item does not belong to this session';
  end if;

  insert into public.exercise_discomfort_logs (
    exercise_session_id, exercise_item_id, user_id, symptom_type,
    severity, body_areas, detail, action_taken
  ) values (
    p_session_id, p_item_id, p_user_id, p_symptom_type,
    p_severity, coalesce(p_body_areas, '[]'::jsonb),
    nullif(btrim(p_detail), ''), p_action_taken
  ) returning * into v_discomfort;

  if p_action_taken = 'adjust' then
    with adjusted as (
      update public.exercise_items i
      set intensity = case i.intensity
            when 'high' then 'moderate'
            when 'moderate' then 'low'
            else i.intensity
          end,
          duration_minutes = case when i.duration_minutes is null then null
            else greatest(1, ceil(i.duration_minutes * 0.8)::integer) end,
          target_duration_seconds = case when i.target_duration_seconds is null then null
            else greatest(1, ceil(i.target_duration_seconds * 0.8)::integer) end,
          sets = case when i.sets is null then null
            else greatest(1, ceil(i.sets * 0.8)::integer) end,
          repetitions = case when i.repetitions is null then null
            else greatest(1, ceil(i.repetitions * 0.8)::integer) end,
          target_weight_kg = case when i.target_weight_kg is null then null
            else round(i.target_weight_kg * 0.8, 2) end,
          calories_burned = case when i.calories_burned is null then null
            else round(i.calories_burned * 0.8, 2) end
      where i.exercise_recommendation_id = v_session.exercise_recommendation_id
        and (p_item_id is null or i.exercise_item_id <> p_item_id)
        and not exists (
          select 1 from public.exercise_logs l
          where l.exercise_session_id = p_session_id
            and l.exercise_item_id = i.exercise_item_id
        )
      returning i.*
    )
    select coalesce(jsonb_agg(to_jsonb(a) order by a.sequence_order), '[]'::jsonb)
      into v_adjusted_items
    from adjusted a;
  elsif p_action_taken = 'stop' then
    insert into public.exercise_logs (
      user_id, exercise_item_id, exercise_name, performed_at,
      duration_minutes, calories_burned, intensity, completed, note,
      exercise_session_id, skipped, skip_reason
    )
    select p_user_id, i.exercise_item_id, i.exercise_name, now(),
           0, 0, i.intensity, false, null,
           p_session_id, true, '운동 중 상태 변화로 종료'
    from public.exercise_items i
    where i.exercise_recommendation_id = v_session.exercise_recommendation_id
      and not exists (
        select 1 from public.exercise_logs l
        where l.exercise_session_id = p_session_id
          and l.exercise_item_id = i.exercise_item_id
      )
    on conflict (exercise_session_id, exercise_item_id)
      where exercise_session_id is not null and exercise_item_id is not null
      do nothing;

    select count(*) filter (where completed and not skipped)::integer,
           count(*) filter (where skipped)::integer
      into v_completed_count, v_skipped_count
    from public.exercise_logs
    where exercise_session_id = p_session_id and user_id = p_user_id;

    update public.exercise_sessions
    set status = 'stopped',
        completed_at = now(),
        completed_item_count = v_completed_count,
        skipped_item_count = v_skipped_count,
        completion_rate = round((v_completed_count::numeric / greatest(planned_item_count, 1)) * 100, 2),
        updated_at = now()
    where exercise_session_id = p_session_id
    returning * into v_session;

    update public.exercise_recommendations
    set status = 'cancelled'
    where exercise_recommendation_id = v_session.exercise_recommendation_id
      and user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'discomfort', to_jsonb(v_discomfort),
    'session', to_jsonb(v_session),
    'adjusted_items', v_adjusted_items
  );
end;
$$;

revoke all on function public.record_exercise_discomfort(uuid, uuid, uuid, text, smallint, jsonb, text, text)
  from public, anon, authenticated;

grant execute on function public.record_exercise_discomfort(uuid, uuid, uuid, text, smallint, jsonb, text, text)
  to service_role;
