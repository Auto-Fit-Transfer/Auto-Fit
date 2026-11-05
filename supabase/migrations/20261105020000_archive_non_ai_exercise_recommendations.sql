-- Preserve historical exercise records for reference without keeping them usable.
-- The preceding migration removes the old start RPC and accepts only AI plans.
do $$
begin
  update public.exercise_sessions as session
  set status = 'stopped', updated_at = now()
  from public.exercise_recommendations as recommendation
  where session.exercise_recommendation_id = recommendation.exercise_recommendation_id
    and recommendation.generator <> 'auto-fit-ai'
    and session.status = 'in_progress';

  -- The insert guard also makes generator immutable. Disable it only within this
  -- atomic statement while normalizing rows created before AI-only operation.
  execute 'alter table public.exercise_recommendations disable trigger require_ai_exercise_recommendation_insert';

  update public.exercise_recommendations
  set generator = 'legacy',
      status = case when status = 'active' then 'cancelled' else status end
  where generator <> 'auto-fit-ai'
    and (generator <> 'legacy' or status = 'active');

  execute 'alter table public.exercise_recommendations enable trigger require_ai_exercise_recommendation_insert';

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.exercise_recommendations'::regclass
      and conname = 'exercise_recommendations_ai_or_archived_check'
  ) then
    alter table public.exercise_recommendations
      add constraint exercise_recommendations_ai_or_archived_check
      check (
        generator = 'auto-fit-ai'
        or (generator = 'legacy' and status in ('completed', 'cancelled'))
      );
  end if;
end;
$$;

comment on column public.exercise_recommendations.generator is
  'auto-fit-ai for usable plans; legacy for archived historical records.';
comment on column public.exercise_items.exercise_key is
  'Validated AI catalog key; null for archived historical recommendations.';

-- Existing feedback and activity records remain readable. New derived records
-- cannot be written from an archived recommendation or one of its sessions.
create or replace function public.prevent_archived_exercise_derived_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_row jsonb;
  v_recommendation_id uuid;
  v_session_id uuid;
begin
  if tg_op = 'UPDATE' then
    v_rows := jsonb_build_array(to_jsonb(old), to_jsonb(new));
  else
    v_rows := jsonb_build_array(to_jsonb(new));
  end if;

  for v_row in select value from jsonb_array_elements(v_rows)
  loop
    v_recommendation_id := nullif(coalesce(
      v_row->>'source_recommendation_id',
      v_row->>'exercise_recommendation_id'
    ), '')::uuid;
    v_session_id := nullif(v_row->>'exercise_session_id', '')::uuid;

    if v_recommendation_id is not null and exists (
      select 1 from public.exercise_recommendations
      where exercise_recommendation_id = v_recommendation_id
        and generator = 'legacy'
    ) then
      raise exception 'Archived exercise records are read-only' using errcode = '22023';
    end if;
    if v_session_id is not null and exists (
      select 1
      from public.exercise_sessions as session
      join public.exercise_recommendations as recommendation
        on recommendation.exercise_recommendation_id = session.exercise_recommendation_id
      where session.exercise_session_id = v_session_id
        and recommendation.generator = 'legacy'
    ) then
      raise exception 'Archived exercise records are read-only' using errcode = '22023';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.prevent_archived_exercise_derived_write()
  from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'exercise_session_feedback',
    'exercise_session_analyses',
    'posture_analysis_jobs',
    'user_workout_routines',
    'community_posts'
  ] loop
    execute format(
      'create or replace trigger prevent_archived_exercise_derived_write '
      || 'before insert or update on public.%I for each row '
      || 'execute function public.prevent_archived_exercise_derived_write()',
      v_table
    );
  end loop;
end;
$$;

