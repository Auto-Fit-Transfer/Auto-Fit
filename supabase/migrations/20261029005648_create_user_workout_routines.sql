-- R7 E10/E11: a saved recommendation or a user-created, editable workout.
-- Keep a snapshot of the ordered steps so later recommendation edits do not
-- silently change a saved routine. Auto-Fit uses logical ownership references.
create table public.user_workout_routines (
  user_workout_routine_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_recommendation_id uuid,
  source_type text not null check (source_type in ('recommendation', 'custom')),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_user_workout_routines_source check (
    (source_type = 'recommendation' and source_recommendation_id is not null)
    or (source_type = 'custom' and source_recommendation_id is null)
  )
);

-- Saving the same recommendation twice should return the existing routine.
create unique index uq_user_workout_routines_saved_recommendation
  on public.user_workout_routines(user_id, source_recommendation_id)
  where source_type = 'recommendation';
create index idx_user_workout_routines_user_active
  on public.user_workout_routines(user_id, updated_at desc, user_workout_routine_id desc)
  where status = 'active';

create table public.user_workout_routine_items (
  user_workout_routine_item_id uuid primary key default gen_random_uuid(),
  user_workout_routine_id uuid not null,
  sequence_order integer not null check (sequence_order > 0),
  exercise_type_id uuid,
  exercise_name text not null check (length(btrim(exercise_name)) between 1 and 160),
  target_duration_seconds integer check (target_duration_seconds is null or target_duration_seconds > 0),
  sets integer check (sets is null or sets > 0),
  repetitions integer check (repetitions is null or repetitions > 0),
  target_weight_kg numeric(8,2) check (target_weight_kg is null or target_weight_kg >= 0),
  rest_seconds integer check (rest_seconds is null or rest_seconds >= 0),
  instruction text not null default '' check (length(instruction) <= 2000),
  demo_video_url text check (demo_video_url is null or length(demo_video_url) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_workout_routine_id, sequence_order)
);
create index idx_user_workout_routine_items_type
  on public.user_workout_routine_items(exercise_type_id)
  where exercise_type_id is not null;

insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('user_workout_routines', 'source_recommendation_id',
   'exercise_recommendations', 'exercise_recommendation_id'),
  ('user_workout_routine_items', 'user_workout_routine_id',
   'user_workout_routines', 'user_workout_routine_id'),
  ('user_workout_routine_items', 'exercise_type_id',
   'exercise_types', 'exercise_type_id');

create trigger check_user_reference before insert or update on public.user_workout_routines
  for each row execute function autofit_integrity.check_user_reference();
create trigger z_check_business_references before insert or update on public.user_workout_routines
  for each row execute function autofit_integrity.check_business_references();
create trigger z_check_business_references before insert or update on public.user_workout_routine_items
  for each row execute function autofit_integrity.check_business_references();
create trigger protect_business_parent before delete or update on public.user_workout_routines
  for each row execute function autofit_integrity.protect_business_parent();
create trigger business_parent_block_truncate before truncate on public.user_workout_routines
  for each statement execute function autofit_integrity.block_parent_truncate();
create trigger zzz_check_account_writable before insert or update on public.user_workout_routines
  for each row execute function autofit_integrity.check_account_writable();
create trigger zzz_check_account_writable before insert or update on public.user_workout_routine_items
  for each row execute function autofit_integrity.check_account_writable();
create trigger trg_user_workout_routines_updated_at before update on public.user_workout_routines
  for each row execute function public.set_updated_at();
create trigger trg_user_workout_routine_items_updated_at before update on public.user_workout_routine_items
  for each row execute function public.set_updated_at();

alter table public.user_workout_routines enable row level security;
alter table public.user_workout_routine_items enable row level security;
revoke all on public.user_workout_routines, public.user_workout_routine_items
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.user_workout_routines,
  public.user_workout_routine_items to service_role;

comment on table public.user_workout_routines is
  'User-owned saved recommendation or custom workout; editable and archivable.';
comment on table public.user_workout_routine_items is
  'Ordered exercise snapshot for a user workout routine.';

-- Rollback only after the API and any saved routines have been retired:
-- drop table public.user_workout_routine_items;
-- drop table public.user_workout_routines;
