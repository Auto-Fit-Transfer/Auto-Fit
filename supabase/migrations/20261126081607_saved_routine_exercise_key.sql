-- Keep the catalog key with each saved routine item and its immutable session
-- snapshot so the app can select the matching exercise voice tip on resume.
alter table public.user_workout_routine_items
  add column exercise_key text;
alter table public.user_workout_routine_items
  add constraint ck_saved_routine_item_exercise_key
  check (exercise_key is null or exercise_key ~ '^ex_[0-9a-f]{8,64}$');

alter table public.saved_routine_session_items
  add column exercise_key text;
alter table public.saved_routine_session_items
  add constraint ck_saved_routine_snapshot_exercise_key
  check (exercise_key is null or exercise_key ~ '^ex_[0-9a-f]{8,64}$');

create or replace function public.start_saved_workout_routine(
  p_user_id uuid, p_routine_id uuid
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_routine public.user_workout_routines%rowtype;
  v_session public.exercise_sessions%rowtype;
  v_items jsonb;
  v_count integer;
  v_goal text;
  v_constraint text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('autofit-exercise-session:' || p_user_id::text, 0)
  );
  select * into v_routine
  from public.user_workout_routines
  where user_workout_routine_id = p_routine_id
    and user_id = p_user_id and status = 'active'
  for update;
  if v_routine.user_workout_routine_id is null then
    raise exception 'Active saved workout routine not found';
  end if;

  if v_routine.source_recommendation_id is not null then
    select recommendation.goal into v_goal
    from public.exercise_recommendations recommendation
    where recommendation.exercise_recommendation_id = v_routine.source_recommendation_id
      and recommendation.user_id = p_user_id;
    if not found then
      raise exception 'Saved routine source recommendation not found';
    end if;
  end if;
  select * into v_session
  from public.exercise_sessions
  where user_id = p_user_id and user_workout_routine_id is not null
    and status = 'in_progress'
  for update;
  if v_session.exercise_session_id is not null
      and v_session.user_workout_routine_id <> p_routine_id then
    raise exception 'Another saved workout routine is in progress';
  end if;
  if v_session.exercise_session_id is null then
    insert into public.exercise_sessions (
      user_id, user_workout_routine_id, saved_routine_goal, planned_item_count
    ) values (p_user_id, p_routine_id, v_goal, 0)
    returning * into v_session;

    insert into public.saved_routine_session_items (
      exercise_session_id, user_id, source_routine_item_id,
      sequence_order, exercise_type_id, exercise_name, exercise_key,
      target_duration_seconds, sets, repetitions, target_weight_kg,
      rest_seconds, instruction, demo_video_url
    )
    select v_session.exercise_session_id, p_user_id,
           item.user_workout_routine_item_id, item.sequence_order,
           item.exercise_type_id, item.exercise_name, item.exercise_key,
           item.target_duration_seconds, item.sets, item.repetitions,
           item.target_weight_kg, item.rest_seconds, item.instruction,
           item.demo_video_url
    from public.user_workout_routine_items item
    where item.user_workout_routine_id = p_routine_id;

    select count(*)::integer into v_count
    from public.saved_routine_session_items
    where exercise_session_id = v_session.exercise_session_id;
    if v_count = 0 or v_count > 30 then
      raise exception 'Saved workout routine must contain 1 to 30 items';
    end if;
    update public.exercise_sessions
    set planned_item_count = v_count
    where exercise_session_id = v_session.exercise_session_id
    returning * into v_session;
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(item) || jsonb_build_object(
      'exercise_item_id', item.saved_routine_session_item_id,
      'user_workout_routine_item_id', item.source_routine_item_id,
      'execution_type', case when item.target_duration_seconds is not null
        then 'time_based' else 'count_based' end,
      'duration_minutes', case when item.target_duration_seconds is not null
        then ceil(item.target_duration_seconds / 60.0)::integer else null end,
      'calories_burned', 0
    ) order by item.sequence_order
  ), '[]'::jsonb) into v_items
  from public.saved_routine_session_items item
  where item.exercise_session_id = v_session.exercise_session_id;
  return jsonb_build_object('session', to_jsonb(v_session), 'items', v_items);
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'uq_active_saved_routine_session_user' then
    raise exception 'Another saved workout routine is in progress';
  end if;
  raise;
end;
$$;
revoke all on function public.start_saved_workout_routine(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_saved_workout_routine(uuid, uuid)
  to service_role;
