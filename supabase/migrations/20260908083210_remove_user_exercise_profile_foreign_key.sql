alter table public.user_exercise_profiles
  drop constraint if exists user_exercise_profiles_user_id_fkey;

comment on table public.user_exercise_profiles is
  'One current exercise goal and experience level per user. Auto-Fit design principle: minimal logical units; no physical foreign keys. Reference existence, ownership, and related deletion are application responsibilities.';

comment on column public.user_exercise_profiles.user_id is
  'Logical reference to profiles.user_id; no physical foreign key or cascading delete. UNIQUE enforces one exercise profile per user.';
