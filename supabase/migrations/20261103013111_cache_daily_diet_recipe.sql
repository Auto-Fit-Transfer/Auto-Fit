-- Save the validated AI response for a daily meal, including an unavailable result.
-- The fingerprint changes when the saved meal or allergy restrictions change.
alter table public.diet_recipe_snapshots
  add column recipe_response jsonb,
  add column source_fingerprint text;

alter table public.diet_recipe_snapshots
  add constraint diet_recipe_snapshots_response_check check (
    recipe_response is null or jsonb_typeof(recipe_response) = 'object'
  ),
  add constraint diet_recipe_snapshots_fingerprint_check check (
    source_fingerprint is null or source_fingerprint ~ '^[0-9a-f]{64}$'
  );

-- An AI reply may mark every item unavailable. Preserve that result so a
-- subsequent read does not invoke the AI again or invent recipe steps.
alter table public.diet_recipe_snapshots
  drop constraint diet_recipe_snapshots_ingredients_check,
  drop constraint diet_recipe_snapshots_steps_check;

alter table public.diet_recipe_snapshots
  add constraint diet_recipe_snapshots_ingredients_check check (
    jsonb_typeof(ingredients) = 'array'
    and jsonb_array_length(ingredients) between
      case when recipe_response is null then 1 else 0 end and 50
  ),
  add constraint diet_recipe_snapshots_steps_check check (
    jsonb_typeof(steps) = 'array'
    and jsonb_array_length(steps) between
      case when recipe_response is null then 1 else 0 end and 50
  );

grant update on public.diet_recipe_snapshots to service_role;
