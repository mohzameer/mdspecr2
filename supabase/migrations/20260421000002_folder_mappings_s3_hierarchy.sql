alter table public.folder_mappings
  add column if not exists s3_maintain_hierarchy boolean not null default false;
