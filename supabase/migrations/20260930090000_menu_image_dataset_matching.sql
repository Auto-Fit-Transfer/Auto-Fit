alter table public.menu_images
  add column if not exists meal_type text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'menu_images_meal_type_check'
      and conrelid = 'public.menu_images'::regclass
  ) then
    alter table public.menu_images
      add constraint menu_images_meal_type_check
      check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));
  end if;
end;
$$;

create index if not exists menu_images_status_meal_type_idx
  on public.menu_images (generation_status, meal_type);

alter table public.diet_meals
  drop constraint if exists diet_meals_image_storage_path_check;

alter table public.diet_meals
  add constraint diet_meals_image_storage_path_check
  check (
    image_storage_path is null
    or (
      length(image_storage_path) <= 500
      and position('..' in image_storage_path) = 0
      and image_storage_path !~ '^/'
      and image_storage_path ~* '^[A-Za-z0-9][A-Za-z0-9/_-]*[.](png|jpg|jpeg|webp)$'
    )
  ) not valid;

alter table public.diet_meals
  validate constraint diet_meals_image_storage_path_check;

drop function if exists public.claim_menu_image(text, text, text[]);

create function public.claim_menu_image(
  p_image_key text,
  p_menu_name text,
  p_food_tags text[],
  p_meal_type text
)
returns public.menu_images
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_image public.menu_images%rowtype;
begin
  if nullif(btrim(p_image_key), '') is null then
    raise exception 'image_key is required';
  end if;
  if nullif(btrim(p_menu_name), '') is null then
    raise exception 'menu_name is required';
  end if;
  if coalesce(cardinality(p_food_tags), 0) = 0 then
    raise exception 'food_tags are required';
  end if;
  if p_meal_type is not null
     and p_meal_type not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception 'invalid meal_type';
  end if;

  insert into public.menu_images (
    image_key, menu_name, food_tags, meal_type, source_type, generation_status
  ) values (
    btrim(p_image_key), btrim(p_menu_name), p_food_tags, p_meal_type,
    'generated', 'pending'
  )
  on conflict (image_key) do nothing;

  select mi.* into v_image
  from public.menu_images mi
  where mi.image_key = btrim(p_image_key);

  return v_image;
end;
$$;

revoke all on function public.claim_menu_image(text, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.claim_menu_image(text, text, text[], text)
  to service_role;

create or replace function public.claim_menu_image_generation(p_image_key text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  update public.menu_images
  set generation_status = 'generating', last_error = null
  where image_key = p_image_key
    and source_type = 'generated'
    and (
      generation_status = 'pending'
      or (
        generation_status = 'failed'
        and coalesce((metadata ->> 'retryable')::boolean, true)
      )
      or (
        generation_status = 'generating'
        and updated_at < now() - interval '30 minutes'
      )
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_menu_image_generation(text)
  from public, anon, authenticated;
grant execute on function public.claim_menu_image_generation(text)
  to service_role;

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
  v_used_ingredients jsonb;
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
    v_used_ingredients := coalesce(
      v_meal_input -> 'used_ingredients',
      '[]'::jsonb
    );
    if jsonb_typeof(v_used_ingredients) <> 'array' then
      raise exception 'used_ingredients must be an array';
    end if;

    insert into public.diet_meals (
      diet_recommendation_id, meal_type, meal_order, recommended_calories,
      recommendation_note, image_storage_path, menu_image_key, source_type,
      used_ingredients, status
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
