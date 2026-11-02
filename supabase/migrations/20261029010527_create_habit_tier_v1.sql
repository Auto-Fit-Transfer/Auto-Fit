-- R8 "티어 초안 v1": tier points are cumulative activity points, separate from
-- the 0-100 health score. The older tier_policy_versions draft models a health
-- score composition and is deliberately left untouched; it has no evaluations.
-- The figures below are provisional Figma examples to tune after team testing.

create table public.tier_habit_policy_versions (
  tier_habit_policy_version_id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  change_note text not null default '' check (length(change_note) <= 2000),
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_tier_habit_policy_lifecycle check (
    (status = 'draft' and published_at is null and retired_at is null) or
    (status = 'active' and published_at is not null and retired_at is null) or
    (status = 'retired' and published_at is not null and retired_at >= published_at)
  )
);
create unique index uq_tier_habit_policy_one_active
  on public.tier_habit_policy_versions(status) where status = 'active';

create table public.tier_habit_point_rules (
  tier_habit_point_rule_id uuid primary key default gen_random_uuid(),
  tier_habit_policy_version_id uuid not null,
  event_code text not null check (event_code in (
    'meal_log', 'recommended_workout_completed', 'weekly_exercise_goal_met',
    'health_data_uploaded', 'challenge_completed', 'seven_day_logging_streak'
  )),
  points integer not null check (points > 0),
  period_unit text not null check (period_unit in ('day', 'week', 'month', 'event')),
  max_awards integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tier_habit_policy_version_id, event_code),
  constraint ck_tier_habit_rule_limit check (
    (period_unit = 'event' and max_awards is null) or
    (period_unit <> 'event' and max_awards > 0)
  )
);

-- Only lower bounds are stored. PEAK 3 starts at 1330 and is open ended.
create table public.tier_habit_bands (
  tier_habit_band_id uuid primary key default gen_random_uuid(),
  tier_habit_policy_version_id uuid not null,
  tier_definition_id uuid not null,
  sublevel integer not null check (sublevel between 1 and 3),
  min_points integer not null check (min_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tier_habit_policy_version_id, tier_definition_id, sublevel),
  unique (tier_habit_policy_version_id, min_points)
);
create index idx_tier_habit_bands_definition on public.tier_habit_bands(tier_definition_id);

-- Source keys are server-generated stable IDs (or period-qualified aggregate
-- keys). The backend must verify ownership and completion of the source event.
create table public.user_tier_points (
  user_tier_point_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tier_habit_point_rule_id uuid not null,
  event_code text not null,
  source_key text not null check (length(btrim(source_key)) between 1 and 160),
  points integer not null check (points > 0),
  occurred_at timestamptz not null,
  period_start date,
  created_at timestamptz not null default now(),
  unique (user_id, event_code, source_key)
);
create index idx_user_tier_points_recent
  on public.user_tier_points(user_id, occurred_at desc, user_tier_point_id desc);
create index idx_user_tier_points_period
  on public.user_tier_points(user_id, event_code, period_start)
  where period_start is not null;
create index idx_user_tier_points_rule
  on public.user_tier_points(tier_habit_point_rule_id);

insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('tier_habit_point_rules', 'tier_habit_policy_version_id',
   'tier_habit_policy_versions', 'tier_habit_policy_version_id'),
  ('tier_habit_bands', 'tier_habit_policy_version_id',
   'tier_habit_policy_versions', 'tier_habit_policy_version_id'),
  ('tier_habit_bands', 'tier_definition_id',
   'tier_definitions', 'tier_definition_id'),
  ('user_tier_points', 'tier_habit_point_rule_id',
   'tier_habit_point_rules', 'tier_habit_point_rule_id');

create function autofit_integrity.guard_tier_habit_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare item record; band_count integer := 0; previous_points integer := -1;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'Create habit policies as drafts' using errcode = '23514'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Published habit policies cannot be removed' using errcode = '23514'; end if;
    return old;
  end if;
  if new.version is distinct from old.version or new.created_at is distinct from old.created_at then
    raise exception 'Habit policy version and creation time are immutable' using errcode = '23514';
  end if;
  if old.status = 'active' then
    if new.status <> 'retired' or
       (to_jsonb(new) - array['status','retired_at','updated_at']) is distinct from
       (to_jsonb(old) - array['status','retired_at','updated_at']) then
      raise exception 'Published habit policy is immutable' using errcode = '23514';
    end if;
    new.published_at := old.published_at;
    new.retired_at := now();
  elsif old.status = 'retired' then
    raise exception 'Retired habit policy is immutable' using errcode = '23514';
  elsif new.status = 'active' then
    if (select count(*) from public.tier_habit_point_rules r
        where r.tier_habit_policy_version_id = new.tier_habit_policy_version_id) <> 6 then
      raise exception 'Habit policy requires all six point rules' using errcode = '23514';
    end if;
    for item in
      select b.min_points, b.sublevel, d.display_order, d.code
      from public.tier_habit_bands b
      join public.tier_definitions d on d.tier_definition_id = b.tier_definition_id
      where b.tier_habit_policy_version_id = new.tier_habit_policy_version_id
      order by b.min_points for share of d
    loop
      band_count := band_count + 1;
      if (band_count = 1 and item.min_points <> 0) or
         item.min_points <= previous_points or
         item.display_order <> ((band_count - 1) / 3) + 1 or
         item.sublevel <> ((band_count - 1) % 3) + 1 or
         item.code <> (array['CORE','BALANCE','ACTIVE','FIT','PEAK'])[ ((band_count - 1) / 3) + 1 ] then
        raise exception 'Habit tier bands must follow CORE through PEAK in three increasing levels'
          using errcode = '23514';
      end if;
      previous_points := item.min_points;
    end loop;
    if band_count <> 15 then raise exception 'Habit policy requires fifteen bands' using errcode = '23514'; end if;
    new.published_at := now();
    new.retired_at := null;
  elsif new.status <> 'draft' then
    raise exception 'Invalid habit policy transition' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;

