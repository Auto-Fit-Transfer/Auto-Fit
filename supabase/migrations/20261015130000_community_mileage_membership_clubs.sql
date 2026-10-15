-- Community stage 3: mileage, demo membership and clubs.
-- Requires 20261015090000_community_follows_notifications.sql. Applied files stay untouched.
-- Adds tables and functions, adds community_posts.club_id, and replaces three functions in place:
--   autofit_integrity.check_community_pair_writable()  also guards club owners;
--   public.community_timeline(...)                     keeps club posts out of all/following;
--   public.community_delete_user_data(uuid)            also hands over or removes owned clubs.
-- The team has not decided the mileage numbers or payments yet. Every number lives in
-- community_rules (provisional values below), so deciding them is a data update, not code.
-- Membership is demo-only: no payment is taken, and the rule can be switched off.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.community_rules (
  rule_key text primary key
    check (rule_key in ('earn_workout', 'earn_meal_log', 'club_create_cost', 'membership_demo_days')),
  amount integer not null check (amount >= 0),
  daily_limit integer check (daily_limit is null or daily_limit >= 0),
  enabled boolean not null default true,
  -- Activity before this moment never earns mileage.
  starts_at timestamptz not null default now(),
  note text,
  updated_at timestamptz not null default now()
);
insert into public.community_rules(rule_key, amount, daily_limit, note) values
  ('earn_workout', 10, 1, '임시값(팀 결정 전): 운동 완료 1회 +10, 하루 1회까지'),
  ('earn_meal_log', 5, 3, '임시값(팀 결정 전): 식단 기록 1건 +5, 하루 3건까지'),
  ('club_create_cost', 500, null, '임시값(팀 결정 전): 유료 회원이 아니면 클럽 개설에 500 사용. 끄면 유료 회원만 개설'),
  ('membership_demo_days', 30, null, '시연용: 결제 없이 30일 유료 회원. 끄면 시연 가입 불가');

-- Balance = sum(amount). Earned rows point at their activity (source_id) so it counts once.
create table public.community_mileage_ledger (
  entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('workout', 'meal_log', 'club_create')),
  source_id uuid,
  earned_on date,
  created_at timestamptz not null default clock_timestamp(),
  check ((reason = 'club_create') = (amount < 0)),
  check ((amount > 0) = (earned_on is not null))
);
create unique index community_mileage_ledger_source_idx
  on public.community_mileage_ledger(user_id, reason, source_id) where source_id is not null;
create index community_mileage_ledger_user_idx
  on public.community_mileage_ledger(user_id, created_at desc, entry_id desc);
create index community_mileage_ledger_daily_idx
  on public.community_mileage_ledger(user_id, reason, earned_on) where earned_on is not null;

create table public.community_memberships (
  user_id uuid primary key,
  plan text not null default 'premium' check (plan in ('premium')),
  source text not null check (source in ('demo')),
  started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at > started_at)
);

create table public.community_clubs (
  club_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name text not null check (char_length(name) between 2 and 30),
  description text check (description is null or char_length(description) between 1 and 300),
  category text not null
    check (category in ('running', 'strength', 'diet', 'yoga', 'hiking', 'cycling', 'sports', 'etc')),
  created_at timestamptz not null default clock_timestamp()
);
create unique index community_clubs_name_idx on public.community_clubs(lower(name));
create index community_clubs_owner_idx on public.community_clubs(owner_user_id);
create index community_clubs_list_idx on public.community_clubs(created_at desc, club_id desc);

create table public.community_club_members (
  club_id uuid not null,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default clock_timestamp(),
  primary key (club_id, user_id)
);
create index community_club_members_user_idx on public.community_club_members(user_id, joined_at desc);
create index community_club_members_order_idx on public.community_club_members(club_id, joined_at, user_id);

-- Club posts live in community_posts; reposts never carry a club.
alter table public.community_posts add column club_id uuid;
alter table public.community_posts add constraint community_posts_club_check
  check (club_id is null or repost_of_post_id is null);
create index community_posts_club_idx on public.community_posts(club_id, created_at desc, post_id desc)
  where club_id is not null;

alter table public.community_rules enable row level security;
alter table public.community_mileage_ledger enable row level security;
alter table public.community_memberships enable row level security;
alter table public.community_clubs enable row level security;
alter table public.community_club_members enable row level security;
revoke all on public.community_rules, public.community_mileage_ledger, public.community_memberships,
  public.community_clubs, public.community_club_members from public, anon, authenticated;
