alter table public.spec_publish_targets
  add column if not exists updated_at timestamptz not null default now();

-- Back-fill successfully published rows from their publish timestamp.
-- Rows that are currently failed or queued keep the default now(), which is
-- more accurate than showing a stale published_at from a previous success.
update public.spec_publish_targets
  set updated_at = published_at
  where status = 'published' and published_at is not null;
