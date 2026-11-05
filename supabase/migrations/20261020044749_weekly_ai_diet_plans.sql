-- Full seven-day source payload; legacy daily recommendations remain separate.
create function public.valid_weekly_diet_result(p_result jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  d jsonb; m text; seen text[] := '{}';
  days constant text[] := array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
begin
  if jsonb_typeof(p_result) is distinct from 'object'
     or jsonb_typeof(p_result->'weekly_plan') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_result->'weekly_plan') <> 7 then return false; end if;
  for d in select value from jsonb_array_elements(p_result->'weekly_plan') loop
    if d->>'day' is null or not (d->>'day' = any(days))
       or d->>'day' = any(seen)
       or jsonb_typeof(d->'meals') is distinct from 'object' then return false; end if;
    seen := array_append(seen, d->>'day');
    if (select count(*) from jsonb_object_keys(d->'meals')) <> 4 then return false; end if;
    foreach m in array array['breakfast','lunch','dinner','snack'] loop
      if jsonb_typeof(d->'meals'->m) is distinct from 'object'
         or jsonb_typeof(d->'meals'->m->'items') is distinct from 'array' then return false; end if;
      if jsonb_array_length(d->'meals'->m->'items') < 1 then return false; end if;
    end loop;
  end loop;
  return seen = days;
end $$;
revoke all on function public.valid_weekly_diet_result(jsonb) from public, anon, authenticated;
grant execute on function public.valid_weekly_diet_result(jsonb) to service_role;

create table public.weekly_diet_plans (
  weekly_diet_plan_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  week_start_date date not null check (extract(isodow from week_start_date) = 1
                                     and week_start_date between date '0001-01-01' and date '9999-12-25'),
  generator text not null,
  result jsonb not null check (public.valid_weekly_diet_result(result)),
  request_context jsonb not null check (jsonb_typeof(request_context) = 'object'),
  last_replacement jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);
alter table public.weekly_diet_plans enable row level security;
revoke all on public.weekly_diet_plans from public, anon, authenticated;
grant select, insert, update, delete on public.weekly_diet_plans to service_role;

-- Serialize source changes with the final context check in the save transaction.
-- A shared catalog lock permits unrelated users to save concurrently.
create function public.lock_weekly_diet_user_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare uid uuid;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('weekly-diet-catalog', 0));
  for uid in select distinct value from unnest(array[
      case when tg_op <> 'INSERT' then old.user_id end,
      case when tg_op <> 'DELETE' then new.user_id end
    ]) as u(value) where value is not null order by value loop
    perform pg_advisory_xact_lock(hashtextextended('weekly-diet-user:' || uid::text, 0));
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger aa_weekly_diet_context_lock before insert or update or delete on public.user_allergies
  for each row execute function public.lock_weekly_diet_user_context();
create trigger aa_weekly_diet_context_lock before insert or update or delete on public.user_exercise_profiles
  for each row execute function public.lock_weekly_diet_user_context();

create function public.lock_weekly_diet_catalog()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('weekly-diet-catalog', 0));
  return null;
end $$;
create trigger aa_weekly_diet_catalog_lock before insert or update or delete on public.allergy_types
  for each statement execute function public.lock_weekly_diet_catalog();

create function public.check_weekly_diet_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare actual_allergies jsonb; actual_goal text; unresolved boolean;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('weekly-diet-catalog', 0));
  perform pg_advisory_xact_lock(hashtextextended('weekly-diet-user:' || new.user_id::text, 0));
  select coalesce(jsonb_agg(distinct btrim(coalesce(nullif(a.custom_name, ''), t.name))), '[]'::jsonb),
         coalesce(bool_or(coalesce(nullif(a.custom_name, ''), t.name) is null), false)
    into actual_allergies, unresolved
    from public.user_allergies a left join public.allergy_types t
      on t.allergy_type_id = a.allergy_type_id and t.is_active
    where a.user_id = new.user_id;
  select goal_type into actual_goal from public.user_exercise_profiles where user_id = new.user_id;
  if unresolved or jsonb_typeof(new.request_context->'food_allergens') is distinct from 'array'
     or not (actual_allergies <@ (new.request_context->'food_allergens')
             and actual_allergies @> (new.request_context->'food_allergens'))
     or (new.request_context->>'goal_type') is distinct from actual_goal then
    raise exception 'WEEKLY_DIET_CONTEXT_CHANGED' using errcode = '40001';
  end if;
  return new;
