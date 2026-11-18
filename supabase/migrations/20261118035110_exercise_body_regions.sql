-- Preserve historical rows (NULL). A temporarily older Backend may also omit
-- the field during the DB-first rollout; supplied arrays are strictly validated.
alter table public.exercise_items
  add column body_regions text[];

alter table public.exercise_items
  add constraint exercise_items_body_regions_valid check (
    body_regions is null or (
      array_ndims(body_regions) = 1
      and cardinality(body_regions) between 1 and 4
      and array_position(body_regions, null) is null
      and body_regions <@ array['upper_body', 'core', 'lower_body', 'full_body']::text[]
      and cardinality(body_regions) =
        (case when 'upper_body' = any(body_regions) then 1 else 0 end) +
        (case when 'core' = any(body_regions) then 1 else 0 end) +
        (case when 'lower_body' = any(body_regions) then 1 else 0 end) +
        (case when 'full_body' = any(body_regions) then 1 else 0 end)
      and (not 'full_body' = any(body_regions) or cardinality(body_regions) = 1)
    )
  );

comment on column public.exercise_items.body_regions is
  'Validated exercise body regions; historical rows remain NULL until classified.';

-- Keep the latest AI-only implementation and validate supplied arrays before writes.
create or replace function public.create_exercise_recommendation(
  p_user_id uuid,
  p_context_id uuid,
  p_recommendation jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recommendation_id uuid;
  v_linked_context_id uuid;
  v_expected_item_count integer;
  v_inserted_item_count integer;
  v_result jsonb;
begin
  if p_recommendation->>'generator' is distinct from 'auto-fit-ai' then
    raise exception 'New exercise recommendations require auto-fit-ai' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  v_expected_item_count := jsonb_array_length(p_items);
  if v_expected_item_count < 1 or v_expected_item_count > 12 then
    raise exception 'items count is outside the allowed range';
  end if;

  if (p_recommendation->>'catalog_version' !~ '^sha256:[0-9a-f]{64}$'
          or p_recommendation->>'catalog_version' is null) then
    raise exception 'AI exercise catalog version is invalid';
  end if;

  if exists (
       select 1 from jsonb_array_elements(p_items) as item(value)
       where nullif(item.value->>'exercise_key', '') is null
     ) then
    raise exception 'AI exercise key is required';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as item(value)
    where item.value ? 'body_regions'
      and jsonb_typeof(item.value->'body_regions') is distinct from 'array'
  ) then
    raise exception 'AI exercise body_regions must be an array' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as item(value)
    where item.value ? 'body_regions'
      and jsonb_array_length(item.value->'body_regions') not between 1 and 4
  ) then
    raise exception 'AI exercise body_regions count is invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) with ordinality as item(value, position)
    cross join lateral jsonb_array_elements_text(item.value->'body_regions') as region(value)
    group by item.position
    having count(*) <> count(distinct region.value)
       or count(*) filter (where region.value is null or region.value not in
         ('upper_body', 'core', 'lower_body', 'full_body')) > 0
       or (bool_or(region.value = 'full_body') and count(*) > 1)
  ) then
    raise exception 'AI exercise body_regions values are invalid' using errcode = '22023';
  end if;

  if (
    p_recommendation->'plan_sessions' is null
    or jsonb_typeof(p_recommendation->'plan_sessions') <> 'array'
    or jsonb_array_length(p_recommendation->'plan_sessions') not between 1 and 3
  ) then
    raise exception 'AI exercise plan sessions are invalid';
  end if;

  if not exists (
    select 1
    from public.exercise_recommendation_contexts
    where exercise_recommendation_context_id = p_context_id
      and user_id = p_user_id
      and exercise_recommendation_id is null
  ) then
    raise exception 'an unlinked recommendation context was not found';
  end if;

  insert into public.exercise_recommendations (
    user_id,
    recommendation_date,
    goal,
    total_duration_minutes,
    intensity,
    recommendation_summary,
    ai_reason,
    generator,
    catalog_version,
    status
  )
  values (
    p_user_id,
    coalesce((p_recommendation->>'recommendation_date')::date, current_date),
    p_recommendation->>'goal',
    (p_recommendation->>'total_duration_minutes')::integer,
    p_recommendation->>'intensity',
    p_recommendation->>'recommendation_summary',
    p_recommendation->>'ai_reason',
    'auto-fit-ai',
    p_recommendation->>'catalog_version',
    'active'
  )
  returning exercise_recommendation_id into v_recommendation_id;

  update public.exercise_recommendation_contexts
  set exercise_recommendation_id = v_recommendation_id
  where exercise_recommendation_context_id = p_context_id
    and user_id = p_user_id
    and exercise_recommendation_id is null
  returning exercise_recommendation_context_id into v_linked_context_id;

  if v_linked_context_id is null then
    raise exception 'recommendation context could not be linked';
  end if;

  insert into public.exercise_plan_sessions (
    exercise_recommendation_id, session_index, scheduled_date, name, focus, duration_minutes
  )
  select v_recommendation_id,
    (session.value->>'session_index')::integer,
    (session.value->>'scheduled_date')::date,
    session.value->>'name',
    session.value->>'focus',
    (session.value->>'duration_minutes')::integer
  from jsonb_array_elements(p_recommendation->'plan_sessions') as session(value);

  if exists (
    select 1 from public.exercise_plan_sessions as planned
    where planned.exercise_recommendation_id = v_recommendation_id
      and (planned.scheduled_date < (p_recommendation->>'recommendation_date')::date
        or planned.scheduled_date >= (p_recommendation->>'recommendation_date')::date + 7)
  ) then
    raise exception 'AI exercise scheduled date is outside the seven-day plan';
  end if;

  insert into public.exercise_items (
    exercise_recommendation_id,
    exercise_type_id,
    plan_session_id,
    exercise_key,
    exercise_name,
    body_regions,
    sequence_order,
    duration_minutes,
    sets,
    repetitions,
    calories_burned,
    intensity,
    instruction,
    execution_type,
    target_duration_seconds,
    target_weight_kg,
    rest_seconds
  )
  select
    v_recommendation_id,
    exercise_type.exercise_type_id,
    planned.exercise_plan_session_id,
    item.value->>'exercise_key',
    item.value->>'exercise_name',
    case when item.value ? 'body_regions' then
      ARRAY(select region.value from jsonb_array_elements_text(item.value->'body_regions') as region(value))
    else null end,
    item.ordinality::integer,
    nullif(item.value->>'duration_minutes', '')::integer,
    nullif(item.value->>'sets', '')::integer,
    nullif(item.value->>'repetitions', '')::integer,
    nullif(item.value->>'calories_burned', '')::numeric,
    item.value->>'intensity',
    item.value->>'instruction',
    item.value->>'execution_type',
    nullif(item.value->>'target_duration_seconds', '')::integer,
    nullif(item.value->>'target_weight_kg', '')::numeric,
    nullif(item.value->>'rest_seconds', '')::integer
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  join public.exercise_types as exercise_type
    on exercise_type.name = item.value->>'exercise_type_name'
   and exercise_type.is_active
  join public.exercise_plan_sessions as planned
    on planned.exercise_recommendation_id = v_recommendation_id
   and planned.session_index = nullif(item.value->>'plan_session_index', '')::integer;

  get diagnostics v_inserted_item_count = row_count;
  if v_inserted_item_count <> v_expected_item_count then
    raise exception 'one or more exercise types are invalid or inactive';
  end if;

  if exists (
    select 1
    from public.exercise_plan_sessions as planned
    left join public.exercise_items as exercise_item
      on exercise_item.plan_session_id = planned.exercise_plan_session_id
    where planned.exercise_recommendation_id = v_recommendation_id
    group by planned.exercise_plan_session_id, planned.duration_minutes
    having count(exercise_item.exercise_item_id) not between 1 and 4
       or coalesce(sum(exercise_item.duration_minutes), -1) <> planned.duration_minutes
  ) then
    raise exception 'AI exercise plan session items are invalid';
  end if;

  select jsonb_build_object(
    'recommendation', to_jsonb(recommendation),
    'plan_sessions', coalesce((
      select jsonb_agg(to_jsonb(planned) || jsonb_build_object('status', 'planned')
        order by planned.session_index)
      from public.exercise_plan_sessions as planned
      where planned.exercise_recommendation_id = v_recommendation_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(exercise_item) order by exercise_item.sequence_order)
      from public.exercise_items as exercise_item
      where exercise_item.exercise_recommendation_id = v_recommendation_id
    ), '[]'::jsonb)
  )
  into v_result
  from public.exercise_recommendations as recommendation
  where recommendation.exercise_recommendation_id = v_recommendation_id;

  return v_result;
end;
$$;

revoke all on function public.create_exercise_recommendation(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_exercise_recommendation(uuid, uuid, jsonb, jsonb)
  to service_role;
