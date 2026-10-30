begin;

alter table public.diet_meal_foods
  add column if not exists food_order integer;

with ranked_foods as (
  select
    diet_meal_food_id,
    row_number() over (
      partition by diet_meal_id
      order by created_at, diet_meal_food_id
    )::integer as food_order
  from public.diet_meal_foods
)
update public.diet_meal_foods as foods
set food_order = ranked_foods.food_order
from ranked_foods
where foods.diet_meal_food_id = ranked_foods.diet_meal_food_id
  and foods.food_order is null;

create or replace function public.assign_diet_meal_food_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.food_order is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.diet_meal_id::text, 0)
    );

    select coalesce(max(food.food_order), 0) + 1
    into new.food_order
    from public.diet_meal_foods as food
    where food.diet_meal_id = new.diet_meal_id;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_diet_meal_food_order
  on public.diet_meal_foods;

create trigger assign_diet_meal_food_order
before insert on public.diet_meal_foods
for each row
execute function public.assign_diet_meal_food_order();

alter table public.diet_meal_foods
  alter column food_order set not null,
  add constraint diet_meal_foods_meal_order_key
    unique (diet_meal_id, food_order);

comment on column public.diet_meal_foods.food_order is
  'Stable display order of foods within a recommended meal.';

revoke all on function public.assign_diet_meal_food_order()
  from public, anon, authenticated;

commit;
