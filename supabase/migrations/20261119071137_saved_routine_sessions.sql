-- Run a saved snapshot without pretending that it is a new AI recommendation.
alter table public.exercise_sessions
  add column user_workout_routine_id uuid,
  add column saved_routine_goal text,
  add constraint ck_exercise_session_single_source check (
    exercise_recommendation_id is null or user_workout_routine_id is null
  );

create table public.saved_routine_session_items (
  saved_routine_session_item_id uuid primary key default gen_random_uuid(),
  exercise_session_id uuid not null,
  user_id uuid not null,
  source_routine_item_id uuid not null,
  sequence_order integer not null,
  exercise_type_id uuid,
  exercise_name text not null,
  target_duration_seconds integer,
  sets integer,
  repetitions integer,
  target_weight_kg numeric(8,2),
  rest_seconds integer,
  instruction text not null default '',
  demo_video_url text,
  created_at timestamptz not null default now(),
  unique (exercise_session_id, sequence_order),
  unique (exercise_session_id, source_routine_item_id)
);
alter table public.exercise_logs
  add column saved_routine_session_item_id uuid,
  add constraint ck_exercise_log_single_item_source check (
    exercise_item_id is null or saved_routine_session_item_id is null
  );
alter table public.exercise_discomfort_logs
  add column saved_routine_session_item_id uuid,
  add constraint ck_exercise_discomfort_single_item_source check (
    exercise_item_id is null or saved_routine_session_item_id is null
  );

create unique index uq_active_saved_routine_session_user
  on public.exercise_sessions(user_id)
  where status = 'in_progress' and user_workout_routine_id is not null;
create unique index uq_saved_routine_session_item_log
  on public.exercise_logs(exercise_session_id, saved_routine_session_item_id)
  where exercise_session_id is not null and saved_routine_session_item_id is not null;

insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('exercise_sessions', 'user_workout_routine_id',
   'user_workout_routines', 'user_workout_routine_id'),
  ('saved_routine_session_items', 'exercise_session_id',
   'exercise_sessions', 'exercise_session_id'),
  ('exercise_logs', 'saved_routine_session_item_id',
   'saved_routine_session_items', 'saved_routine_session_item_id'),
  ('exercise_discomfort_logs', 'saved_routine_session_item_id',
   'saved_routine_session_items', 'saved_routine_session_item_id');

create trigger z_check_business_references before insert or update
  on public.saved_routine_session_items for each row
  execute function autofit_integrity.check_business_references();
create trigger protect_business_parent before delete or update
  on public.saved_routine_session_items for each row
  execute function autofit_integrity.protect_business_parent();
create trigger business_parent_block_truncate before truncate
  on public.saved_routine_session_items for each statement
  execute function autofit_integrity.block_parent_truncate();
create trigger zzz_check_account_writable before insert or update
  on public.saved_routine_session_items for each row
  execute function autofit_integrity.check_account_writable();
alter table public.saved_routine_session_items enable row level security;
revoke all on public.saved_routine_session_items
  from public, anon, authenticated, service_role;
grant select, insert on public.saved_routine_session_items to service_role;

-- Existing users may already have several active historical sessions, so a new
-- global unique index cannot be applied without changing their records. Guard
-- only new starts and serialize them per account across both workout sources.
create function public.guard_new_active_exercise_session()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status <> 'in_progress' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('autofit-exercise-session:' || new.user_id::text, 0)
  );
  if exists (
    select 1 from public.exercise_sessions existing
    where existing.user_id = new.user_id and existing.status = 'in_progress'
  ) then
    raise exception 'Another exercise session is in progress';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_new_active_exercise_session()
  from public, anon, authenticated;
create trigger aa_guard_new_active_exercise_session
  before insert on public.exercise_sessions for each row
  execute function public.guard_new_active_exercise_session();

create function public.start_saved_workout_routine(
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
      sequence_order, exercise_type_id, exercise_name,
      target_duration_seconds, sets, repetitions, target_weight_kg,
      rest_seconds, instruction, demo_video_url
    )
    select v_session.exercise_session_id, p_user_id,
           item.user_workout_routine_item_id, item.sequence_order,
           item.exercise_type_id, item.exercise_name,
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

