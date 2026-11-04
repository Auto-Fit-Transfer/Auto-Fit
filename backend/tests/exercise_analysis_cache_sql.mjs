// Isolated PostgreSQL check; never connects to a remote Supabase project.
// Usage: node backend/tests/exercise_analysis_cache_sql.mjs /path/to/@electric-sql/pglite
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const migration = readFileSync(
  new URL('../../supabase/migrations/20261104060215_cache_exercise_ai_analysis.sql', import.meta.url),
  'utf8',
);
const sessionId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.exercise_sessions (exercise_session_id uuid primary key, user_id uuid not null);
  `);
  await db.query('insert into public.exercise_sessions values ($1, $2)', [sessionId, userId]);
  await db.exec(migration);
  await db.exec('set role service_role');
  await db.query(`insert into public.exercise_session_analyses
    (exercise_session_id, user_id, input_hash, analysis) values ($1,$2,$3,$4)`,
    [sessionId, userId, 'a'.repeat(64), { generator: 'auto-fit-ai', summary: '완료' }]);
  assert.equal((await db.query('select count(*)::int as n from public.exercise_session_analyses')).rows[0].n, 1);
  await db.exec('set role authenticated');
  await assert.rejects(
    () => db.query('select * from public.exercise_session_analyses'),
    /permission denied/,
  );
  await db.exec('reset role');
  await db.query('delete from public.exercise_sessions where exercise_session_id=$1', [sessionId]);
  assert.equal((await db.query('select count(*)::int as n from public.exercise_session_analyses')).rows[0].n, 0);
  console.log('Exercise analysis cache SQL checks passed: service role, browser denial, cascade.');
} finally {
  await db.close();
}
