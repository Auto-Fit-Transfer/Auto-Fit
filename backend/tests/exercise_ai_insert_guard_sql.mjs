// Isolated PostgreSQL check; never connects to the remote Supabase project.
// Usage: node backend/tests/exercise_ai_insert_guard_sql.mjs /path/to/@electric-sql/pglite
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const migration = readFileSync(
  new URL('../../supabase/migrations/20261104080053_enforce_ai_only_exercise_recommendations.sql', import.meta.url),
  'utf8',
);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.exercise_recommendations (
      id integer primary key, generator text not null default 'legacy', status text not null
    );
    insert into public.exercise_recommendations (id, status) values (1, 'active');
  `);
  await db.exec(migration);
  await db.exec('grant usage on schema public to service_role; grant all on public.exercise_recommendations to service_role');
  await assert.rejects(
    () => db.exec("insert into public.exercise_recommendations values (2, 'legacy', 'active')"),
    /New exercise recommendations require auto-fit-ai/,
  );
  await assert.rejects(
    () => db.exec("insert into public.exercise_recommendations (id, status) values (2, 'active')"),
    /New exercise recommendations require auto-fit-ai/,
  );
  await db.exec('set role service_role');
  await db.exec("insert into public.exercise_recommendations values (3, 'auto-fit-ai', 'active')");
  await assert.rejects(
    () => db.exec("insert into public.exercise_recommendations values (4, 'legacy', 'active')"),
    /New exercise recommendations require auto-fit-ai/,
  );
  await assert.rejects(
    () => db.exec("update public.exercise_recommendations set generator='legacy' where id=3"),
    /generator is immutable/,
  );
  await assert.rejects(
    () => db.exec("update public.exercise_recommendations set generator='auto-fit-ai' where id=1"),
    /generator is immutable/,
  );
  await db.exec("update public.exercise_recommendations set generator='legacy' where id=1");
  await db.exec("update public.exercise_recommendations set status='completed' where id=1");
  const rows = (await db.query('select id, generator, status from public.exercise_recommendations order by id')).rows;
  assert.deepEqual(rows, [
    { id: 1, generator: 'legacy', status: 'completed' },
    { id: 3, generator: 'auto-fit-ai', status: 'active' },
  ]);
  await db.exec('reset role');
  await db.exec(migration);
  console.log('AI insert guard SQL passed: historical status update, AI insert, non-AI denial, immutable generator and safe reapplication.');
} finally {
  await db.close();
}