-- Rules are changed by the DB owner only (SQL), never through the API.
grant select on public.community_rules to service_role;
grant select, insert, update, delete on public.community_mileage_ledger, public.community_memberships,
  public.community_clubs, public.community_club_members to service_role;

-- ---------------------------------------------------------------------------
-- Account-deletion write guards
-- ---------------------------------------------------------------------------

-- Same as in 20261015090000, plus club owners. A club update checks only the new owner, so
-- the deletion cleanup can hand a club over from a leaving owner.
create or replace function autofit_integrity.check_community_pair_writable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'community_reports' then
    perform autofit_integrity.assert_account_writable(new.reporter_user_id);
    perform autofit_integrity.assert_account_writable(new.target_user_id);
  elsif tg_table_name = 'community_blocks' then
    perform autofit_integrity.assert_account_writable(new.blocker_user_id);
    perform autofit_integrity.assert_account_writable(new.blocked_user_id);
  elsif tg_table_name = 'community_follows' then
    perform autofit_integrity.assert_account_writable(new.follower_user_id);
    perform autofit_integrity.assert_account_writable(new.following_user_id);
  elsif tg_table_name = 'community_notifications' then
    perform autofit_integrity.assert_account_writable(new.actor_user_id);
  elsif tg_table_name = 'community_clubs' then
    perform autofit_integrity.assert_account_writable(new.owner_user_id);
  else
    raise exception 'check_community_pair_writable is not set up for %', tg_table_name;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['community_mileage_ledger', 'community_memberships', 'community_club_members'] loop
    execute format('create trigger check_user_reference before insert or update on public.%I
      for each row execute function autofit_integrity.check_user_reference()', t);
    execute format('create trigger zzz_check_account_writable before insert or update on public.%I
      for each row execute function autofit_integrity.check_account_writable()', t);
  end loop;
end;
$$;
create trigger zzz_check_account_writable before insert or update on public.community_clubs
  for each row execute function autofit_integrity.check_community_pair_writable();

-- ---------------------------------------------------------------------------
-- Mileage and membership
-- ---------------------------------------------------------------------------

create function public.community_mileage_balance(p_user_id uuid)
returns integer language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(l.amount), 0)::integer from public.community_mileage_ledger l where l.user_id = p_user_id
$$;

create function public.community_membership_active(p_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.community_memberships m
                 where m.user_id = p_user_id and m.expires_at > now())
$$;

create function public.community_rule_list()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'rule_key', r.rule_key, 'amount', r.amount, 'daily_limit', r.daily_limit,
    'enabled', r.enabled, 'note', r.note) order by r.rule_key), '[]'::jsonb)
  from public.community_rules r
$$;

create function public.community_mileage_summary(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'balance', public.community_mileage_balance(p_user_id),
    'earned_today', (select coalesce(sum(l.amount), 0) from public.community_mileage_ledger l
                     where l.user_id = p_user_id and l.earned_on = (now() at time zone 'Asia/Seoul')::date),
    'rules', public.community_rule_list())
$$;

-- Earns mileage for completed workouts and recorded meals that have not earned yet, within the
-- rule's daily limit (Korean date of the activity). Runs when the mileage screen opens, so the
-- existing workout and meal APIs stay unchanged.
create function public.community_sync_mileage(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_rule public.community_rules;
begin
  if p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-mileage', 0));

  select * into v_rule from public.community_rules where rule_key = 'earn_workout';
  if found and v_rule.enabled and v_rule.amount > 0 then
    insert into public.community_mileage_ledger(user_id, amount, reason, source_id, earned_on)
    select p_user_id, v_rule.amount, 'workout', s.id, s.day
    from (
      select x.id, x.day, row_number() over (partition by x.day order by x.at, x.id) as n
      from (
        select e.exercise_session_id as id, e.completed_at as at,
               (e.completed_at at time zone 'Asia/Seoul')::date as day
        from public.exercise_sessions e
        where e.user_id = p_user_id and e.status = 'completed' and e.completed_at >= v_rule.starts_at
          and not exists (select 1 from public.community_mileage_ledger l
                          where l.user_id = p_user_id and l.reason = 'workout'
                            and l.source_id = e.exercise_session_id)) x
    ) s
    where s.n + (select count(*) from public.community_mileage_ledger l
                 where l.user_id = p_user_id and l.reason = 'workout' and l.earned_on = s.day)
          <= coalesce(v_rule.daily_limit, 2147483647);
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
                            and l.source_id = m.meal_log_id)) x
    ) s
    where s.n + (select count(*) from public.community_mileage_ledger l
                 where l.user_id = p_user_id and l.reason = 'meal_log' and l.earned_on = s.day)
          <= coalesce(v_rule.daily_limit, 2147483647);
  end if;

  return public.community_mileage_summary(p_user_id);
