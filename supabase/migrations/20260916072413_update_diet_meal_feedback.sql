create or replace function public.update_recommended_meal(
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
  if p_feedback_type is null or p_feedback_type not in ('eaten', 'different_food', 'skipped') then
    raise exception 'invalid feedback_type';
  end if;
  if p_actual_items is null or jsonb_typeof(p_actual_items) <> 'array' then
    raise exception 'actual_items must be an array';
  end if;
  if p_feedback_type = 'different_food' and jsonb_array_length(p_actual_items) = 0 then
    raise exception 'different_food requires actual_items';
  end if;

  select dm.* into v_meal
  from public.diet_meals dm
  join public.diet_recommendations dr
    on dr.diet_recommendation_id = dm.diet_recommendation_id
  where dm.diet_meal_id = p_diet_meal_id
    and dr.user_id = p_user_id
  for update of dm;

  if not found then
    raise exception 'diet meal not found for user' using errcode = 'P0002';
  end if;

  select * into v_feedback from public.diet_feedback
  where user_id = p_user_id and diet_meal_id = p_diet_meal_id
  for update;
  if not found then
    raise exception 'meal feedback not found' using errcode = 'P0002';
  end if;
  p_eaten_at := coalesce(p_eaten_at, v_feedback.recorded_at);

  -- Only touch the log belonging to this user's feedback.
  if v_feedback.meal_log_id is not null then
    select * into v_meal_log from public.meal_logs
    where meal_log_id = v_feedback.meal_log_id
      and user_id = p_user_id and diet_meal_id = p_diet_meal_id
    for update;
    if not found then
      raise exception 'feedback meal log ownership mismatch';
    end if;
    delete from public.meal_log_items where meal_log_id = v_meal_log.meal_log_id;
    update public.meal_logs
    set status = case when p_feedback_type = 'skipped' then 'deleted' else 'recorded' end,
        source_type = case when p_feedback_type = 'eaten' then 'recommendation' else 'manual' end,
        eaten_at = p_eaten_at, updated_at = now()
    where meal_log_id = v_meal_log.meal_log_id
    returning * into v_meal_log;
  end if;

  if p_feedback_type <> 'skipped' then
    if v_meal_log.meal_log_id is null then
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

    end if;

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

  update public.diet_feedback
  set meal_log_id = case when p_feedback_type = 'skipped' then null else v_meal_log.meal_log_id end,
      feedback_type = p_feedback_type,
      actual_food_name = case when p_feedback_type = 'different_food'
        then nullif(btrim(p_actual_items -> 0 ->> 'food_name'), '') else null end,
      recorded_at = p_eaten_at
  where diet_feedback_id = v_feedback.diet_feedback_id
  returning * into v_feedback;

  update public.diet_meals
  set status = case p_feedback_type
    when 'eaten' then 'completed'
    when 'different_food' then 'changed'
    else 'skipped'
  end
  where diet_meal_id = p_diet_meal_id;

  return jsonb_build_object(
    'feedback', to_jsonb(v_feedback),
    'meal_log', case when p_feedback_type = 'skipped' then null else to_jsonb(v_meal_log) end
  );
end;
$$;

revoke all on function public.update_recommended_meal(uuid, uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_recommended_meal(uuid, uuid, text, timestamptz, jsonb)
  to service_role;
