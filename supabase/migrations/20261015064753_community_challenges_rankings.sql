-- Community stages 4-5: challenges and weekly rankings.
-- Requires 20261015130000_community_mileage_membership_clubs.sql. Applied files stay untouched;
-- this file only adds tables and functions and widens one check constraint (mileage reasons).
-- The team has not defined challenges or rankings yet:
--   * challenges are rows in community_challenges (two provisional examples below), so new
--     ones or other goals and rewards are a data update. Progress is counted from the existing
--     workout and meal records; nobody uploads proof.
--   * rankings show only users who opted in, because workout activity is not shared
--     automatically (community default decided with the team).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.community_challenges (
  challenge_id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 40),
  description text check (description is null or char_length(description) between 1 and 300),
  -- Days (Korean date) with a completed workout or a recorded meal.
  metric text not null check (metric in ('workout_days', 'meal_log_days')),
  goal integer not null check (goal between 1 and 366),
  starts_on date not null,
  ends_on date not null,
  reward_mileage integer not null default 0 check (reward_mileage >= 0),
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default clock_timestamp(),
  check (ends_on >= starts_on),
  check (goal <= ends_on - starts_on + 1)
);
create index community_challenges_period_idx on public.community_challenges(ends_on, starts_on);
insert into public.community_challenges(title, description, metric, goal, starts_on, ends_on, reward_mileage, note)
select v.title, v.description, v.metric, v.goal, d.today, d.today + 13, v.reward, v.note
from (select (now() at time zone 'Asia/Seoul')::date as today) d
cross join (values
  ('2주 운동 습관', '2주 동안 운동을 5일 완료해 보세요.', 'workout_days', 5, 50,
   '임시값(팀 결정 전): 예시 챌린지. 기간·목표·보상은 바뀔 수 있음'),
  ('식단 기록 챌린지', '2주 동안 식단을 7일 기록해 보세요.', 'meal_log_days', 7, 30,
   '임시값(팀 결정 전): 예시 챌린지. 기간·목표·보상은 바뀔 수 있음')
) as v(title, description, metric, goal, reward, note);

create table public.community_challenge_participants (
  challenge_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default clock_timestamp(),
  rewarded_at timestamptz,
  primary key (challenge_id, user_id)
);
create index community_challenge_participants_user_idx
  on public.community_challenge_participants(user_id, joined_at desc);

-- Opt-in list for rankings. Not in the list = never shown to others.
create table public.community_ranking_participants (
  user_id uuid primary key,
  joined_at timestamptz not null default clock_timestamp()
);

-- Challenge rewards are mileage too.
alter table public.community_mileage_ledger drop constraint community_mileage_ledger_reason_check;
alter table public.community_mileage_ledger add constraint community_mileage_ledger_reason_check
  check (reason in ('workout', 'meal_log', 'club_create', 'challenge'));

alter table public.community_challenges enable row level security;
alter table public.community_challenge_participants enable row level security;
alter table public.community_ranking_participants enable row level security;
revoke all on public.community_challenges, public.community_challenge_participants,
  public.community_ranking_participants from public, anon, authenticated;
-- Challenges are created and changed by the DB owner only (SQL), never through the API.
grant select on public.community_challenges to service_role;
grant select, insert, update, delete on public.community_challenge_participants,
  public.community_ranking_participants to service_role;

-- user_id tables get the stock account-deletion guards; the generic purge removes their rows.
do $$
declare
  t text;
