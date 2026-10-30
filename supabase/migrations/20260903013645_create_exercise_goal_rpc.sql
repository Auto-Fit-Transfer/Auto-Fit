create or replace function public.save_exercise_goal(
  p_user_id uuid,
  p_goal_type text,
  p_weekly_frequency integer,
  p_weekly_duration_minutes integer,
  p_goal_period_weeks integer,
  p_starts_on date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_goal public.exercise_goals%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_goal_type is null or p_goal_type not in (
    'weight_loss',
    'muscle_gain',
    'endurance',
    'maintenance',
    'rehabilitation'
  ) then
    raise exception 'invalid goal_type';
  end if;

  if p_weekly_frequency is null or p_weekly_frequency not between 1 and 7 then
    raise exception 'weekly_frequency must be between 1 and 7';
  end if;

  if p_weekly_duration_minutes is null
     or p_weekly_duration_minutes not between 1 and 10080 then
    raise exception 'weekly_duration_minutes must be between 1 and 10080';
  end if;

  if p_goal_period_weeks is null or p_goal_period_weeks not between 1 and 260 then
    raise exception 'goal_period_weeks must be between 1 and 260';
  end if;

  if p_starts_on is null then
    raise exception 'starts_on is required';
  end if;

  update public.exercise_goals
  set status = 'cancelled',
      updated_at = now()
  where user_id = p_user_id
    and status = 'active'
    and goal_type <> p_goal_type;

  insert into public.exercise_goals (
    user_id,
    goal_type,
    weekly_frequency,
    weekly_duration_minutes,
    goal_period_weeks,
    starts_on,
    ends_on,
    status
  )
  values (
    p_user_id,
    p_goal_type,
    p_weekly_frequency,
    p_weekly_duration_minutes,
    p_goal_period_weeks,
    p_starts_on,
    p_starts_on + (p_goal_period_weeks * 7 - 1),
    'active'
  )
  on conflict (user_id, goal_type) where status = 'active'
  do update set
    weekly_frequency = excluded.weekly_frequency,
    weekly_duration_minutes = excluded.weekly_duration_minutes,
    goal_period_weeks = excluded.goal_period_weeks,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    updated_at = now()
  returning * into v_goal;

  return to_jsonb(v_goal);
end;
$$;

revoke all on function public.save_exercise_goal(
  uuid, text, integer, integer, integer, date
) from public, anon, authenticated;

grant execute on function public.save_exercise_goal(
  uuid, text, integer, integer, integer, date
) to service_role;
