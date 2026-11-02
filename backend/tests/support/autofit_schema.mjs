// Builds an isolated in-memory copy of the Auto-Fit schema for PGlite tests: every repo
// migration plus the applied 2026-09-17 integrity migrations, which live outside the repo
// (reference copies from the DB owner; pass their folder path). Never the remote project.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));

// Minimal stand-ins for Supabase-managed schemas the migrations reference.
const PLATFORM_STUBS = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, deleted_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.role() returns text language sql stable as $$ select null::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select null::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[], owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text,
  name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now());
create function storage.foldername(name text) returns text[] language sql immutable
  as $$ select string_to_array(name, '/') $$;
create schema cron;
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create schema extensions;
`;

export async function loadAutofitSchema(db, integrityDir) {
  if (!integrityDir) throw new Error('Pass the folder with the 2026-09-17 integrity SQL files');
  await db.exec(PLATFORM_STUBS);
  const files = [
    ...readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => path.join(MIGRATIONS, f)),
    ...readdirSync(integrityDir).filter((f) => /^20260917\d+_.*\.sql$/.test(f)).map((f) => path.join(integrityDir, f)),
  ].sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  if (files.filter((f) => path.basename(f).startsWith('20260917')).length < 5) {
    throw new Error('Expected the five 20260917 integrity migrations in ' + integrityDir);
  }
  for (const file of files) {
    // pg_cron is a platform extension; the cron.schedule stub above stands in for it.
    const sql = readFileSync(file, 'utf8').replace(/create extension if not exists pg_cron;/gi, '');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`${path.basename(file)}: ${error.message}`);
    }
  }
  return files.map((f) => path.basename(f));
}

// Signing up creates the profile (handle_new_user trigger), as in the real project.
export async function createUsers(db, users) {
  for (const user of users) {
    await db.query('insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)',
      [user.id, `${user.id}@test.local`, JSON.stringify({ name: user.name ?? '테스트' })]);
    if (user.nickname) {
      await db.query('update public.profiles set nickname = $2 where user_id = $1', [user.id, user.nickname]);
    }
  }
}
