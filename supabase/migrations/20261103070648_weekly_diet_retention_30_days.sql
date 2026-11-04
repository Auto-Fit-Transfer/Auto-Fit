-- A plan and its allergen snapshot expire 30 days after plan creation.
-- Weekly recipe snapshots are removed first because business-reference triggers
-- correctly prevent deleting a plan that still has children.
create schema if not exists autofit_maintenance;
revoke all on schema autofit_maintenance from public, anon, authenticated, service_role;

create index idx_weekly_diet_plans_created_at
  on public.weekly_diet_plans(created_at, weekly_diet_plan_id);

create function autofit_maintenance.purge_expired_weekly_diet_plans()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  cutoff timestamptz := transaction_timestamp() - interval '30 days';
  expired record;
  deleted_plans bigint := 0;
  deleted_recipes bigint := 0;
  deleted_rows bigint;
begin
  if not pg_try_advisory_xact_lock(827104, 31) then
    return jsonb_build_object('skipped', true, 'deleted_plans', 0, 'deleted_recipes', 0);
  end if;

  -- Parent row locks also serialize recipe creation, whose integrity check
  -- takes a shared lock on the same plan. Busy plans wait for the next run.
  for expired in
    select p.weekly_diet_plan_id from public.weekly_diet_plans p
    where p.created_at < cutoff
    order by p.created_at, p.weekly_diet_plan_id
    limit 100 for update of p skip locked
  loop
    delete from public.diet_recipe_snapshots r
    where r.weekly_diet_plan_id = expired.weekly_diet_plan_id;
    get diagnostics deleted_rows = row_count;
    deleted_recipes := deleted_recipes + deleted_rows;

    delete from public.weekly_diet_plans p
    where p.weekly_diet_plan_id = expired.weekly_diet_plan_id
      and p.created_at < cutoff;
    get diagnostics deleted_rows = row_count;
    deleted_plans := deleted_plans + deleted_rows;
  end loop;

  return jsonb_build_object('skipped', false,
    'deleted_plans', deleted_plans, 'deleted_recipes', deleted_recipes);
end;
$$;
revoke all on function autofit_maintenance.purge_expired_weekly_diet_plans()
  from public, anon, authenticated, service_role;

-- UTC schedule: every five minutes, with a bounded batch and statement budget.
select cron.schedule('autofit-weekly-diet-retention-30-days', '*/5 * * * *',
  'set statement_timeout = ''60s''; select autofit_maintenance.purge_expired_weekly_diet_plans();');

-- Rollback: unschedule the named job, drop the function, then drop the index.;
