-- A run can use a saved AI course without forcing it into the admin catalog
-- or the user's manually drawn course table.
alter table public.running_recommendations
  add column running_saved_course_id uuid;
alter table public.running_recommendations
  drop constraint ck_running_recommendations_course_location;
alter table public.running_recommendations
  add constraint ck_running_recommendations_course_location check (
    (location_type = 'outdoor'
      and num_nonnulls(running_course_id, running_custom_course_id, running_saved_course_id) = 1
      and course_name_snapshot is not null)
    or (location_type = 'indoor'
      and running_course_id is null and running_custom_course_id is null
      and running_saved_course_id is null and course_name_snapshot is null)
  );
create index idx_running_recommendations_saved_course
  on public.running_recommendations(running_saved_course_id)
  where running_saved_course_id is not null;
insert into autofit_integrity.business_references
  (child_table, child_column, parent_table, parent_column)
values ('running_recommendations', 'running_saved_course_id',
        'running_saved_courses', 'running_saved_course_id');
create trigger protect_business_parent before delete or update on public.running_saved_courses
  for each row execute function autofit_integrity.protect_business_parent();
create trigger business_parent_block_truncate before truncate on public.running_saved_courses
  for each statement execute function autofit_integrity.block_parent_truncate();

create function public.set_running_saved_course_favorite(
  p_user_id uuid, p_saved_course_id uuid, p_is_favorite boolean
) returns public.running_saved_courses
language plpgsql security definer set search_path = '' as $$
declare saved public.running_saved_courses;
begin
  if p_is_favorite is null then
    raise exception 'Invalid favorite state' using errcode = '23514';
  end if;
  perform autofit_integrity.assert_account_writable(p_user_id);
  update public.running_saved_courses
    set is_favorite = p_is_favorite
    where running_saved_course_id = p_saved_course_id and user_id = p_user_id
    returning * into saved;
  return saved;
end $$;
revoke all on function public.set_running_saved_course_favorite(uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.set_running_saved_course_favorite(uuid,uuid,boolean)
  to service_role;
