-- Preserve every AI workout as a dated session while leaving rules_v1 rows unchanged.
create table public.exercise_plan_sessions (
  exercise_plan_session_id uuid primary key default gen_random_uuid(),
  exercise_recommendation_id uuid not null references public.exercise_recommendations(exercise_recommendation_id) on delete cascade,
  session_index integer not null check (session_index between 1 and 3),
  scheduled_date date not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  focus text,
  duration_minutes integer not null check (duration_minutes between 1 and 300),
  created_at timestamptz not null default now(),
  unique (exercise_recommendation_id, session_index),
  unique (exercise_recommendation_id, scheduled_date)
);

alter table public.exercise_plan_sessions enable row level security;
revoke all on public.exercise_plan_sessions from anon, authenticated;
grant select, insert, update, delete on public.exercise_plan_sessions to service_role;

alter table public.exercise_items
  add column plan_session_id uuid references public.exercise_plan_sessions(exercise_plan_session_id);
alter table public.exercise_sessions
  add column plan_session_id uuid references public.exercise_plan_sessions(exercise_plan_session_id);

create index exercise_items_plan_session_idx on public.exercise_items(plan_session_id);
create unique index exercise_sessions_completed_plan_uidx
  on public.exercise_sessions(user_id, plan_session_id)
  where plan_session_id is not null and status in ('in_progress', 'completed');

