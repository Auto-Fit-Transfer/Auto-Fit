create or replace function public.replace_user_allergies(
  p_user_id uuid,
  p_allergy_type_ids uuid[] default '{}'::uuid[],
  p_custom_names text[] default '{}'::text[]
)
returns table (
  user_allergy_id uuid,
  user_id uuid,
  allergy_type_id uuid,
  custom_name text,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if cardinality(coalesce(p_allergy_type_ids, '{}'::uuid[])) > 12 then
    raise exception 'Too many allergy types' using errcode = '22023';
  end if;

  if cardinality(coalesce(p_custom_names, '{}'::text[])) > 5 then
    raise exception 'Too many custom allergies' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_allergy_type_ids, '{}'::uuid[])) as requested(allergy_type_id)
    left join public.allergy_types as allergy_type
      on allergy_type.allergy_type_id = requested.allergy_type_id
     and allergy_type.is_active
    where allergy_type.allergy_type_id is null
  ) then
    raise exception 'Unknown or inactive allergy type' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_custom_names, '{}'::text[])) as requested(custom_name)
    where length(btrim(requested.custom_name)) not between 1 and 50
  ) then
    raise exception 'Custom allergy name must be between 1 and 50 characters'
      using errcode = '22023';
  end if;

  delete from public.user_allergies as existing
  where existing.user_id = p_user_id;

  insert into public.user_allergies (user_id, allergy_type_id)
  select p_user_id, requested.allergy_type_id
  from (
    select distinct input.allergy_type_id
    from unnest(coalesce(p_allergy_type_ids, '{}'::uuid[])) as input(allergy_type_id)
  ) as requested;

  insert into public.user_allergies (user_id, custom_name)
  select p_user_id, requested.custom_name
  from (
    select distinct btrim(input.custom_name) as custom_name
    from unnest(coalesce(p_custom_names, '{}'::text[])) as input(custom_name)
  ) as requested;

  return query
  select
    saved.user_allergy_id,
    saved.user_id,
    saved.allergy_type_id,
    saved.custom_name,
    saved.created_at
  from public.user_allergies as saved
  where saved.user_id = p_user_id
  order by saved.created_at, saved.user_allergy_id;
end;
$$;

revoke execute on function public.replace_user_allergies(uuid, uuid[], text[])
  from public, anon, authenticated;

grant execute on function public.replace_user_allergies(uuid, uuid[], text[])
  to service_role;

comment on function public.replace_user_allergies(uuid, uuid[], text[]) is
  'Atomically replaces one user allergy selection; callable only by the backend service role.';
