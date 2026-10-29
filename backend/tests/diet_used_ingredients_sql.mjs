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
  new URL('../../supabase/migrations/20260930055817_persist_diet_used_ingredients.sql', import.meta.url),
  'utf8',
);
const laterMigration = readFileSync(
  new URL('../../supabase/migrations/20260930090000_menu_image_dataset_matching.sql', import.meta.url),
  'utf8',
);

const owner = '00000000-0000-0000-0000-000000000001';
const inventory = '00000000-0000-0000-0000-000000000002';

const usedIngredient = (name, matchedFoodName) => ({
  user_food_inventory_id: inventory,
  name,
  matched_food_name: matchedFoodName,
  quantity: 10,
  unit: '개',
});

const food = (name, calories) => ({
  food_name: name,
  quantity: 100,
  unit: 'g',
  calories,
  carbohydrates: 20,
  protein: 10,
  fat: 5,
});

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
  await db.exec(`
    alter table public.diet_meals
      add column image_storage_path text,
      add column menu_image_key text,
      add column source_type text not null default 'db_catalog';
    alter table public.diet_meal_foods add column food_order integer;
  `);
  await db.exec(migration);
  await db.exec('set role service_role');

  const meals = [
    ['breakfast', 1, 'ai_generated', '블루베리', 400],
    ['lunch', 2, 'ai_generated', '두부', 500],
    ['dinner', 3, 'db_catalog', '현미밥', 550],
    ['snack', 4, 'db_catalog', '사과', 150],
  ].map(([mealType, mealOrder, sourceType, foodName, calories]) => ({
    meal_type: mealType,
    meal_order: mealOrder,
    recommended_calories: calories,
    recommendation_note: `${foodName} 활용`,
    source_type: sourceType,
    foods: [food(foodName, calories)],
    used_ingredients: foodName === '블루베리'
      ? [usedIngredient('블루베리', '블루베리')]
      : [],
  }));
  const recommendation = {
    recommendation_date: '2026-09-30',
    target_calories: 1600,
    target_carbohydrates: 200,
    target_protein: 80,
    target_fat: 45,
  };

  await db.query(
    'select public.create_diet_recommendation($1::uuid,$2::jsonb,$3::jsonb)',
    [owner, JSON.stringify(recommendation), JSON.stringify(meals)],
  );
  const stored = await db.query(
    `select diet_meal_id, used_ingredients
     from public.diet_meals
     where meal_type = 'breakfast'`,
  );
  assert.deepEqual(
    stored.rows[0].used_ingredients,
    [usedIngredient('블루베리', '블루베리')],
  );

  const laterFunctionStart = laterMigration.indexOf(
    'create or replace function public.create_diet_recommendation(',
  );
  const laterFunctionEnd = laterMigration.indexOf('\n$$;', laterFunctionStart) + 4;
  assert.ok(laterFunctionStart >= 0 && laterFunctionEnd > 3);
  await db.exec('reset role');
  await db.exec(laterMigration.slice(laterFunctionStart, laterFunctionEnd));
  await db.exec('set role service_role');
  await db.query(
    'select public.create_diet_recommendation($1::uuid,$2::jsonb,$3::jsonb)',
    [
      owner,
      JSON.stringify({ ...recommendation, recommendation_date: '2026-10-01' }),
      JSON.stringify(meals),
    ],
  );
  const storedAfterLaterMigration = await db.query(
    `select dm.used_ingredients
     from public.diet_meals dm
     join public.diet_recommendations dr
       on dr.diet_recommendation_id = dm.diet_recommendation_id
     where dm.meal_type = 'breakfast'
       and dr.recommendation_date = '2026-10-01'`,
  );
  assert.deepEqual(
    storedAfterLaterMigration.rows[0].used_ingredients,
    [usedIngredient('블루베리', '블루베리')],
  );

  const replacement = {
    meal_type: 'breakfast',
    meal_order: 1,
    recommended_calories: 400,
    recommendation_note: '딸기 활용',
    source_type: 'ai_generated',
    foods: [food('딸기', 400)],
    used_ingredients: [usedIngredient('딸기', '딸기')],
  };
  await db.query(
    'select public.replace_diet_meal($1::uuid,$2::uuid,$3::jsonb)',
    [owner, stored.rows[0].diet_meal_id, JSON.stringify(replacement)],
  );
  const replaced = await db.query(
    'select used_ingredients from public.diet_meals where diet_meal_id = $1',
    [stored.rows[0].diet_meal_id],
  );
  assert.deepEqual(
    replaced.rows[0].used_ingredients,
    [usedIngredient('딸기', '딸기')],
  );

  console.log('3 diet used-ingredient snapshot SQL checks passed in isolated PGlite.');
} finally {
  await db.close();
}