begin
  foreach t in array array['community_challenge_participants', 'community_ranking_participants'] loop
    execute format('create trigger check_user_reference before insert or update on public.%I
      for each row execute function autofit_integrity.check_user_reference()', t);
    execute format('create trigger zzz_check_account_writable before insert or update on public.%I
      for each row execute function autofit_integrity.check_account_writable()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

create function public.community_today()
returns date language sql stable security invoker set search_path = '' as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

-- Distinct Korean dates inside the challenge period with the measured activity.
create function public.community_challenge_progress(p_user_id uuid, p_challenge public.community_challenges)
returns integer language sql stable security invoker set search_path = '' as $$
  select case p_challenge.metric
    when 'workout_days' then (
      select count(distinct (e.completed_at at time zone 'Asia/Seoul')::date)
      from public.exercise_sessions e
      where e.user_id = p_user_id and e.status = 'completed'
        and (e.completed_at at time zone 'Asia/Seoul')::date between p_challenge.starts_on and p_challenge.ends_on)
    else (
      select count(distinct (m.created_at at time zone 'Asia/Seoul')::date)
      from public.meal_logs m
      where m.user_id = p_user_id and m.status = 'recorded'
        and (m.created_at at time zone 'Asia/Seoul')::date between p_challenge.starts_on and p_challenge.ends_on)
  end::integer
$$;

create function public.community_challenge_view(p_viewer uuid, p_challenge public.community_challenges)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_me public.community_challenge_participants;
  v_progress integer;
  v_today date := public.community_today();
begin
  select * into v_me from public.community_challenge_participants
    where challenge_id = p_challenge.challenge_id and user_id = p_viewer;
  v_progress := public.community_challenge_progress(p_viewer, p_challenge);
  return jsonb_build_object(
    'challenge_id', p_challenge.challenge_id,
    'title', p_challenge.title,
    'description', p_challenge.description,
    'metric', p_challenge.metric,
    'goal', p_challenge.goal,
    'starts_on', p_challenge.starts_on,
    'ends_on', p_challenge.ends_on,
    'reward_mileage', p_challenge.reward_mileage,
    'note', p_challenge.note,
    'phase', case when v_today < p_challenge.starts_on then 'upcoming'
                  when v_today > p_challenge.ends_on then 'ended' else 'ongoing' end,
    'participant_count', (select count(*) from public.community_challenge_participants c
                          where c.challenge_id = p_challenge.challenge_id),
    'joined', v_me.user_id is not null,
    'progress', least(v_progress, p_challenge.goal),
    'completed', v_progress >= p_challenge.goal,
    'rewarded', v_me.rewarded_at is not null,
    'can_claim', v_me.user_id is not null and v_me.rewarded_at is null and v_progress >= p_challenge.goal);
end;
$$;

-- Ongoing and upcoming challenges first, then ones that ended within the last week (so
-- rewards can still be claimed).
create function public.community_challenge_list(p_viewer uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_today date := public.community_today();
begin
  if p_viewer is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_challenge_view(p_viewer, c)
                     order by (c.ends_on < v_today), c.ends_on, c.starts_on, c.challenge_id)
    from public.community_challenges c
    where c.enabled and c.ends_on >= v_today - 7), '[]'::jsonb);
end;
$$;

create function public.community_visible_challenge(p_challenge_id uuid)
returns public.community_challenges language plpgsql stable security invoker set search_path = '' as $$
declare
  v_challenge public.community_challenges;
begin
  select * into v_challenge from public.community_challenges where challenge_id = p_challenge_id and enabled;
  if not found then
    raise exception using message = 'COMMUNITY_CHALLENGE_NOT_FOUND', errcode = 'P0001';
  end if;
  return v_challenge;
end;
$$;

