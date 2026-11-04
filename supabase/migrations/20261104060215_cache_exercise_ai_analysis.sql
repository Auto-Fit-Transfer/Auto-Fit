-- Server-owned cache for the AI narrative; never exposed to browser roles.
create table public.exercise_session_analyses (
  exercise_session_id uuid primary key
    references public.exercise_sessions(exercise_session_id) on delete cascade,
  user_id uuid not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  analysis jsonb not null check (jsonb_typeof(analysis) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exercise_session_analyses enable row level security;
revoke all on public.exercise_session_analyses from anon, authenticated;
grant select, insert, update on public.exercise_session_analyses to service_role;
