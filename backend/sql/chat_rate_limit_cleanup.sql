-- Apply only with chat_rate_limits.sql and existing pg_cron.
-- The table holds quota metadata only, never question/answer text.
select cron.schedule(
  'autofit-chat-rate-limit-cleanup',
  '*/5 * * * *',
  'set statement_timeout = ''60s''; delete from public.chat_rate_limit_events where created_at < clock_timestamp() - interval ''5 minutes'';'
);