end $$;
create trigger ab_weekly_diet_context_check before insert or update on public.weekly_diet_plans
  for each row execute function public.check_weekly_diet_context();
revoke all on function public.lock_weekly_diet_user_context(), public.lock_weekly_diet_catalog(),
  public.check_weekly_diet_context() from public, anon, authenticated;
grant execute on function public.lock_weekly_diet_user_context(), public.lock_weekly_diet_catalog(),
  public.check_weekly_diet_context() to service_role;

-- Existing account-deletion cascade discovers all public user_id tables.
-- Attach the corresponding write guard to prevent races with deletion.
create trigger check_user_reference
  before insert or update on public.weekly_diet_plans
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable
  before insert or update on public.weekly_diet_plans
  for each row execute function autofit_integrity.check_account_writable();

create function public.replace_weekly_diet_meal(
  p_user_id uuid, p_plan_id uuid, p_expected_version integer,
  p_day text, p_meal_type text, p_replacement jsonb, p_request_context jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  plan public.weekly_diet_plans;
  day_index integer;
begin
  if p_expected_version is null or p_expected_version < 1
     or p_day is null or p_day not in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
     or p_meal_type is null or p_meal_type not in ('breakfast','lunch','dinner','snack')
     or jsonb_typeof(p_replacement) is distinct from 'object'
     or (p_replacement->'ok') is distinct from 'true'::jsonb
     or p_replacement#>>'{meal,day}' is distinct from p_day
     or p_replacement#>>'{meal,meal_type}' is distinct from p_meal_type
     or jsonb_typeof(p_replacement#>'{meal,meal}') is distinct from 'object'
     or jsonb_typeof(p_request_context) is distinct from 'object' then
    raise exception 'WEEKLY_DIET_INVALID_REPLACEMENT' using errcode = '22023';
  end if;
  select * into plan from public.weekly_diet_plans
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id for update;
  if not found then raise exception 'WEEKLY_DIET_NOT_FOUND' using errcode = 'P0002'; end if;
  if plan.version <> p_expected_version then
    raise exception 'WEEKLY_DIET_VERSION_CONFLICT' using errcode = '40001';
  end if;
  select ordinality::integer - 1 into day_index
    from jsonb_array_elements(plan.result->'weekly_plan') with ordinality
    where value->>'day' = p_day;
  update public.weekly_diet_plans
    set result = jsonb_set(result, array['weekly_plan',day_index::text,'meals',p_meal_type],
                          p_replacement#>'{meal,meal}', false),
        request_context = p_request_context, last_replacement = p_replacement,
        version = version + 1, updated_at = now()
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id
    returning * into plan;
  return to_jsonb(plan);
end $$;
revoke all on function public.replace_weekly_diet_meal(uuid,uuid,integer,text,text,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_weekly_diet_meal(uuid,uuid,integer,text,text,jsonb,jsonb)
  to service_role;

create function public.refresh_weekly_diet_plan(
  p_user_id uuid, p_plan_id uuid, p_expected_version integer,
  p_reply jsonb, p_request_context jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare plan public.weekly_diet_plans;
begin
  if p_expected_version is null or p_expected_version < 1
     or jsonb_typeof(p_reply) is distinct from 'object'
     or p_reply->'ok' is distinct from 'true'::jsonb
     or nullif(btrim(p_reply->>'generator'), '') is null
     or not public.valid_weekly_diet_result(p_reply->'result')
     or jsonb_typeof(p_request_context) is distinct from 'object' then
    raise exception 'WEEKLY_DIET_INVALID_RESULT' using errcode = '22023';
  end if;
  select * into plan from public.weekly_diet_plans
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id for update;
  if not found then raise exception 'WEEKLY_DIET_NOT_FOUND' using errcode = 'P0002'; end if;
  if plan.version <> p_expected_version then
    raise exception 'WEEKLY_DIET_VERSION_CONFLICT' using errcode = '40001';
  end if;
  update public.weekly_diet_plans
    set result = p_reply->'result', generator = p_reply->>'generator',
        request_context = p_request_context, last_replacement = null,
        version = version + 1, updated_at = now()
    where weekly_diet_plan_id = p_plan_id and user_id = p_user_id
    returning * into plan;
  return to_jsonb(plan);
end $$;
revoke all on function public.refresh_weekly_diet_plan(uuid,uuid,integer,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.refresh_weekly_diet_plan(uuid,uuid,integer,jsonb,jsonb) to service_role;
