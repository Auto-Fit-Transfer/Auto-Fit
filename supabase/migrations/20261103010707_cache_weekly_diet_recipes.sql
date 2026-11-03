-- Keep the validated AI reply for each weekly plan version, slot and serving count.
alter table public.diet_recipe_snapshots
  add column if not exists recipe_response jsonb;

alter table public.diet_recipe_snapshots
  drop constraint if exists diet_recipe_snapshots_response_check;

alter table public.diet_recipe_snapshots
  add constraint diet_recipe_snapshots_response_check check (
    recipe_response is null or jsonb_typeof(recipe_response) = 'object'
  );

-- A generated recipe can have cooking steps without structured ingredients.
alter table public.diet_recipe_snapshots
  drop constraint diet_recipe_snapshots_ingredients_check,
  drop constraint diet_recipe_snapshots_steps_check;

alter table public.diet_recipe_snapshots
  add constraint diet_recipe_snapshots_ingredients_check check (
    case when jsonb_typeof(ingredients) = 'array' then
      jsonb_array_length(ingredients) between
        case when weekly_diet_plan_id is not null and recipe_response is not null
          then 0 else 1 end and 50
    else false end
  ),
  add constraint diet_recipe_snapshots_steps_check check (
    case when jsonb_typeof(steps) = 'array' then
      jsonb_array_length(steps) between
        case when weekly_diet_plan_id is not null and recipe_response is not null
          then 0 else 1 end and 50
    else false end
  );

drop index public.uq_diet_recipe_weekly_slot_version;
create unique index uq_diet_recipe_weekly_slot_version
  on public.diet_recipe_snapshots
    (weekly_diet_plan_id, weekly_plan_version, plan_day, meal_type, servings)
  where weekly_diet_plan_id is not null;

grant update on public.diet_recipe_snapshots to service_role;
