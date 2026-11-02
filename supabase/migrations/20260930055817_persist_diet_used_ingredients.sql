begin;

alter table public.diet_meals
  add column if not exists used_ingredients jsonb;

alter table public.diet_meals
  add constraint diet_meals_used_ingredients_array_check
  check (
    used_ingredients is null
    or jsonb_typeof(used_ingredients) = 'array'
  );

comment on column public.diet_meals.used_ingredients is
  'Recommendation-time snapshot of refrigerator ingredients matched to this meal. NULL identifies legacy rows without a snapshot.';

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
  v_used_ingredients jsonb;
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
    user_id,
    recommendation_date,
    target_calories,
    target_carbohydrates,
    target_protein,
    target_fat,
    recommendation_summary,
    ai_reason,
    status
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
    v_used_ingredients := coalesce(
      v_meal_input -> 'used_ingredients',
      '[]'::jsonb
    );
    if jsonb_typeof(v_used_ingredients) <> 'array' then
      raise exception 'used_ingredients must be an array';
    end if;

    insert into public.diet_meals (
      diet_recommendation_id,
      meal_type,
      meal_order,
      recommended_calories,
      recommendation_note,
      image_storage_path,
      menu_image_key,
      source_type,
      used_ingredients,
      status
    ) values (
      v_recommendation.diet_recommendation_id,
      v_meal_input ->> 'meal_type',
      (v_meal_input ->> 'meal_order')::integer,
      (v_meal_input ->> 'recommended_calories')::numeric,
      nullif(btrim(v_meal_input ->> 'recommendation_note'), ''),
      nullif(btrim(v_meal_input ->> 'image_storage_path'), ''),
      nullif(btrim(v_meal_input ->> 'menu_image_key'), ''),
      v_meal_input ->> 'source_type',
      v_used_ingredients,
      'recommended'
    ) returning * into v_meal;

    for v_food_input in select value from jsonb_array_elements(v_meal_input -> 'foods')
    loop
      if nullif(btrim(v_food_input ->> 'food_name'), '') is null then
        raise exception 'food_name is required';
      end if;
      insert into public.diet_meal_foods (
        diet_meal_id,
        food_name,
        quantity,
        unit,
        calories,
        carbohydrates,
        protein,
        fat
      ) values (
        v_meal.diet_meal_id,
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

create or replace function public.replace_diet_meal(
  p_user_id uuid,
  p_diet_meal_id uuid,
  p_meal jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recommendation public.diet_recommendations%rowtype;
  v_meal public.diet_meals%rowtype;
  v_food_input jsonb;
  v_old_representative text;
  v_new_representative text;
  v_new_calories numeric;
  v_source_type text;
  v_foods jsonb;
  v_used_ingredients jsonb;
begin
  if p_user_id is null or p_diet_meal_id is null then
    raise exception 'user_id and diet_meal_id are required';
  end if;
  if jsonb_typeof(p_meal) <> 'object' then
    raise exception 'meal must be an object';
  end if;
  if jsonb_typeof(p_meal -> 'foods') <> 'array'
     or jsonb_array_length(p_meal -> 'foods') not between 1 and 20 then
    raise exception 'meal foods must contain between 1 and 20 items';
  end if;

  v_source_type := p_meal ->> 'source_type';
  if v_source_type is not null
     and v_source_type not in ('db_catalog', 'ai_generated') then
    raise exception 'invalid meal source_type';
  end if;
  v_used_ingredients := coalesce(p_meal -> 'used_ingredients', '[]'::jsonb);
  if jsonb_typeof(v_used_ingredients) <> 'array' then
    raise exception 'used_ingredients must be an array';
  end if;

  select dr.* into v_recommendation
  from public.diet_recommendations dr
  join public.diet_meals dm
    on dm.diet_recommendation_id = dr.diet_recommendation_id
  where dm.diet_meal_id = p_diet_meal_id
    and dr.user_id = p_user_id
  for update of dr;

  if not found then
    raise exception 'diet meal not found for user';
  end if;

  select dm.* into v_meal
  from public.diet_meals dm
  where dm.diet_meal_id = p_diet_meal_id
    and dm.diet_recommendation_id = v_recommendation.diet_recommendation_id
  for update;

  -- Keep rollout compatible with an older API instance until traffic switches.
  v_source_type := coalesce(v_source_type, v_meal.source_type);

  if v_recommendation.status <> 'active' or v_meal.status <> 'recommended' then
    raise exception 'diet meal cannot be regenerated in its current state';
  end if;
  if p_meal ->> 'meal_type' <> v_meal.meal_type then
    raise exception 'meal_type cannot be changed';
  end if;
  if coalesce((p_meal ->> 'meal_order')::integer, -1) <> v_meal.meal_order then
    raise exception 'meal_order cannot be changed';
  end if;

  v_new_calories := (p_meal ->> 'recommended_calories')::numeric;
  if coalesce(v_new_calories, 0) <= 0 then
    raise exception 'recommended_calories must be positive';
  end if;
  if v_meal.recommended_calories is not null
     and (
       v_new_calories < v_meal.recommended_calories * 0.85
       or v_new_calories > v_meal.recommended_calories * 1.15
     ) then
    raise exception 'replacement calories must be within 15 percent';
  end if;

  select coalesce(dmf.food_name, fi.name) into v_old_representative
  from public.diet_meal_foods dmf
  left join public.food_items fi on fi.food_item_id = dmf.food_item_id
  where dmf.diet_meal_id = p_diet_meal_id
  order by dmf.food_order, dmf.diet_meal_food_id
  limit 1;

  v_new_representative := nullif(btrim(p_meal -> 'foods' -> 0 ->> 'food_name'), '');
  if v_new_representative is null then
    raise exception 'representative food_name is required';
  end if;
  if v_old_representative is not null
     and lower(btrim(v_old_representative)) = lower(v_new_representative) then
    raise exception 'representative food must be changed';
  end if;

  for v_food_input in select value from jsonb_array_elements(p_meal -> 'foods')
  loop
    if nullif(btrim(v_food_input ->> 'food_name'), '') is null then
      raise exception 'food_name is required';
    end if;
    if coalesce((v_food_input ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'food quantity must be positive';
    end if;
    if nullif(btrim(v_food_input ->> 'unit'), '') is null then
      raise exception 'food unit is required';
    end if;
    if coalesce((v_food_input ->> 'calories')::numeric, 0) < 0
       or coalesce((v_food_input ->> 'carbohydrates')::numeric, 0) < 0
       or coalesce((v_food_input ->> 'protein')::numeric, 0) < 0
       or coalesce((v_food_input ->> 'fat')::numeric, 0) < 0 then
      raise exception 'food nutrients must be nonnegative';
    end if;
  end loop;

  delete from public.diet_meal_foods
  where diet_meal_id = p_diet_meal_id;

  update public.diet_meals
  set recommended_calories = v_new_calories,
      recommendation_note = nullif(btrim(p_meal ->> 'recommendation_note'), ''),
      image_storage_path = nullif(btrim(p_meal ->> 'image_storage_path'), ''),
      menu_image_key = nullif(btrim(p_meal ->> 'menu_image_key'), ''),
      source_type = v_source_type,
      used_ingredients = v_used_ingredients,
      status = 'recommended'
  where diet_meal_id = p_diet_meal_id
  returning * into v_meal;

  for v_food_input in select value from jsonb_array_elements(p_meal -> 'foods')
  loop
    insert into public.diet_meal_foods (
      diet_meal_id, food_item_id, food_name, quantity, unit, calories,
      carbohydrates, protein, fat
    ) values (
      p_diet_meal_id,
      nullif(v_food_input ->> 'food_item_id', '')::uuid,
      btrim(v_food_input ->> 'food_name'),
      (v_food_input ->> 'quantity')::numeric,
      btrim(v_food_input ->> 'unit'),
      (v_food_input ->> 'calories')::numeric,
      (v_food_input ->> 'carbohydrates')::numeric,
      (v_food_input ->> 'protein')::numeric,
      (v_food_input ->> 'fat')::numeric
    );
  end loop;

  select coalesce(
    jsonb_agg(to_jsonb(dmf) order by dmf.food_order, dmf.diet_meal_food_id),
    '[]'::jsonb
  ) into v_foods
  from public.diet_meal_foods dmf
  where dmf.diet_meal_id = p_diet_meal_id;

  return to_jsonb(v_meal) || jsonb_build_object('foods', v_foods);
end;
$$;

revoke all on function public.create_diet_recommendation(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_diet_recommendation(uuid, jsonb, jsonb)
  to service_role;

revoke all on function public.replace_diet_meal(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_diet_meal(uuid, uuid, jsonb)
  to service_role;

commit;
