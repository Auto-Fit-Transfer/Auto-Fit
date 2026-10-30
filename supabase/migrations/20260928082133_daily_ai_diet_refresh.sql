alter table public.diet_meals
  add column if not exists source_type text not null default 'db_catalog';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'diet_meals_source_type_check'
      and conrelid = 'public.diet_meals'::regclass
  ) then
    alter table public.diet_meals
      add constraint diet_meals_source_type_check
      check (source_type in ('db_catalog', 'ai_generated'));
  end if;
end;
$$;

comment on column public.diet_meals.source_type is
  'Origin of this recommended meal: DB food catalog or validated AI generation.';

create or replace function public.create_diet_recommendation(
  p_user_id uuid,
  p_recommendation jsonb,
  p_meals jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recommendation public.diet_recommendations%rowtype;
  v_meal public.diet_meals%rowtype;
  v_meal_input jsonb;
  v_food_input jsonb;
  v_ai_meal_count integer;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;
  if jsonb_typeof(p_recommendation) <> 'object' then
    raise exception 'recommendation must be an object';
  end if;
  if jsonb_typeof(p_meals) <> 'array' or jsonb_array_length(p_meals) <> 4 then
    raise exception 'daily mixed recommendations must contain exactly 4 meals';
  end if;
  select count(*) into v_ai_meal_count
  from jsonb_array_elements(p_meals) meal
  where meal ->> 'source_type' = 'ai_generated';
  if v_ai_meal_count not between 2 and 3 then
    raise exception 'daily recommendations must contain 2 or 3 AI-generated meals';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_meals) meal
    where meal ->> 'source_type' not in ('db_catalog', 'ai_generated')
  ) then
    raise exception 'invalid meal source_type';
  end if;
  if coalesce((p_recommendation ->> 'target_calories')::numeric, 0) <= 0 then
    raise exception 'target_calories must be positive';
  end if;

  update public.diet_recommendations
  set status = 'cancelled'
  where user_id = p_user_id
    and recommendation_date = (p_recommendation ->> 'recommendation_date')::date
    and status = 'active';

  insert into public.diet_recommendations (
    user_id, recommendation_date, target_calories, target_carbohydrates,
    target_protein, target_fat, recommendation_summary, ai_reason, status
  ) values (
    p_user_id,
    (p_recommendation ->> 'recommendation_date')::date,
    (p_recommendation ->> 'target_calories')::numeric,
    (p_recommendation ->> 'target_carbohydrates')::numeric,
    (p_recommendation ->> 'target_protein')::numeric,
    (p_recommendation ->> 'target_fat')::numeric,
    nullif(btrim(p_recommendation ->> 'recommendation_summary'), ''),
    nullif(btrim(p_recommendation ->> 'ai_reason'), ''),
    'active'
  ) returning * into v_recommendation;

  for v_meal_input in select value from jsonb_array_elements(p_meals)
  loop
    if v_meal_input ->> 'meal_type' not in ('breakfast', 'lunch', 'dinner', 'snack') then
      raise exception 'invalid meal_type';
    end if;
    if jsonb_typeof(v_meal_input -> 'foods') <> 'array'
       or jsonb_array_length(v_meal_input -> 'foods') = 0 then
      raise exception 'each meal must contain foods';
    end if;

    insert into public.diet_meals (
      diet_recommendation_id, meal_type, meal_order, recommended_calories,
      recommendation_note, source_type, status
    ) values (
      v_recommendation.diet_recommendation_id,
      v_meal_input ->> 'meal_type',
      (v_meal_input ->> 'meal_order')::integer,
      (v_meal_input ->> 'recommended_calories')::numeric,
      nullif(btrim(v_meal_input ->> 'recommendation_note'), ''),
      v_meal_input ->> 'source_type',
      'recommended'
    ) returning * into v_meal;

    for v_food_input in select value from jsonb_array_elements(v_meal_input -> 'foods')
    loop
      if nullif(btrim(v_food_input ->> 'food_name'), '') is null then
        raise exception 'food_name is required';
      end if;
      insert into public.diet_meal_foods (
        diet_meal_id, food_item_id, food_name, quantity, unit, calories,
        carbohydrates, protein, fat
      ) values (
        v_meal.diet_meal_id,
        nullif(v_food_input ->> 'food_item_id', '')::uuid,
        btrim(v_food_input ->> 'food_name'),
        (v_food_input ->> 'quantity')::numeric,
        nullif(btrim(v_food_input ->> 'unit'), ''),
        (v_food_input ->> 'calories')::numeric,
        (v_food_input ->> 'carbohydrates')::numeric,
        (v_food_input ->> 'protein')::numeric,
        (v_food_input ->> 'fat')::numeric
      );
    end loop;
  end loop;

  return to_jsonb(v_recommendation);
end;
$$;

revoke all on function public.create_diet_recommendation(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_diet_recommendation(uuid, jsonb, jsonb)
  to service_role;
