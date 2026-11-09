// Isolated PostgreSQL checks; pass the installed @electric-sql/pglite path.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const read = name => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
const owner = '00000000-0000-0000-0000-000000000001';
const egg = '00000000-0000-0000-0000-000000000002';
const recommendation = { recommendation_date: '2026-11-09', target_calories: 500 };
const mealInput = name => [{ meal_type: 'lunch', meal_order: 1, recommended_calories: 500,
  foods: [{ food_name: name, quantity: 100, unit: 'g', calories: 500 }] }];
const create = async (name, allergens) => (await db.query(
  'select public.create_checked_diet_recommendation($1::uuid,$2::jsonb,$3::jsonb,$4::jsonb) as result',
  [owner, JSON.stringify(recommendation), JSON.stringify(mealInput(name)), JSON.stringify(allergens)],
)).rows[0].result;
const mealId = async rec => (await db.query(
  'select diet_meal_id from public.diet_meals where diet_recommendation_id = $1::uuid',
  [rec.diet_recommendation_id],
)).rows[0].diet_meal_id;
const feedback = async (meal, type, actual = []) => (await db.query(
  'select public.record_recommended_meal($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::jsonb) as result',
  [owner, meal, type, '2026-11-09T06:00:00Z', JSON.stringify(actual)],
)).rows[0].result;
const actual = [{ food_name: '현미밥', quantity: 100, unit: 'g' }];

try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const base = read('20260901055003_remote_schema.sql');
  for (const table of [
    'allergy_types', 'user_allergies', 'food_items', 'diet_recommendations',
    'diet_meals', 'diet_meal_foods', 'meal_logs', 'meal_log_items', 'diet_feedback',
  ]) {
    const start = base.indexOf('CREATE TABLE "public"."' + table + '" (');
    assert.ok(start >= 0, `missing ${table}`);
    await db.exec(base.slice(start, base.indexOf('\n);', start) + 3));
    await db.exec('alter table public.' + table + ' enable row level security; grant select,insert,update,delete on public.' + table + ' to service_role;');
  }
  await db.exec("alter table public.diet_meals add column used_ingredients jsonb not null default '[]'::jsonb;");
  await db.exec(read('20260903023055_create_diet_rpcs.sql'));
  await db.exec(read('20260916072413_update_diet_meal_feedback.sql'));
  await db.exec(read('20261109040000_guard_saved_diet_feedback_allergy.sql'));
  // Stub only the inner replacement; this test exercises the new wrapper guard.
  await db.exec(`create function public.replace_diet_meal(uuid, uuid, jsonb)
    returns jsonb language sql security invoker set search_path = ''
    as $$ select $3 $$;
    grant execute on function public.replace_diet_meal(uuid, uuid, jsonb) to service_role;`);

  await db.query('insert into public.allergy_types (allergy_type_id,name) values ($1,\'계란\')', [egg]);
  await db.exec('set role service_role');

  // Legacy rows remain intact, but cannot be represented as verified eaten meals.
  const legacyRec = '00000000-0000-0000-0000-000000000003';
  const legacyMeal = '00000000-0000-0000-0000-000000000004';
  await db.query("insert into public.diet_recommendations (diet_recommendation_id,user_id,recommendation_date,status) values ($1,$2,'2026-11-08','active')", [legacyRec, owner]);
  await db.query("insert into public.diet_meals (diet_meal_id,diet_recommendation_id,meal_type) values ($1,$2,'lunch')", [legacyMeal, legacyRec]);
  await db.query("insert into public.diet_meal_foods (diet_meal_id,food_name) values ($1,'현미밥')", [legacyMeal]);
  await db.query('insert into public.user_allergies (user_id,allergy_type_id) values ($1,$2)', [owner, egg]);
  await assert.rejects(() => feedback(legacyMeal, 'eaten'), /DIET_MEAL_ALLERGY_UNVERIFIED/);
  assert.equal((await db.query('select count(*)::integer as n from public.meal_logs')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::integer as n from public.diet_feedback')).rows[0].n, 0);
  await feedback(legacyMeal, 'different_food', actual);

  // A known allergen is rejected even if a newer row captured that selection.
  const unsafe = await create('달걀스크램블', ['계란']);
  const unsafeMeal = await mealId(unsafe);
  await assert.rejects(() => feedback(unsafeMeal, 'eaten'), /DIET_MEAL_ALLERGY_CONFLICT/);

  // A newly created row with unchanged context can be marked eaten.
  const safe = await create('현미밥', ['계란']);
  const safeMeal = await mealId(safe);
  await feedback(safeMeal, 'eaten');
  const replace = (meal, allergens) => db.query(
    'select public.replace_checked_diet_meal($1::uuid,$2::uuid,$3::jsonb,$4::jsonb)',
    [owner, meal, JSON.stringify({ foods: [] }), JSON.stringify(allergens)],
  );
  await replace(safeMeal, ['계란']);
  await assert.rejects(() => replace(safeMeal, []), /DIET_ALLERGY_CONTEXT_CHANGED/);
  await assert.rejects(() => replace(legacyMeal, ['계란']), /DIET_MEAL_ALLERGY_UNVERIFIED/);

  // A new allergy after generation invalidates the saved recommendation.
  await db.query('delete from public.user_allergies where user_id = $1', [owner]);
  const beforeChange = await create('현미밥', []);
  await db.query('insert into public.user_allergies (user_id,allergy_type_id) values ($1,$2)', [owner, egg]);
  const changedMeal = await mealId(beforeChange);
  await assert.rejects(() => feedback(changedMeal, 'eaten'), /DIET_MEAL_ALLERGY_CONFLICT/);
  await assert.rejects(() => replace(changedMeal, ['계란']), /DIET_ALLERGY_CONTEXT_CHANGED/);
  await assert.rejects(() => create('현미밥', []), /DIET_ALLERGY_CONTEXT_CHANGED/);

  console.log('PASS: legacy, known conflict, unchanged context, changed context, atomic rollback');
} finally {
  await db.close();
}
