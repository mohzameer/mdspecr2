alter table public.folder_mappings
  add column if not exists s3_format text
    check (s3_format in ('md', 'html'))
    default 'md';
