-- A recipe is a generated snapshot, not an inference from recommended foods.
-- It can belong to a legacy daily meal or to one version of a weekly plan slot.
create table public.diet_recipe_snapshots (
  diet_recipe_snapshot_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  diet_meal_id uuid,
  weekly_diet_plan_id uuid,
  weekly_plan_version integer check (weekly_plan_version > 0),
  plan_day text check (plan_day in
    ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack')),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  servings numeric(5,2) not null check (servings > 0),
  prep_minutes integer check (prep_minutes is null or prep_minutes >= 0),
  ingredients jsonb not null check (
    case when jsonb_typeof(ingredients) = 'array'
      then jsonb_array_length(ingredients) between 1 and 50 else false end),
  steps jsonb not null check (
    case when jsonb_typeof(steps) = 'array'
      then jsonb_array_length(steps) between 1 and 50 else false end),
  generator text not null check (length(btrim(generator)) between 1 and 80),
  created_at timestamptz not null default now(),
  constraint ck_diet_recipe_one_source check (
    (diet_meal_id is not null and weekly_diet_plan_id is null
      and weekly_plan_version is null and plan_day is null and meal_type is null)
    or
    (diet_meal_id is null and weekly_diet_plan_id is not null
      and weekly_plan_version is not null and plan_day is not null and meal_type is not null)
  )
);

create unique index uq_diet_recipe_daily_meal
  on public.diet_recipe_snapshots(diet_meal_id) where diet_meal_id is not null;
create unique index uq_diet_recipe_weekly_slot_version
  on public.diet_recipe_snapshots(weekly_diet_plan_id, weekly_plan_version, plan_day, meal_type)
  where weekly_diet_plan_id is not null;
create index idx_diet_recipe_user_recent
  on public.diet_recipe_snapshots(user_id, created_at desc, diet_recipe_snapshot_id desc);

insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('diet_recipe_snapshots','diet_meal_id','diet_meals','diet_meal_id'),
  ('diet_recipe_snapshots','weekly_diet_plan_id','weekly_diet_plans','weekly_diet_plan_id');

create trigger check_user_reference before insert or update on public.diet_recipe_snapshots
  for each row execute function autofit_integrity.check_user_reference();
create trigger z_check_business_references before insert or update on public.diet_recipe_snapshots
  for each row execute function autofit_integrity.check_business_references();
create trigger zzz_check_account_writable before insert or update on public.diet_recipe_snapshots
  for each row execute function autofit_integrity.check_account_writable();
create trigger protect_business_parent before delete or update on public.weekly_diet_plans
  for each row execute function autofit_integrity.protect_business_parent();
create trigger business_parent_block_truncate before truncate on public.weekly_diet_plans
  for each statement execute function autofit_integrity.block_parent_truncate();

alter table public.diet_recipe_snapshots enable row level security;
revoke all on public.diet_recipe_snapshots from public, anon, authenticated, service_role;
grant select, insert, delete on public.diet_recipe_snapshots to service_role;
comment on table public.diet_recipe_snapshots is
  'AI recipe response for one recommendation slot and version; no recipe is synthesized from food names.';

-- Rollback after recipe snapshots are removed and API readers are retired:
-- delete from autofit_integrity.business_references
--   where child_table = 'diet_recipe_snapshots';
-- drop trigger protect_business_parent on public.weekly_diet_plans;
-- drop trigger business_parent_block_truncate on public.weekly_diet_plans;
-- drop table public.diet_recipe_snapshots;
