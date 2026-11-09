-- Recheck the current allergy selection in the same transaction that records
-- recommendation feedback. Existing meal logs are not touched by this migration.
-- The weekly diet context triggers already serialize user_allergies and catalog
-- changes with these advisory lock keys (20261020044749).
alter table public.diet_recommendations
  add column allergy_context jsonb
  check (allergy_context is null or jsonb_typeof(allergy_context) = 'array');

-- Keep the existing creation RPC intact. This wrapper checks the exact allergy
-- selection used to generate the menu and stores it while holding the same lock.
create function public.create_checked_diet_recommendation(
  p_user_id uuid, p_recommendation jsonb, p_meals jsonb, p_food_allergens jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current jsonb;
  v_unresolved boolean;
  v_created jsonb;
begin
  if p_user_id is null or jsonb_typeof(p_food_allergens) is distinct from 'array' then
    raise exception 'DIET_ALLERGY_CONTEXT_CHANGED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('weekly-diet-catalog', 0));
  perform pg_advisory_xact_lock(hashtextextended('weekly-diet-user:' || p_user_id::text, 0));

  select coalesce(jsonb_agg(distinct btrim(coalesce(a.custom_name, t.name))), '[]'::jsonb),
         coalesce(bool_or(nullif(btrim(coalesce(a.custom_name, t.name)), '') is null), false)
    into v_current, v_unresolved
  from public.user_allergies a
  left join public.allergy_types t
    on t.allergy_type_id = a.allergy_type_id and t.is_active
  where a.user_id = p_user_id;

  if v_unresolved or not (
    v_current @> p_food_allergens and p_food_allergens @> v_current
  ) then
    raise exception 'DIET_ALLERGY_CONTEXT_CHANGED' using errcode = 'P0001';
  end if;

  v_created := public.create_diet_recommendation(p_user_id, p_recommendation, p_meals);
  update public.diet_recommendations
  set allergy_context = v_current
  where diet_recommendation_id = (v_created ->> 'diet_recommendation_id')::uuid
    and user_id = p_user_id;
  if not found then
    raise exception 'diet recommendation snapshot failed';
  end if;
  return v_created;
end;
$$;

revoke all on function public.create_checked_diet_recommendation(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_checked_diet_recommendation(uuid, jsonb, jsonb, jsonb)
  to service_role;

-- A replacement has its own AI generation delay. Validate its context at the
-- point of persistence without changing the other meals' original snapshot.
create function public.replace_checked_diet_meal(
  p_user_id uuid, p_diet_meal_id uuid, p_meal jsonb, p_food_allergens jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current jsonb;
  v_saved jsonb;
  v_unresolved boolean;
begin
  if p_user_id is null or jsonb_typeof(p_food_allergens) is distinct from 'array' then
    raise exception 'DIET_ALLERGY_CONTEXT_CHANGED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('weekly-diet-catalog', 0));
  perform pg_advisory_xact_lock(hashtextextended('weekly-diet-user:' || p_user_id::text, 0));

  select dr.allergy_context into v_saved
  from public.diet_meals dm
  join public.diet_recommendations dr
    on dr.diet_recommendation_id = dm.diet_recommendation_id
  where dm.diet_meal_id = p_diet_meal_id and dr.user_id = p_user_id;
  if not found then
    raise exception 'diet meal not found for user' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(distinct btrim(coalesce(a.custom_name, t.name))), '[]'::jsonb),
         coalesce(bool_or(nullif(btrim(coalesce(a.custom_name, t.name)), '') is null), false)
    into v_current, v_unresolved
  from public.user_allergies a
  left join public.allergy_types t
    on t.allergy_type_id = a.allergy_type_id and t.is_active
  where a.user_id = p_user_id;

  if v_saved is null and v_current <> '[]'::jsonb then
    raise exception 'DIET_MEAL_ALLERGY_UNVERIFIED' using errcode = 'P0001';
  end if;
  if v_unresolved or not (
    v_current @> p_food_allergens and p_food_allergens @> v_current
    and (v_saved is null or v_saved @> v_current)
  ) then
    raise exception 'DIET_ALLERGY_CONTEXT_CHANGED' using errcode = 'P0001';
  end if;
  return public.replace_diet_meal(p_user_id, p_diet_meal_id, p_meal);
end;
$$;

revoke all on function public.replace_checked_diet_meal(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_checked_diet_meal(uuid, uuid, jsonb, jsonb)
  to service_role;

create function public.guard_saved_diet_feedback_allergy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_saved_context jsonb;
  v_current jsonb;
  v_unresolved boolean;
  v_conflict boolean;
begin
  if new.feedback_type <> 'eaten' then
    return new;
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('weekly-diet-catalog', 0));
  perform pg_advisory_xact_lock(hashtextextended('weekly-diet-user:' || new.user_id::text, 0));

  select dr.user_id, dr.allergy_context into v_owner, v_saved_context
  from public.diet_meals dm
  join public.diet_recommendations dr
    on dr.diet_recommendation_id = dm.diet_recommendation_id
  where dm.diet_meal_id = new.diet_meal_id;
  if v_owner is distinct from new.user_id then
    raise exception 'diet meal not found for user' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.user_allergies a
    left join public.allergy_types t
      on t.allergy_type_id = a.allergy_type_id and t.is_active
    where a.user_id = new.user_id
      and nullif(btrim(coalesce(a.custom_name, t.name)), '') is null
  ) into v_unresolved;
  if v_unresolved then
    raise exception 'DIET_MEAL_ALLERGY_UNVERIFIED' using errcode = 'P0001';
  end if;

  with allergies as (
    select lower(btrim(coalesce(a.custom_name, t.name))) as name
    from public.user_allergies a
    left join public.allergy_types t
      on t.allergy_type_id = a.allergy_type_id and t.is_active
    where a.user_id = new.user_id
  ), foods as (
    select lower(btrim(coalesce(dmf.food_name, fi.name, ''))) as name
    from public.diet_meal_foods dmf
    left join public.food_items fi on fi.food_item_id = dmf.food_item_id
    where dmf.diet_meal_id = new.diet_meal_id
    union all
    select lower(btrim(coalesce(ingredient.value ->> 'name', '')))
    from public.diet_meals dm
    cross join lateral jsonb_array_elements(coalesce(dm.used_ingredients, '[]'::jsonb)) ingredient(value)
    where dm.diet_meal_id = new.diet_meal_id
  ), terms as (
    select a.name as allergy, a.name as term from allergies a
    union all
    select a.name, alias.term
    from allergies a
    cross join lateral unnest(case a.name
      when '우유' then array['요거트','치즈','버터']
      when '유제품' then array['우유','요거트','치즈','버터']
      when 'milk' then array['yogurt','cheese','butter']
      when 'dairy' then array['milk','yogurt','cheese','butter']
      when '대두' then array['두부','콩','된장']
      when 'soy' then array['tofu','soybean']
      when '견과류' then array['호두','아몬드','땅콩','캐슈']
      when '생선' then array['연어','고등어','참치','대구']
      when 'fish' then array['salmon','tuna','cod']
      when '달걀' then array['계란','메추리알','에그','마요네즈']
      when '계란' then array['달걀','메추리알','에그','마요네즈']
      when 'egg' then array['달걀','계란','메추리알','에그','마요네즈']
      when '갑각류' then array['새우','게','꽃게','대게','가재','랍스터','크랩']
      when '새우' then array['갑각류','shrimp','prawn']
      when 'crustacean' then array['새우','게','가재','랍스터','shrimp','crab','lobster']
      when '밀' then array['밀가루','빵','면','국수','라면','우동','파스타','쿠키','케이크']
      when 'wheat' then array['밀','밀가루','빵','면','국수','라면','우동','파스타','bread','noodle']
      else array[]::text[]
    end) alias(term)
  )
  select exists (
    select 1 from foods f cross join terms t
    where f.name <> '' and t.term <> ''
      and (position(t.term in f.name) > 0 or position(f.name in t.allergy) > 0)
  ) into v_conflict;

  if v_conflict then
    raise exception 'DIET_MEAL_ALLERGY_CONFLICT' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(distinct btrim(coalesce(a.custom_name, t.name))), '[]'::jsonb)
    into v_current
  from public.user_allergies a
  left join public.allergy_types t
    on t.allergy_type_id = a.allergy_type_id and t.is_active
  where a.user_id = new.user_id;
  if v_saved_context is null and v_current <> '[]'::jsonb then
    raise exception 'DIET_MEAL_ALLERGY_UNVERIFIED' using errcode = 'P0001';
  end if;
  if v_saved_context is not null and not (v_saved_context @> v_current) then
    raise exception 'DIET_MEAL_ALLERGY_CONFLICT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_saved_diet_feedback_allergy
before insert or update on public.diet_feedback
for each row execute function public.guard_saved_diet_feedback_allergy();

revoke all on function public.guard_saved_diet_feedback_allergy()
  from public, anon, authenticated;
grant execute on function public.guard_saved_diet_feedback_allergy()
  to service_role;
