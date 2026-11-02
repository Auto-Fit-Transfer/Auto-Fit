-- A generated upstream ID can be reused for a different path. Keep every
-- selected route version so an older run never changes under its reference.
alter table public.running_saved_courses
  drop constraint running_saved_courses_user_id_source_type_source_course_id_key;
alter table public.running_saved_courses
  add column snapshot_fingerprint text generated always as (pg_catalog.md5(snapshot::text)) stored;
alter table public.running_saved_courses
  add constraint uq_running_saved_courses_snapshot
  unique (user_id, source_type, source_course_id, snapshot_fingerprint);

create or replace function public.save_running_course(
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
  on conflict on constraint uq_running_saved_courses_snapshot do update set
    is_favorite = excluded.is_favorite,
    is_selected = excluded.is_selected
  returning * into saved;
  return saved;
end $$;
