-- Auto-Fit access model:
--   Frontend -> Supabase Auth only
--   Frontend -> FastAPI for application data
--   FastAPI  -> Supabase Data API with the server-only service role
--
-- Keep RLS enabled as defense in depth, but do not expose public tables or
-- functions to browser/mobile Data API roles.

revoke all privileges on all tables in schema public
  from anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to service_role;

revoke all privileges on all sequences in schema public
  from anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to service_role;

-- Trigger helpers must not be callable as public RPC endpoints. PostgreSQL
-- checks trigger-function privileges when a trigger is created, so existing
-- triggers continue to run after these direct EXECUTE grants are removed.
revoke execute on all functions in schema public
  from public, anon, authenticated, service_role;

-- Future public-schema objects stay private until a migration explicitly
-- grants the minimum privileges required by the backend.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select, update
  on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- This trigger helper only reads NEW and now(), so it does not need any
-- schema lookup. Pinning search_path removes the mutable-path security warning.
alter function public.set_updated_at() set search_path = '';