create function autofit_integrity.guard_tier_habit_config()
returns trigger language plpgsql security definer set search_path = '' as $$
declare policy_id uuid; policy_status text;
begin
  policy_id := case when tg_op = 'DELETE' then old.tier_habit_policy_version_id
                    else new.tier_habit_policy_version_id end;
  if tg_op = 'UPDATE' and new.tier_habit_policy_version_id is distinct from old.tier_habit_policy_version_id then
    raise exception 'Habit configuration cannot move between policies' using errcode = '23514';
  end if;
  select status into policy_status from public.tier_habit_policy_versions
    where tier_habit_policy_version_id = policy_id for update;
  if not found then raise exception 'Habit policy does not exist' using errcode = '23503'; end if;
  if policy_status <> 'draft' then
    raise exception 'Published habit configuration is immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and new.created_at is distinct from old.created_at then
    raise exception 'Habit configuration creation time is immutable' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;

create function autofit_integrity.guard_user_tier_point()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rule_row record; existing_count integer;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Tier point events are immutable' using errcode = '23514';
  end if;
  select r.event_code, r.points, r.period_unit, r.max_awards,
         p.status, p.published_at
    into rule_row
    from public.tier_habit_point_rules r
    join public.tier_habit_policy_versions p
      on p.tier_habit_policy_version_id = r.tier_habit_policy_version_id
    where r.tier_habit_point_rule_id = new.tier_habit_point_rule_id
    for share of r, p;
  if not found then raise exception 'Tier point rule does not exist' using errcode = '23503'; end if;
  if rule_row.status <> 'active' or new.occurred_at < rule_row.published_at or new.occurred_at > now() then
    raise exception 'Tier points require an active rule and a current event' using errcode = '23514';
  end if;
  new.event_code := rule_row.event_code;
  new.points := rule_row.points;
  new.period_start := case rule_row.period_unit
    when 'day' then (new.occurred_at at time zone 'Asia/Seoul')::date
    when 'week' then date_trunc('week', new.occurred_at at time zone 'Asia/Seoul')::date
    when 'month' then date_trunc('month', new.occurred_at at time zone 'Asia/Seoul')::date
    else null end;
  perform pg_advisory_xact_lock(hashtextextended(
    new.user_id::text || ':' || new.event_code || ':' || coalesce(new.period_start::text, 'event'), 0));
  -- Keep ON CONFLICT DO NOTHING idempotent even after a period is full.
  if exists (select 1 from public.user_tier_points e where e.user_id = new.user_id
      and e.event_code = new.event_code and e.source_key = new.source_key) then
    return new;
  end if;
  if rule_row.period_unit <> 'event' then
    select count(*) into existing_count from public.user_tier_points e
      where e.user_id = new.user_id and e.event_code = new.event_code
        and e.period_start = new.period_start;
    if existing_count >= rule_row.max_awards then
      raise exception 'Tier point period limit reached' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

revoke all on function autofit_integrity.guard_tier_habit_policy(),
  autofit_integrity.guard_tier_habit_config(), autofit_integrity.guard_user_tier_point()
  from public, anon, authenticated, service_role;

create trigger a_guard_tier_habit_policy before insert or update or delete
  on public.tier_habit_policy_versions for each row
  execute function autofit_integrity.guard_tier_habit_policy();
create trigger a_guard_tier_habit_config before insert or update or delete
  on public.tier_habit_point_rules for each row
  execute function autofit_integrity.guard_tier_habit_config();
create trigger a_guard_tier_habit_config before insert or update or delete
  on public.tier_habit_bands for each row
  execute function autofit_integrity.guard_tier_habit_config();
create trigger a_guard_user_tier_point before insert or update
  on public.user_tier_points for each row
  execute function autofit_integrity.guard_user_tier_point();
create trigger check_user_reference before insert or update on public.user_tier_points
  for each row execute function autofit_integrity.check_user_reference();