create or replace function public.create_exercise_recommendation(
  p_user_id uuid,
  p_context_id uuid,
  p_recommendation jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recommendation_id uuid;
  v_linked_context_id uuid;
  v_expected_item_count integer;
  v_max_items integer;
  v_inserted_item_count integer;
  v_result jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  v_expected_item_count := jsonb_array_length(p_items);
  v_max_items := case when p_recommendation->>'generator' = 'auto-fit-ai' then 12 else 10 end;
  if v_expected_item_count < 1 or v_expected_item_count > v_max_items then
    raise exception 'items count is outside the allowed range';
  end if;

  if p_recommendation->>'generator' = 'auto-fit-ai'
     and (p_recommendation->>'catalog_version' !~ '^sha256:[0-9a-f]{64}$'
          or p_recommendation->>'catalog_version' is null) then
    raise exception 'AI exercise catalog version is invalid';
  end if;

  if p_recommendation->>'generator' = 'auto-fit-ai'
     and exists (
       select 1 from jsonb_array_elements(p_items) as item(value)
       where nullif(item.value->>'exercise_key', '') is null
     ) then
    raise exception 'AI exercise key is required';
  end if;

  if p_recommendation->>'generator' = 'auto-fit-ai' and (
    p_recommendation->'plan_sessions' is null
    or jsonb_typeof(p_recommendation->'plan_sessions') <> 'array'
    or jsonb_array_length(p_recommendation->'plan_sessions') not between 1 and 3
  ) then
    raise exception 'AI exercise plan sessions are invalid';
  end if;

  if not exists (
    select 1
    from public.exercise_recommendation_contexts
    where exercise_recommendation_context_id = p_context_id
      and user_id = p_user_id
      and exercise_recommendation_id is null
  ) then
    raise exception 'an unlinked recommendation context was not found';
  end if;

  insert into public.exercise_recommendations (
    user_id,
    recommendation_date,
    goal,
    total_duration_minutes,
    intensity,
    recommendation_summary,
    ai_reason,
    generator,
    catalog_version,
    status
  )
  values (
    p_user_id,
    coalesce((p_recommendation->>'recommendation_date')::date, current_date),
    p_recommendation->>'goal',
    (p_recommendation->>'total_duration_minutes')::integer,
    p_recommendation->>'intensity',
    p_recommendation->>'recommendation_summary',
    p_recommendation->>'ai_reason',
    coalesce(p_recommendation->>'generator', 'rules_v1'),
    p_recommendation->>'catalog_version',
    'active'
  )
  returning exercise_recommendation_id into v_recommendation_id;

  update public.exercise_recommendation_contexts
  set exercise_recommendation_id = v_recommendation_id
  where exercise_recommendation_context_id = p_context_id
    and user_id = p_user_id
    and exercise_recommendation_id is null
  returning exercise_recommendation_context_id into v_linked_context_id;

  if v_linked_context_id is null then
    raise exception 'recommendation context could not be linked';
  end if;

  if p_recommendation->>'generator' = 'auto-fit-ai' then
    insert into public.exercise_plan_sessions (
      exercise_recommendation_id, session_index, scheduled_date, name, focus, duration_minutes
    )
    select v_recommendation_id,
      (session.value->>'session_index')::integer,
      (session.value->>'scheduled_date')::date,
      session.value->>'name',
      session.value->>'focus',
      (session.value->>'duration_minutes')::integer
    from jsonb_array_elements(p_recommendation->'plan_sessions') as session(value);

    if exists (
      select 1 from public.exercise_plan_sessions as planned
      where planned.exercise_recommendation_id = v_recommendation_id
        and (planned.scheduled_date < (p_recommendation->>'recommendation_date')::date
          or planned.scheduled_date >= (p_recommendation->>'recommendation_date')::date + 7)
    ) then
      raise exception 'AI exercise scheduled date is outside the seven-day plan';
    end if;
  end if;

  insert into public.exercise_items (
    exercise_recommendation_id,
    exercise_type_id,
    plan_session_id,
    exercise_key,
    exercise_name,
    sequence_order,
    duration_minutes,
    sets,
    repetitions,
    calories_burned,
    intensity,
    instruction,
    execution_type,
    target_duration_seconds,
    target_weight_kg,
    rest_seconds
  )
  select
    v_recommendation_id,
    exercise_type.exercise_type_id,
    planned.exercise_plan_session_id,
    case when p_recommendation->>'generator' = 'auto-fit-ai'
      then item.value->>'exercise_key' else null end,
    item.value->>'exercise_name',
    item.ordinality::integer,
    nullif(item.value->>'duration_minutes', '')::integer,
    nullif(item.value->>'sets', '')::integer,
    nullif(item.value->>'repetitions', '')::integer,
    nullif(item.value->>'calories_burned', '')::numeric,
    item.value->>'intensity',
    item.value->>'instruction',
    item.value->>'execution_type',
    nullif(item.value->>'target_duration_seconds', '')::integer,
    nullif(item.value->>'target_weight_kg', '')::numeric,
    nullif(item.value->>'rest_seconds', '')::integer
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  join public.exercise_types as exercise_type
    on exercise_type.name = item.value->>'exercise_type_name'
   and exercise_type.is_active
  left join public.exercise_plan_sessions as planned
    on planned.exercise_recommendation_id = v_recommendation_id
   and planned.session_index = nullif(item.value->>'plan_session_index', '')::integer
  where p_recommendation->>'generator' is distinct from 'auto-fit-ai'
     or planned.exercise_plan_session_id is not null;

  get diagnostics v_inserted_item_count = row_count;
  if v_inserted_item_count <> v_expected_item_count then
    raise exception 'one or more exercise types are invalid or inactive';
  end if;

  if p_recommendation->>'generator' = 'auto-fit-ai' and exists (
    select 1
    from public.exercise_plan_sessions as planned
    left join public.exercise_items as exercise_item
      on exercise_item.plan_session_id = planned.exercise_plan_session_id
    where planned.exercise_recommendation_id = v_recommendation_id
    group by planned.exercise_plan_session_id, planned.duration_minutes
    having count(exercise_item.exercise_item_id) not between 1 and 4
       or coalesce(sum(exercise_item.duration_minutes), -1) <> planned.duration_minutes
  ) then
    raise exception 'AI exercise plan session items are invalid';
  end if;

  select jsonb_build_object(
    'recommendation', to_jsonb(recommendation),
    'plan_sessions', coalesce((
      select jsonb_agg(to_jsonb(planned) || jsonb_build_object('status', 'planned')
        order by planned.session_index)
      from public.exercise_plan_sessions as planned
      where planned.exercise_recommendation_id = v_recommendation_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(exercise_item) order by exercise_item.sequence_order)
      from public.exercise_items as exercise_item
      where exercise_item.exercise_recommendation_id = v_recommendation_id
    ), '[]'::jsonb)
  )
  into v_result
  from public.exercise_recommendations as recommendation
  where recommendation.exercise_recommendation_id = v_recommendation_id;

  return v_result;
