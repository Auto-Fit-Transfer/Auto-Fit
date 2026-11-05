-- Main: a user-editable current health goal, separate from an assessment snapshot
-- and from the exercise-only goal. No physical FK by project convention.
create table public.user_health_goals (
  user_health_goal_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_text text not null check (length(btrim(goal_text)) between 1 and 200),
  target_date date,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_user_health_goals_one_active
  on public.user_health_goals(user_id) where status = 'active';
create index idx_user_health_goals_history
  on public.user_health_goals(user_id, created_at desc, user_health_goal_id desc);

create trigger check_user_reference before insert or update on public.user_health_goals
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.user_health_goals
  for each row execute function autofit_integrity.check_account_writable();
create trigger trg_user_health_goals_updated_at before update on public.user_health_goals
  for each row execute function public.set_updated_at();

alter table public.user_health_goals enable row level security;
revoke all on public.user_health_goals from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.user_health_goals to service_role;
comment on table public.user_health_goals is
  'User-edited health goals. Assessments retain their own goal snapshot for historical accuracy.';

-- Rollback, only after dependent API use and goal records have been retired:
-- drop table public.user_health_goals;
