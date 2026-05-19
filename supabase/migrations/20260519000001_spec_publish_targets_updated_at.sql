alter table public.spec_publish_targets
  add column if not exists updated_at timestamptz not null default now();

-- Back-fill: use published_at for published rows, now() for everything else
update public.spec_publish_targets
  set updated_at = published_at
  where published_at is not null;
