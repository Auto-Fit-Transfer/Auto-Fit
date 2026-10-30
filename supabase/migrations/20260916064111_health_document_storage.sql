-- Private bucket for sensitive health documents. Application access is server-only.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'health-documents',
  'health-documents',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.upload_files is
  'Metadata for user-owned uploads. Health document bytes live in the private health-documents bucket.';

-- FastAPI authenticates the user and applies an explicit user_id ownership filter.
-- Browser roles retain no direct DML access to these sensitive tables.
grant select, insert, update, delete on table public.upload_files to service_role;
grant select, insert, update, delete on table public.ocr_results to service_role;
grant select, insert, update, delete on table public.health_checkups to service_role;
grant select, insert, update, delete on table public.body_compositions to service_role;
