-- A weekly slot has no diet_meal_id. Keep its feedback separate from legacy
-- diet_feedback, while actual food remains in meal_logs/meal_log_items.
create table public.weekly_diet_feedback (
  weekly_diet_feedback_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  weekly_diet_plan_id uuid not null,
  plan_day text not null check (plan_day in (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  weekly_plan_version integer not null check (weekly_plan_version > 0),
  feedback_type text not null check (feedback_type in ('eaten', 'different_food', 'skipped')),
  meal_snapshot jsonb not null check (jsonb_typeof(meal_snapshot) = 'object'),
  meal_log_id uuid,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, weekly_diet_plan_id, plan_day, meal_type),
  check ((feedback_type = 'skipped') = (meal_log_id is null))
);
create index idx_weekly_diet_feedback_user_log on public.weekly_diet_feedback(user_id, meal_log_id)
  where meal_log_id is not null;
create index idx_weekly_diet_feedback_user_recorded
  on public.weekly_diet_feedback(user_id, recorded_at, meal_type);
alter table public.weekly_diet_feedback enable row level security;
revoke all on public.weekly_diet_feedback from public, anon, authenticated;
grant select, insert, update, delete on public.weekly_diet_feedback to service_role;
insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('weekly_diet_feedback', 'meal_log_id', 'meal_logs', 'meal_log_id');
create trigger check_user_reference before insert or update on public.weekly_diet_feedback
  for each row execute function autofit_integrity.check_user_reference();
create trigger z_check_business_references before insert or update on public.weekly_diet_feedback
  for each row execute function autofit_integrity.check_business_references();
create trigger zzz_check_account_writable before insert or update on public.weekly_diet_feedback
  for each row execute function autofit_integrity.check_account_writable();

-- Both old daily feedback and new weekly feedback take one slot lock before
-- checking the other source. This closes the cross-app insert race.
create function public.lock_diet_feedback_slot(
  p_user_id uuid, p_date date, p_meal_type text
)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_date is null
     or p_meal_type is null
     or p_meal_type not in ('breakfast','lunch','dinner','snack') then
    raise exception 'DIET_FEEDBACK_SLOT_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'diet-feedback-slot:' || p_user_id::text || ':' || p_date::text || ':' || p_meal_type, 0));
end $$;
revoke all on function public.lock_diet_feedback_slot(uuid,date,text)
  from public, anon, authenticated;
grant execute on function public.lock_diet_feedback_slot(uuid,date,text) to service_role;

create function public.guard_legacy_daily_feedback_against_weekly()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_date date;
  v_meal_type text;
begin
  select r.recommendation_date, m.meal_type into v_date, v_meal_type
    from public.diet_meals m
    join public.diet_recommendations r
      on r.diet_recommendation_id = m.diet_recommendation_id
    where m.diet_meal_id = new.diet_meal_id and r.user_id = new.user_id;
  if not found then
    return new; -- Existing business-reference/ownership triggers reject it.
  end if;
  perform public.lock_diet_feedback_slot(new.user_id, v_date, v_meal_type);
  if exists (
    select 1 from public.weekly_diet_feedback f
    where f.user_id = new.user_id
      and f.meal_type = v_meal_type
      and f.recorded_at >= (v_date::timestamp at time zone 'Asia/Seoul')
      and f.recorded_at < ((v_date + 1)::timestamp at time zone 'Asia/Seoul')
  ) then
    raise exception 'DIET_WEEKLY_RECORD_EXISTS' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function public.guard_legacy_daily_feedback_against_weekly()
  from public, anon, authenticated, service_role;
create trigger z_guard_legacy_daily_feedback_against_weekly
  before insert or update on public.diet_feedback
  for each row execute function public.guard_legacy_daily_feedback_against_weekly();

create function public.write_weekly_diet_feedback(
  p_user_id uuid, p_plan_id uuid, p_expected_version integer,
  p_day text, p_meal_type text, p_feedback_type text,
  p_eaten_at timestamptz, p_actual_items jsonb, p_create boolean
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_plan public.weekly_diet_plans;
  v_feedback public.weekly_diet_feedback;
  v_log public.meal_logs;
  v_meal jsonb;
  v_source_meal jsonb;
  v_item jsonb;
  v_order integer := 0;
  v_slot_date date;
begin
  if p_user_id is null or p_plan_id is null or p_expected_version is null
     or p_expected_version < 1 or p_create is null
     or p_day is null or p_day not in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
     or p_meal_type is null or p_meal_type not in ('breakfast','lunch','dinner','snack')
     or p_feedback_type is null or p_feedback_type not in ('eaten','different_food','skipped')
     or jsonb_typeof(p_actual_items) is distinct from 'array'
     or jsonb_array_length(p_actual_items) > 20
     or (p_feedback_type = 'different_food' and jsonb_array_length(p_actual_items) = 0)
     or (p_feedback_type <> 'different_food' and jsonb_array_length(p_actual_items) <> 0)
     or (p_create and p_eaten_at is null) then
    raise exception 'WEEKLY_FEEDBACK_INVALID' using errcode = '22023';
  end if;

  -- Lock the plan before checking its version. Concurrent regeneration or
  -- tomorrow rebalance cannot change the slot between validation and logging.
  select * into v_plan from public.weekly_diet_plans
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id for update;
  if not found then
    raise exception 'WEEKLY_DIET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_plan.version <> p_expected_version then
    raise exception 'WEEKLY_DIET_VERSION_CONFLICT' using errcode = '40001';
  end if;
  select d.value->'meals'->p_meal_type into v_meal
    from jsonb_array_elements(v_plan.result->'weekly_plan') as d(value)
    where d.value->>'day' = p_day;
  if jsonb_typeof(v_meal) is distinct from 'object' then
    raise exception 'WEEKLY_FEEDBACK_INVALID' using errcode = '22023';
  end if;

  select * into v_feedback from public.weekly_diet_feedback
    where user_id = p_user_id and weekly_diet_plan_id = p_plan_id
      and plan_day = p_day and meal_type = p_meal_type for update;
  if p_create and found then
    raise exception 'WEEKLY_FEEDBACK_EXISTS' using errcode = '23505';
  end if;
  if not p_create and not found then
    raise exception 'WEEKLY_FEEDBACK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not p_create then
    p_eaten_at := coalesce(p_eaten_at, v_feedback.recorded_at);
  end if;
  v_slot_date := v_plan.week_start_date + (array_position(
    array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
    p_day) - 1);
  if (p_eaten_at at time zone 'Asia/Seoul')::date is distinct from v_slot_date then
    raise exception 'WEEKLY_FEEDBACK_DATE_MISMATCH' using errcode = '22023';
  end if;
  perform public.lock_diet_feedback_slot(p_user_id, v_slot_date, p_meal_type);
  if exists (
    select 1 from public.diet_feedback f
    join public.diet_meals m on m.diet_meal_id = f.diet_meal_id
    join public.diet_recommendations r
      on r.diet_recommendation_id = m.diet_recommendation_id
    where f.user_id = p_user_id and r.user_id = p_user_id
      and r.recommendation_date = v_slot_date and m.meal_type = p_meal_type
  ) then
    raise exception 'WEEKLY_FEEDBACK_LEGACY_EXISTS' using errcode = '23505';
  end if;
  -- A later plan regeneration must not replace the food originally recorded.
  v_source_meal := case when p_create then v_meal else v_feedback.meal_snapshot end;
  if jsonb_typeof(v_source_meal) is distinct from 'object' then
    raise exception 'WEEKLY_FEEDBACK_LOG_MISMATCH' using errcode = '23503';
  end if;

  if v_feedback.meal_log_id is not null then
    select * into v_log from public.meal_logs
      where meal_log_id = v_feedback.meal_log_id and user_id = p_user_id
        and diet_meal_id is null for update;
    if not found then
      raise exception 'WEEKLY_FEEDBACK_LOG_MISMATCH' using errcode = '23503';
    end if;
    delete from public.meal_log_items where meal_log_id = v_log.meal_log_id;
    update public.meal_logs set
      status = case when p_feedback_type = 'skipped' then 'deleted' else 'recorded' end,
      source_type = case when p_feedback_type = 'eaten' then 'recommendation' else 'manual' end,
      eaten_at = p_eaten_at, updated_at = now()
      where meal_log_id = v_log.meal_log_id;
  end if;

  if p_feedback_type <> 'skipped' then
    if v_log.meal_log_id is null then
      insert into public.meal_logs (
        user_id, diet_meal_id, meal_type, source_type, eaten_at, status
      ) values (
        p_user_id, null, p_meal_type,
        case when p_feedback_type = 'eaten' then 'recommendation' else 'manual' end,
        p_eaten_at, 'recorded'
      ) returning * into v_log;
    end if;
    if p_feedback_type = 'eaten' then
      for v_item in select value from jsonb_array_elements(v_source_meal->'items') loop
        insert into public.meal_log_items (
          meal_log_id, food_name, quantity, unit, calories,
          carbohydrates, protein, fat, sequence_order
        ) values (
          v_log.meal_log_id, v_item->>'food_name',
          (v_item->>'portion_g')::numeric, 'g',
          (v_item->>'calories_kcal')::numeric,
          (v_item->>'carbohydrate_g')::numeric,
          (v_item->>'protein_g')::numeric,
          (v_item->>'fat_g')::numeric, v_order
        );
        v_order := v_order + 1;
      end loop;
    else
      for v_item in select value from jsonb_array_elements(p_actual_items) loop
        if nullif(btrim(v_item->>'food_name'), '') is null
           or coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
          raise exception 'WEEKLY_FEEDBACK_INVALID' using errcode = '22023';
        end if;
        insert into public.meal_log_items (
          meal_log_id, food_name, quantity, unit, calories,
          carbohydrates, protein, fat, sequence_order
        ) values (
          v_log.meal_log_id, btrim(v_item->>'food_name'),
          (v_item->>'quantity')::numeric,
          coalesce(nullif(btrim(v_item->>'unit'), ''), 'g'),
          (v_item->>'calories')::numeric,
          (v_item->>'carbohydrates')::numeric,
          (v_item->>'protein')::numeric,
          (v_item->>'fat')::numeric, v_order
        );
        v_order := v_order + 1;
      end loop;
    end if;
  end if;

  if p_create then
    insert into public.weekly_diet_feedback (
      user_id, weekly_diet_plan_id, plan_day, meal_type,
      weekly_plan_version, feedback_type, meal_snapshot, meal_log_id, recorded_at
    ) values (
      p_user_id, p_plan_id, p_day, p_meal_type, p_expected_version,
      p_feedback_type, v_meal, v_log.meal_log_id, p_eaten_at
    ) returning * into v_feedback;
  else
    update public.weekly_diet_feedback set
      feedback_type = p_feedback_type,
      meal_log_id = case when p_feedback_type = 'skipped' then null else v_log.meal_log_id end,
      recorded_at = p_eaten_at, updated_at = now()
      where weekly_diet_feedback_id = v_feedback.weekly_diet_feedback_id
      returning * into v_feedback;
  end if;
  return jsonb_build_object(
    'feedback', to_jsonb(v_feedback),
    'meal_log', case when p_feedback_type = 'skipped' then null else to_jsonb(v_log) end
  );
end $$;
revoke all on function public.write_weekly_diet_feedback(
  uuid,uuid,integer,text,text,text,timestamptz,jsonb,boolean
) from public, anon, authenticated;
grant execute on function public.write_weekly_diet_feedback(
  uuid,uuid,integer,text,text,text,timestamptz,jsonb,boolean
) to service_role;

-- A안 can mark a slot already recorded by the older test app without
-- rewriting or hiding the original daily recommendation and meal log.
create function public.list_legacy_weekly_diet_feedback(
  p_user_id uuid, p_plan_id uuid
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_start date;
  v_rows jsonb;
begin
  select week_start_date into v_start from public.weekly_diet_plans
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id;
  if not found then
    raise exception 'WEEKLY_DIET_NOT_FOUND' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(to_jsonb(slot) order by slot.date, slot.meal_type), '[]'::jsonb)
    into v_rows from (
      select distinct on (r.recommendation_date, m.meal_type)
        f.user_id, p_plan_id as weekly_diet_plan_id,
        r.recommendation_date as date,
        case extract(isodow from r.recommendation_date)::integer
          when 1 then 'monday' when 2 then 'tuesday' when 3 then 'wednesday'
          when 4 then 'thursday' when 5 then 'friday' when 6 then 'saturday'
          else 'sunday' end as plan_day,
        m.meal_type, f.diet_feedback_id, f.diet_meal_id,
        f.feedback_type, f.meal_log_id, f.recorded_at
      from public.diet_feedback f
      join public.diet_meals m on m.diet_meal_id = f.diet_meal_id
      join public.diet_recommendations r
        on r.diet_recommendation_id = m.diet_recommendation_id
      where f.user_id = p_user_id and r.user_id = p_user_id
        and r.recommendation_date between v_start and v_start + 6
      order by r.recommendation_date, m.meal_type,
               f.recorded_at desc, f.diet_feedback_id desc
    ) slot;
  return v_rows;
end $$;
revoke all on function public.list_legacy_weekly_diet_feedback(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.list_legacy_weekly_diet_feedback(uuid,uuid)
  to service_role;

-- The user's answer to today's overage prompt is shared across devices.
create table public.diet_rebalance_decisions (
  user_id uuid not null,
  decision_date date not null,
  decision text not null check (decision in ('cheat', 'adjusted')),
  preview_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, decision_date)
);
alter table public.diet_rebalance_decisions enable row level security;
revoke all on public.diet_rebalance_decisions from public, anon, authenticated;
grant select, insert, update, delete on public.diet_rebalance_decisions to service_role;
create trigger check_user_reference before insert or update on public.diet_rebalance_decisions
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.diet_rebalance_decisions
  for each row execute function autofit_integrity.check_account_writable();

create function public.diet_rebalance_today_totals(p_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_start timestamptz;
  v_end timestamptz;
  v_consumed numeric;
  v_unknown boolean;
  v_exercise numeric;
  v_running numeric;
  v_decision text;
begin
  if p_user_id is null then
    raise exception 'DIET_REBALANCE_INVALID_USER' using errcode = '22023';
  end if;
  v_start := v_today::timestamp at time zone 'Asia/Seoul';
  v_end := (v_today + 1)::timestamp at time zone 'Asia/Seoul';

  select coalesce(sum(i.calories), 0),
         coalesce(bool_or(i.meal_log_item_id is null or i.calories is null), false)
    into v_consumed, v_unknown
    from public.meal_logs l left join public.meal_log_items i on i.meal_log_id = l.meal_log_id
    where l.user_id = p_user_id and l.status = 'recorded'
      and l.eaten_at >= v_start and l.eaten_at < v_end;
  -- exercise_logs are already rolled up into the session total; adding both
  -- would count the same workout twice.
  select coalesce(sum(total_calories_burned), 0) into v_exercise
    from public.exercise_sessions
    where user_id = p_user_id and status in ('completed', 'stopped')
      and completed_at >= v_start and completed_at < v_end;
  select coalesce(sum(calories_burned), 0) into v_running
    from public.running_sessions
    where user_id = p_user_id and status = 'completed'
      and ended_at >= v_start and ended_at < v_end;
  select decision into v_decision from public.diet_rebalance_decisions
    where user_id = p_user_id and decision_date = v_today;
  return jsonb_build_object(
    'date', v_today, 'consumed_kcal', v_consumed,
    'has_unknown_calories', v_unknown,
    'exercise_burned_kcal', v_exercise, 'running_burned_kcal', v_running,
    'decision', coalesce(v_decision, 'none')
  );
end $$;
revoke all on function public.diet_rebalance_today_totals(uuid)
  from public, anon, authenticated;
grant execute on function public.diet_rebalance_today_totals(uuid) to service_role;

-- The same snapshot check protects both the cheat choice and preview workflow.
create function public.assert_diet_rebalance_today_snapshot(
  p_user_id uuid, p_expected_date date, p_snapshot jsonb
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_totals jsonb;
  v_target numeric;
  v_overage numeric;
begin
  if p_user_id is null or p_expected_date is null
     or jsonb_typeof(p_snapshot) is distinct from 'object'
     or p_expected_date <> (now() at time zone 'Asia/Seoul')::date then
    raise exception 'DIET_REBALANCE_STATUS_CHANGED' using errcode = '40001';
  end if;
  v_totals := public.diet_rebalance_today_totals(p_user_id);
  select (result#>>'{daily_target,calories_kcal}')::numeric into v_target
    from public.weekly_diet_plans
    where user_id = p_user_id
      and week_start_date = p_expected_date - (extract(isodow from p_expected_date)::integer - 1)
    for share;
  if v_target is null or v_target <= 0
     or (v_totals->>'has_unknown_calories')::boolean
     or v_totals->>'decision' <> 'none' then
    raise exception 'DIET_REBALANCE_STATUS_CHANGED' using errcode = '40001';
  end if;
  v_overage := greatest(0,
    (v_totals->>'consumed_kcal')::numeric
    - (v_totals->>'exercise_burned_kcal')::numeric
    - (v_totals->>'running_burned_kcal')::numeric - v_target);
  -- The HTTP snapshot contains JSON numbers that crossed Python float. Use
  -- display-level hundredth-kcal equality rather than binary-float equality.
  if v_overage <= 0
     or p_snapshot->>'date' is distinct from p_expected_date::text
     or round((p_snapshot->>'consumed_kcal')::numeric, 2) is distinct from
        round((v_totals->>'consumed_kcal')::numeric, 2)
     or round((p_snapshot->>'exercise_burned_kcal')::numeric, 2) is distinct from
        round((v_totals->>'exercise_burned_kcal')::numeric, 2)
     or round((p_snapshot->>'running_burned_kcal')::numeric, 2) is distinct from
        round((v_totals->>'running_burned_kcal')::numeric, 2)
     or round((p_snapshot->>'target_kcal')::numeric, 2) is distinct from round(v_target, 2)
     or round((p_snapshot->>'overage_kcal')::numeric, 2) is distinct from round(v_overage, 2) then
    raise exception 'DIET_REBALANCE_STATUS_CHANGED' using errcode = '40001';
  end if;
end $$;
revoke all on function public.assert_diet_rebalance_today_snapshot(uuid,date,jsonb)
  from public, anon, authenticated;
grant execute on function public.assert_diet_rebalance_today_snapshot(uuid,date,jsonb)
  to service_role;

create function public.choose_diet_rebalance_cheat(
  p_user_id uuid, p_expected_date date, p_snapshot jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_decision public.diet_rebalance_decisions;
begin
  if p_user_id is null or p_expected_date is null then
    raise exception 'DIET_REBALANCE_INVALID_USER' using errcode = '22023';
  end if;
  if p_expected_date <> v_today then
    raise exception 'DIET_REBALANCE_DATE_CHANGED' using errcode = '40001';
  end if;
  select * into v_decision from public.diet_rebalance_decisions
    where user_id = p_user_id and decision_date = v_today for update;
  if found then
    if v_decision.decision <> 'cheat' then
      raise exception 'DIET_REBALANCE_ALREADY_DECIDED' using errcode = '23505';
    end if;
    return jsonb_build_object('date', v_today, 'decision', 'cheat');
  end if;
  perform public.assert_diet_rebalance_today_snapshot(p_user_id, v_today, p_snapshot);
  insert into public.diet_rebalance_decisions(user_id, decision_date, decision)
    values (p_user_id, v_today, 'cheat')
    on conflict (user_id, decision_date) do nothing;
  select * into v_decision from public.diet_rebalance_decisions
    where user_id = p_user_id and decision_date = v_today for update;
  if v_decision.decision <> 'cheat' then
    raise exception 'DIET_REBALANCE_ALREADY_DECIDED' using errcode = '23505';
  end if;
  return jsonb_build_object('date', v_today, 'decision', v_decision.decision);
end $$;
revoke all on function public.choose_diet_rebalance_cheat(uuid,date,jsonb)
  from public, anon, authenticated;
grant execute on function public.choose_diet_rebalance_cheat(uuid,date,jsonb) to service_role;
