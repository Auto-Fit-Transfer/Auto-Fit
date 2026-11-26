// Isolated PostgreSQL regression for saved routine exercise keys. Pass PGlite path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [owner, routine, keyedItem, legacyItem] = [1, 2, 3, 4].map(id);
const key = 'ex_96dcb551b33a8e';
const migration = readFileSync(new URL(
  '../../supabase/migrations/20261126082517_saved_routine_exercise_key.sql',
  import.meta.url,
), 'utf8');

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.exercise_recommendations (
      exercise_recommendation_id uuid primary key, user_id uuid, goal text
    );
    create table public.user_workout_routines (
      user_workout_routine_id uuid primary key, user_id uuid,
      source_recommendation_id uuid, status text
    );
    create table public.user_workout_routine_items (
      user_workout_routine_item_id uuid primary key, user_workout_routine_id uuid,
      sequence_order integer, exercise_type_id uuid, exercise_name text,
      target_duration_seconds integer, sets integer, repetitions integer,
      target_weight_kg numeric(8,2), rest_seconds integer,
      instruction text, demo_video_url text
    );
    create table public.exercise_sessions (
      exercise_session_id uuid primary key default gen_random_uuid(),
      user_id uuid, user_workout_routine_id uuid, saved_routine_goal text,
      planned_item_count integer, status text default 'in_progress'
    );
    create table public.saved_routine_session_items (
      saved_routine_session_item_id uuid primary key default gen_random_uuid(),
      exercise_session_id uuid, user_id uuid, source_routine_item_id uuid,
      sequence_order integer, exercise_type_id uuid, exercise_name text,
      target_duration_seconds integer, sets integer, repetitions integer,
      target_weight_kg numeric(8,2), rest_seconds integer,
      instruction text, demo_video_url text
    );
    grant select, insert, update on all tables in schema public to service_role;
  `);
  await db.exec(migration);

  const privileges = (await db.query(`
    select has_function_privilege('service_role',
             'public.start_saved_workout_routine(uuid,uuid)', 'execute') as service,
           has_function_privilege('anon',
             'public.start_saved_workout_routine(uuid,uuid)', 'execute') as anon,
           has_function_privilege('authenticated',
             'public.start_saved_workout_routine(uuid,uuid)', 'execute') as authenticated
  `)).rows[0];
  assert.deepEqual(privileges, { service: true, anon: false, authenticated: false });

  await db.exec(`
    insert into public.user_workout_routines values
      ('${routine}', '${owner}', null, 'active');
    insert into public.user_workout_routine_items (
      user_workout_routine_item_id, user_workout_routine_id,
      sequence_order, exercise_name, sets, repetitions, exercise_key
    ) values
      ('${keyedItem}', '${routine}', 1, '스쿼트', 3, 10, '${key}'),
      ('${legacyItem}', '${routine}', 2, '런지', 2, 10, null);
  `);
  await assert.rejects(() => db.exec(`
    insert into public.user_workout_routine_items (
      user_workout_routine_item_id, user_workout_routine_id,
      sequence_order, exercise_name, exercise_key
    ) values ('${id(5)}', '${routine}', 3, '잘못된 키', 'invalid');
  `), /ck_saved_routine_item_exercise_key/);

  await db.exec('set role service_role');
  const start = () => db.query(
    'select public.start_saved_workout_routine($1::uuid, $2::uuid) as result',
    [owner, routine],
  ).then(value => value.rows[0].result);
  const first = await start();
  assert.equal(first.items.length, 2);
  assert.equal(first.items[0].exercise_key, key);
  assert.equal(first.items[1].exercise_key, null);
  assert.equal(first.items[0].user_workout_routine_item_id, keyedItem);

  await db.exec(`
    update public.user_workout_routine_items
    set exercise_key = 'ex_0156f02c26cd1c'
    where user_workout_routine_item_id = '${keyedItem}';
  `);
  const resumed = await start();
  assert.equal(resumed.session.exercise_session_id, first.session.exercise_session_id);
  assert.equal(resumed.items[0].exercise_key, key);
  assert.equal(resumed.items[1].exercise_key, null);

  console.log('PASS: routine key snapshot survives resume, legacy null and grants remain valid');
} finally {
  await db.close();
}
