-- Main OCR result lets the user name a document independently of its file name.
alter table public.upload_files
  add column display_title text
    check (display_title is null or length(btrim(display_title)) between 1 and 120);

comment on column public.upload_files.display_title is
  'Optional user-facing document title; file_name and original_file_name remain file metadata.';

-- Rollback after the document title UI is retired:
-- alter table public.upload_files drop column display_title;
