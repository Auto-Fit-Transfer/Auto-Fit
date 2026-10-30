// Isolated SQL integration check; no remote database or user data is touched.
// node backend/tests/community_mileage_sql.mjs /path/to/@electric-sql/pglite
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const migration = readFileSync(
  new URL('../../supabase/migrations/20261028072013_community_mileage_trial_rules.sql', import.meta.url),
  'utf8',
);
const one = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const owner = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const prior = '10000000-0000-0000-0000-000000000003';
const pending = '10000000-0000-0000-0000-000000000004';
const unrelated = '10000000-0000-0000-0000-000000000005';
const start = '2026-10-01T00:00:00+09:00';
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };

try {
  await db.exec(`
    create table public.community_rules (
      rule_key text primary key,
      amount integer not null check (amount >= 0),
      daily_limit integer check (daily_limit >= 0),
      enabled boolean not null default true,
      starts_at timestamptz not null default now(),
      note text,
      constraint community_rules_rule_key_check check (rule_key in
        ('earn_workout','earn_meal_log','club_create_cost','membership_demo_days'))
    );
    create table public.community_mileage_ledger (
      entry_id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      amount integer not null check (amount <> 0),
      reason text not null,
      source_id uuid,
      earned_on date,
      created_at timestamptz not null default clock_timestamp(),
      constraint community_mileage_ledger_reason_check check (reason in
        ('workout','meal_log','club_create','challenge')),
      check ((reason = 'club_create') = (amount < 0)),
      check ((amount > 0) = (earned_on is not null))
    );
    create unique index community_mileage_source_key on public.community_mileage_ledger
      (user_id, reason, source_id) where source_id is not null;
    create table public.exercise_recommendations (
      exercise_recommendation_id uuid primary key,
      user_id uuid not null,
      intensity text
    );
    create table public.exercise_sessions (
      exercise_session_id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      exercise_recommendation_id uuid,
      status text not null,
      completed_at timestamptz
    );
    create table public.meal_logs (
      meal_log_id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      status text not null,
      created_at timestamptz not null
    );
    create function public.community_require_writable(uuid) returns void
      language sql as $$ select null::void $$;
    create function public.community_mileage_summary(p_user_id uuid) returns jsonb
      language sql as $$
        select jsonb_build_object('balance', coalesce(sum(amount),0))
        from public.community_mileage_ledger where user_id = p_user_id
      $$;
    insert into public.community_rules(rule_key,amount,daily_limit,starts_at) values
      ('earn_workout',10,1,'2026-09-01T00:00:00+09:00'),
      ('earn_meal_log',5,3,'2026-09-01T00:00:00+09:00'),
      ('club_create_cost',500,null,'2026-09-01T00:00:00+09:00'),
      ('membership_demo_days',30,null,'2026-09-01T00:00:00+09:00');
  `);
  await db.exec(migration);
  check(await one("select array_agg(amount order by rule_key) from public.community_rules where rule_key in ('earn_streak_5','earn_streak_30','earn_workout_high')"), [30,10,30], 'trial rule values');
  check(await one("select amount from public.community_rules where rule_key='earn_workout'"), 10, 'existing workout rule retained');
  check(await one("select amount from public.community_rules where rule_key='club_create_cost'"), 500, 'unresolved spending threshold retained');
  await db.query("update public.community_rules set starts_at=$1 where rule_key in ('earn_workout_high','earn_streak_5','earn_streak_30')", [start]);

  const highRecommendation = '20000000-0000-0000-0000-000000000001';
  await db.query('insert into public.exercise_recommendations values($1,$2,$3)', [highRecommendation, owner, 'high']);
  await db.query("insert into public.exercise_sessions(user_id,status,completed_at) values($1,'completed','2026-10-01T08:00:00+09:00')", [owner]);
  await db.query(`insert into public.meal_logs(user_id,status,created_at)
    select $1,'recorded','2026-10-01T09:00:00+09:00'::timestamptz + (n || ' hours')::interval
    from generate_series(0,3) n`, [owner]);
  await db.query('select public.community_sync_mileage($1)', [owner]);
  check(await one('select sum(amount)::integer from public.community_mileage_ledger where user_id=$1', [owner]), 25, 'base workout and three meal logs');
  await db.query("insert into public.exercise_sessions(user_id,exercise_recommendation_id,status,completed_at) values($1,$2,'completed','2026-10-01T18:00:00+09:00')", [owner, highRecommendation]);
  await db.query('select public.community_sync_mileage($1)', [owner]);
  check(await one("select sum(amount)::integer from public.community_mileage_ledger where user_id=$1 and reason in ('workout','workout_high_adjustment')", [owner]), 30, 'high workout tops up an already credited day');
  await db.query('select public.community_sync_mileage($1)', [owner]);
  check(await one("select count(*)::integer from public.community_mileage_ledger where user_id=$1 and reason='workout_high_adjustment'", [owner]), 1, 'high adjustment is idempotent');

  await db.query("insert into public.exercise_sessions(user_id,status,completed_at) values($1,'completed','2026-10-01T08:00:00+09:00')", [pending]);
  const pendingHighRecommendation = '20000000-0000-0000-0000-000000000002';
  await db.query('insert into public.exercise_recommendations values($1,$2,$3)', [pendingHighRecommendation, pending, 'high']);
  await db.query("insert into public.exercise_sessions(user_id,exercise_recommendation_id,status,completed_at) values($1,$2,'completed','2026-10-01T18:00:00+09:00')", [pending, pendingHighRecommendation]);
  await db.query('select public.community_sync_mileage($1)', [pending]);
  check(await one("select amount from public.community_mileage_ledger where user_id=$1 and reason='workout'", [pending]), 30, 'pending high workout takes the daily slot');
  check(await one("select count(*)::integer from public.community_mileage_ledger where user_id=$1 and reason='workout_high_adjustment'", [pending]), 0, 'no adjustment when high is awarded directly');
  await db.query("insert into public.exercise_sessions(user_id,exercise_recommendation_id,status,completed_at) values($1,$2,'completed','2026-10-01T18:00:00+09:00')", [unrelated, highRecommendation]);
  await db.query('select public.community_sync_mileage($1)', [unrelated]);
  check(await one("select amount from public.community_mileage_ledger where user_id=$1 and reason='workout'", [unrelated]), 10, 'another user cannot inherit high recommendation');

  await db.query(`insert into public.exercise_sessions(user_id,status,completed_at)
    select $1,'completed','2026-10-01T08:00:00+09:00'::timestamptz + n * interval '1 day'
    from generate_series(1,4) n`, [owner]);
  await db.query('select public.community_sync_mileage($1)', [owner]);
  check(await one("select count(*)::integer from public.community_mileage_ledger where user_id=$1 and reason='workout_streak_5'", [owner]), 1, 'five consecutive days awarded once');
  await db.query(`insert into public.exercise_sessions(user_id,status,completed_at)
    select $1,'completed','2026-10-07T08:00:00+09:00'::timestamptz + n * interval '1 day'
    from generate_series(0,4) n`, [owner]);
  await db.query('select public.community_sync_mileage($1)', [owner]);
  check(await one("select count(*)::integer from public.community_mileage_ledger where user_id=$1 and reason='workout_streak_5'", [owner]), 2, 'new streak after rest is awarded');

  await db.query(`insert into public.exercise_sessions(user_id,status,completed_at)
    select $1,'completed','2026-10-01T08:00:00+09:00'::timestamptz + n * interval '1 day'
    from generate_series(0,29) n`, [other]);
  await db.query('select public.community_sync_mileage($1)', [other]);
  check(await one("select count(*)::integer from public.community_mileage_ledger where user_id=$1 and reason='workout_streak_30'", [other]), 1, 'thirty consecutive days awarded');
  check(await one('select sum(amount)::integer from public.community_mileage_ledger where user_id=$1', [other]), 340, 'thirty daily rewards and both streak bonuses');
  await db.query('select public.community_sync_mileage($1)', [other]);
  check(await one('select count(*)::integer from public.community_mileage_ledger where user_id=$1', [other]), 32, 'repeat sync adds no duplicate entries');

  await db.query(`insert into public.exercise_sessions(user_id,status,completed_at)
    select $1,'completed','2026-09-30T08:00:00+09:00'::timestamptz + n * interval '1 day'
    from generate_series(0,4) n`, [prior]);
  await db.query('select public.community_sync_mileage($1)', [prior]);
  check(await one("select count(*)::integer from public.community_mileage_ledger where user_id=$1 and reason='workout_streak_5'", [prior]), 0, 'pre-rule activity does not backfill a streak');
  await db.query("update public.community_rules set enabled=false where rule_key='earn_streak_5'");
  await db.query("insert into public.exercise_sessions(user_id,status,completed_at) values($1,'completed','2026-10-05T08:00:00+09:00')", [prior]);
  await db.query('select public.community_sync_mileage($1)', [prior]);
  check(await one("select count(*)::integer from public.community_mileage_ledger where user_id=$1 and reason='workout_streak_5'", [prior]), 0, 'disabled rule does not award');
  console.log(`PASS: ${checks} mileage integration checks`);
} catch (error) {
  console.error({ message: error.message, code: error.code, query: error.query });
  process.exitCode = 1;
} finally {
  await db.close();
}
