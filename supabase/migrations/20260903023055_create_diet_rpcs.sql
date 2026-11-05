create unique index if not exists uk_diet_recommendations_user_date_active
  on public.diet_recommendations (user_id, recommendation_date)
  where status = 'active';

create unique index if not exists uk_diet_feedback_user_meal
  on public.diet_feedback (user_id, diet_meal_id);

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
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;
  if jsonb_typeof(p_recommendation) <> 'object' then
    raise exception 'recommendation must be an object';
  end if;
  if jsonb_typeof(p_meals) <> 'array' or jsonb_array_length(p_meals) not between 1 and 4 then
    raise exception 'meals must contain between 1 and 4 items';
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

    insert into public.diet_meals (
      diet_recommendation_id,
      meal_type,
      meal_order,
      recommended_calories,
      recommendation_note,
      status
    ) values (
      v_recommendation.diet_recommendation_id,
      v_meal_input ->> 'meal_type',
      (v_meal_input ->> 'meal_order')::integer,
      (v_meal_input ->> 'recommended_calories')::numeric,
      nullif(btrim(v_meal_input ->> 'recommendation_note'), ''),
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

create or replace function public.record_recommended_meal(
  p_user_id uuid,
  p_diet_meal_id uuid,
  p_feedback_type text,
  p_eaten_at timestamptz,
  p_actual_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meal public.diet_meals%rowtype;
  v_meal_log public.meal_logs%rowtype;
  v_feedback public.diet_feedback%rowtype;
  v_item jsonb;
  v_order integer := 0;
begin
  if p_user_id is null or p_diet_meal_id is null then
    raise exception 'user_id and diet_meal_id are required';
  end if;
  if p_feedback_type not in ('eaten', 'different_food', 'skipped') then
    raise exception 'invalid feedback_type';
  end if;
  if p_eaten_at is null then
    raise exception 'eaten_at is required';
  end if;
  if jsonb_typeof(p_actual_items) <> 'array' then
    raise exception 'actual_items must be an array';
  end if;
  if p_feedback_type = 'different_food' and jsonb_array_length(p_actual_items) = 0 then
    raise exception 'different_food requires actual_items';
  end if;
  if exists (
    select 1 from public.diet_feedback
    where user_id = p_user_id and diet_meal_id = p_diet_meal_id
  ) then
    raise exception 'meal feedback already recorded';
  end if;

  select dm.* into v_meal
  from public.diet_meals dm
  join public.diet_recommendations dr
    on dr.diet_recommendation_id = dm.diet_recommendation_id
  where dm.diet_meal_id = p_diet_meal_id
    and dr.user_id = p_user_id;

  if not found then
    raise exception 'diet meal not found for user';
  end if;

  if p_feedback_type <> 'skipped' then
    insert into public.meal_logs (
      user_id,
      diet_meal_id,
      meal_type,
      source_type,
      eaten_at,
      status
    ) values (
      p_user_id,
      p_diet_meal_id,
      v_meal.meal_type,
      case when p_feedback_type = 'eaten' then 'recommendation' else 'manual' end,
      p_eaten_at,
      'recorded'
    ) returning * into v_meal_log;

    if p_feedback_type = 'eaten' then
      insert into public.meal_log_items (
        meal_log_id, food_item_id, food_name, quantity, unit,
        calories, carbohydrates, protein, fat, sequence_order
      )
      select
        v_meal_log.meal_log_id,
        dmf.food_item_id,
        coalesce(dmf.food_name, fi.name),
        coalesce(dmf.quantity, 1),
        coalesce(dmf.unit, 'serving'),
        dmf.calories,
        dmf.carbohydrates,
        dmf.protein,
        dmf.fat,
        (row_number() over (order by dmf.created_at, dmf.diet_meal_food_id) - 1)::integer
      from public.diet_meal_foods dmf
      left join public.food_items fi on fi.food_item_id = dmf.food_item_id
      where dmf.diet_meal_id = p_diet_meal_id;
    else
      for v_item in select value from jsonb_array_elements(p_actual_items)
      loop
        if nullif(btrim(v_item ->> 'food_name'), '') is null
           or coalesce((v_item ->> 'quantity')::numeric, 0) <= 0 then
          raise exception 'actual food name and positive quantity are required';
        end if;
        insert into public.meal_log_items (
          meal_log_id, food_name, quantity, unit, calories,
          carbohydrates, protein, fat, sequence_order
        ) values (
          v_meal_log.meal_log_id,
          btrim(v_item ->> 'food_name'),
          (v_item ->> 'quantity')::numeric,
          coalesce(nullif(btrim(v_item ->> 'unit'), ''), 'g'),
          (v_item ->> 'calories')::numeric,
          (v_item ->> 'carbohydrates')::numeric,
          (v_item ->> 'protein')::numeric,
          (v_item ->> 'fat')::numeric,
          v_order
        );
        v_order := v_order + 1;
      end loop;
    end if;
  end if;

  insert into public.diet_feedback (
    user_id,
    diet_meal_id,
    meal_log_id,
    feedback_type,
    actual_food_name,
    recorded_at
  ) values (
    p_user_id,
    p_diet_meal_id,
    v_meal_log.meal_log_id,
    p_feedback_type,
    case
      when p_feedback_type = 'different_food'
      then nullif(btrim(p_actual_items -> 0 ->> 'food_name'), '')
      else null
    end,
    p_eaten_at
  ) returning * into v_feedback;

  update public.diet_meals
  set status = case p_feedback_type
    when 'eaten' then 'completed'
    when 'different_food' then 'changed'
    else 'skipped'
  end
  where diet_meal_id = p_diet_meal_id;

  return jsonb_build_object(
    'feedback', to_jsonb(v_feedback),
    'meal_log', case when v_meal_log.meal_log_id is null then null else to_jsonb(v_meal_log) end
  );
end;
$$;

revoke all on function public.create_diet_recommendation(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_diet_recommendation(uuid, jsonb, jsonb)
  to service_role;

revoke all on function public.record_recommended_meal(uuid, uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_recommended_meal(uuid, uuid, text, timestamptz, jsonb)
  to service_role;
