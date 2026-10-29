-- Complete the Main running layers: course card images and the hidden
-- "direct course setup" path. Keep admin catalog and user routes separate.

alter table public.running_courses
  add column thumbnail_url text
    check (thumbnail_url is null or
      (length(thumbnail_url) <= 2048 and thumbnail_url ~* '^https://[^[:space:]]+$'));

create table public.running_custom_courses (
  running_custom_course_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  region_name text check (region_name is null or length(btrim(region_name)) between 1 and 120),
  distance_meters integer not null check (distance_meters > 0),
  estimated_duration_seconds integer check (
    estimated_duration_seconds is null or estimated_duration_seconds > 0),
  thumbnail_url text check (thumbnail_url is null or
    (length(thumbnail_url) <= 2048 and thumbnail_url ~* '^https://[^[:space:]]+$')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_running_custom_courses_user_recent
  on public.running_custom_courses(user_id, created_at desc, running_custom_course_id desc);

create table public.running_custom_course_points (
  running_custom_course_point_id uuid primary key default gen_random_uuid(),
  running_custom_course_id uuid not null,
  sequence_number integer not null check (sequence_number >= 0),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  unique (running_custom_course_id, sequence_number)
);

alter table public.running_recommendations
  add column running_custom_course_id uuid;
alter table public.running_recommendations
  drop constraint ck_running_recommendations_course_location;
alter table public.running_recommendations
  add constraint ck_running_recommendations_course_location check (
    (location_type = 'outdoor' and num_nonnulls(running_course_id, running_custom_course_id) = 1
      and course_name_snapshot is not null)
    or (location_type = 'indoor' and running_course_id is null
      and running_custom_course_id is null and course_name_snapshot is null)
  );
create index idx_running_recommendations_custom_course
  on public.running_recommendations(running_custom_course_id)
  where running_custom_course_id is not null;

insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column) values
  ('running_custom_course_points', 'running_custom_course_id',
   'running_custom_courses', 'running_custom_course_id'),
  ('running_recommendations', 'running_custom_course_id',
   'running_custom_courses', 'running_custom_course_id');

create trigger check_user_reference before insert or update on public.running_custom_courses
  for each row execute function autofit_integrity.check_user_reference();
create trigger z_check_business_references before insert or update on public.running_custom_course_points
  for each row execute function autofit_integrity.check_business_references();
create trigger protect_business_parent before delete or update on public.running_custom_courses
  for each row execute function autofit_integrity.protect_business_parent();
create trigger business_parent_block_truncate before truncate on public.running_custom_courses
  for each statement execute function autofit_integrity.block_parent_truncate();
create trigger zzz_check_account_writable before insert or update on public.running_custom_courses
  for each row execute function autofit_integrity.check_account_writable();
create trigger zzz_check_account_writable before insert or update on public.running_custom_course_points
  for each row execute function autofit_integrity.check_account_writable();
create trigger trg_running_custom_courses_updated_at before update on public.running_custom_courses
  for each row execute function public.set_updated_at();

alter table public.running_custom_courses enable row level security;
alter table public.running_custom_course_points enable row level security;
revoke all on public.running_custom_courses, public.running_custom_course_points
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.running_custom_courses to service_role;
grant select, insert, delete on public.running_custom_course_points to service_role;

comment on column public.running_courses.thumbnail_url is 'Stable HTTPS image URL for the course card; Figma sample photos are not seeded.';
comment on table public.running_custom_courses is 'User-owned running courses, independent from the admin catalog and exercise tables.';
comment on table public.running_custom_course_points is 'Ordered planned GPS route for a user-owned course.';
comment on column public.running_recommendations.running_custom_course_id is 'Optional user-owned outdoor course; exclusive with running_course_id.';
