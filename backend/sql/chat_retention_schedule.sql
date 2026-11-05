-- Activated on 2026-09-08 as migration 20260908023656 (jobid 1).
-- Apply chat_retention_30_days.sql first. Run as postgres, not an API role.
create extension if not exists pg_cron;
select cron.schedule(
  'autofit-chat-retention-30-days',
  '*/5 * * * *',
  'set statement_timeout = ''60s''; select autofit_maintenance.purge_expired_chat_messages();'
);
