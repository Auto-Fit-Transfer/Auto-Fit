// Isolated PostgreSQL checks; pass the installed @electric-sql/pglite path.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const owner = '00000000-0000-0000-0000-000000000001';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(user_id uuid primary key);
    create function public.set_updated_at() returns trigger language plpgsql as
      $$ begin new.updated_at = now(); return new; end $$;
  `);
  await db.exec(migration('20260902020953_create_user_exercise_profiles.sql'));
  await db.query('insert into profiles values ($1)', [owner]);
  await db.query("insert into user_exercise_profiles(user_id,goal_type,experience_level) values ($1,'maintenance','beginner')", [owner]);
  await db.exec(migration('20260915043649_add_custom_exercise_goal.sql'));
  assert.equal((await db.query('select custom_goal from user_exercise_profiles')).rows[0].custom_goal, null);
  await db.exec('set role service_role');
  await db.query("update user_exercise_profiles set goal_type='other',custom_goal=$1", ['등산 준비']);
  assert.equal((await db.query('select custom_goal from user_exercise_profiles')).rows[0].custom_goal, '등산 준비');
  for (const value of [null, '', '  ', '\n\t', ' 앞뒤 공백 ', '가'.repeat(201)]) {
    await assert.rejects(() => db.query('update user_exercise_profiles set custom_goal=$1', [value]), /custom_goal_check/);
  }
  await db.query('update user_exercise_profiles set custom_goal=$1', ['가'.repeat(200)]);
  await assert.rejects(() => db.exec("update user_exercise_profiles set goal_type='endurance'"), /custom_goal_check/);
  await db.exec("update user_exercise_profiles set goal_type='endurance',custom_goal=null");
  await assert.rejects(() => db.exec("update user_exercise_profiles set goal_type='unknown'"), /goal_type_check/);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => db.exec('select * from user_exercise_profiles'), /permission denied/);
  }
  await db.exec('reset role');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.user_exercise_profiles'::regclass")).rows[0].relrowsecurity, true);
  console.log('Custom goal PostgreSQL checks passed: migration, existing data, bounds, clearing, permissions, RLS.');
} finally {
  await db.close();
}
