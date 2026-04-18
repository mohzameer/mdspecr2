-- Remove full content storage from specs; add first-class title column.
-- Title is resolved at API ingest: frontmatter.title ?? filename stem.
alter table public.specs
  drop column content,
  add column title text not null default '';

-- Remove the title_source project setting — title derivation is now
-- always: frontmatter.title if set, otherwise filename stem.
alter table public.projects
  drop column if exists title_source;
