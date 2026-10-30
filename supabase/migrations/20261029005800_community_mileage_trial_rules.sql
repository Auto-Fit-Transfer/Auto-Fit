-- Provisional mileage values from the 2026-10-28 meeting. Keep historical
-- ledger rows intact; operators can tune the three new rules during testing.
alter table public.community_rules
  drop constraint community_rules_rule_key_check;
alter table public.community_rules
  add constraint community_rules_rule_key_check check (rule_key in (
    'earn_workout', 'earn_meal_log', 'club_create_cost', 'membership_demo_days',
    'earn_workout_high', 'earn_streak_5', 'earn_streak_30'
  ));

alter table public.community_mileage_ledger
  drop constraint community_mileage_ledger_reason_check;
alter table public.community_mileage_ledger
  add constraint community_mileage_ledger_reason_check check (reason in (
    'workout', 'meal_log', 'club_create', 'challenge',
    'workout_high_adjustment', 'workout_streak_5', 'workout_streak_30'
  ));

insert into public.community_rules(rule_key, amount, daily_limit, enabled, starts_at, note)
values
  ('earn_workout_high', 30, null, true, now(), '시험 기준: high 강도 완료일의 운동 보상 총액'),
  ('earn_streak_5', 10, null, true, now(), '시험 기준: 운동 완료 5일 연속 달성'),
  ('earn_streak_30', 30, null, true, now(), '시험 기준: 운동 완료 30일 연속 달성')
on conflict (rule_key) do nothing;

create index if not exists idx_exercise_sessions_user_completed_mileage
  on public.exercise_sessions(user_id, completed_at)
  where status = 'completed' and completed_at is not null;

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
        left join public.exercise_recommendations r
          on r.exercise_recommendation_id = e.exercise_recommendation_id and r.user_id = e.user_id
        where e.user_id = p_user_id and e.status = 'completed' and e.completed_at >= v_rule.starts_at
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
            where e.user_id = p_user_id and e.status = 'completed'
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