end;
$$;

revoke all on function public.create_exercise_recommendation(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_exercise_recommendation(uuid, uuid, jsonb, jsonb)
  to service_role;


create or replace function public.start_exercise_plan_session(
  p_user_id uuid,
  p_recommendation_id uuid,
  p_plan_session_id uuid
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
  from public.exercise_recommendations as recommendation
  join public.exercise_plan_sessions as planned
    on planned.exercise_recommendation_id = recommendation.exercise_recommendation_id
  where recommendation.exercise_recommendation_id = p_recommendation_id
    and recommendation.user_id = p_user_id
    and recommendation.status = 'active'
    and planned.exercise_plan_session_id = p_plan_session_id
    and planned.scheduled_date <= (now() at time zone 'Asia/Seoul')::date
  for update of recommendation;

  if not found then
    raise exception 'Scheduled exercise plan session is unavailable';
  end if;

  if exists (
    select 1 from public.exercise_sessions
    where user_id = p_user_id
      and exercise_recommendation_id = p_recommendation_id
      and plan_session_id <> p_plan_session_id
      and status = 'in_progress'
  ) then
    raise exception 'Another exercise plan session is in progress';
  end if;

  select * into v_session
  from public.exercise_sessions
  where user_id = p_user_id
    and exercise_recommendation_id = p_recommendation_id
    and plan_session_id = p_plan_session_id
    and status = 'in_progress'
  order by started_at desc
  limit 1
  for update;

  if v_session.exercise_session_id is null and exists (
    select 1 from public.exercise_sessions
    where user_id = p_user_id and plan_session_id = p_plan_session_id
      and status = 'completed'
  ) then
    raise exception 'Exercise plan session is already completed';
  end if;

  select count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(item) order by item.sequence_order), '[]'::jsonb)
  into v_planned_count, v_items
  from public.exercise_items as item
  where item.plan_session_id = p_plan_session_id;

  if v_planned_count = 0 then
    raise exception 'Exercise plan session has no items';
  end if;

  if v_session.exercise_session_id is null then
    insert into public.exercise_sessions (
      user_id, exercise_recommendation_id, plan_session_id, planned_item_count
    ) values (
      p_user_id, p_recommendation_id, p_plan_session_id, v_planned_count
    ) returning * into v_session;
  end if;

  return jsonb_build_object('session', to_jsonb(v_session), 'items', v_items);
end;
$$;

revoke all on function public.start_exercise_plan_session(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_exercise_plan_session(uuid, uuid, uuid)
  to service_role;

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
    and exercise_recommendation_id = v_session.exercise_recommendation_id
    and (v_session.plan_session_id is null
      or plan_session_id = v_session.plan_session_id);

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
    and user_id = p_user_id
    and (v_session.plan_session_id is null or not exists (
      select 1 from public.exercise_plan_sessions as planned
      where planned.exercise_recommendation_id = v_session.exercise_recommendation_id
        and not exists (
          select 1 from public.exercise_sessions as completed
          where completed.plan_session_id = planned.exercise_plan_session_id
            and completed.user_id = p_user_id
            and completed.status = 'completed'
        )
    ));

  select coalesce(jsonb_agg(to_jsonb(l) order by l.performed_at), '[]'::jsonb)
    into v_logs
  from public.exercise_logs l
  where l.exercise_session_id = p_session_id and l.user_id = p_user_id;

  return jsonb_build_object('session', to_jsonb(v_session), 'logs', v_logs);
end;
$$;

-- Existing grants are retained by CREATE OR REPLACE, but state them explicitly.
revoke all on function public.record_exercise_item_result(uuid, uuid, uuid, boolean, boolean, integer, integer, integer, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.record_exercise_item_result(uuid, uuid, uuid, boolean, boolean, integer, integer, integer, numeric, text, text)
  to service_role;
revoke all on function public.complete_exercise_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_exercise_session(uuid, uuid)
  to service_role;

-- Rollback: stop AI weekly creation, restore the three RPCs from their prior
-- migrations, then drop plan_session_id columns and exercise_plan_sessions.
