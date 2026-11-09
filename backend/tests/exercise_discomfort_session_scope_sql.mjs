// Isolated PostgreSQL regression for a weekly recommendation with two days.
// Pass the installed @electric-sql/pglite package path as argv[2].
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = id(1);
const recommendation = id(2);
const firstDay = id(3);
const secondDay = id(4);
const firstItem = id(5);
const remainingItem = id(6);
const nextDayItem = id(7);
const session = id(8);
const migration = readFileSync(
  new URL('../../supabase/migrations/20261109041000_scope_exercise_discomfort_to_plan_session.sql', import.meta.url),
  'utf8',
);

const record = (action, item, activeSession = session, severity = 3) => db.query(
  `select public.record_exercise_discomfort(
    $1::uuid, $2::uuid, $3::uuid, 'pain', $4::smallint, '["무릎"]'::jsonb, null, $5::text
  ) as result`,
  [user, activeSession, item, severity, action],
).then(value => value.rows[0].result);

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.exercise_recommendations (
      exercise_recommendation_id uuid primary key, user_id uuid, status text,
      generator text default 'auto-fit-ai'
    );
    create table public.exercise_plan_sessions (
      exercise_plan_session_id uuid primary key, exercise_recommendation_id uuid,
      scheduled_date date
    );
    create table public.exercise_items (
      exercise_item_id uuid primary key, exercise_recommendation_id uuid,
      plan_session_id uuid, exercise_name text, sequence_order integer,
      intensity text, duration_minutes integer, target_duration_seconds integer,
      sets integer, repetitions integer, target_weight_kg numeric,
      calories_burned numeric
    );
    create table public.exercise_sessions (
      exercise_session_id uuid primary key default gen_random_uuid(), user_id uuid,
      exercise_recommendation_id uuid, plan_session_id uuid,
      status text default 'in_progress', started_at timestamptz default now(),
      planned_item_count integer, completed_at timestamptz,
      completed_item_count integer default 0, skipped_item_count integer default 0,
      completion_rate numeric, updated_at timestamptz default now()
    );
    create table public.exercise_discomfort_logs (
      exercise_session_id uuid, exercise_item_id uuid, user_id uuid,
      symptom_type text, severity smallint, body_areas jsonb,
      detail text, action_taken text
    );
    create table public.exercise_logs (
      user_id uuid, exercise_item_id uuid, exercise_name text,
      performed_at timestamptz, duration_minutes integer,
      calories_burned numeric, intensity text, completed boolean,
      note text, exercise_session_id uuid, skipped boolean, skip_reason text
    );
    create unique index exercise_logs_session_item_unique
      on public.exercise_logs (exercise_session_id, exercise_item_id)
      where exercise_session_id is not null and exercise_item_id is not null;
    grant select, insert, update on all tables in schema public to service_role;
  `);
  await db.exec(migration);
  const signature = 'public.record_exercise_discomfort(uuid,uuid,uuid,text,smallint,jsonb,text,text)';
  for (const functionSignature of [
    signature,
    'public.start_exercise_plan_session(uuid,uuid,uuid)',
    'public.complete_exercise_session(uuid,uuid)',
  ]) {
    const privilege = (await db.query(
    `select has_function_privilege('service_role',$1,'execute') as service,
            has_function_privilege('anon',$1,'execute') as anon,
            has_function_privilege('authenticated',$1,'execute') as authenticated`,
      [functionSignature],
    )).rows[0];
    assert.deepEqual(privilege, { service: true, anon: false, authenticated: false });
  }

  await db.exec(`
    insert into public.exercise_recommendations values ('${recommendation}','${user}','active');
    insert into public.exercise_plan_sessions values
      ('${firstDay}','${recommendation}','2020-01-01'),
      ('${secondDay}','${recommendation}','2020-01-02');
    insert into public.exercise_items (
      exercise_item_id, exercise_recommendation_id, plan_session_id,
      exercise_name, sequence_order, intensity, duration_minutes
    ) values
      ('${firstItem}','${recommendation}','${firstDay}','첫 운동',1,'high',10),
      ('${remainingItem}','${recommendation}','${firstDay}','남은 운동',2,'high',20),
      ('${nextDayItem}','${recommendation}','${secondDay}','다음 날 운동',1,'high',30);
    insert into public.exercise_sessions (
      exercise_session_id,user_id,exercise_recommendation_id,plan_session_id,
      status,planned_item_count
    ) values ('${session}','${user}','${recommendation}','${firstDay}','in_progress',2);
  `);
  await db.exec('set role service_role');

  await assert.rejects(() => record('continue', nextDayItem), /does not belong to this session/);
  assert.equal((await db.query('select count(*)::integer as n from public.exercise_discomfort_logs')).rows[0].n, 0);

  const adjusted = await record('adjust', firstItem);
  assert.equal(adjusted.adjusted_items.length, 1);
  assert.equal(adjusted.adjusted_items[0].exercise_item_id, remainingItem);
  const items = (await db.query(`
    select exercise_item_id,intensity,duration_minutes from public.exercise_items
    where exercise_recommendation_id=$1::uuid order by exercise_item_id
  `, [recommendation])).rows;
  assert.deepEqual(items.map(row => [row.exercise_item_id, row.intensity, row.duration_minutes]), [
    [firstItem, 'high', 10], [remainingItem, 'moderate', 16], [nextDayItem, 'high', 30],
  ]);

  const stopped = await record('stop', firstItem, session, 9);
  assert.equal(stopped.discomfort.action_taken, 'stop');
  assert.equal(stopped.session.status, 'stopped');
  assert.equal(stopped.session.skipped_item_count, 2);
  assert.equal((await db.query(
    'select status from public.exercise_recommendations where exercise_recommendation_id=$1::uuid',
    [recommendation],
  )).rows[0].status, 'active');
  const logs = (await db.query(
    'select exercise_item_id,skipped from public.exercise_logs where exercise_session_id=$1::uuid order by exercise_item_id',
    [session],
  )).rows;
  assert.deepEqual(logs, [
    { exercise_item_id: firstItem, skipped: true },
    { exercise_item_id: remainingItem, skipped: true },
  ]);
  assert.equal((await db.query(
    "select count(*)::integer as n from public.exercise_discomfort_logs where action_taken='stop'",
  )).rows[0].n, 1);

  await assert.rejects(
    () => db.query('select public.start_exercise_plan_session($1::uuid,$2::uuid,$3::uuid)',
      [user, recommendation, firstDay]),
    /already finished/,
  );
  const started = (await db.query(
    'select public.start_exercise_plan_session($1::uuid,$2::uuid,$3::uuid) as result',
    [user, recommendation, secondDay],
  )).rows[0].result;
  assert.equal(started.session.plan_session_id, secondDay);
  await db.query(
    'update public.exercise_sessions set completed_item_count=1 where exercise_session_id=$1::uuid',
    [started.session.exercise_session_id],
  );
  await db.query('select public.complete_exercise_session($1::uuid,$2::uuid)',
    [user, started.session.exercise_session_id]);
  assert.equal((await db.query(
    'select status from public.exercise_recommendations where exercise_recommendation_id=$1::uuid',
    [recommendation],
  )).rows[0].status, 'completed');

  const finalRecommendation = id(9);
  const finalDay = id(10);
  const finalItem = id(11);
  const finalSession = id(12);
  await db.exec(`
    insert into public.exercise_recommendations values ('${finalRecommendation}','${user}','active','auto-fit-ai');
    insert into public.exercise_plan_sessions values ('${finalDay}','${finalRecommendation}','2020-01-01');
    insert into public.exercise_items (
      exercise_item_id, exercise_recommendation_id, plan_session_id,
      exercise_name, sequence_order, intensity, duration_minutes
    ) values ('${finalItem}','${finalRecommendation}','${finalDay}','마지막 운동',1,'high',10);
    insert into public.exercise_sessions (
      exercise_session_id,user_id,exercise_recommendation_id,plan_session_id,
      status,planned_item_count
    ) values ('${finalSession}','${user}','${finalRecommendation}','${finalDay}','in_progress',1);
  `);
  await record('stop', finalItem, finalSession, 9);
  assert.equal((await db.query(
    'select status from public.exercise_recommendations where exercise_recommendation_id=$1::uuid',
    [finalRecommendation],
  )).rows[0].status, 'completed');

  for (const [offset, finishAction] of [[13, 'stop'], [19, 'complete']]) {
    const skippedRecommendation = id(offset);
    const skippedDay = id(offset + 1);
    const followingDay = id(offset + 2);
    const followingItem = id(offset + 3);
    const followingSession = id(offset + 4);
    const skippedSession = id(offset + 5);
    await db.exec(`
      insert into public.exercise_recommendations values
        ('${skippedRecommendation}','${user}','active','auto-fit-ai');
      insert into public.exercise_plan_sessions values
        ('${skippedDay}','${skippedRecommendation}','2020-01-01'),
        ('${followingDay}','${skippedRecommendation}','2020-01-02');
      insert into public.exercise_items (
        exercise_item_id, exercise_recommendation_id, plan_session_id,
        exercise_name, sequence_order, intensity, duration_minutes
      ) values ('${followingItem}','${skippedRecommendation}','${followingDay}','다음 운동',1,'high',10);
      insert into public.exercise_sessions (
        exercise_session_id,user_id,exercise_recommendation_id,plan_session_id,
        status,planned_item_count
      ) values ('${skippedSession}','${user}','${skippedRecommendation}','${skippedDay}','skipped',1);
    `);
    await assert.rejects(
      () => db.query('select public.start_exercise_plan_session($1::uuid,$2::uuid,$3::uuid)',
        [user, skippedRecommendation, skippedDay]),
      /already finished/,
    );
    await db.exec(`
      insert into public.exercise_sessions (
        exercise_session_id,user_id,exercise_recommendation_id,plan_session_id,
        status,planned_item_count,completed_item_count
      ) values ('${followingSession}','${user}','${skippedRecommendation}','${followingDay}',
        'in_progress',1,${finishAction === 'complete' ? 1 : 0});
    `);
    if (finishAction === 'stop') {
      await record('stop', followingItem, followingSession, 9);
    } else {
      await db.query('select public.complete_exercise_session($1::uuid,$2::uuid)',
        [user, followingSession]);
    }
    assert.equal((await db.query(
      'select status from public.exercise_recommendations where exercise_recommendation_id=$1::uuid',
      [skippedRecommendation],
    )).rows[0].status, 'completed');
  }
  console.log('PASS: discomfort stays on one date; stopped days are terminal; weekly completion works');
} finally {
  await db.close();
}
