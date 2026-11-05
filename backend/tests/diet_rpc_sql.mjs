// Run with a path to an installed @electric-sql/pglite package (test-only).
// Uses an isolated in-memory PostgreSQL instance, never the remote project.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
const base = readFileSync(
  new URL('../../supabase/migrations/20260901055003_remote_schema.sql', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../../supabase/migrations/20260916042556_replace_diet_meal.sql', import.meta.url),
  'utf8',
);
let checks = 0;

const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const recommendation = '00000000-0000-0000-0000-000000000003';
const meal = '00000000-0000-0000-0000-000000000004';

const replacement = {
  meal_type: 'lunch',
  meal_order: 2,
  recommended_calories: 480,
  recommendation_note: '다른 점심',
  foods: [
    {
      food_name: '고구마',
      quantity: 200,
      unit: 'g',
      calories: 480,
      carbohydrates: 80,
      protein: 10,
      fat: 5,
    },
  ],
};

const call = async (user, payload) => (
  await db.query(
    'select public.replace_diet_meal($1::uuid,$2::uuid,$3::jsonb) as result',
    [user, meal, JSON.stringify(payload)],
  )
).rows[0].result;

const rejected = async (operation, message) => {
  await assert.rejects(operation, new RegExp(message));
  checks += 1;
};

try {
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const table of [
    'food_items',
    'diet_recommendations',
    'diet_meals',
    'diet_meal_foods',
  ]) {
    const start = base.indexOf(`CREATE TABLE "public"."${table}" (`);
    const end = base.indexOf('\n);', start) + 3;
    assert.ok(start >= 0 && end > 2, `missing base table ${table}`);
    await db.exec(base.slice(start, end));
    await db.exec(
      `alter table public.${table} enable row level security; `
      + `grant select,insert,update,delete on public.${table} to service_role;`,
    );
  }
  await db.exec(migration);
  await db.query(
    `insert into diet_recommendations (
       diet_recommendation_id,user_id,recommendation_date,target_calories,status
     ) values ($1,$2,current_date,1650,'active')`,
    [recommendation, owner],
  );
  await db.query(
    `insert into diet_meals (
       diet_meal_id,diet_recommendation_id,meal_type,meal_order,
       recommended_calories,status
     ) values ($1,$2,'lunch',2,480,'recommended')`,
    [meal, recommendation],
  );
  await db.query(
    `insert into diet_meal_foods (
       diet_meal_id,food_name,quantity,unit,calories,carbohydrates,protein,fat
     ) values ($1,'현미밥',180,'g',480,80,10,5)`,
    [meal],
  );

  await db.exec('set role anon');
  await rejected(() => call(owner, replacement), 'permission denied');

  await db.exec('set role service_role');
  await rejected(() => call(other, replacement), 'diet meal not found for user');

  const result = await call(owner, replacement);
  assert.equal(result.diet_meal_id, meal);
  assert.equal(result.meal_type, 'lunch');
  assert.equal(result.meal_order, 2);
  assert.equal(result.status, 'recommended');
  assert.equal(result.foods.length, 1);
  assert.equal(result.foods[0].food_name, '고구마');
  checks += 1;

  await rejected(
    () => call(owner, { ...replacement, foods: [{ ...replacement.foods[0], food_name: '고구마' }] }),
    'representative food must be changed',
  );
  await rejected(
    () => call(owner, { ...replacement, recommended_calories: 700, foods: [{ ...replacement.foods[0], food_name: '현미밥' }] }),
    'within 15 percent',
  );

  const overflow = {
    ...replacement,
    foods: [{ ...replacement.foods[0], food_name: '현미밥', quantity: 100000000 }],
  };
  await rejected(() => call(owner, overflow), 'numeric field overflow');
  const foodsAfterRollback = await db.query(
    'select food_name from diet_meal_foods where diet_meal_id=$1',
    [meal],
  );
  assert.deepEqual(foodsAfterRollback.rows.map((row) => row.food_name), ['고구마']);
  checks += 1;

  await db.query("update diet_meals set status='completed' where diet_meal_id=$1", [meal]);
  await rejected(() => call(owner, { ...replacement, foods: [{ ...replacement.foods[0], food_name: '현미밥' }] }), 'current state');

  console.log(`${checks} diet RPC checks passed in isolated PGlite.`);
} finally {
  await db.close();
}
