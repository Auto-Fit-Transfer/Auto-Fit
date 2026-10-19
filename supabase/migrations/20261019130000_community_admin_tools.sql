-- Community operator tools: moderators manage challenges and the mileage rules in the app, so
-- the team can set the still-provisional numbers without SQL.
-- Requires 20261019022935_community_moderation.sql (moderators) and the stage 3-5 files.
-- Applied files stay untouched; this file only adds functions and lets the service role write
-- the two settings tables, which FastAPI does only through these moderator-checked functions.

grant insert, update on public.community_challenges to service_role;
grant update on public.community_rules to service_role;

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

create function public.community_admin_challenge_view(p_challenge public.community_challenges)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'challenge_id', p_challenge.challenge_id,
    'title', p_challenge.title,
    'description', p_challenge.description,
    'metric', p_challenge.metric,
    'goal', p_challenge.goal,
    'starts_on', p_challenge.starts_on,
    'ends_on', p_challenge.ends_on,
    'reward_mileage', p_challenge.reward_mileage,
    'enabled', p_challenge.enabled,
    'note', p_challenge.note,
    'participant_count', (select count(*) from public.community_challenge_participants p
                          where p.challenge_id = p_challenge.challenge_id),
    'rewarded_count', (select count(*) from public.community_challenge_participants p
                       where p.challenge_id = p_challenge.challenge_id and p.rewarded_at is not null),
    -- Someone joined: the goal, start and reward can no longer change.
    'locked', exists (select 1 from public.community_challenge_participants p
                      where p.challenge_id = p_challenge.challenge_id))
$$;

-- Every challenge, switched off and ended ones included, latest end first.
create function public.community_admin_challenge_list(p_moderator uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_moderator is null or not public.community_is_moderator(p_moderator) then
    raise exception using message = 'COMMUNITY_FORBIDDEN', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_admin_challenge_view(c) order by c.ends_on desc, c.created_at desc)
    from public.community_challenges c), '[]'::jsonb);
end;
$$;

-- Creates a challenge (p_challenge_id null) or changes one. Once someone joined, the measured
-- activity, goal, start date and reward stay as they were and the end date can only move later,
-- so nobody's progress or promised reward changes under them. The title, description, a later
-- end and switching the challenge on or off stay possible.
create function public.community_admin_save_challenge(
  p_moderator uuid, p_challenge_id uuid, p_title text, p_description text, p_metric text,
  p_goal integer, p_starts_on date, p_ends_on date, p_reward_mileage integer, p_enabled boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_title text := nullif(btrim(p_title), '');
  v_description text := nullif(btrim(p_description), '');
  v_old public.community_challenges;
  v_saved public.community_challenges;
begin
  if p_moderator is null or v_title is null or char_length(v_title) not between 2 and 40
     or char_length(v_description) > 300
     or p_metric is null or p_metric not in ('workout_days', 'meal_log_days')
     or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_goal is null or p_goal not between 1 and 366 or p_goal > p_ends_on - p_starts_on + 1
     or p_reward_mileage is null or p_reward_mileage not between 0 and 100000
     or p_enabled is null then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_moderator(p_moderator);
  if p_challenge_id is null then
    insert into public.community_challenges(
      title, description, metric, goal, starts_on, ends_on, reward_mileage, enabled, note)
    values (v_title, v_description, p_metric, p_goal, p_starts_on, p_ends_on, p_reward_mileage, p_enabled,
            '운영자가 만든 챌린지')
    returning * into v_saved;
  else
    select * into v_old from public.community_challenges where challenge_id = p_challenge_id for update;
    if not found then
      raise exception using message = 'COMMUNITY_CHALLENGE_NOT_FOUND', errcode = 'P0001';
    end if;
    if exists (select 1 from public.community_challenge_participants p where p.challenge_id = p_challenge_id)
       and (p_metric <> v_old.metric or p_goal <> v_old.goal or p_starts_on <> v_old.starts_on
            or p_reward_mileage <> v_old.reward_mileage or p_ends_on < v_old.ends_on) then
      raise exception using message = 'COMMUNITY_CHALLENGE_LOCKED', errcode = 'P0001';
    end if;
    update public.community_challenges set
      title = v_title, description = v_description, metric = p_metric, goal = p_goal,
      starts_on = p_starts_on, ends_on = p_ends_on, reward_mileage = p_reward_mileage, enabled = p_enabled,
      note = case when note like '임시값%' then '운영자가 정함' else note end
    where challenge_id = p_challenge_id
    returning * into v_saved;
  end if;
  return public.community_admin_challenge_view(v_saved);
end;
$$;

-- ---------------------------------------------------------------------------
-- Mileage rules
-- ---------------------------------------------------------------------------

create function public.community_admin_rule_view(p_rule public.community_rules)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'rule_key', p_rule.rule_key, 'amount', p_rule.amount, 'daily_limit', p_rule.daily_limit,
    'enabled', p_rule.enabled, 'note', p_rule.note, 'starts_at', p_rule.starts_at,
    'updated_at', p_rule.updated_at)
$$;

create function public.community_admin_rule_list(p_moderator uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_moderator is null or not public.community_is_moderator(p_moderator) then
    raise exception using message = 'COMMUNITY_FORBIDDEN', errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(public.community_admin_rule_view(r) order by r.rule_key)
    from public.community_rules r), '[]'::jsonb);
end;
$$;

-- Daily limits exist only for the earning rules. p_restart = earn only from now on (activity
-- before now never earns under this rule; use it when switching a rule back on). Without a new
-- note, a provisional note becomes '운영자가 정함' so the app stops calling the rule provisional.
create function public.community_admin_update_rule(
  p_moderator uuid, p_rule_key text, p_amount integer, p_daily_limit integer, p_enabled boolean,
  p_restart boolean, p_note text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_note text := nullif(btrim(p_note), '');
  v_rule public.community_rules;
begin
  if p_moderator is null or p_rule_key is null
     or p_amount is null or p_amount not between 0 and 100000
     or (p_daily_limit is not null and (p_daily_limit not between 0 and 100
                                        or p_rule_key not in ('earn_workout', 'earn_meal_log')))
     or p_enabled is null or p_restart is null or char_length(v_note) > 100 then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  perform public.community_require_moderator(p_moderator);
  update public.community_rules set
    amount = p_amount, daily_limit = p_daily_limit, enabled = p_enabled,
    starts_at = case when p_restart then now() else starts_at end,
    note = coalesce(v_note, case when note like '임시값%' then '운영자가 정함' else note end),
    updated_at = now()
  where rule_key = p_rule_key
  returning * into v_rule;
  if not found then
    raise exception using message = 'COMMUNITY_INVALID_INPUT', errcode = 'P0001';
  end if;
  return public.community_admin_rule_view(v_rule);
end;
$$;

revoke all on function
  public.community_admin_challenge_view(public.community_challenges),
  public.community_admin_challenge_list(uuid),
  public.community_admin_save_challenge(uuid, uuid, text, text, text, integer, date, date, integer, boolean),
  public.community_admin_rule_view(public.community_rules),
  public.community_admin_rule_list(uuid),
  public.community_admin_update_rule(uuid, text, integer, integer, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function
  public.community_admin_challenge_view(public.community_challenges),
  public.community_admin_challenge_list(uuid),
  public.community_admin_save_challenge(uuid, uuid, text, text, text, integer, date, date, integer, boolean),
  public.community_admin_rule_view(public.community_rules),
  public.community_admin_rule_list(uuid),
  public.community_admin_update_rule(uuid, text, integer, integer, boolean, boolean, text)
  to service_role;
