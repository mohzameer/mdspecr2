create table if not exists public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  total_groups    int  not null,
  completed_groups int not null default 0,
  results         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- Atomically increments completed_groups and appends one group result blob.
-- Returns the updated row so the caller can check if this was the last group.
create or replace function public.complete_sync_group(
  p_sync_run_id  uuid,
  p_group_result jsonb
) returns table(completed_groups int, total_groups int)
language sql
as $$
  update public.sync_runs
  set
    completed_groups = completed_groups + 1,
    results          = results || jsonb_build_array(p_group_result)
  where id = p_sync_run_id
  returning completed_groups, total_groups;
$$;
