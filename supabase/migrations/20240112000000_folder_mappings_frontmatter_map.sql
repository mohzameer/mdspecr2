alter table public.folder_mappings drop column if exists frontmatter_keys;
alter table public.folder_mappings add column if not exists frontmatter_map jsonb;
