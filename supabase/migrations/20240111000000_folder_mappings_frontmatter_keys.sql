alter table public.folder_mappings
  add column if not exists frontmatter_keys text;
