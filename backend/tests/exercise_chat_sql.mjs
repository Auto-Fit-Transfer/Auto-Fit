// Isolated PostgreSQL regression for exercise chat actions. Pass an installed
// @electric-sql/pglite package path as argv[2]; never connects to production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = id(1);
const otherUser = id(2);
const chat = id(3);
const session = id(4);
const plan = id(5);
const otherPlan = id(6);
const recommendation = id(7);
const item = id(8);
const laterItem = id(9);
const otherDayItem = id(10);
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const base = migration('20260901055003_remote_schema.sql');
let checks = 0;

const count = async table => (await db.query(`select count(*)::integer as n from public.${table}`)).rows[0].n;
const rejected = async (operation, message) => {
  await assert.rejects(operation, new RegExp(message));
  checks++;
};
const proposalPayload = version => ({
  action: 'exercise_session_adjust', session_id: session, plan_session_id: plan,
  exercise_item_id: item, session_version: version, symptom_type: 'pain',
  severity: 3, body_areas: ['무릎'], adjustment_strategy: 'reduce_remaining_volume',
});
const proposalAnswer = pending => ({
  intent: 'exercise_session_discomfort', content: '남은 운동량을 낮출까요?',
  response_source: 'database_ai', needs_more_data: false, evidence: [], required_data: [],
  action: 'confirm_exercise_adjustment', action_status: 'awaiting_confirmation',
  requires_backend_apply: false, action_data: { recommended_action: 'adjust' },
  pending_action_id: pending,
});
const propose = (owner, request, pending, payload) => db.query(
  `select public.save_exercise_chat_proposal(
    $1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb,$6::uuid,$7::jsonb
  ) as result`,
  [owner, chat, request, '무릎이 조금 아파요', JSON.stringify(proposalAnswer(pending)), pending, JSON.stringify(payload)],
).then(value => value.rows[0].result);
const decision = (owner, pending, key, action, ai, answer) => db.query(
  `select public.resolve_exercise_chat_pending_action(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::jsonb,$7::jsonb
  ) as result`,
  [owner, chat, pending, key, action, JSON.stringify(ai), JSON.stringify(answer)],
).then(value => value.rows[0].result);
const cancellation = pending => {
  const ai = {
    intent: 'exercise_session_discomfort', message: '조정을 취소했어요.',
    action: 'exercise_adjustment_cancelled', action_status: 'completed',
    requires_backend_apply: false, data: { session_id: session },
  };
  return [ai, {
    intent: ai.intent, content: ai.message, response_source: 'database_ai',
    needs_more_data: false, evidence: [], required_data: [], action: ai.action,
    action_status: ai.action_status, requires_backend_apply: false,
    action_data: ai.data, pending_action_id: pending,
  }];
};
const confirmation = (pending, version) => {
  const ai = {
    intent: 'exercise_session_discomfort', message: '현재 계획을 조정합니다.',
    action: 'exercise_session_adjust', action_status: 'ready_for_backend_apply',
    requires_backend_apply: true,
    data: {
      session_id: session, plan_session_id: plan, exercise_item_id: item,
      session_version: version, adjustment_strategy: 'reduce_remaining_volume',
      discomfort_event: {
        symptom_type: 'pain', severity: 3, body_areas: ['무릎'], action_taken: 'adjust',
      },
    },
  };
  return [ai, {
    intent: ai.intent, content: ai.message, response_source: 'database_ai',
    needs_more_data: false, evidence: [], required_data: [], action: ai.action,
    action_status: ai.action_status, requires_backend_apply: true,
    action_data: ai.data, pending_action_id: pending,
  }];
};

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema autofit_integrity;
    create function autofit_integrity.check_account_writable()
      returns trigger language plpgsql as $$ begin return new; end $$;
    create function autofit_integrity.purge_account_rows(text,text,uuid,uuid,integer)
      returns void language plpgsql as $$ begin return; end $$;
    create table public.exercise_recommendations (
      exercise_recommendation_id uuid primary key, user_id uuid, status text
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
      exercise_session_id uuid primary key, user_id uuid,
      exercise_recommendation_id uuid, plan_session_id uuid,
      status text default 'in_progress', started_at timestamptz default now(),
      completed_at timestamptz, planned_item_count integer default 0,
      completed_item_count integer default 0, skipped_item_count integer default 0,
      completion_rate numeric default 0, updated_at timestamptz default now()
    );
    create table public.exercise_discomfort_logs (
      exercise_discomfort_log_id uuid primary key default gen_random_uuid(),
      exercise_session_id uuid not null, exercise_item_id uuid, user_id uuid,
      symptom_type text, severity smallint, body_areas jsonb, detail text,
      action_taken text
    );
    create table public.exercise_logs (
      exercise_log_id uuid primary key default gen_random_uuid(),
      user_id uuid, exercise_item_id uuid, exercise_name text,
      performed_at timestamptz, duration_minutes integer,
      calories_burned numeric, intensity text, completed boolean,
      note text, exercise_session_id uuid, skipped boolean, skip_reason text
    );
    create unique index exercise_logs_session_item_unique
      on public.exercise_logs(exercise_session_id,exercise_item_id)
      where exercise_session_id is not null and exercise_item_id is not null;
    grant select,insert,update,delete,truncate,trigger on all tables in schema public to service_role;
  `);
  for (const table of ['chats', 'chat_messages']) {
    const start = base.indexOf(`CREATE TABLE "public"."${table}" (`);
    const end = base.indexOf('\n);', start) + 3;
    await db.exec(base.slice(start, end));
    await db.exec(`alter table public.${table} enable row level security;
      grant select,insert,update,delete on public.${table} to service_role;`);
  }
  // The migration also enables pg_cron, unavailable in isolated PGlite.
  await db.exec(readFileSync(new URL('../sql/chat_retention_30_days.sql', import.meta.url), 'utf8'));
  for (const file of [
    '20260908012312_chat_message_storage.sql',
    '20261109042535_exercise_chat_session_safety.sql',
    '20261109042659_exercise_chat_event_and_pending_storage.sql',
    '20261109042801_exercise_chat_message_actions.sql',
    '20261109042841_exercise_chat_action_transactions.sql',
    '20261109042905_exercise_chat_proposal_exchange.sql',
    '20261110014003_exercise_chat_pending_retention.sql',
  ]) await db.exec(migration(file));

  await db.query('insert into chats(chat_id,user_id) values($1,$2)', [chat, user]);
  await db.query('insert into exercise_recommendations values($1,$2,$3)', [recommendation, user, 'active']);
  await db.query(`insert into exercise_plan_sessions values
    ($1,$3,'2020-01-01'),($2,$3,'2020-01-02')`, [plan, otherPlan, recommendation]);
  await db.query(`insert into exercise_sessions(
    exercise_session_id,user_id,exercise_recommendation_id,plan_session_id,planned_item_count
  ) values($1,$2,$3,$4,2)`, [session, user, recommendation, plan]);
  for (const [itemId, itemPlan, order] of [[item, plan, 1], [laterItem, plan, 2], [otherDayItem, otherPlan, 1]]) {
    await db.query(`insert into exercise_items(
      exercise_item_id,exercise_recommendation_id,plan_session_id,exercise_name,
      sequence_order,intensity,duration_minutes,sets
    ) values($1,$2,$3,'스쿼트',$4,'high',10,3)`, [itemId, recommendation, itemPlan, order]);
  }
  const version = (await db.query('select updated_at from exercise_sessions where exercise_session_id=$1', [session])).rows[0].updated_at;
  const payload = proposalPayload(version);
  await db.exec('set role anon');
  await rejected(() => propose(user, id(20), id(21), payload), 'permission denied');
  await db.exec('set role service_role');
  await rejected(() => propose(otherUser, id(20), id(21), payload), 'CHAT_NOT_FOUND');
  assert.equal(await count('chat_messages'), 0); checks++;

  const first = await propose(user, id(20), id(21), payload);
  assert.equal(first.is_replay, false);
  assert.equal(first.assistant_message.pending_action_id, id(21));
  assert.equal(await count('chat_messages'), 2);
  assert.equal(await count('exercise_chat_pending_actions'), 1); checks++;
  const replay = await propose(user, id(20), id(22), payload);
  assert.equal(replay.is_replay, true);
  assert.equal(replay.assistant_message.pending_action_id, id(21));
  assert.equal(await count('exercise_chat_pending_actions'), 1); checks++;

  await db.exec(`reset role;
    create function public.reject_test_pending() returns trigger
    language plpgsql as $$ begin raise exception 'TEST_PENDING_FAILURE'; end $$;
    create trigger aa_reject_test_pending before insert on public.exercise_chat_pending_actions
    for each row execute function public.reject_test_pending();
    set role service_role;`);
  await rejected(() => propose(user, id(23), id(24), payload), 'TEST_PENDING_FAILURE');
  assert.equal(await count('chat_messages'), 2);
  assert.equal(await count('exercise_chat_pending_actions'), 1); checks++;
  await db.exec(`reset role;
    drop trigger aa_reject_test_pending on public.exercise_chat_pending_actions;
    set role service_role;`);

  const [cancelAI, cancelAnswer] = cancellation(id(21));
  const cancelled = await decision(user, id(21), id(25), 'cancel', cancelAI, cancelAnswer);
  assert.equal(cancelled.assistant_message.action, 'exercise_adjustment_cancelled');
  assert.equal(cancelled.adjusted_items.length, 0);
  assert.equal(await count('exercise_discomfort_logs'), 0); checks++;
  const cancelReplay = await decision(user, id(21), id(25), 'cancel', cancelAI, cancelAnswer);
  assert.deepEqual(cancelReplay, cancelled); checks++;
  await rejected(() => decision(user, id(21), id(26), 'confirm', cancelAI, cancelAnswer), 'PENDING_ACTION_CONSUMED');

  await propose(user, id(31), id(32), payload);
  await db.query(`update exercise_chat_pending_actions
    set created_at=now()-interval '15 minutes', expires_at=now()-interval '5 minutes'
    where pending_action_id=$1`, [id(32)]);
  const [expiredAI, expiredAnswer] = cancellation(id(32));
  await rejected(() => decision(user, id(32), id(33), 'cancel', expiredAI, expiredAnswer), 'PENDING_ACTION_EXPIRED');
  assert.equal((await db.query('select consumed_at from exercise_chat_pending_actions where pending_action_id=$1', [id(32)])).rows[0].consumed_at, null); checks++;

  await propose(user, id(27), id(28), payload);
  const [confirmAI, confirmAnswer] = confirmation(id(28), version);
  await rejected(() => decision(otherUser, id(28), id(29), 'confirm', confirmAI, confirmAnswer), 'PENDING_ACTION_NOT_FOUND');
  const badAI = { ...confirmAI, data: { ...confirmAI.data, session_id: otherUser } };
  await rejected(() => decision(user, id(28), id(29), 'confirm', badAI, confirmAnswer), 'AI_ACTION_MISMATCH');
  assert.equal(await count('exercise_discomfort_logs'), 0); checks++;
  const confirmed = await decision(user, id(28), id(29), 'confirm', confirmAI, confirmAnswer);
  assert.equal(confirmed.assistant_message.action, 'exercise_session_adjust');
  assert.equal(confirmed.adjusted_items.length, 2);
  assert.equal(await count('exercise_discomfort_logs'), 1);
  const items = (await db.query('select exercise_item_id,duration_minutes from exercise_items order by exercise_item_id')).rows;
  assert.deepEqual(items.map(row => row.duration_minutes), [8, 8, 10]); checks++;
  assert.deepEqual(await decision(user, id(28), id(29), 'confirm', confirmAI, confirmAnswer), confirmed); checks++;
  await rejected(() => propose(user, id(34), id(35), payload), 'SESSION_VERSION_CONFLICT');
  assert.equal((await db.query('select count(*)::integer as n from chat_messages where client_message_id=$1', [id(34)])).rows[0].n, 0); checks++;

  const eventKey = id(30);
  const event = async () => (await db.query(`select public.record_exercise_chat_event(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'pain',null,'[]'::jsonb
  ) as result`, [user, chat, eventKey, session, item])).rows[0].result;
  const firstEvent = await event();
  assert.equal((await event()).exercise_discomfort_log_id, firstEvent.exercise_discomfort_log_id);
  assert.equal(await count('exercise_discomfort_logs'), 2); checks++;
  const currentVersion = (await db.query('select updated_at from exercise_sessions where exercise_session_id=$1', [session])).rows[0].updated_at;
  const stopped = (await db.query(`select public.stop_exercise_chat_session(
    $1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid
  ) as result`, [user, session, plan, currentVersion, eventKey])).rows[0].result;
  assert.equal(stopped.session.status, 'stopped');
  assert.equal((await db.query('select status from exercise_recommendations where exercise_recommendation_id=$1',
    [recommendation])).rows[0].status, 'active');
  assert.equal(await count('exercise_logs'), 2);
  assert.equal((await db.query('select duration_minutes from exercise_items where exercise_item_id=$1', [otherDayItem])).rows[0].duration_minutes, 10); checks++;
  const otherSession = id(36);
  const otherEvent = id(37);
  await db.query(`insert into exercise_sessions(
    exercise_session_id,user_id,exercise_recommendation_id,plan_session_id,planned_item_count
  ) values($1,$2,$3,$4,1)`, [otherSession, user, recommendation, otherPlan]);
  const nextVersion = (await db.query('select updated_at from exercise_sessions where exercise_session_id=$1',
    [otherSession])).rows[0].updated_at;
  await db.query(`select public.stop_exercise_chat_session(
    $1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid
  )`, [user, otherSession, otherPlan, nextVersion, otherEvent]);
  assert.equal((await db.query('select status from exercise_recommendations where exercise_recommendation_id=$1',
    [recommendation])).rows[0].status, 'completed'); checks++;

  await db.query(`update exercise_chat_pending_actions
    set created_at=now()-interval '31 days'
    where pending_action_id=$1`, [id(32)]);
  await db.exec('reset role');
  const purged = (await db.query('select autofit_maintenance.purge_expired_chat_messages() as result')).rows[0].result;
  assert.equal(purged.deleted_pending_actions, 1);
  assert.equal(await count('exercise_chat_pending_actions'), 2); checks++;
  await db.exec('set role service_role');
  await rejected(() => db.query('select autofit_maintenance.purge_expired_chat_messages()'), 'permission denied');
  console.log(`${checks} exercise chat SQL checks passed (PGlite; no multi-connection concurrency test).`);
} finally {
  await db.close();
}
