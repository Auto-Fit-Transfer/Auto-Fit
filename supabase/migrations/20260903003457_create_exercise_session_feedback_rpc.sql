create or replace function public.save_exercise_session_feedback(
  p_user_id uuid,
  p_session_id uuid,
  p_perceived_difficulty smallint,
  p_post_condition text,
  p_uncomfortable_areas jsonb,
  p_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_feedback public.exercise_session_feedback%rowtype;
begin
  if p_perceived_difficulty is null
     or p_perceived_difficulty < 1
     or p_perceived_difficulty > 5 then
    raise exception 'Perceived difficulty must be between 1 and 5';
  end if;

  if p_post_condition is null
     or p_post_condition not in ('very_bad', 'bad', 'normal', 'good', 'very_good') then
    raise exception 'Invalid post condition';
  end if;

  if jsonb_typeof(coalesce(p_uncomfortable_areas, '[]'::jsonb)) <> 'array' then
    raise exception 'Uncomfortable areas must be a JSON array';
  end if;

  select * into v_session
  from public.exercise_sessions
  where exercise_session_id = p_session_id
    and user_id = p_user_id
    and status in ('completed', 'stopped')
  for update;

  if v_session.exercise_session_id is null then
    raise exception 'Completed or stopped exercise session not found';
  end if;

  insert into public.exercise_session_feedback (
    exercise_session_id,
    user_id,
    perceived_difficulty,
    post_condition,
    uncomfortable_areas,
    note
  ) values (
    p_session_id,
    p_user_id,
    p_perceived_difficulty,
    p_post_condition,
    coalesce(p_uncomfortable_areas, '[]'::jsonb),
    nullif(btrim(p_note), '')
  )
  on conflict (exercise_session_id) do update
  set user_id = excluded.user_id,
      perceived_difficulty = excluded.perceived_difficulty,
      post_condition = excluded.post_condition,
      uncomfortable_areas = excluded.uncomfortable_areas,
      note = excluded.note,
      updated_at = now()
  returning * into v_feedback;

  return to_jsonb(v_feedback);
end;
$$;

revoke all on function public.save_exercise_session_feedback(
  uuid, uuid, smallint, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.save_exercise_session_feedback(
  uuid, uuid, smallint, text, jsonb, text
) to service_role;
