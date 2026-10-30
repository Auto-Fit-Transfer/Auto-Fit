create unique index if not exists exercise_logs_session_item_uidx
on public.exercise_logs (exercise_session_id, exercise_item_id)
where exercise_session_id is not null and exercise_item_id is not null;

create or replace function public.start_exercise_session(
  p_user_id uuid,
  p_recommendation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_planned_count integer;
  v_items jsonb;
begin
  perform 1
  from public.exercise_recommendations
  where exercise_recommendation_id = p_recommendation_id
    and user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active exercise recommendation not found';
  end if;

  select * into v_session
  from public.exercise_sessions
  where user_id = p_user_id
    and exercise_recommendation_id = p_recommendation_id
    and status = 'in_progress'
  order by started_at desc
  limit 1
  for update;

  select count(*)::integer,
         coalesce(jsonb_agg(to_jsonb(i) order by i.sequence_order), '[]'::jsonb)
    into v_planned_count, v_items
  from public.exercise_items i
  where i.exercise_recommendation_id = p_recommendation_id;

  if v_planned_count = 0 then
    raise exception 'Exercise recommendation has no items';
  end if;

  if v_session.exercise_session_id is null then
    insert into public.exercise_sessions (
      user_id, exercise_recommendation_id, planned_item_count
    ) values (
      p_user_id, p_recommendation_id, v_planned_count
    ) returning * into v_session;
  end if;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'items', v_items
  );
end;
$$;

create or replace function public.record_exercise_item_result(
  p_user_id uuid,
  p_session_id uuid,
  p_item_id uuid,
  p_completed boolean,
  p_skipped boolean,
  p_duration_minutes integer default null,
  p_completed_sets integer default null,
  p_performed_repetitions integer default null,
  p_performed_weight_kg numeric default null,
  p_note text default null,
  p_skip_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_item public.exercise_items%rowtype;
  v_log public.exercise_logs%rowtype;
  v_duration integer;
  v_calories numeric;
begin
  if coalesce(p_completed, false) = coalesce(p_skipped, false) then
    raise exception 'Exactly one of completed or skipped must be true';
  end if;
  if p_skipped and nullif(btrim(p_skip_reason), '') is null then
    raise exception 'Skip reason is required';
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

  select * into v_item
  from public.exercise_items
  where exercise_item_id = p_item_id
    and exercise_recommendation_id = v_session.exercise_recommendation_id;

  if v_item.exercise_item_id is null then
    raise exception 'Exercise item does not belong to this session';
  end if;

  v_duration := case when p_completed then coalesce(p_duration_minutes, v_item.duration_minutes, 0) else 0 end;
  v_calories := case when p_completed then coalesce(v_item.calories_burned, 0) else 0 end;

  insert into public.exercise_logs (
    user_id, exercise_item_id, exercise_name, performed_at,
    duration_minutes, calories_burned, intensity, completed, note,
    exercise_session_id, completed_sets, performed_repetitions,
    performed_weight_kg, skipped, skip_reason
  ) values (
    p_user_id, p_item_id, v_item.exercise_name, now(),
    v_duration, v_calories, v_item.intensity, p_completed, nullif(btrim(p_note), ''),
    p_session_id, p_completed_sets, p_performed_repetitions,
    p_performed_weight_kg, p_skipped, nullif(btrim(p_skip_reason), '')
  ) returning * into v_log;

  update public.exercise_sessions
  set completed_item_count = completed_item_count + case when p_completed then 1 else 0 end,
      skipped_item_count = skipped_item_count + case when p_skipped then 1 else 0 end,
      total_duration_seconds = total_duration_seconds + (v_duration * 60),
      total_calories_burned = total_calories_burned + v_calories,
      completion_rate = round(
        ((completed_item_count + case when p_completed then 1 else 0 end)::numeric
          / greatest(planned_item_count, 1)) * 100,
        2
      ),
      updated_at = now()
  where exercise_session_id = p_session_id
  returning * into v_session;

  return jsonb_build_object('session', to_jsonb(v_session), 'log', to_jsonb(v_log));
exception
  when unique_violation then
    raise exception 'Exercise item result already recorded';
end;
$$;

create or replace function public.complete_exercise_session(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_logs jsonb;
begin
  select * into v_session
  from public.exercise_sessions
  where exercise_session_id = p_session_id
    and user_id = p_user_id
    and status = 'in_progress'
  for update;

  if v_session.exercise_session_id is null then
    raise exception 'In-progress exercise session not found';
  end if;
  if v_session.completed_item_count + v_session.skipped_item_count < v_session.planned_item_count then
    raise exception 'All exercise items must be recorded before completion';
  end if;

  update public.exercise_sessions
  set status = 'completed', completed_at = now(), updated_at = now()
  where exercise_session_id = p_session_id
  returning * into v_session;

  update public.exercise_recommendations
  set status = 'completed'
  where exercise_recommendation_id = v_session.exercise_recommendation_id
    and user_id = p_user_id;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.performed_at), '[]'::jsonb)
    into v_logs
  from public.exercise_logs l
  where l.exercise_session_id = p_session_id and l.user_id = p_user_id;

  return jsonb_build_object('session', to_jsonb(v_session), 'logs', v_logs);
end;
$$;

revoke all on function public.start_exercise_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_exercise_item_result(uuid, uuid, uuid, boolean, boolean, integer, integer, integer, numeric, text, text) from public, anon, authenticated;
revoke all on function public.complete_exercise_session(uuid, uuid) from public, anon, authenticated;

grant execute on function public.start_exercise_session(uuid, uuid) to service_role;
grant execute on function public.record_exercise_item_result(uuid, uuid, uuid, boolean, boolean, integer, integer, integer, numeric, text, text) to service_role;
grant execute on function public.complete_exercise_session(uuid, uuid) to service_role;
