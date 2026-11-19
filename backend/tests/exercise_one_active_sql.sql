-- Run only after the complete migrations on an isolated local Supabase DB.
-- The transaction rolls back every synthetic account and workout.
begin;
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_recommendation uuid;
  v_plan_one uuid;
  v_plan_two uuid;
  v_ai_item uuid;
  v_routine uuid;
  v_source_item uuid;
  v_ai_session uuid;
  v_saved_session uuid;
  v_result jsonb;
begin
  insert into auth.users(id, email, aud, role)
  values (v_owner, 'one-active-' || v_owner::text || '@example.invalid',
          'authenticated', 'authenticated');
  insert into public.exercise_recommendations
    (user_id, recommendation_date, goal, intensity, generator, status)
  values (v_owner, current_date, 'maintenance', 'low', 'auto-fit-ai', 'active')
  returning exercise_recommendation_id into v_recommendation;
  insert into public.exercise_plan_sessions
    (exercise_recommendation_id, session_index, scheduled_date, name, duration_minutes)
  values (v_recommendation, 1, current_date - 1, '첫 운동', 10)
  returning exercise_plan_session_id into v_plan_one;
  insert into public.exercise_plan_sessions
    (exercise_recommendation_id, session_index, scheduled_date, name, duration_minutes)
  values (v_recommendation, 2, current_date, '둘째 운동', 10)
  returning exercise_plan_session_id into v_plan_two;
  insert into public.exercise_items
    (exercise_recommendation_id, plan_session_id, exercise_name,
     sequence_order, duration_minutes, execution_type, exercise_key)
  values (v_recommendation, v_plan_one, '스쿼트', 1, 10, 'time_based', 'synthetic-squat')
  returning exercise_item_id into v_ai_item;
  insert into public.exercise_items
    (exercise_recommendation_id, plan_session_id, exercise_name,
     sequence_order, duration_minutes, execution_type, exercise_key)
  values (v_recommendation, v_plan_two, '스쿼트', 2, 10, 'time_based', 'synthetic-squat');
  insert into public.user_workout_routines(user_id, source_type, name)
  values (v_owner, 'custom', '저장 루틴')
  returning user_workout_routine_id into v_routine;
  insert into public.user_workout_routine_items
    (user_workout_routine_id, sequence_order, exercise_name, sets, repetitions)
  values (v_routine, 1, '스쿼트', 1, 10)
  returning user_workout_routine_item_id into v_source_item;

  v_result := public.start_exercise_plan_session(v_owner, v_recommendation, v_plan_one);
  v_ai_session := (v_result->'session'->>'exercise_session_id')::uuid;
  begin
    perform public.start_saved_workout_routine(v_owner, v_routine);
    raise exception 'Saved routine started during AI workout';
  exception when others then
    if sqlerrm <> 'Another exercise session is in progress' then raise; end if;
  end;
  perform public.record_exercise_item_result(
    v_owner, v_ai_session, v_ai_item, false, true,
    null, null, null, null, null, 'synthetic skip'
  );
  perform public.complete_exercise_session(v_owner, v_ai_session);

  v_result := public.start_saved_workout_routine(v_owner, v_routine);
  v_saved_session := (v_result->'session'->>'exercise_session_id')::uuid;
  if (public.start_saved_workout_routine(v_owner, v_routine)
      ->'session'->>'exercise_session_id')::uuid is distinct from v_saved_session then
    raise exception 'Same saved routine did not resume its active session';
  end if;
  begin
    perform public.record_saved_routine_item_result(
      v_owner, v_saved_session, v_source_item, true, false,
      1, 1, null, null, null, null
    );
    raise exception 'Original routine item ID was accepted as a session item';
  exception when others then
    if sqlerrm <> 'Saved routine item does not belong to this session' then raise; end if;
  end;
  begin
    perform public.start_exercise_plan_session(v_owner, v_recommendation, v_plan_two);
    raise exception 'AI workout started during saved routine';
  exception when others then
    if sqlerrm <> 'Another exercise session is in progress' then raise; end if;
  end;
  perform public.record_saved_routine_discomfort(
    v_owner, v_saved_session, null, 'pain', 5::smallint,
    '[]'::jsonb, 'synthetic', 'stop'
  );
  v_result := public.start_exercise_plan_session(v_owner, v_recommendation, v_plan_two);
  if v_result->'session'->>'status' <> 'in_progress' then
    raise exception 'Next AI workout did not start after saved routine stopped';
  end if;
end;
$$;
rollback;
