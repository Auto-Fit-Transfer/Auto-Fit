-- A selected AI course is an immutable, user-owned snapshot. Generated IDs
-- are ephemeral upstream, so the full response (including path) lives here.
create table public.running_saved_courses (
  running_saved_course_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_type text not null check (source_type in ('official_metadata', 'official_gpx', 'auto_generated')),
  source_course_id text not null check (length(btrim(source_course_id)) between 1 and 200),
  course_name text not null check (length(btrim(course_name)) between 1 and 200),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 2097152),
  is_favorite boolean not null default false,
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_course_id)
);
create unique index uq_running_saved_courses_selected_user
  on public.running_saved_courses(user_id) where is_selected;
create index idx_running_saved_courses_user_favorites
  on public.running_saved_courses(user_id, updated_at desc) where is_favorite;
create trigger check_user_reference before insert or update on public.running_saved_courses
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.running_saved_courses
  for each row execute function autofit_integrity.check_account_writable();
create trigger trg_running_saved_courses_updated_at before update on public.running_saved_courses
  for each row execute function public.set_updated_at();
alter table public.running_saved_courses enable row level security;
revoke all on public.running_saved_courses from public, anon, authenticated, service_role;
grant select on public.running_saved_courses to service_role;

create table public.running_pace_preferences (
  user_id uuid primary key,
  pace_minutes_per_km numeric(4,2) not null check (pace_minutes_per_km between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger check_user_reference before insert or update on public.running_pace_preferences
  for each row execute function autofit_integrity.check_user_reference();
create trigger zzz_check_account_writable before insert or update on public.running_pace_preferences
  for each row execute function autofit_integrity.check_account_writable();
create trigger trg_running_pace_preferences_updated_at before update on public.running_pace_preferences
  for each row execute function public.set_updated_at();
alter table public.running_pace_preferences enable row level security;
revoke all on public.running_pace_preferences from public, anon, authenticated, service_role;
grant select, insert, update on public.running_pace_preferences to service_role;

-- Selection replacement and favorite state change commit together.
create function public.save_running_course(
  p_user_id uuid, p_source_type text, p_source_course_id text,
  p_course_name text, p_snapshot jsonb, p_is_favorite boolean,
  p_is_selected boolean
) returns public.running_saved_courses
language plpgsql security definer set search_path = '' as $$
declare saved public.running_saved_courses;
begin
  if p_user_id is null or p_snapshot is null or p_is_favorite is null or p_is_selected is null then
    raise exception 'Invalid running selection' using errcode = '23514';
  end if;
  perform autofit_integrity.assert_account_writable(p_user_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  if p_is_selected then
    update public.running_saved_courses set is_selected = false
      where user_id = p_user_id and is_selected;
  end if;
  insert into public.running_saved_courses
    (user_id, source_type, source_course_id, course_name, snapshot, is_favorite, is_selected)
  values
    (p_user_id, p_source_type, p_source_course_id, p_course_name, p_snapshot,
     p_is_favorite, p_is_selected)
  on conflict (user_id, source_type, source_course_id) do update set
    course_name = excluded.course_name,
    snapshot = excluded.snapshot,
    is_favorite = excluded.is_favorite,
    is_selected = excluded.is_selected
  returning * into saved;
  return saved;
end $$;
revoke all on function public.save_running_course(uuid,text,text,text,jsonb,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.save_running_course(uuid,text,text,text,jsonb,boolean,boolean)
  to service_role;

comment on table public.running_saved_courses is 'User-owned snapshot of official or generated AI running course, with favorite and current selection.';
comment on table public.running_pace_preferences is 'User-selected pace in AI API minutes per kilometer.';