-- Historical completed sessions still appear in exercise history, but cannot
-- be selected as new community activity cards.
create or replace function public.community_activity_snapshot(p_user_id uuid, p_session_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_session public.exercise_sessions;
  v_names jsonb;
  v_first_name text;
begin
  select session.* into v_session
  from public.exercise_sessions as session
  join public.exercise_recommendations as recommendation
    on recommendation.exercise_recommendation_id = session.exercise_recommendation_id
  where session.exercise_session_id = p_session_id
    and session.user_id = p_user_id
    and session.status = 'completed'
    and recommendation.generator = 'auto-fit-ai';
  if not found then
    raise exception using message = 'COMMUNITY_ACTIVITY_NOT_FOUND', errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(x.exercise_name order by x.performed_at), '[]'::jsonb)
    into v_names from (
      select log.exercise_name, min(log.performed_at) performed_at
      from public.exercise_logs as log
      where log.exercise_session_id = p_session_id and log.user_id = p_user_id
        and log.completed and not log.skipped
      group by log.exercise_name order by min(log.performed_at) limit 3
    ) x;
  select log.exercise_name into v_first_name from public.exercise_logs as log
    where log.exercise_session_id = p_session_id and log.user_id = p_user_id
      and log.completed and not log.skipped
    order by log.performed_at limit 1;
  return jsonb_build_object(
    'name', coalesce(v_first_name, '운동 기록'),
    'duration_minutes', round(v_session.total_duration_seconds / 60.0),
    'calories', round(v_session.total_calories_burned),
    'exercises', v_names);
end;
$$;

create or replace function public.community_my_activities(p_user_id uuid, p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_limit is null or p_limit not between 1 and 20 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'session_id', session.exercise_session_id, 'completed_at', session.completed_at,
    'snapshot', public.community_activity_snapshot(p_user_id, session.exercise_session_id))
    order by session.completed_at desc, session.exercise_session_id desc)
    from (
      select exercise_session.exercise_session_id, exercise_session.completed_at
      from public.exercise_sessions as exercise_session
      join public.exercise_recommendations as recommendation
        on recommendation.exercise_recommendation_id = exercise_session.exercise_recommendation_id
      where exercise_session.user_id = p_user_id
        and exercise_session.status = 'completed'
        and recommendation.generator = 'auto-fit-ai'
      order by exercise_session.completed_at desc, exercise_session.exercise_session_id desc
      limit p_limit
    ) as session), '[]'::jsonb);
end;
$$;

