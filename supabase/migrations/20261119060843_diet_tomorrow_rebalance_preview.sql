-- AI candidates are private until the user confirms this exact preview.
create table public.diet_rebalance_previews (
  preview_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  weekly_diet_plan_id uuid not null,
  base_version integer not null check (base_version > 0),
  today_date date not null,
  tomorrow_date date not null check (tomorrow_date = today_date + 1),
  successful_replacements jsonb not null check (
    jsonb_typeof(successful_replacements) = 'array'
    and jsonb_array_length(successful_replacements) between 1 and 4),
  failed_meals jsonb not null default '[]'::jsonb check (jsonb_typeof(failed_meals) = 'array'),
  public_preview jsonb not null check (jsonb_typeof(public_preview) = 'object'),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_diet_rebalance_previews_user_recent
  on public.diet_rebalance_previews(user_id, created_at desc);
create index idx_diet_rebalance_previews_expiry
  on public.diet_rebalance_previews(expires_at) where consumed_at is null;
alter table public.diet_rebalance_previews enable row level security;
revoke all on public.diet_rebalance_previews from public, anon, authenticated;
grant select, insert, update, delete on public.diet_rebalance_previews to service_role;
create trigger check_user_reference before insert or update on public.diet_rebalance_previews
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.diet_rebalance_previews
  for each row execute function autofit_integrity.check_account_writable();

-- The existing 30-day weekly-plan retention removes a plan after its recipe
-- snapshots. Clear only ephemeral previews; feedback and meal_logs remain as
-- historical records and continue to block duplicate legacy daily feedback.
create function public.cleanup_weekly_diet_auxiliary()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.diet_rebalance_previews
    where weekly_diet_plan_id = old.weekly_diet_plan_id;
  return old;
end $$;
revoke all on function public.cleanup_weekly_diet_auxiliary()
  from public, anon, authenticated;
grant execute on function public.cleanup_weekly_diet_auxiliary() to service_role;
create trigger aa_cleanup_weekly_diet_auxiliary
  before delete on public.weekly_diet_plans
  for each row execute function public.cleanup_weekly_diet_auxiliary();

create function public.save_diet_rebalance_preview(
  p_user_id uuid, p_plan_id uuid, p_base_version integer,
  p_today_date date, p_tomorrow_date date,
  p_successes jsonb, p_failures jsonb, p_public_preview jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_plan public.weekly_diet_plans;
  v_preview public.diet_rebalance_previews;
  v_day text;
  v_candidate jsonb;
  v_seen text[] := '{}';
begin
  if p_user_id is null or p_plan_id is null or p_base_version is null or p_base_version < 1
     or p_today_date is null or p_tomorrow_date is null
     or p_today_date <> (now() at time zone 'Asia/Seoul')::date
     or p_tomorrow_date <> p_today_date + 1 then
    raise exception 'DIET_REBALANCE_DATE_CHANGED' using errcode = '40001';
  end if;
  if jsonb_typeof(p_successes) is distinct from 'array'
     or jsonb_array_length(p_successes) not between 1 and 4
     or jsonb_typeof(p_failures) is distinct from 'array'
     or jsonb_typeof(p_public_preview) is distinct from 'object' then
    raise exception 'DIET_REBALANCE_INVALID_PREVIEW' using errcode = '22023';
  end if;
  select * into v_plan from public.weekly_diet_plans
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id for update;
  if not found then
    raise exception 'WEEKLY_DIET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_plan.version <> p_base_version then
    raise exception 'WEEKLY_DIET_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if p_tomorrow_date < v_plan.week_start_date
     or p_tomorrow_date >= v_plan.week_start_date + 7
     or jsonb_typeof(v_plan.result->'daily_target') is distinct from 'object'
     or jsonb_typeof(v_plan.result->'slot_targets') is distinct from 'object' then
    raise exception 'DIET_REBALANCE_INVALID_PREVIEW' using errcode = '22023';
  end if;
  if exists (select 1 from public.diet_rebalance_decisions
             where user_id = p_user_id and decision_date = p_today_date) then
    raise exception 'DIET_REBALANCE_ALREADY_DECIDED' using errcode = '23505';
  end if;
  perform public.assert_diet_rebalance_today_snapshot(
    p_user_id, p_today_date, p_public_preview->'today');
  v_day := case extract(isodow from p_tomorrow_date)::integer
    when 1 then 'monday' when 2 then 'tuesday' when 3 then 'wednesday'
    when 4 then 'thursday' when 5 then 'friday' when 6 then 'saturday'
    else 'sunday' end;
  for v_candidate in select value from jsonb_array_elements(p_successes) loop
    if v_candidate->>'meal_type' is null
       or v_candidate->>'meal_type' not in ('breakfast','lunch','dinner','snack')
       or v_candidate->>'meal_type' = any(v_seen)
       or v_candidate#>>'{replacement,meal,day}' is distinct from v_day
       or v_candidate#>>'{replacement,meal,meal_type}' is distinct from v_candidate->>'meal_type'
       or jsonb_typeof(v_candidate#>'{replacement,meal,meal}') is distinct from 'object'
       or jsonb_typeof(v_candidate#>'{replacement,meal,adjustment}') is distinct from 'object' then
      raise exception 'DIET_REBALANCE_INVALID_PREVIEW' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_candidate->>'meal_type');
  end loop;
  insert into public.diet_rebalance_previews (
    user_id, weekly_diet_plan_id, base_version, today_date, tomorrow_date,
    successful_replacements, failed_meals, public_preview
  ) values (
    p_user_id, p_plan_id, p_base_version, p_today_date, p_tomorrow_date,
    p_successes, p_failures, p_public_preview
  ) returning * into v_preview;
  return jsonb_build_object('preview_id', v_preview.preview_id,
                            'expires_at', v_preview.expires_at);
end $$;
revoke all on function public.save_diet_rebalance_preview(
  uuid,uuid,integer,date,date,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.save_diet_rebalance_preview(
  uuid,uuid,integer,date,date,jsonb,jsonb,jsonb
) to service_role;

create function public.confirm_diet_rebalance_preview(
  p_user_id uuid, p_plan_id uuid, p_preview_id uuid
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_preview public.diet_rebalance_previews;
  v_plan public.weekly_diet_plans;
  v_result jsonb;
  v_candidate jsonb;
  v_day_index integer;
  v_type text;
  v_total numeric := 0;
  v_floor numeric;
  v_applied jsonb := '[]'::jsonb;
begin
  select * into v_preview from public.diet_rebalance_previews
    where preview_id = p_preview_id and user_id = p_user_id
      and weekly_diet_plan_id = p_plan_id for update;
  if not found then
    raise exception 'DIET_REBALANCE_PREVIEW_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_preview.consumed_at is not null or v_preview.expires_at <= now() then
    raise exception 'DIET_REBALANCE_PREVIEW_EXPIRED' using errcode = '40001';
  end if;
  if v_preview.today_date <> (now() at time zone 'Asia/Seoul')::date
     or v_preview.tomorrow_date <> v_preview.today_date + 1 then
    raise exception 'DIET_REBALANCE_DATE_CHANGED' using errcode = '40001';
  end if;
  select * into v_plan from public.weekly_diet_plans
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id for update;
  if not found then
    raise exception 'WEEKLY_DIET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_plan.version <> v_preview.base_version then
    raise exception 'WEEKLY_DIET_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if exists (select 1 from public.diet_rebalance_decisions
             where user_id = p_user_id and decision_date = v_preview.today_date) then
    raise exception 'DIET_REBALANCE_ALREADY_DECIDED' using errcode = '23505';
  end if;
  perform public.assert_diet_rebalance_today_snapshot(
    p_user_id, v_preview.today_date, v_preview.public_preview->'today');
  v_day_index := (extract(isodow from v_preview.tomorrow_date))::integer - 1;
  v_result := v_plan.result;
  for v_candidate in select value from jsonb_array_elements(v_preview.successful_replacements) loop
    v_type := v_candidate->>'meal_type';
    v_result := jsonb_set(v_result,
      array['weekly_plan', v_day_index::text, 'meals', v_type],
      v_candidate#>'{replacement,meal,meal}', false);
    v_applied := v_applied || to_jsonb(v_type);
  end loop;
  select coalesce(sum((meal.value->>'estimated_calories_kcal')::numeric), 0)
    into v_total from jsonb_each(v_result#>array['weekly_plan',v_day_index::text,'meals']) as meal;
  v_floor := (v_plan.result#>>'{daily_target,calories_kcal}')::numeric * 0.85;
  if v_total + 0.01 < v_floor then
    raise exception 'DIET_DAILY_FLOOR_REACHED' using errcode = '23514';
  end if;
  update public.weekly_diet_plans set
    result = v_result, version = version + 1, last_replacement = null,
    updated_at = now()
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id
    returning * into v_plan;
  insert into public.diet_rebalance_decisions (
    user_id, decision_date, decision, preview_id
  ) values (
    p_user_id, v_preview.today_date, 'adjusted', p_preview_id
  ) on conflict (user_id, decision_date) do nothing;
  if not found then
    raise exception 'DIET_REBALANCE_ALREADY_DECIDED' using errcode = '23505';
  end if;
  update public.diet_rebalance_previews set consumed_at = now()
    where preview_id = p_preview_id;
  return jsonb_build_object(
    'weekly_diet_plan_id', p_plan_id, 'version', v_plan.version,
    'applied_meal_types', v_applied, 'failed_meals', v_preview.failed_meals,
    'tomorrow_date', v_preview.tomorrow_date, 'decision', 'adjusted'
  );
end $$;
revoke all on function public.confirm_diet_rebalance_preview(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_diet_rebalance_preview(uuid,uuid,uuid)
  to service_role;

-- Previews are short-lived and contain proposed meal details. Remove their
-- payloads after a short audit window without affecting confirmed plans.
create function autofit_maintenance.purge_expired_diet_rebalance_previews()
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_deleted integer;
begin
  with victims as (
    select preview_id from public.diet_rebalance_previews
    where expires_at < now() - interval '1 day'
    order by expires_at, preview_id limit 500 for update skip locked
  )
  delete from public.diet_rebalance_previews p using victims v
    where p.preview_id = v.preview_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;
revoke all on function autofit_maintenance.purge_expired_diet_rebalance_previews()
  from public, anon, authenticated, service_role;
select cron.schedule('autofit-diet-rebalance-preview-retention', '*/10 * * * *',
  'set statement_timeout = ''30s''; select autofit_maintenance.purge_expired_diet_rebalance_previews();');
