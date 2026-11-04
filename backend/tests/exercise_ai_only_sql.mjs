// Uses an isolated PostgreSQL instance; never connects to the production database.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const migration = readFileSync(new URL(
  '../../supabase/migrations/20261104081014_remove_legacy_exercise_paths.sql', import.meta.url,
), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const context = '00000000-0000-4000-8000-000000000003';
const historical = '00000000-0000-4000-8000-000000000004';

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.exercise_recommendations (
      exercise_recommendation_id uuid primary key default gen_random_uuid(), user_id uuid,
      recommendation_date date, goal text, total_duration_minutes integer, intensity text,
      recommendation_summary text, ai_reason text, generator text, catalog_version text, status text
    );
    create table public.exercise_recommendation_contexts (
      exercise_recommendation_context_id uuid primary key, user_id uuid, exercise_recommendation_id uuid
    );
    create table public.exercise_types (
      exercise_type_id uuid primary key default gen_random_uuid(), name text, is_active boolean
    );
    create table public.exercise_plan_sessions (
      exercise_plan_session_id uuid primary key default gen_random_uuid(),
      exercise_recommendation_id uuid references public.exercise_recommendations,
      session_index integer, scheduled_date date, name text, focus text, duration_minutes integer
    );
    create table public.exercise_items (
      exercise_item_id uuid primary key default gen_random_uuid(), exercise_recommendation_id uuid,
      exercise_type_id uuid, plan_session_id uuid, exercise_key text, exercise_name text,
      sequence_order integer, duration_minutes integer, sets integer, repetitions integer,
      calories_burned numeric, intensity text, instruction text, execution_type text,
      target_duration_seconds integer, target_weight_kg numeric, rest_seconds integer
    );
    create table public.exercise_sessions (
      exercise_session_id uuid primary key default gen_random_uuid(), user_id uuid,
      exercise_recommendation_id uuid, plan_session_id uuid, planned_item_count integer,
      status text default 'in_progress', started_at timestamptz default now()
    );
    create function public.start_exercise_session(uuid, uuid) returns jsonb
      language sql as $$ select '{}'::jsonb $$;
    grant usage on schema public to service_role;
    grant select,insert,update,delete on all tables in schema public to service_role;
    insert into public.exercise_types(name,is_active) values ('걷기',true);
  `);
  await db.query('insert into public.exercise_recommendation_contexts values ($1,$2,null)', [context, owner]);
  await db.query(`insert into public.exercise_recommendations
    (exercise_recommendation_id,user_id,generator,status) values ($1,$2,'rules_v1','active')`, [historical, owner]);
  const oldPlan = (await db.query(`insert into public.exercise_plan_sessions
    (exercise_recommendation_id,session_index,scheduled_date,name,duration_minutes)
    values ($1,1,current_date,'과거 계획',30) returning exercise_plan_session_id`, [historical])).rows[0].exercise_plan_session_id;
  await db.exec(migration);
  assert.equal((await db.query("select to_regprocedure('public.start_exercise_session(uuid,uuid)') as f")).rows[0].f, null);

  const today = (await db.query("select to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD') as d")).rows[0].d;
  const plan = {
    generator: 'auto-fit-ai', catalog_version: `sha256:${'a'.repeat(64)}`,
    recommendation_date: today, goal: 'maintenance', intensity: 'moderate',
    total_duration_minutes: 30, recommendation_summary: 'AI 운동', ai_reason: '선택 조건 반영',
    plan_sessions: [{ session_index: 1, scheduled_date: today, name: '첫날', duration_minutes: 30 }],
  };
  const items = [{ exercise_type_name: '걷기', exercise_key: 'walk', exercise_name: '걷기',
    plan_session_index: 1, duration_minutes: 30, execution_type: 'time_based' }];
  const create = (user, recommendation, exercises = items) => db.query(
    'select public.create_exercise_recommendation($1,$2,$3,$4) as result',
    [user, context, recommendation, exercises],
  );
  await db.exec('set role authenticated');
  await assert.rejects(() => create(owner, plan), /permission denied/);
  await db.exec('set role service_role');
  await assert.rejects(() => create(other, plan), /unlinked recommendation context/);
  for (const generator of ['rules_v1', 'unknown', null]) {
    await assert.rejects(() => create(owner, { ...plan, generator }), /require auto-fit-ai/);
  }
  const noGenerator = { ...plan };
  delete noGenerator.generator;
  await assert.rejects(() => create(owner, noGenerator), /require auto-fit-ai/);
  await assert.rejects(() => create(owner, { ...plan, catalog_version: 'invalid' }), /catalog version/);
  await assert.rejects(() => create(owner, { ...plan, plan_sessions: [] }), /plan sessions/);
  await assert.rejects(() => create(owner, plan, [{ ...items[0], exercise_key: '' }]), /key is required/);
  await assert.rejects(() => create(owner, plan, [{ ...items[0], plan_session_index: 2 }]), /exercise types/);
  await assert.rejects(() => create(owner, plan, [{ ...items[0], duration_minutes: 15 }]), /session items/);
  // Failed validation must not consume the context or leave orphan recommendations.
  assert.equal((await db.query('select count(*)::int as n from public.exercise_recommendations')).rows[0].n, 1);
  assert.equal((await db.query('select exercise_recommendation_id as id from public.exercise_recommendation_contexts')).rows[0].id, null);

  const created = (await create(owner, plan)).rows[0].result;
  assert.equal(created.recommendation.generator, 'auto-fit-ai');
  assert.equal(created.items[0].plan_session_id, created.plan_sessions[0].exercise_plan_session_id);
  const start = (user, recommendationId, planId) => db.query(
    'select public.start_exercise_plan_session($1,$2,$3) as result', [user, recommendationId, planId],
  );
  await assert.rejects(() => start(owner, historical, oldPlan), /unavailable/);
  await assert.rejects(() => start(other, created.recommendation.exercise_recommendation_id,
    created.plan_sessions[0].exercise_plan_session_id), /unavailable/);
  const started = (await start(owner, created.recommendation.exercise_recommendation_id,
    created.plan_sessions[0].exercise_plan_session_id)).rows[0].result;
  const resumed = (await start(owner, created.recommendation.exercise_recommendation_id,
    created.plan_sessions[0].exercise_plan_session_id)).rows[0].result;
  assert.equal(started.session.exercise_session_id, resumed.session.exercise_session_id);
  assert.equal(started.items.length, 1);
  assert.equal((await db.query('select generator from public.exercise_recommendations where exercise_recommendation_id=$1', [historical])).rows[0].generator, 'rules_v1');
  await db.exec('reset role');
  await db.exec(migration);
  console.log('AI-only SQL passed: RPC removal, AI contract, rollback, ownership, start/resume and historical row preservation.');
} finally {
  await db.close();
}
