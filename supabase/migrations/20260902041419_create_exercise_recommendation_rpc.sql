create index if not exists exercise_recommendations_user_date_idx
  on public.exercise_recommendations (user_id, recommendation_date desc, created_at desc);

create unique index if not exists exercise_items_recommendation_sequence_uidx
  on public.exercise_items (exercise_recommendation_id, sequence_order);

alter table public.exercise_recommendations enable row level security;
alter table public.exercise_items enable row level security;

revoke all on table public.exercise_recommendations from anon, authenticated;
revoke all on table public.exercise_items from anon, authenticated;

grant select, insert, update, delete
  on table public.exercise_recommendations
  to service_role;

grant select, insert, update, delete
  on table public.exercise_items
  to service_role;

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
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  v_expected_item_count := jsonb_array_length(p_items);
  if v_expected_item_count < 1 or v_expected_item_count > 10 then
    raise exception 'items must contain between 1 and 10 entries';
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

  insert into public.exercise_items (
    exercise_recommendation_id,
    exercise_type_id,
    exercise_name,
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
    item.value->>'exercise_name',
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
   and exercise_type.is_active;

  get diagnostics v_inserted_item_count = row_count;
  if v_inserted_item_count <> v_expected_item_count then
    raise exception 'one or more exercise types are invalid or inactive';
  end if;

  select jsonb_build_object(
    'recommendation', to_jsonb(recommendation),
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
