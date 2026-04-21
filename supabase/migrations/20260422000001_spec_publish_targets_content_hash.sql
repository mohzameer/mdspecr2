-- Track the last-published content hash per publish target.
-- The worker writes this after a successful publish; the processor uses it
-- for skip detection (compare job hash vs last-published hash).
alter table public.spec_publish_targets
  add column if not exists content_hash text;