create function public.record_saved_routine_item_result(
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
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_item public.saved_routine_session_items%rowtype;
  v_log public.exercise_logs%rowtype;
  v_duration integer;
begin
  if coalesce(p_completed, false) = coalesce(p_skipped, false) then
    raise exception 'Exactly one of completed or skipped must be true';
  end if;
  if p_skipped and nullif(btrim(p_skip_reason), '') is null then
    raise exception 'Skip reason is required';
  end if;
  if p_duration_minutes is not null and p_duration_minutes not between 0 and 300 then
    raise exception 'Duration is outside the allowed range';
  end if;

  select * into v_session
  from public.exercise_sessions
  where exercise_session_id = p_session_id and user_id = p_user_id
    and user_workout_routine_id is not null and status = 'in_progress'
  for update;
  if v_session.exercise_session_id is null then
    raise exception 'In-progress saved routine session not found';
  end if;
  select * into v_item
  from public.saved_routine_session_items
  where saved_routine_session_item_id = p_item_id
    and exercise_session_id = p_session_id and user_id = p_user_id;
  if v_item.saved_routine_session_item_id is null then
    raise exception 'Saved routine item does not belong to this session';
  end if;

  v_duration := case when p_completed then coalesce(
    p_duration_minutes,
    ceil(v_item.target_duration_seconds / 60.0)::integer,
    0
  ) else 0 end;
  if p_completed and v_duration < 1 then
    raise exception 'Completed saved routine item requires at least one recorded minute';
  end if;
  insert into public.exercise_logs (
    user_id, saved_routine_session_item_id, exercise_name, performed_at,
    duration_minutes, calories_burned, completed, note,
    exercise_session_id, completed_sets, performed_repetitions,
    performed_weight_kg, skipped, skip_reason
  ) values (
    p_user_id, p_item_id, v_item.exercise_name, now(),
    v_duration, 0, p_completed, nullif(btrim(p_note), ''),
    p_session_id, p_completed_sets, p_performed_repetitions,
    p_performed_weight_kg, p_skipped, nullif(btrim(p_skip_reason), '')
  ) returning * into v_log;

  update public.exercise_sessions
  set completed_item_count = completed_item_count + case when p_completed then 1 else 0 end,
      skipped_item_count = skipped_item_count + case when p_skipped then 1 else 0 end,
      total_duration_seconds = total_duration_seconds + (v_duration * 60),
      completion_rate = round(
        ((completed_item_count + case when p_completed then 1 else 0 end)::numeric
          / greatest(planned_item_count, 1)) * 100, 2
      ),
      updated_at = now()
  where exercise_session_id = p_session_id
  returning * into v_session;
  return jsonb_build_object('session', to_jsonb(v_session), 'log', to_jsonb(v_log));
exception when unique_violation then
  raise exception 'Saved routine item result already recorded';
end;
$$;
revoke all on function public.record_saved_routine_item_result(
  uuid, uuid, uuid, boolean, boolean, integer, integer, integer, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.record_saved_routine_item_result(
  uuid, uuid, uuid, boolean, boolean, integer, integer, integer, numeric, text, text
) to service_role;

create function public.record_saved_routine_discomfort(
  p_user_id uuid,
  p_session_id uuid,
  p_item_id uuid,
  p_symptom_type text,
  p_severity smallint,
  p_body_areas jsonb,
  p_detail text,
  p_action_taken text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.exercise_sessions%rowtype;
  v_discomfort public.exercise_discomfort_logs%rowtype;
  v_completed_count integer;
  v_skipped_count integer;
begin
  if p_symptom_type not in ('pain', 'fatigue', 'dizziness', 'breathing', 'other')
      or p_action_taken not in ('stop', 'continue')
      or (p_severity is not null and p_severity not between 0 and 10)
      or jsonb_typeof(coalesce(p_body_areas, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid saved routine discomfort input';
  end if;
  select * into v_session
  from public.exercise_sessions
  where exercise_session_id = p_session_id and user_id = p_user_id
    and user_workout_routine_id is not null and status = 'in_progress'
  for update;
  if v_session.exercise_session_id is null then
    raise exception 'In-progress saved routine session not found';
  end if;
  if p_item_id is not null and not exists (
    select 1 from public.saved_routine_session_items
    where saved_routine_session_item_id = p_item_id
      and exercise_session_id = p_session_id and user_id = p_user_id
  ) then
    raise exception 'Saved routine item does not belong to this session';
  end if;

  insert into public.exercise_discomfort_logs (
    exercise_session_id, saved_routine_session_item_id, user_id,
    symptom_type, severity, body_areas, detail, action_taken
  ) values (
    p_session_id, p_item_id, p_user_id, p_symptom_type, p_severity,
    coalesce(p_body_areas, '[]'::jsonb), nullif(btrim(p_detail), ''), p_action_taken
  ) returning * into v_discomfort;

  if p_action_taken = 'stop' then
    insert into public.exercise_logs (
      user_id, saved_routine_session_item_id, exercise_name, performed_at,
      duration_minutes, calories_burned, completed, exercise_session_id,
      skipped, skip_reason
    )
    select p_user_id, item.saved_routine_session_item_id, item.exercise_name, now(),
           0, 0, false, p_session_id, true, '운동 중 상태 변화로 종료'
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
  end if;

  return jsonb_build_object(
    'discomfort', to_jsonb(v_discomfort), 'session', to_jsonb(v_session),
    'adjusted_items', '[]'::jsonb
  );
end;
$$;
revoke all on function public.record_saved_routine_discomfort(
  uuid, uuid, uuid, text, smallint, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.record_saved_routine_discomfort(
  uuid, uuid, uuid, text, smallint, jsonb, text, text
) to service_role;

comment on column public.exercise_sessions.user_workout_routine_id is
  'Saved routine source; null for an AI recommendation or a historical session.';
comment on column public.exercise_logs.saved_routine_session_item_id is
  'Immutable saved routine session item; exercise_item_id is null for this kind of log.';
comment on table public.saved_routine_session_items is
  'Per-session immutable copy of saved routine items; later routine edits do not alter history.';