-- Join until the last day; leaving is allowed until the reward is claimed.
create function public.community_set_challenge_participation(
  p_user_id uuid, p_challenge_id uuid, p_joined boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_challenge public.community_challenges;
begin
  if p_user_id is null or p_challenge_id is null or p_joined is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  v_challenge := public.community_visible_challenge(p_challenge_id);
  if p_joined then
    perform public.community_require_writable(p_user_id);
    if public.community_today() > v_challenge.ends_on then
      raise exception using message = 'COMMUNITY_CHALLENGE_ENDED', errcode = 'P0001';
    end if;
    insert into public.community_challenge_participants(challenge_id, user_id)
      values (p_challenge_id, p_user_id) on conflict do nothing;
  else
    if exists (select 1 from public.community_challenge_participants
               where challenge_id = p_challenge_id and user_id = p_user_id and rewarded_at is not null) then
      raise exception using message = 'COMMUNITY_CHALLENGE_ALREADY_CLAIMED', errcode = 'P0001';
    end if;
    delete from public.community_challenge_participants
      where challenge_id = p_challenge_id and user_id = p_user_id;
  end if;
  return public.community_challenge_view(p_user_id, v_challenge);
end;
$$;

-- Pays the reward once (ledger source = challenge) when the goal is reached.
create function public.community_claim_challenge(p_user_id uuid, p_challenge_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_challenge public.community_challenges;
  v_rewarded timestamptz;
begin
  if p_user_id is null or p_challenge_id is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  v_challenge := public.community_visible_challenge(p_challenge_id);
  perform public.community_require_writable(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':community-mileage', 0));
  select rewarded_at into v_rewarded from public.community_challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id for update;
  if not found then
    raise exception using message = 'COMMUNITY_CHALLENGE_NOT_JOINED', errcode = 'P0001';
  end if;
  if v_rewarded is not null then
    raise exception using message = 'COMMUNITY_CHALLENGE_ALREADY_CLAIMED', errcode = 'P0001';
  end if;
  if public.community_challenge_progress(p_user_id, v_challenge) < v_challenge.goal then
    raise exception using message = 'COMMUNITY_CHALLENGE_NOT_COMPLETED', errcode = 'P0001';
  end if;
  if v_challenge.reward_mileage > 0 then
    insert into public.community_mileage_ledger(user_id, amount, reason, source_id, earned_on)
      values (p_user_id, v_challenge.reward_mileage, 'challenge', p_challenge_id, public.community_today());
  end if;
  update public.community_challenge_participants set rewarded_at = clock_timestamp()
    where challenge_id = p_challenge_id and user_id = p_user_id;
  return public.community_challenge_view(p_user_id, v_challenge);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rankings (this Korean week, Monday to Sunday)
-- ---------------------------------------------------------------------------

create function public.community_set_ranking_participation(p_user_id uuid, p_participating boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_participating is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  if p_participating then
    perform public.community_require_writable(p_user_id);
    perform public.community_require_nickname(p_user_id);
    insert into public.community_ranking_participants(user_id) values (p_user_id) on conflict do nothing;
  else
    delete from public.community_ranking_participants where user_id = p_user_id;
  end if;
  return jsonb_build_object('participating', p_participating);
end;
$$;

-- metric: 'workout' (completed workouts) or 'mileage' (mileage earned, as credited so far).
-- scope: 'all', 'following' (followed users and the viewer) or 'club' (members of p_club_id).
-- Only opted-in users with a score above zero are ranked; ties share a rank.
create function public.community_ranking(
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
          where e.user_id = c.user_id and e.status = 'completed'
            and (e.completed_at at time zone 'Asia/Seoul')::date between v_start and v_end)
        else (
          select coalesce(sum(l.amount), 0) from public.community_mileage_ledger l
          where l.user_id = c.user_id and l.amount > 0 and l.earned_on between v_start and v_end)
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

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function
  public.community_today(),
  public.community_challenge_progress(uuid, public.community_challenges),
  public.community_challenge_view(uuid, public.community_challenges),
  public.community_challenge_list(uuid),
  public.community_visible_challenge(uuid),
  public.community_set_challenge_participation(uuid, uuid, boolean),
  public.community_claim_challenge(uuid, uuid),
  public.community_set_ranking_participation(uuid, boolean),
  public.community_ranking(uuid, text, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function
  public.community_today(),
  public.community_challenge_progress(uuid, public.community_challenges),
  public.community_challenge_view(uuid, public.community_challenges),
  public.community_challenge_list(uuid),
  public.community_visible_challenge(uuid),
  public.community_set_challenge_participation(uuid, uuid, boolean),
  public.community_claim_challenge(uuid, uuid),
  public.community_set_ranking_participation(uuid, boolean),
  public.community_ranking(uuid, text, text, uuid, integer)
  to service_role;