end;
$$;

create function public.community_mileage_history(
  p_user_id uuid, p_before_created_at timestamptz, p_before_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'entry_id', l.entry_id, 'amount', l.amount, 'reason', l.reason, 'created_at', l.created_at)
      order by l.created_at desc, l.entry_id desc)
    from (
      select * from public.community_mileage_ledger l
      where l.user_id = p_user_id
        and (p_before_created_at is null or (l.created_at, l.entry_id) < (p_before_created_at, p_before_id))
      order by l.created_at desc, l.entry_id desc
      limit p_limit
    ) l), '[]'::jsonb);
end;
$$;

create function public.community_membership(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'active', coalesce(m.expires_at > now(), false),
    'plan', m.plan, 'source', m.source, 'expires_at', m.expires_at,
    'demo_available', coalesce((select r.enabled and r.amount > 0 from public.community_rules r
                                where r.rule_key = 'membership_demo_days'), false),
    'demo_days', (select r.amount from public.community_rules r where r.rule_key = 'membership_demo_days'))
  from (select 1) one
  left join public.community_memberships m on m.user_id = p_user_id
$$;

-- Demo only: no payment. Extends from the later of now and the current end.
create function public.community_start_demo_membership(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_rule public.community_rules;
begin
  if p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  select * into v_rule from public.community_rules where rule_key = 'membership_demo_days';
  if not found or not v_rule.enabled or v_rule.amount <= 0 then
    raise exception using message = 'COMMUNITY_DEMO_UNAVAILABLE', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  insert into public.community_memberships as m (user_id, source, started_at, expires_at)
    values (p_user_id, 'demo', clock_timestamp(), clock_timestamp() + make_interval(days => v_rule.amount))
    on conflict (user_id) do update set
      source = 'demo',
      started_at = case when m.expires_at > now() then m.started_at else clock_timestamp() end,
      expires_at = greatest(m.expires_at, clock_timestamp()) + make_interval(days => v_rule.amount);
  return public.community_membership(p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Clubs
-- ---------------------------------------------------------------------------

create function public.community_club_view(p_viewer uuid, p_club public.community_clubs)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'club_id', p_club.club_id,
    'name', p_club.name,
    'description', p_club.description,
    'category', p_club.category,
    'owner', public.community_author(p_club.owner_user_id),
    'member_count', (select count(*) from public.community_club_members m where m.club_id = p_club.club_id),
    'post_count', (select count(*) from public.community_posts p where p.club_id = p_club.club_id),
    'is_member', exists (select 1 from public.community_club_members m
                         where m.club_id = p_club.club_id and m.user_id = p_viewer),
    'is_owner', p_club.owner_user_id = p_viewer,
    'created_at', p_club.created_at)
$$;

-- Clubs of users blocked with the viewer are hidden.
create function public.community_visible_club(p_viewer uuid, p_club_id uuid)
returns public.community_clubs language plpgsql stable security invoker set search_path = '' as $$
declare
  v_club public.community_clubs;
begin
  select * into v_club from public.community_clubs where club_id = p_club_id;
  if not found or public.community_blocked_between(p_viewer, v_club.owner_user_id) then
    raise exception using message = 'COMMUNITY_CLUB_NOT_FOUND', errcode = 'P0001';
  end if;
  return v_club;
end;
$$;

-- Free for members with an active membership; otherwise spends club_create_cost mileage.
-- A user owns at most five clubs.
create function public.community_create_club(
  p_user_id uuid, p_name text, p_description text, p_category text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_description text := nullif(btrim(p_description), '');
  v_rule public.community_rules;
  v_cost integer := 0;
  v_club public.community_clubs;
  v_club_id uuid := gen_random_uuid();
begin
  if p_user_id is null or v_name is null or char_length(v_name) not between 2 and 30
     or char_length(v_description) > 300
     or p_category is null
     or p_category not in ('running', 'strength', 'diet', 'yoga', 'hiking', 'cycling', 'sports', 'etc') then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_writable(p_user_id);
  perform public.community_require_nickname(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-mileage', 0));
  if (select count(*) from public.community_clubs where owner_user_id = p_user_id) >= 5 then
    raise exception using message = 'COMMUNITY_CLUB_LIMIT', errcode = 'P0001';
  end if;
  if exists (select 1 from public.community_clubs where lower(name) = lower(v_name)) then
    raise exception using message = 'COMMUNITY_CLUB_NAME_TAKEN', errcode = 'P0001';
  end if;
  if not public.community_membership_active(p_user_id) then
    select * into v_rule from public.community_rules where rule_key = 'club_create_cost';
    if not found or not v_rule.enabled then
      raise exception using message = 'COMMUNITY_MEMBERSHIP_REQUIRED', errcode = 'P0001';
    end if;
    v_cost := v_rule.amount;
    if public.community_mileage_balance(p_user_id) < v_cost then
      raise exception using message = 'COMMUNITY_MILEAGE_NOT_ENOUGH', errcode = 'P0001';
    end if;
  end if;
  begin
    insert into public.community_clubs(club_id, owner_user_id, name, description, category)
      values (v_club_id, p_user_id, v_name, v_description, p_category) returning * into v_club;
  exception when unique_violation then
    raise exception using message = 'COMMUNITY_CLUB_NAME_TAKEN', errcode = 'P0001';
  end;
  insert into public.community_club_members(club_id, user_id, role) values (v_club_id, p_user_id, 'owner');
  if v_cost > 0 then
    insert into public.community_mileage_ledger(user_id, amount, reason, source_id)
      values (p_user_id, -v_cost, 'club_create', v_club_id);
  end if;
  return public.community_club_view(p_user_id, v_club) || jsonb_build_object(
    'paid_with', case when v_cost > 0 then 'mileage' else 'membership' end, 'mileage_spent', v_cost);
end;
$$;

-- Newest first. Scope 'all' or 'mine' (clubs the viewer belongs to); optional category.
create function public.community_club_list(
  p_viewer uuid, p_scope text, p_category text,
  p_before_created_at timestamptz, p_before_club_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_scope is null or p_scope not in ('all', 'mine')
     or (p_category is not null
         and p_category not in ('running', 'strength', 'diet', 'yoga', 'hiking', 'cycling', 'sports', 'etc'))
     or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_club_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_club_view(p_viewer, s.c) order by (s.c).created_at desc, (s.c).club_id desc)
    from (
      select c
      from public.community_clubs c
      where (p_before_created_at is null or (c.created_at, c.club_id) < (p_before_created_at, p_before_club_id))
        and (p_category is null or c.category = p_category)
        and (p_scope = 'all' or exists (select 1 from public.community_club_members m
                                        where m.club_id = c.club_id and m.user_id = p_viewer))
        and not public.community_blocked_between(p_viewer, c.owner_user_id)
      order by c.created_at desc, c.club_id desc
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

create function public.community_get_club(p_viewer uuid, p_club_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_club_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return public.community_club_view(p_viewer, public.community_visible_club(p_viewer, p_club_id));
end;
$$;

-- Join or leave. The owner cannot leave. Joining holds the club row so the club cannot be
-- removed (owner account deletion) between the check and the insert.
create function public.community_set_club_membership(p_user_id uuid, p_club_id uuid, p_joined boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_club public.community_clubs;
begin
  if p_user_id is null or p_club_id is null or p_joined is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  v_club := public.community_visible_club(p_user_id, p_club_id);
  if p_joined then
    perform public.community_require_writable(p_user_id);
    perform public.community_require_nickname(p_user_id);
    perform 1 from public.community_clubs where club_id = p_club_id for share;
    if not found then
      raise exception using message = 'COMMUNITY_CLUB_NOT_FOUND', errcode = 'P0001';
    end if;
    insert into public.community_club_members(club_id, user_id) values (p_club_id, p_user_id)
      on conflict do nothing;
  else
    if v_club.owner_user_id = p_user_id then
      raise exception using message = 'COMMUNITY_CLUB_OWNER', errcode = 'P0001';
    end if;
    delete from public.community_club_members where club_id = p_club_id and user_id = p_user_id;
  end if;
  return jsonb_build_object('club_id', p_club_id, 'joined', p_joined,
    'member_count', (select count(*) from public.community_club_members m where m.club_id = p_club_id));
end;
$$;

-- Members only. Same rules as community_create_post (it does the work), then tags the club.
create function public.community_create_club_post(
  p_user_id uuid, p_club_id uuid, p_content text, p_upload_ids uuid[]
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
begin
  if p_user_id is null or p_club_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_visible_club(p_user_id, p_club_id);
  perform public.community_require_writable(p_user_id);
  if not exists (select 1 from public.community_club_members m
                 where m.club_id = p_club_id and m.user_id = p_user_id) then
    raise exception using message = 'COMMUNITY_CLUB_MEMBERS_ONLY', errcode = 'P0001';
  end if;
  v_item := public.community_create_post(p_user_id, p_content, p_upload_ids);
  update public.community_posts set club_id = p_club_id where post_id = (v_item->>'post_id')::uuid;
  return v_item;
end;
$$;

-- A club's posts, newest first, with the feed's block and report rules.
create function public.community_club_feed(
  p_viewer uuid, p_club_id uuid, p_before_created_at timestamptz, p_before_item_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_club_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_item_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_visible_club(p_viewer, p_club_id);
  return coalesce((
    select jsonb_agg(public.community_feed_item(p_viewer, s.entry)
                     order by (s.entry).created_at desc, (s.entry).post_id desc)
    from (
      select f as entry
      from public.community_posts f
      where f.club_id = p_club_id
        and (p_before_created_at is null
             or (f.created_at, f.post_id) < (p_before_created_at, p_before_item_id))
        and not public.community_blocked_between(p_viewer, f.user_id)
        and not exists (
          select 1 from public.community_reports r
          where r.reporter_user_id = p_viewer and r.target_type = 'post' and r.target_id = f.post_id)
      order by f.created_at desc, f.post_id desc
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

-- Same as in 20261015090000, except that club posts stay out of the 'all' and 'following'
-- feeds (they show in their club and on the author's profile).
create or replace function public.community_timeline(
  p_viewer uuid, p_scope text, p_user_id uuid,
  p_before_created_at timestamptz, p_before_item_id uuid, p_limit integer
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_viewer is null or p_scope is null or p_scope not in ('all', 'following', 'user')
     or (p_scope = 'user') <> (p_user_id is not null)
     or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_item_id is null) then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_scope = 'user' then
    perform public.community_require_visible_user(p_viewer, p_user_id);
  end if;
  return coalesce((
    select jsonb_agg(public.community_feed_item(p_viewer, s.entry)
                     order by (s.entry).created_at desc, (s.entry).post_id desc)
    from (
      select f as entry
      from public.community_posts f
      left join public.community_posts o on o.post_id = f.repost_of_post_id
      where (p_before_created_at is null
             or (f.created_at, f.post_id) < (p_before_created_at, p_before_item_id))
        and (p_scope = 'user' or f.club_id is null)
        and case p_scope
              when 'user' then f.user_id = p_user_id
              when 'following' then f.user_id = p_viewer or exists (
                select 1 from public.community_follows w
                where w.follower_user_id = p_viewer and w.following_user_id = f.user_id)
              else true end
        and not public.community_blocked_between(p_viewer, f.user_id)
        and (o.post_id is null or not public.community_blocked_between(p_viewer, o.user_id))
        and not exists (
          select 1 from public.community_reports r
          where r.reporter_user_id = p_viewer and r.target_type = 'post'
            and r.target_id = coalesce(f.repost_of_post_id, f.post_id))
      order by f.created_at desc, f.post_id desc
      limit p_limit
    ) s), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

-- Same as in 20261015090000, plus owned clubs. Mileage, membership and club-member rows have
-- user_id, so the generic purge in cascade_account_deletion() removes them afterwards.
create or replace function public.community_delete_user_data(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  -- Concurrent account deletions clean community rows one at a time. Without this, two leaving
  -- users with likes or comments on each other's posts delete the same rows in opposite orders
  -- (40P01), and two leaving users can fix a third user's counters in different orders. Each
  -- deletion already holds its own auth.users row; the cleanup skips posts of other leaving
  -- users (begin_account_deletion runs first), so it never waits on another leaving account.
  perform pg_advisory_xact_lock(hashtextextended('community:account-deletion', 0));
  -- Posts whose authors are also mid-deletion disappear anyway; updating them would trip the
  -- write guard and block this deletion until the other one finishes.
  update public.community_posts o set like_count = o.like_count - x.n
    from (select post_id, count(*)::integer as n from public.community_post_likes
          where user_id = p_user_id group by post_id) x
    where o.post_id = x.post_id and o.user_id <> p_user_id
      and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = o.user_id);
  update public.community_posts o set comment_count = o.comment_count - x.n
    from (select post_id, count(*)::integer as n from public.community_comments
          where user_id = p_user_id group by post_id) x
    where o.post_id = x.post_id and o.user_id <> p_user_id
      and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = o.user_id);
  update public.community_posts o set repost_count = o.repost_count - x.n
    from (select repost_of_post_id as post_id, count(*)::integer as n from public.community_posts
          where user_id = p_user_id and repost_of_post_id is not null group by repost_of_post_id) x
    where o.post_id = x.post_id and o.user_id <> p_user_id
      and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = o.user_id);
  delete from public.community_post_likes where user_id = p_user_id;
  delete from public.community_comments where user_id = p_user_id;
  -- Other users' reposts, likes and comments on this user's posts go with the posts.
  delete from public.community_posts r using public.community_posts o
    where r.repost_of_post_id = o.post_id and o.user_id = p_user_id;
  delete from public.community_post_likes l using public.community_posts o
    where l.post_id = o.post_id and o.user_id = p_user_id;
  delete from public.community_comments c using public.community_posts o
    where c.post_id = o.post_id and o.user_id = p_user_id;
  delete from public.community_posts where user_id = p_user_id;
  delete from public.community_uploads where user_id = p_user_id;
  delete from public.community_blocks where blocker_user_id = p_user_id or blocked_user_id = p_user_id;
  delete from public.community_reports where reporter_user_id = p_user_id or target_user_id = p_user_id;
  delete from public.community_follows where follower_user_id = p_user_id or following_user_id = p_user_id;
  delete from public.community_notifications where user_id = p_user_id or actor_user_id = p_user_id;
  -- Owned clubs pass to the earliest-joined member who is not leaving.
  update public.community_clubs c set owner_user_id = h.user_id
    from (select distinct on (m.club_id) m.club_id, m.user_id
          from public.community_club_members m
          join public.community_clubs oc on oc.club_id = m.club_id and oc.owner_user_id = p_user_id
          where m.user_id <> p_user_id
            and not exists (select 1 from autofit_integrity.account_deletions d where d.user_id = m.user_id)
          order by m.club_id, m.joined_at, m.user_id) h
    where c.club_id = h.club_id;
  update public.community_club_members m set role = 'owner'
    from public.community_clubs c
    where c.club_id = m.club_id and c.owner_user_id = m.user_id and m.role <> 'owner';
  -- Clubs nobody can take over are removed. Earlier posts of former members keep their
  -- club_id and stay visible on the authors' profiles only.
  with gone as (delete from public.community_clubs where owner_user_id = p_user_id returning club_id)
  delete from public.community_club_members m using gone g where m.club_id = g.club_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges (create or replace above keeps the existing grants)
-- ---------------------------------------------------------------------------

revoke all on function
  public.community_mileage_balance(uuid),
  public.community_membership_active(uuid),
  public.community_rule_list(),
  public.community_mileage_summary(uuid),
  public.community_sync_mileage(uuid),
  public.community_mileage_history(uuid, timestamptz, uuid, integer),
  public.community_membership(uuid),
  public.community_start_demo_membership(uuid),
  public.community_club_view(uuid, public.community_clubs),
  public.community_visible_club(uuid, uuid),
  public.community_create_club(uuid, text, text, text),
  public.community_club_list(uuid, text, text, timestamptz, uuid, integer),
  public.community_get_club(uuid, uuid),
  public.community_set_club_membership(uuid, uuid, boolean),
  public.community_create_club_post(uuid, uuid, text, uuid[]),
  public.community_club_feed(uuid, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function
  public.community_mileage_balance(uuid),
  public.community_membership_active(uuid),
  public.community_rule_list(),
  public.community_mileage_summary(uuid),
  public.community_sync_mileage(uuid),
  public.community_mileage_history(uuid, timestamptz, uuid, integer),
  public.community_membership(uuid),
  public.community_start_demo_membership(uuid),
  public.community_club_view(uuid, public.community_clubs),
  public.community_visible_club(uuid, uuid),
  public.community_create_club(uuid, text, text, text),
  public.community_club_list(uuid, text, text, timestamptz, uuid, integer),
  public.community_get_club(uuid, uuid),
  public.community_set_club_membership(uuid, uuid, boolean),
  public.community_create_club_post(uuid, uuid, text, uuid[]),
  public.community_club_feed(uuid, uuid, timestamptz, uuid, integer)
  to service_role;
