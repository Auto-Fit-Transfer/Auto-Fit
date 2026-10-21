-- Figma Auto-fit Main (1:2): running setup, recommendation, live run, result.
-- Running is its own domain. No exercise_* table is reused or referenced.
-- Auto-Fit uses logical references, server-only access, and no physical FKs.

create table public.running_courses (
  running_course_id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  region_name text not null check (length(btrim(region_name)) between 1 and 120),
  distance_meters integer not null check (distance_meters > 0),
  estimated_duration_seconds integer not null check (estimated_duration_seconds > 0),
  difficulty text not null check (difficulty in ('easy', 'moderate', 'hard')),
  terrain_name text check (terrain_name is null or length(btrim(terrain_name)) between 1 and 120),
  course_type text not null check (course_type in ('riverside', 'park', 'urban', 'other')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_running_courses_active_type on public.running_courses(course_type, difficulty)
  where is_active;

-- GPS geometry for a real catalog course. No Figma example route is seeded.
create table public.running_course_points (
  running_course_point_id uuid primary key default gen_random_uuid(),
  running_course_id uuid not null,
  sequence_number integer not null check (sequence_number >= 0),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  unique (running_course_id, sequence_number)
);

-- One generated recommendation stores the inputs and chosen course snapshot.
-- Indoors has no catalog course or route; outdoors requires a course.
create table public.running_recommendations (
  running_recommendation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  running_course_id uuid,
  condition_level text not null check (condition_level in ('good', 'normal', 'tired')),
  target_duration_seconds integer not null check (target_duration_seconds > 0),
  intensity text not null check (intensity in ('light', 'moderate', 'hard')),
  location_type text not null check (location_type in ('indoor', 'outdoor')),
  discomfort_areas text[] not null default '{}'::text[]
    check (cardinality(discomfort_areas) <= 20),
  course_name_snapshot text check (course_name_snapshot is null or length(btrim(course_name_snapshot)) between 1 and 120),
  target_distance_meters integer check (target_distance_meters is null or target_distance_meters > 0),
  target_pace_seconds_per_km integer check (target_pace_seconds_per_km is null or target_pace_seconds_per_km > 0),
  recommendation_reason text not null default '' check (length(recommendation_reason) <= 2000),
  created_at timestamptz not null default now(),
  constraint ck_running_recommendations_course_location check (
    (location_type = 'outdoor' and running_course_id is not null and course_name_snapshot is not null)
    or (location_type = 'indoor' and running_course_id is null and course_name_snapshot is null)
  )
);
create index idx_running_recommendations_user_recent
  on public.running_recommendations(user_id, created_at desc, running_recommendation_id desc);
create index idx_running_recommendations_course
  on public.running_recommendations(running_course_id) where running_course_id is not null;

-- Elapsed seconds exclude pauses. The mean pace is derived from elapsed time
-- and actual distance, so clients cannot save an inconsistent summary pace.
create table public.running_sessions (
  running_session_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  running_recommendation_id uuid not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'paused', 'completed', 'discarded')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  ended_at timestamptz,
  saved_at timestamptz,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  distance_meters numeric(10,2) not null default 0 check (distance_meters >= 0),
  average_pace_seconds_per_km integer generated always as (
    case when distance_meters > 0 and elapsed_seconds > 0
      then round(elapsed_seconds::numeric * 1000 / distance_meters)::integer
      else null end
  ) stored,
  calories_burned numeric(10,2) not null default 0 check (calories_burned >= 0),
  coach_note text check (coach_note is null or length(coach_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_running_sessions_lifecycle check (
    (status = 'in_progress' and paused_at is null and ended_at is null and saved_at is null)
    or (status = 'paused' and paused_at is not null and ended_at is null and saved_at is null)
    or (status = 'completed' and paused_at is null and ended_at is not null)
    or (status = 'discarded' and paused_at is null and ended_at is not null and saved_at is null)
  ),
  constraint ck_running_sessions_time_order check (
    (paused_at is null or paused_at >= started_at)
    and (ended_at is null or ended_at >= started_at)
    and (saved_at is null or (status = 'completed' and saved_at >= ended_at))
  )
);
create index idx_running_sessions_user_recent
  on public.running_sessions(user_id, started_at desc, running_session_id desc);
create index idx_running_sessions_recommendation
  on public.running_sessions(running_recommendation_id);
create unique index uq_running_sessions_one_active_per_user
  on public.running_sessions(user_id) where status in ('in_progress', 'paused');

create trigger trg_running_courses_updated_at before update on public.running_courses
  for each row execute function public.set_updated_at();
create trigger trg_running_sessions_updated_at before update on public.running_sessions
  for each row execute function public.set_updated_at();

-- A route point belongs to one session. Account deletion follows this logical
-- reference, so the route is removed with its owner even without a user_id here.
create table public.running_track_points (
  running_track_point_id uuid primary key default gen_random_uuid(),
  running_session_id uuid not null,
  sequence_number integer not null check (sequence_number >= 0),
  recorded_at timestamptz not null,
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  cumulative_distance_meters numeric(10,2) not null check (cumulative_distance_meters >= 0),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(8,2) check (accuracy_meters is null or accuracy_meters >= 0),
  created_at timestamptz not null default now(),
  unique (running_session_id, sequence_number)
);

insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('running_course_points', 'running_course_id', 'running_courses', 'running_course_id'),
  ('running_recommendations', 'running_course_id', 'running_courses', 'running_course_id'),
  ('running_sessions', 'running_recommendation_id', 'running_recommendations', 'running_recommendation_id'),
  ('running_track_points', 'running_session_id', 'running_sessions', 'running_session_id');

-- Existing registry helpers check existence and ownership without physical FKs.
create trigger check_user_reference before insert or update on public.running_recommendations
  for each row execute function autofit_integrity.check_user_reference();
create trigger check_user_reference before insert or update on public.running_sessions
  for each row execute function autofit_integrity.check_user_reference();

do $$ declare tbl text; begin
  foreach tbl in array array['running_course_points', 'running_recommendations',
    'running_sessions', 'running_track_points'] loop
    execute format('create trigger z_check_business_references before insert or update on public.%I for each row execute function autofit_integrity.check_business_references()', tbl);
  end loop;
  foreach tbl in array array['running_courses', 'running_recommendations', 'running_sessions'] loop
    execute format('create trigger protect_business_parent before delete or update on public.%I for each row execute function autofit_integrity.protect_business_parent()', tbl);
    execute format('create trigger business_parent_block_truncate before truncate on public.%I for each statement execute function autofit_integrity.block_parent_truncate()', tbl);
  end loop;
  foreach tbl in array array['running_recommendations', 'running_sessions', 'running_track_points'] loop
    execute format('create trigger zzz_check_account_writable before insert or update on public.%I for each row execute function autofit_integrity.check_account_writable()', tbl);
  end loop;
  foreach tbl in array array['running_courses', 'running_course_points',
    'running_recommendations', 'running_sessions', 'running_track_points'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', tbl);
    execute format('grant select on public.%I to service_role', tbl);
  end loop;
end $$;

-- Catalog management is administrative. Only the backend writes user data.
grant insert, delete on public.running_recommendations to service_role;
grant insert, update, delete on public.running_sessions to service_role;
grant insert, delete on public.running_track_points to service_role;

comment on table public.running_courses is 'Admin-managed outdoor running course catalog; independent from exercise tables.';
comment on table public.running_course_points is 'Ordered planned GPS route for a running course.';
comment on table public.running_recommendations is 'User running inputs, selected course snapshot, and recommendation reason.';
comment on table public.running_sessions is 'Actual running progress and saved result, owned by user_id.';
comment on table public.running_track_points is 'Ordered actual GPS route; owner follows running_session_id.';