do $$ declare tbl text; begin
  foreach tbl in array array['tier_habit_point_rules','tier_habit_bands','user_tier_points'] loop
    execute format('create trigger z_check_business_references before insert or update on public.%I for each row execute function autofit_integrity.check_business_references()', tbl);
  end loop;
  foreach tbl in array array['tier_habit_policy_versions','tier_habit_point_rules'] loop
    execute format('create trigger protect_business_parent before delete or update on public.%I for each row execute function autofit_integrity.protect_business_parent()', tbl);
    execute format('create trigger block_habit_tier_truncate before truncate on public.%I for each statement execute function autofit_integrity.block_parent_truncate()', tbl);
  end loop;
  foreach tbl in array array['tier_habit_policy_versions','tier_habit_point_rules','tier_habit_bands','user_tier_points'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', tbl);
    execute format('grant select on public.%I to service_role', tbl);
  end loop;
end $$;
create trigger zzz_check_account_writable before insert or update on public.user_tier_points
  for each row execute function autofit_integrity.check_account_writable();
grant insert on public.user_tier_points to service_role;

insert into public.tier_habit_policy_versions(version, name, change_note)
values (1, 'R8 티어 초안 v1', '초안 수치로 시작하여 팀 실테스트 후 새 정책 버전으로 조정');

insert into public.tier_habit_point_rules
  (tier_habit_policy_version_id, event_code, points, period_unit, max_awards)
select p.tier_habit_policy_version_id, r.event_code, r.points, r.period_unit, r.max_awards
from public.tier_habit_policy_versions p
cross join (values
  ('meal_log', 2, 'day', 3),
  ('recommended_workout_completed', 5, 'day', 1),
  ('weekly_exercise_goal_met', 10, 'week', 1),
  ('health_data_uploaded', 15, 'month', 1),
  ('challenge_completed', 20, 'event', null::integer),
  ('seven_day_logging_streak', 10, 'week', 1)
) as r(event_code, points, period_unit, max_awards)
where p.version = 1;

insert into public.tier_habit_bands
  (tier_habit_policy_version_id, tier_definition_id, sublevel, min_points)
select p.tier_habit_policy_version_id, d.tier_definition_id, b.sublevel, b.min_points
from public.tier_habit_policy_versions p
join (values
  ('CORE', 1, 0), ('CORE', 2, 30), ('CORE', 3, 70),
  ('BALANCE', 1, 120), ('BALANCE', 2, 180), ('BALANCE', 3, 250),
  ('ACTIVE', 1, 330), ('ACTIVE', 2, 420), ('ACTIVE', 3, 520),
  ('FIT', 1, 630), ('FIT', 2, 750), ('FIT', 3, 880),
  ('PEAK', 1, 1020), ('PEAK', 2, 1170), ('PEAK', 3, 1330)
) as b(code, sublevel, min_points) on true
join public.tier_definitions d on d.code = b.code and d.revision = 1
where p.version = 1;

update public.tier_habit_policy_versions set status = 'active' where version = 1;

create function public.user_habit_tier_progress(p_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare active_policy uuid; policy_version integer; total_points bigint; current_band record; next_min integer;
begin
  select tier_habit_policy_version_id, version into active_policy, policy_version
    from public.tier_habit_policy_versions where status = 'active';
  if not found then raise exception 'No active habit tier policy' using errcode = 'P0002'; end if;
  select coalesce(sum(points), 0) into total_points
    from public.user_tier_points where user_id = p_user_id;
  select d.code, d.display_name, b.sublevel, b.min_points into current_band
    from public.tier_habit_bands b
    join public.tier_definitions d on d.tier_definition_id = b.tier_definition_id
    where b.tier_habit_policy_version_id = active_policy and b.min_points <= total_points
    order by b.min_points desc limit 1;
  select min(min_points) into next_min from public.tier_habit_bands
    where tier_habit_policy_version_id = active_policy and min_points > total_points;
  return jsonb_build_object(
    'policy_version', policy_version, 'points', total_points,
    'tier_code', current_band.code, 'tier_name', current_band.display_name,
    'sublevel', current_band.sublevel, 'level_start_points', current_band.min_points,
    'next_level_points', next_min
  );
end $$;
revoke all on function public.user_habit_tier_progress(uuid) from public, anon, authenticated;
grant execute on function public.user_habit_tier_progress(uuid) to service_role;

comment on table public.tier_habit_policy_versions is 'R8 habit-tier policies, separate from the older 100-point health-score draft.';
comment on table public.tier_habit_point_rules is 'Versioned activity point awards and per-period limits in Asia/Seoul.';
comment on table public.tier_habit_bands is 'Fifteen cumulative point lower bounds; PEAK 3 has no upper limit.';
comment on table public.user_tier_points is 'Immutable, idempotent user activity point events; source validation belongs to the backend.';

-- Rollback after the active policy and all point events have been retired:
-- drop function public.user_habit_tier_progress(uuid);
-- drop table public.user_tier_points;
-- drop table public.tier_habit_bands;
-- drop table public.tier_habit_point_rules;
-- drop table public.tier_habit_policy_versions;
