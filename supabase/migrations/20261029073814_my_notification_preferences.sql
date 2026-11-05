-- G4 notification choices missing from the existing per-user settings row.
alter table public.notification_settings
  add column community_enabled boolean not null default false,
  add column foreground_push_enabled boolean not null default true;

comment on column public.notification_settings.community_enabled is
  'Whether in-app community events should produce a notification.';
comment on column public.notification_settings.foreground_push_enabled is
  'Whether a push may be shown while the app is open.';

-- Rollback after clients stop using these columns:
-- alter table public.notification_settings
--   drop column foreground_push_enabled, drop column community_enabled;
