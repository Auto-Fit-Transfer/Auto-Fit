// Isolated PostgreSQL regression for explicit workout stop. Pass the PGlite package path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [owner, stranger, recommendation, firstDay, secondDay, aiSession, aiDone,
  aiUntouched, savedSession, savedDone, savedUntouched] = Array.from({ length: 11 },
  (_, index) => id(index + 1));
const migration = readFileSync(new URL(
  '../../supabase/migrations/20261123011515_stop_exercise_session.sql', import.meta.url,
), 'utf8');
const stop = (user, session) => db.query(
  'select public.stop_exercise_session($1::uuid, $2::uuid) as result', [user, session],
).then(value => value.rows[0].result);

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.exercise_recommendations (
      exercise_recommendation_id uuid primary key, user_id uuid, status text
    );
    create table public.exercise_plan_sessions (
      exercise_plan_session_id uuid primary key, exercise_recommendation_id uuid
    );
    create table public.exercise_items (
      exercise_item_id uuid primary key, exercise_recommendation_id uuid,
      plan_session_id uuid, exercise_name text, intensity text
    );
    create table public.exercise_sessions (
      exercise_session_id uuid primary key, user_id uuid,
      exercise_recommendation_id uuid, plan_session_id uuid,
      user_workout_routine_id uuid, status text,
      planned_item_count integer, completed_item_count integer default 0,
      skipped_item_count integer default 0, completion_rate numeric,
      completed_at timestamptz, updated_at timestamptz
    );
    create table public.saved_routine_session_items (
      saved_routine_session_item_id uuid primary key,
      exercise_session_id uuid, user_id uuid, exercise_name text
    );
    create table public.exercise_logs (
      user_id uuid, exercise_item_id uuid, saved_routine_session_item_id uuid,
      exercise_name text, performed_at timestamptz,
      duration_minutes integer, calories_burned numeric, intensity text,
      completed boolean, note text, exercise_session_id uuid,
      skipped boolean, skip_reason text
    );
    create unique index uq_ai_item_log on public.exercise_logs
      (exercise_session_id, exercise_item_id)
      where exercise_session_id is not null and exercise_item_id is not null;
    create unique index uq_saved_item_log on public.exercise_logs
      (exercise_session_id, saved_routine_session_item_id)
      where exercise_session_id is not null and saved_routine_session_item_id is not null;
    grant select, insert, update on all tables in schema public to service_role;
  `);
  await db.exec(migration);
  const privilege = (await db.query(`
    select has_function_privilege('service_role',
             'public.stop_exercise_session(uuid,uuid)', 'execute') as service,
           has_function_privilege('anon',
             'public.stop_exercise_session(uuid,uuid)', 'execute') as anon,
           has_function_privilege('authenticated',
             'public.stop_exercise_session(uuid,uuid)', 'execute') as authenticated
  `)).rows[0];
  assert.deepEqual(privilege, { service: true, anon: false, authenticated: false });

  await db.exec(`
    insert into public.exercise_recommendations values
      ('${recommendation}', '${owner}', 'active');
    insert into public.exercise_plan_sessions values
      ('${firstDay}', '${recommendation}'),
      ('${secondDay}', '${recommendation}');
    insert into public.exercise_items values
      ('${aiDone}', '${recommendation}', '${firstDay}', '스쿼트', 'low'),
      ('${aiUntouched}', '${recommendation}', '${firstDay}', '런지', 'low');
    insert into public.exercise_sessions (
      exercise_session_id, user_id, exercise_recommendation_id, plan_session_id,
      status, planned_item_count, completed_item_count, completion_rate
    ) values
      ('${aiSession}', '${owner}', '${recommendation}', '${firstDay}',
       'in_progress', 2, 1, 50),
      ('${secondDay}', '${owner}', '${recommendation}', '${secondDay}',
       'completed', 1, 1, 100);
    insert into public.exercise_logs (
      user_id, exercise_item_id, exercise_name, performed_at,
      duration_minutes, calories_burned, intensity, completed,
      exercise_session_id, skipped
    ) values ('${owner}', '${aiDone}', '스쿼트', now(), 1, 2, 'low', true,
              '${aiSession}', false);
    insert into public.exercise_sessions (
      exercise_session_id, user_id, user_workout_routine_id,
      status, planned_item_count, completed_item_count, completion_rate
    ) values ('${savedSession}', '${owner}', '${id(20)}', 'in_progress', 2, 1, 50);
    insert into public.saved_routine_session_items values
      ('${savedDone}', '${savedSession}', '${owner}', '스쿼트'),
      ('${savedUntouched}', '${savedSession}', '${owner}', '플랭크');
    insert into public.exercise_logs (
      user_id, saved_routine_session_item_id, exercise_name, performed_at,
      duration_minutes, calories_burned, completed, exercise_session_id, skipped
    ) values ('${owner}', '${savedDone}', '스쿼트', now(), 1, 0, true,
              '${savedSession}', false);
  `);
  await db.exec('set role service_role');

  await assert.rejects(() => stop(stranger, aiSession), /EXERCISE_SESSION_NOT_FOUND/);
  await assert.rejects(() => stop(owner, id(99)), /EXERCISE_SESSION_NOT_FOUND/);
  await assert.rejects(() => stop(owner, secondDay), /EXERCISE_SESSION_NOT_STOPPABLE/);

  const stoppedAi = await stop(owner, aiSession);
  assert.equal(stoppedAi.session.status, 'stopped');
  assert.equal(stoppedAi.session.completed_item_count, 1);
  assert.equal(stoppedAi.session.skipped_item_count, 1);
  assert.equal(stoppedAi.logs.length, 2);
  assert.equal(stoppedAi.logs.find(log => log.exercise_item_id === aiDone).completed, true);
  assert.equal(stoppedAi.logs.find(log => log.exercise_item_id === aiUntouched).skipped, true);
  assert.deepEqual(await stop(owner, aiSession), stoppedAi);
  assert.equal((await db.query(
    'select status from public.exercise_recommendations where exercise_recommendation_id=$1::uuid',
    [recommendation],
  )).rows[0].status, 'completed');

  const stoppedSaved = await stop(owner, savedSession);
  assert.equal(stoppedSaved.session.status, 'stopped');
  assert.equal(stoppedSaved.session.completed_item_count, 1);
  assert.equal(stoppedSaved.session.skipped_item_count, 1);
  assert.equal(stoppedSaved.logs.length, 2);
  assert.equal(stoppedSaved.logs.find(log =>
    log.saved_routine_session_item_id === savedDone).completed, true);
  assert.equal(stoppedSaved.logs.find(log =>
    log.saved_routine_session_item_id === savedUntouched).skipped, true);
  assert.deepEqual(await stop(owner, savedSession), stoppedSaved);

  console.log('PASS: both workout sources stop atomically, preserve logs and retry safely');
} finally {
  await db.close();
}
