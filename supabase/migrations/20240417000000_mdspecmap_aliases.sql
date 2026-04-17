-- mdspec V1 — .mdspecmap aliases + config reconciliation
-- Adds: aliases table, projects config tracking columns
-- Removes backward compat: .mdspecmap is now required

-- ===========================================================================
-- ALIASES TABLE
-- ===========================================================================

create table if not exists public.aliases (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  integration_id  uuid not null references public.integrations(id) on delete cascade,
  name            text not null,
  native_id       text not null,
  native_url      text,
  display_name    text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (org_id, name)
);

-- Alias name validation: lowercase alphanumeric + hyphens, 1-64 chars
alter table public.aliases
  add constraint aliases_name_format
  check (name ~ '^[a-z0-9][a-z0-9\-]{0,63}$');

-- ===========================================================================
-- PROJECTS — config reconciliation tracking
-- ===========================================================================

alter table public.projects
  add column if not exists last_config_commit_sha text,
  add column if not exists last_config_commit_timestamp bigint,
  add column if not exists last_config_reconciled_at timestamptz;

-- ===========================================================================
-- ENABLE RLS
-- ===========================================================================

alter table public.aliases enable row level security;

-- ===========================================================================
-- RLS POLICIES — aliases
-- ===========================================================================

-- Org members can read aliases
create policy "aliases: select if org member"
  on public.aliases for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = aliases.org_id
        and org_members.user_id = auth.uid()
    )
  );

-- Org admin/owner can create aliases
create policy "aliases: insert if admin"
  on public.aliases for insert
  with check (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

-- Org admin/owner can update aliases
create policy "aliases: update if admin"
  on public.aliases for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = aliases.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

-- Org admin/owner can delete aliases
create policy "aliases: delete if admin"
  on public.aliases for delete
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = aliases.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

-- ===========================================================================
-- INDEXES
-- ===========================================================================

create index if not exists idx_aliases_org_id
  on public.aliases(org_id);

create index if not exists idx_aliases_integration_id
  on public.aliases(integration_id);

create index if not exists idx_aliases_org_name
  on public.aliases(org_id, name);