-- Archived completed sessions remain in history but cannot generate new
-- mileage, challenge progress, or workout ranking credit. Existing ledgers
-- and previously awarded points are preserved.
create or replace function public.community_sync_mileage(p_user_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_rule public.community_rules;
  v_high public.community_rules;
  v_streak public.community_rules;
  v_length integer;
  v_reason text;
begin
  if p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-mileage', 0));

  select * into v_high from public.community_rules where rule_key = 'earn_workout_high';
  select * into v_rule from public.community_rules where rule_key = 'earn_workout';
  if found and v_rule.enabled and v_rule.amount > 0 then
    insert into public.community_mileage_ledger(user_id, amount, reason, source_id, earned_on)
    select p_user_id, s.amount, 'workout', s.id, s.day
    from (
      select x.*, row_number() over (partition by x.day order by x.is_high desc, x.at, x.id) as n
      from (
        select e.exercise_session_id as id, e.completed_at as at,
               (e.completed_at at time zone 'Asia/Seoul')::date as day,
               (coalesce(v_high.enabled, false) and v_high.amount > 0
                and e.completed_at >= v_high.starts_at
                and coalesce(r.intensity = 'high', false)) as is_high,
               case when coalesce(v_high.enabled, false) and v_high.amount > 0
                         and e.completed_at >= v_high.starts_at and r.intensity = 'high'
                    then v_high.amount else v_rule.amount end as amount
        from public.exercise_sessions e
        join public.exercise_recommendations r
          on r.exercise_recommendation_id = e.exercise_recommendation_id and r.user_id = e.user_id
        where e.user_id = p_user_id and e.status = 'completed' and r.generator = 'auto-fit-ai'
          and e.completed_at >= v_rule.starts_at
          and not exists (select 1 from public.community_mileage_ledger l
                          where l.user_id = p_user_id and l.reason = 'workout'
                            and l.source_id = e.exercise_session_id)
      ) x
    ) s
    where s.n + (select count(*) from public.community_mileage_ledger l
                 where l.user_id = p_user_id and l.reason = 'workout' and l.earned_on = s.day)
          <= coalesce(v_rule.daily_limit, 2147483647)
    on conflict do nothing;

    -- A normal session may have used today's slot before a high session was
    -- completed. Top up that day's workout reward to the high rule amount.
    if coalesce(v_high.enabled, false) and v_high.amount > v_rule.amount then
      insert into public.community_mileage_ledger(user_id, amount, reason, source_id, earned_on)
      select p_user_id, v_high.amount - w.paid, 'workout_high_adjustment', h.id, h.day
      from (
        select distinct on ((e.completed_at at time zone 'Asia/Seoul')::date)
               e.exercise_session_id as id,
               (e.completed_at at time zone 'Asia/Seoul')::date as day
        from public.exercise_sessions e
        join public.exercise_recommendations r
          on r.exercise_recommendation_id = e.exercise_recommendation_id and r.user_id = e.user_id
        where e.user_id = p_user_id and e.status = 'completed'
          and e.completed_at >= v_high.starts_at and r.intensity = 'high'
          and r.generator = 'auto-fit-ai'
        order by (e.completed_at at time zone 'Asia/Seoul')::date, e.completed_at, e.exercise_session_id
      ) h
      join lateral (
        select coalesce(sum(w.amount), 0)::integer as paid
        from public.community_mileage_ledger w
        where w.user_id = p_user_id and w.reason = 'workout' and w.earned_on = h.day
      ) w on w.paid > 0 and w.paid < v_high.amount
      where not exists (
        select 1 from public.community_mileage_ledger a
        where a.user_id = p_user_id and a.reason = 'workout_high_adjustment' and a.earned_on = h.day
      )
      on conflict do nothing;
    end if;
  end if;

  select * into v_rule from public.community_rules where rule_key = 'earn_meal_log';
  if found and v_rule.enabled and v_rule.amount > 0 then
    insert into public.community_mileage_ledger(user_id, amount, reason, source_id, earned_on)
    select p_user_id, v_rule.amount, 'meal_log', s.id, s.day
    from (
      select x.id, x.day, row_number() over (partition by x.day order by x.at, x.id) as n
      from (
        select m.meal_log_id as id, m.created_at as at,
               (m.created_at at time zone 'Asia/Seoul')::date as day
        from public.meal_logs m
        where m.user_id = p_user_id and m.status = 'recorded' and m.created_at >= v_rule.starts_at
          and not exists (select 1 from public.community_mileage_ledger l
                          where l.user_id = p_user_id and l.reason = 'meal_log'
                            and l.source_id = m.meal_log_id)
      ) x
    ) s
    where s.n + (select count(*) from public.community_mileage_ledger l
                 where l.user_id = p_user_id and l.reason = 'meal_log' and l.earned_on = s.day)
          <= coalesce(v_rule.daily_limit, 2147483647)
    on conflict do nothing;
  end if;

  for v_length, v_reason in
    select 5, 'workout_streak_5' union all select 30, 'workout_streak_30'
  loop
    select * into v_streak from public.community_rules
    where rule_key = case when v_length = 5 then 'earn_streak_5' else 'earn_streak_30' end;
    if found and v_streak.enabled and v_streak.amount > 0 then
      insert into public.community_mileage_ledger(user_id, amount, reason, source_id, earned_on)
      select p_user_id, v_streak.amount, v_reason, streak.id, streak.day
      from (
        select days.*, row_number() over (partition by days.group_key order by days.day) as run_day
        from (
          select first_session.*,
                 first_session.day - (row_number() over (order by first_session.day))::integer as group_key
          from (
            select distinct on ((e.completed_at at time zone 'Asia/Seoul')::date)
                   e.exercise_session_id as id,
                   (e.completed_at at time zone 'Asia/Seoul')::date as day
            from public.exercise_sessions e
            join public.exercise_recommendations r
              on r.exercise_recommendation_id = e.exercise_recommendation_id and r.user_id = e.user_id
            where e.user_id = p_user_id and e.status = 'completed'
              and r.generator = 'auto-fit-ai'
              and e.completed_at >= v_streak.starts_at
            order by (e.completed_at at time zone 'Asia/Seoul')::date, e.completed_at, e.exercise_session_id
          ) first_session
        ) days
      ) streak
      where streak.run_day = v_length
      on conflict do nothing;
    end if;
  end loop;

  return public.community_mileage_summary(p_user_id);
end;
$function$;

create or replace function public.community_challenge_progress(p_user_id uuid, p_challenge public.community_challenges)
returns integer language sql stable security invoker set search_path = '' as $$
  select case p_challenge.metric
    when 'workout_days' then (
      select count(distinct (e.completed_at at time zone 'Asia/Seoul')::date)
      from public.exercise_sessions e
      join public.exercise_recommendations r
        on r.exercise_recommendation_id = e.exercise_recommendation_id and r.user_id = e.user_id
      where e.user_id = p_user_id and e.status = 'completed'
        and r.generator = 'auto-fit-ai'
        and (e.completed_at at time zone 'Asia/Seoul')::date between p_challenge.starts_on and p_challenge.ends_on)
    else (
      select count(distinct (m.created_at at time zone 'Asia/Seoul')::date)
      from public.meal_logs m
      where m.user_id = p_user_id and m.status = 'recorded'
        and (m.created_at at time zone 'Asia/Seoul')::date between p_challenge.starts_on and p_challenge.ends_on)
  end::integer
$$;

create or replace function public.community_ranking(
  p_viewer uuid, p_metric text, p_scope text, p_club_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_start date := date_trunc('week', now() at time zone 'Asia/Seoul')::date;
  v_end date := date_trunc('week', now() at time zone 'Asia/Seoul')::date + 6;
begin
  if p_viewer is null or p_metric is null or p_metric not in ('workout', 'mileage')
     or p_scope is null or p_scope not in ('all', 'following', 'club')
     or (p_scope = 'club') <> (p_club_id is not null)
     or p_limit is null or p_limit not between 1 and 100 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_scope = 'club' then
    perform public.community_visible_club(p_viewer, p_club_id);
  end if;
  return (
    with candidates as (
      select r.user_id
      from public.community_ranking_participants r
      where (p_scope = 'all'
             or (p_scope = 'following' and (r.user_id = p_viewer or exists (
                   select 1 from public.community_follows f
                   where f.follower_user_id = p_viewer and f.following_user_id = r.user_id)))
             or (p_scope = 'club' and exists (
                   select 1 from public.community_club_members m
                   where m.club_id = p_club_id and m.user_id = r.user_id)))
        and not public.community_blocked_between(p_viewer, r.user_id)
    ), scored as (
      select c.user_id, case p_metric
        when 'workout' then (
          select count(*) from public.exercise_sessions e
          join public.exercise_recommendations r
            on r.exercise_recommendation_id = e.exercise_recommendation_id and r.user_id = e.user_id
          where e.user_id = c.user_id and e.status = 'completed'
            and r.generator = 'auto-fit-ai'
            and (e.completed_at at time zone 'Asia/Seoul')::date between v_start and v_end)
        else (
          select coalesce(sum(l.amount), 0) from public.community_mileage_ledger l
          where l.user_id = c.user_id and l.amount > 0 and l.earned_on between v_start and v_end
            and not exists (
              select 1 from public.exercise_sessions e
              join public.exercise_recommendations r
                on r.exercise_recommendation_id = e.exercise_recommendation_id
               and r.user_id = e.user_id
              where e.exercise_session_id = l.source_id
                and e.user_id = l.user_id
                and r.generator = 'legacy'
                and l.reason in (
                  'workout', 'workout_high_adjustment',
                  'workout_streak_5', 'workout_streak_30'
                )
            ))
        end::integer as score
      from candidates c
    ), ranked as (
      select s.user_id, s.score, rank() over (order by s.score desc)::integer as rank
      from scored s where s.score > 0
    )
    select jsonb_build_object(
      'metric', p_metric, 'scope', p_scope, 'week_start', v_start, 'week_end', v_end,
      'participating', exists (select 1 from public.community_ranking_participants p where p.user_id = p_viewer),
      'items', coalesce((
        select jsonb_agg(public.community_author(t.user_id) || jsonb_build_object(
                 'rank', t.rank, 'score', t.score, 'is_me', t.user_id = p_viewer)
               order by t.rank, t.user_id)
        from (select * from ranked order by rank, user_id limit p_limit) t), '[]'::jsonb),
      'me', (select jsonb_build_object('rank', r.rank, 'score', r.score) from ranked r where r.user_id = p_viewer)));
end;
$$;
