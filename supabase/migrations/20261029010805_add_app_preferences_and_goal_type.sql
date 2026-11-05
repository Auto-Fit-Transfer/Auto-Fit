-- R7 G11/G12: one persisted display preference set per account.
create table public.user_app_preferences (
  user_id uuid primary key,
  theme_mode text not null default 'system'
    check (theme_mode in ('system', 'light', 'dark')),
  font_size_step smallint not null default 3
    check (font_size_step between 1 and 5),
  simple_mode_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger check_user_reference before insert or update on public.user_app_preferences
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.user_app_preferences
  for each row execute function autofit_integrity.check_account_writable();
create trigger trg_user_app_preferences_updated_at before update on public.user_app_preferences
  for each row execute function public.set_updated_at();
alter table public.user_app_preferences enable row level security;
revoke all on public.user_app_preferences from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.user_app_preferences to service_role;

-- R7 G7: goal category is selected from chips; the one-line detail is optional.
-- Existing callers can keep sending goal_text alone and receive goal_type=other.
alter table public.user_health_goals
  add column goal_type text not null default 'other'
    check (goal_type in ('fat_loss', 'muscle_gain', 'fitness', 'maintenance', 'other'));
alter table public.user_health_goals alter column goal_text drop not null;
alter table public.user_health_goals
  add constraint ck_user_health_goals_detail check (
    goal_type <> 'other' or goal_text is not null
  );

comment on table public.user_app_preferences is
  'Per-user theme, text size and simple-mode settings from R7 G11/G12.';
comment on column public.user_health_goals.goal_type is
  'R7 G7 goal chip; other requires a free-text goal.';
comment on column public.user_health_goals.goal_text is
  'Optional one-line goal detail for a selected goal type.';

-- Rollback after the settings API and goal-type clients have been retired:
-- drop table public.user_app_preferences;
-- alter table public.user_health_goals drop constraint ck_user_health_goals_detail;
-- update public.user_health_goals set goal_text = goal_type where goal_text is null;
-- alter table public.user_health_goals alter column goal_text set not null;
-- alter table public.user_health_goals drop column goal_type;
