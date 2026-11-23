-- End an AI recommendation or saved routine when the user explicitly taps Stop.
-- Keep recorded items; mark only untouched items as skipped.
create function public.stop_exercise_session(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_completed_count integer;
  v_skipped_count integer;
  v_logs jsonb;
begin
  select * into v_session
  from public.exercise_sessions
  where exercise_session_id = p_session_id and user_id = p_user_id
  for update;

  if v_session.exercise_session_id is null then
    raise exception 'EXERCISE_SESSION_NOT_FOUND';
  end if;
  if v_session.status not in ('in_progress', 'stopped') then
    raise exception 'EXERCISE_SESSION_NOT_STOPPABLE';
  end if;

  if v_session.status = 'in_progress' then
    if v_session.user_workout_routine_id is not null then
      insert into public.exercise_logs (
        user_id, saved_routine_session_item_id, exercise_name, performed_at,
        duration_minutes, calories_burned, completed, exercise_session_id,
        skipped, skip_reason
      )
      select p_user_id, item.saved_routine_session_item_id,
             item.exercise_name, now(), 0, 0, false, p_session_id,
             true, '사용자가 운동 중단'
      from public.saved_routine_session_items item
      where item.exercise_session_id = p_session_id and item.user_id = p_user_id
        and not exists (
          select 1 from public.exercise_logs logged
          where logged.exercise_session_id = p_session_id
            and logged.saved_routine_session_item_id = item.saved_routine_session_item_id
        )
      on conflict (exercise_session_id, saved_routine_session_item_id)
        where exercise_session_id is not null
          and saved_routine_session_item_id is not null
        do nothing;
    else
      insert into public.exercise_logs (
        user_id, exercise_item_id, exercise_name, performed_at,
        duration_minutes, calories_burned, intensity, completed, note,
        exercise_session_id, skipped, skip_reason
      )
      select p_user_id, item.exercise_item_id, item.exercise_name, now(),
             0, 0, item.intensity, false, null,
             p_session_id, true, '사용자가 운동 중단'
      from public.exercise_items item
      where item.exercise_recommendation_id = v_session.exercise_recommendation_id
        and item.plan_session_id is not distinct from v_session.plan_session_id
        and not exists (
          select 1 from public.exercise_logs logged
          where logged.exercise_session_id = p_session_id
            and logged.exercise_item_id = item.exercise_item_id
        )
      on conflict (exercise_session_id, exercise_item_id)
        where exercise_session_id is not null and exercise_item_id is not null
        do nothing;
    end if;

    select count(*) filter (where completed and not skipped)::integer,
           count(*) filter (where skipped)::integer
      into v_completed_count, v_skipped_count
    from public.exercise_logs
    where exercise_session_id = p_session_id and user_id = p_user_id;

    update public.exercise_sessions
    set status = 'stopped', completed_at = now(),
        completed_item_count = v_completed_count,
        skipped_item_count = v_skipped_count,
        completion_rate = round(
          v_completed_count::numeric / greatest(planned_item_count, 1) * 100, 2
        ), updated_at = now()
    where exercise_session_id = p_session_id
    returning * into v_session;

    if v_session.user_workout_routine_id is null then
      -- A stopped weekly date is terminal; future dates remain available.
      update public.exercise_recommendations
      set status = 'completed'
      where exercise_recommendation_id = v_session.exercise_recommendation_id
        and user_id = p_user_id
        and v_session.plan_session_id is not null
        and not exists (
          select 1 from public.exercise_plan_sessions planned
          where planned.exercise_recommendation_id = v_session.exercise_recommendation_id
            and not exists (
              select 1 from public.exercise_sessions finished
              where finished.plan_session_id = planned.exercise_plan_session_id
                and finished.user_id = p_user_id
                and finished.status in ('completed', 'stopped', 'skipped')
            )
        );
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(logged) order by logged.performed_at), '[]'::jsonb)
    into v_logs
  from public.exercise_logs logged
  where logged.exercise_session_id = p_session_id and logged.user_id = p_user_id;

  return jsonb_build_object('session', to_jsonb(v_session), 'logs', v_logs);
end;
$$;

revoke all on function public.stop_exercise_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.stop_exercise_session(uuid, uuid)
  to service_role;
