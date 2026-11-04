// Isolated PostgreSQL check; never connects to the remote Supabase project.
// Usage: node backend/tests/weekly_diet_retention_sql.mjs /path/to/@electric-sql/pglite
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { PGlite } = createRequire(import.meta.url)(process.argv[2]);
const db = new PGlite();
const migration = readFileSync(
  new URL('../../supabase/migrations/20261103070648_weekly_diet_retention_30_days.sql', import.meta.url),
  'utf8',
);
const old = '00000000-0000-4000-8000-000000000001';
const recent = '00000000-0000-4000-8000-000000000002';

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema cron;
    create function cron.schedule(name text, schedule text, command text)
      returns bigint language sql as $$ select 1::bigint $$;
    create table public.weekly_diet_plans (
      weekly_diet_plan_id uuid primary key, user_id uuid not null,
      request_context jsonb not null, created_at timestamptz not null
    );
    create table public.diet_recipe_snapshots (
      diet_recipe_snapshot_id uuid primary key, weekly_diet_plan_id uuid,
      user_id uuid not null, created_at timestamptz not null
    );
    create function protect_weekly_plan() returns trigger language plpgsql as $$
    begin
      if exists(select 1 from public.diet_recipe_snapshots
                where weekly_diet_plan_id = old.weekly_diet_plan_id) then
        raise exception 'Remove recipe snapshot first';
      end if;
      return old;
    end $$;
    create trigger protect_business_parent before delete on public.weekly_diet_plans
      for each row execute function protect_weekly_plan();
  `);
  await db.exec(migration);
  await db.query(`insert into public.weekly_diet_plans
    (weekly_diet_plan_id, user_id, request_context, created_at)
    values ($1, $1, '{"food_allergens":["우유"]}', now() - interval '31 days'),
           ($2, $2, '{"food_allergens":["대두"]}', now() - interval '29 days')`,
    [old, recent]);
  await db.query(`insert into public.diet_recipe_snapshots
    (diet_recipe_snapshot_id, weekly_diet_plan_id, user_id, created_at)
    values ($1, $1, $1, now() - interval '31 days'),
           ($2, $2, $2, now() - interval '29 days')`, [old, recent]);

  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      db.query('select autofit_maintenance.purge_expired_weekly_diet_plans()'),
      /permission denied/,
    );
    await db.exec('reset role');
  }

  const purge = async () => (await db.query(
    'select autofit_maintenance.purge_expired_weekly_diet_plans() as result',
  )).rows[0].result;
  assert.deepEqual(await purge(),
    { skipped: false, deleted_plans: 1, deleted_recipes: 1 });
  assert.deepEqual((await db.query(
    'select weekly_diet_plan_id from public.weekly_diet_plans',
  )).rows.map(row => row.weekly_diet_plan_id), [recent]);
  assert.deepEqual((await db.query(
    'select weekly_diet_plan_id from public.diet_recipe_snapshots',
  )).rows.map(row => row.weekly_diet_plan_id), [recent]);
  assert.deepEqual(await purge(),
    { skipped: false, deleted_plans: 0, deleted_recipes: 0 });
  console.log('Weekly retention SQL passed: 30-day cutoff, linked recipes, role restrictions and idempotence.');
} finally {
  await db.close();
}
