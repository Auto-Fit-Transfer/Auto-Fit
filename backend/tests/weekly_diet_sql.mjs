// Isolated PostgreSQL test; no connection to the remote Supabase project.
// Usage: node backend/tests/weekly_diet_sql.mjs /path/to/@electric-sql/pglite
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2]);
const db = new PGlite();
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const meal = {
  menu_name: '합성 메뉴', menu_description: '', estimated_calories_kcal: 165.5,
  nutrition: { protein_g: 3.5, fat_g: 1.25, carbohydrate_g: 35.25 },
  items: [{ food_name: '현미밥', portion_g: 100.25, calories_kcal: 165.5,
            protein_g: 3.5, fat_g: 1.25, carbohydrate_g: 35.25 }],
};
const result = { summary: '합성', strategy: '', weekly_plan: days.map(day => ({
  day, meals: Object.fromEntries(['breakfast','lunch','dinner','snack'].map(type => [type, meal])),
})) };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema autofit_integrity; create schema auth; create schema storage;
    create table auth.users(id uuid primary key, deleted_at timestamptz);
    create table public.profiles(user_id uuid primary key);
    create table public.notification_settings(user_id uuid primary key);
    create table public.allergy_types(allergy_type_id uuid primary key, name text, is_active boolean);
    create table public.user_allergies(user_id uuid, allergy_type_id uuid, custom_name text);
    create table public.user_exercise_profiles(user_id uuid primary key, goal_type text);
    grant select,insert,update,delete on public.allergy_types, public.user_allergies, public.user_exercise_profiles to service_role;
    create table storage.objects(owner_id text, name text, bucket_id text);
    create table autofit_integrity.business_references(child_table text, child_column text, parent_table text, parent_column text);
    insert into auth.users(id) values ('${owner}'), ('${other}');
    insert into public.profiles values ('${owner}'), ('${other}');
  `);
  const business = migration('20260917015323_enforce_business_reference_integrity.sql');
  await db.exec(business.slice(business.indexOf('create function autofit_integrity.business_owner('), business.indexOf('create function autofit_integrity.check_business_references(')));
  const users = migration('20260917014724_enforce_user_reference_integrity.sql');
  await db.exec(users.slice(users.indexOf('create function autofit_integrity.check_user_reference('), users.indexOf('create function autofit_integrity.protect_user_removal(')));
  await db.exec(migration('20260917021925_cascade_account_deletion.sql'));
  await db.exec(migration('20261020044749_weekly_ai_diet_plans.sql'));
  await db.exec('set role service_role');
  const inserted = await db.query(`insert into public.weekly_diet_plans
    (user_id,week_start_date,generator,result,request_context)
    values ($1,'2026-10-19','auto-fit-ai',$2,'{"food_allergens":[],"goal_type":null}') returning *`, [owner, JSON.stringify(result)]);
  const plan = inserted.rows[0];
  assert.equal(plan.version, 1);
  assert.deepEqual(plan.result, result);
  await assert.rejects(db.query(`insert into public.weekly_diet_plans
    (user_id,week_start_date,generator,result,request_context)
    values ($1,'2026-10-19','auto-fit-ai',$2,'{"food_allergens":[],"goal_type":null}')`, [owner, JSON.stringify(result)]), /unique/);
  for (const bad of [
    { ...result, weekly_plan: result.weekly_plan.slice(0, 6) },
    { ...result, weekly_plan: result.weekly_plan.map(d => ({ ...d, day: 'monday' })) },
    { ...result, weekly_plan: result.weekly_plan.map(d => ({ ...d, meals: { breakfast: meal } })) },
  ]) {
    await assert.rejects(db.query(`insert into public.weekly_diet_plans
      (user_id,week_start_date,generator,result,request_context)
      values ($1,'2026-10-26','auto-fit-ai',$2,'{"food_allergens":[],"goal_type":null}')`, [owner, JSON.stringify(bad)]), /check constraint/);
  }
  const replacement = { ok: true, generator: 'auto-fit-ai', meal: {
    day: 'monday', meal_type: 'lunch', meal: { ...meal, menu_name: '새 메뉴' }, cautions: [], sources: [],
  }};
  const replace = (user, version, payload = replacement) => db.query(
    'select public.replace_weekly_diet_meal($1,$2,$3,$4,$5,$6,$7) as plan',
    [user, plan.weekly_diet_plan_id, version, 'monday', 'lunch', JSON.stringify(payload), '{"food_allergens":[],"goal_type":null}'],
  );
  await assert.rejects(replace(other, 1), /WEEKLY_DIET_NOT_FOUND/);
  await assert.rejects(replace(owner, null), /WEEKLY_DIET_INVALID_REPLACEMENT/);
  await assert.rejects(replace(owner, 1, { ...replacement, meal: { ...replacement.meal, day: 'tuesday' } }), /INVALID_REPLACEMENT/);
  const changed = (await replace(owner, 1)).rows[0].plan;
  assert.equal(changed.version, 2);
  const expected = JSON.parse(JSON.stringify(result));
  expected.weekly_plan[0].meals.lunch.menu_name = '새 메뉴';
  assert.deepEqual(changed.result, expected);
  assert.deepEqual(changed.last_replacement, replacement);
  await assert.rejects(replace(owner, 1), /WEEKLY_DIET_VERSION_CONFLICT/);
  assert.equal((await db.query('select version from public.weekly_diet_plans')).rows[0].version, 2);
  // Source changed after the backend's final read, before the save transaction.
  await db.query('insert into public.user_allergies(user_id,custom_name) values ($1,$2)', [owner, '땅콩']);
  await assert.rejects(replace(owner, 2), /WEEKLY_DIET_CONTEXT_CHANGED/);
  await assert.rejects(db.query(`insert into public.weekly_diet_plans
    (user_id,week_start_date,generator,result,request_context)
    values ($1,'2026-10-26','auto-fit-ai',$2,'{"food_allergens":[],"goal_type":null}')`, [owner, JSON.stringify(result)]), /WEEKLY_DIET_CONTEXT_CHANGED/);
  await db.query('delete from public.user_allergies where user_id=$1', [owner]);
  await db.query('insert into public.user_exercise_profiles(user_id,goal_type) values ($1,$2)', [owner, 'weight_loss']);
  await assert.rejects(replace(owner, 2), /WEEKLY_DIET_CONTEXT_CHANGED/);
  await db.query('delete from public.user_exercise_profiles where user_id=$1', [owner]);
  const refreshedResult = JSON.parse(JSON.stringify(result));
  refreshedResult.summary = '전체 재생성';
  const refresh = (user, version) => db.query(
    'select public.refresh_weekly_diet_plan($1,$2,$3,$4,$5) as plan',
    [user, plan.weekly_diet_plan_id, version,
     JSON.stringify({ok:true, generator:'auto-fit-ai', result:refreshedResult}),
     '{"food_allergens":[],"goal_type":null}'],
  );
  await assert.rejects(refresh(other, 2), /WEEKLY_DIET_NOT_FOUND/);
  await assert.rejects(refresh(owner, 1), /WEEKLY_DIET_VERSION_CONFLICT/);
  const refreshed = (await refresh(owner, 2)).rows[0].plan;
  assert.equal(refreshed.version, 3);
  assert.equal(refreshed.last_replacement, null);
  assert.deepEqual(refreshed.result, refreshedResult);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(db.query('select * from public.weekly_diet_plans'), /permission denied/);
    await assert.rejects(replace(owner, 2), /permission denied/);
    await assert.rejects(refresh(owner, 3), /permission denied/);
    await assert.rejects(db.query('delete from public.weekly_diet_plans'), /permission denied/);
  }
  await db.exec('reset role; set role service_role');
  await db.query(`insert into public.weekly_diet_plans
    (user_id,week_start_date,generator,result,request_context)
    values ($1,'2026-10-19','auto-fit-ai',$2,'{"food_allergens":[],"goal_type":null}')`, [other, JSON.stringify(result)]);
  await db.query('select public.begin_account_deletion($1)', [owner]);
  await assert.rejects(replace(owner, 3), /Account deletion is in progress/);
  await db.exec('reset role');
  await db.query('delete from auth.users where id=$1', [owner]);
  assert.deepEqual((await db.query('select user_id from public.weekly_diet_plans')).rows, [{user_id: other}]);
  console.log('Weekly SQL passed: full-week persistence, precision, slot validation, ownership, version conflicts, role restrictions, real account-deletion guards and cascade.');
} finally { await db.close(); }
