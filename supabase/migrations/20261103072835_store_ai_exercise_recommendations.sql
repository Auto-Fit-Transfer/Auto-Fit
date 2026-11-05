-- AI metadata is retained with the same recommendation and item rows used by
-- the existing session APIs. Historical recommendations keep a neutral source.
alter table public.exercise_recommendations
  add column if not exists generator text not null default 'legacy',
  add column if not exists catalog_version text;

alter table public.exercise_items
  add column if not exists exercise_key text;

comment on column public.exercise_recommendations.catalog_version is
  'SHA-256 of the AI server exercise catalog at generation time.';
comment on column public.exercise_items.exercise_key is
  'Validated AI catalog key; null for historical recommendations.';

-- Keep the existing category-based progress API useful for AI items.
insert into public.exercise_types (name, category, description, is_active)
values
  ('웨이트 트레이닝', '근력', 'AI 카탈로그 근력 운동', true),
  ('홈트레이닝', '홈트', 'AI 카탈로그 홈트레이닝', true),
  ('맨몸 운동', '맨몸', 'AI 카탈로그 맨몸 운동', true),
  ('유산소 운동', '유산소', 'AI 카탈로그 유산소 운동', true),
  ('스트레칭', '스트레칭', 'AI 카탈로그 스트레칭', true),
  ('기능성 운동', '기능성', 'AI 카탈로그 기능성 운동', true)
on conflict (name) do nothing;

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

  if p_recommendation->>'generator' = 'auto-fit-ai'
     and (p_recommendation->>'catalog_version' !~ '^sha256:[0-9a-f]{64}$'
          or p_recommendation->>'catalog_version' is null) then
    raise exception 'AI exercise catalog version is invalid';
  end if;

  if p_recommendation->>'generator' = 'auto-fit-ai'
     and exists (
       select 1 from jsonb_array_elements(p_items) as item(value)
       where nullif(item.value->>'exercise_key', '') is null
     ) then
    raise exception 'AI exercise key is required';
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
    coalesce(p_recommendation->>'generator', 'legacy'),
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

  insert into public.exercise_items (
    exercise_recommendation_id,
    exercise_type_id,
    exercise_key,
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
    case when p_recommendation->>'generator' = 'auto-fit-ai'
      then item.value->>'exercise_key' else null end,
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

-- Rollback after AI recommendations stop being generated:
-- restore the original RPC from 20260902041419_create_exercise_recommendation_rpc.sql,
-- review the six inserted exercise_types rows, then drop exercise_items.exercise_key and
-- exercise_recommendations.catalog_version/generator.;
