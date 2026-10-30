create table public.user_exercise_profiles (
  user_exercise_profile_id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references public.profiles(user_id) on delete cascade,
  goal_type text not null
    constraint user_exercise_profiles_goal_type_check
    check (goal_type in (
      'weight_loss',
      'muscle_gain',
      'endurance',
      'maintenance',
      'rehabilitation'
    )),
  experience_level text not null
    constraint user_exercise_profiles_experience_level_check
    check (experience_level in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_exercise_profiles is
  'One current exercise goal and experience level per user.';

alter table public.user_exercise_profiles enable row level security;

create trigger user_exercise_profiles_updated_at
before update on public.user_exercise_profiles
for each row execute function public.set_updated_at();

revoke all on table public.user_exercise_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.user_exercise_profiles
  to service_role;
