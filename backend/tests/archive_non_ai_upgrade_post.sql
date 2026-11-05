do $$
declare
  v_generator text;
  v_recommendation_status text;
  v_session_status text;
  v_log_count integer;
  v_feedback_count integer;
begin
  select generator, status into v_generator, v_recommendation_status
  from public.exercise_recommendations
  where exercise_recommendation_id = '00000000-0000-4000-8000-000000000211';
  select status into v_session_status
  from public.exercise_sessions
  where exercise_session_id = '00000000-0000-4000-8000-000000000213';
  select count(*) into v_log_count
  from public.exercise_logs
  where exercise_session_id = '00000000-0000-4000-8000-000000000213';
  select count(*) into v_feedback_count
  from public.exercise_session_feedback
  where exercise_session_id = '00000000-0000-4000-8000-000000000213';

  if v_generator <> 'legacy' or v_recommendation_status <> 'cancelled'
     or v_session_status <> 'stopped' or v_log_count <> 1
     or v_feedback_count <> 1 then
    raise exception 'Non-AI exercise archive did not preserve records in a read-only state';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.exercise_recommendations'::regclass
      and conname = 'exercise_recommendations_ai_or_archived_check'
  ) then
    raise exception 'AI-only archive constraint was not restored';
  end if;

  begin
    update public.exercise_session_feedback
    set note = '수정 시도'
    where exercise_session_id = '00000000-0000-4000-8000-000000000213';
    raise exception 'Archived feedback was modified';
  exception when others then
    if sqlerrm <> 'Archived exercise records are read-only' then
      raise;
    end if;
  end;
end;
$$;
rollback;
