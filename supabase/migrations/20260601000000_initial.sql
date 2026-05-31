-- mdspec v2 — Initial Schema (post-pivot to frontmatter routing)
-- Replaces all prior migrations. No production data carried forward.
-- See docs/new-pivot.md (routing spec) and docs/pivot-plan.md (execution plan §9).

-- ===========================================================================
-- EXTENSIONS
-- ===========================================================================

create extension if not exists supabase_vault with schema vault cascade;

-- ===========================================================================
-- TABLES
-- ===========================================================================

create table public.users (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text not null,
  email_notifications      boolean not null default true,
  email_notification_mode  text not null default 'always'
    check (email_notification_mode in ('always', 'failures_only', 'never')),
  created_at               timestamptz not null default now()
);

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  invited_by  uuid references auth.users(id),
  email       text not null,
  role        text not null check (role in ('admin', 'member')),
  token_hash  text not null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  description         text,
  registered_repo     text,
  default_integration text
    check (default_integration is null or default_integration in ('notion','clickup','confluence','jira','s3')),
  default_type        text not null default 'wiki'
    check (default_type in ('wiki','task')),
  publish_count       int not null default 0,
  created_at          timestamptz not null default now()
);

create table public.project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table public.project_tokens (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  token_hash  text not null,
  token_hint  text not null,
  revoked     boolean not null default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create table public.integrations (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  type                   text not null check (type in ('notion', 'confluence', 'clickup', 'jira', 's3')),
  status                 text not null default 'disconnected'
    check (status in ('connected', 'unhealthy', 'disconnected')),
  credentials_secret_id  uuid,
  config                 jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (org_id, type)
);

create table public.aliases (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  integration_id  uuid not null references public.integrations(id) on delete cascade,
  name            text not null
    check (name ~ '^[a-z0-9][a-z0-9\-]{0,63}$'),
  native_id       text not null,
  native_url      text,
  display_name    text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, name)
);

create table public.templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  description  text,
  instructions text not null check (char_length(instructions) <= 4000),
  is_default   boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- specs — per spec §9.1. Each row is one markdown file in a project that
-- has frontmatter. spec_id is frontmatter.id (or file path as fallback).
create table public.specs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  path              text not null,
  spec_id           text not null,
  type              text not null,                       -- 'wiki' | 'task' (v1)
  commit_sha        text not null,
  content_hash      text not null,
  frontmatter       jsonb,
  deleted_from_repo boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (project_id, spec_id)
);

-- spec_publish_targets — per spec §9.2. Tracks where each spec is published
-- and the native ID in the target system for self-heal / update.
create table public.spec_publish_targets (
  id                uuid primary key default gen_random_uuid(),
  spec_id           uuid not null references public.specs(id) on delete cascade,
  integration_id    uuid not null references public.integrations(id) on delete cascade,
  external_id       text,                                -- native page/task/doc ID
  external_page_id  text,                                -- ClickUp doc page sub-id (null for non-ClickUp)
  external_url      text,
  status            text not null default 'queued'
    check (status in ('queued', 'published', 'failed')),
  retry_count       int not null default 0,
  last_error        text,
  content_hash      text,                                -- dedup: skip republish if unchanged
  published_at      timestamptz,
  updated_at        timestamptz not null default now(),
  unique (spec_id, integration_id)
);

create table public.agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  spec_id             uuid not null references public.specs(id) on delete cascade,
  template_id         uuid references public.templates(id) on delete set null,
  raw_content         text not null,
  transformed_content text,
  status              text not null check (status in ('queued', 'running', 'completed', 'failed')),
  error               text,
  duration_ms         int,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

-- sync_runs — one per CLI push. The "last spec" completion fires the
-- consolidated email notification.
create table public.sync_runs (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  total_specs      int not null,
  completed_specs  int not null default 0,
  results          jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade unique,
  plan                   text not null default 'free' check (plan in ('free', 'pro')),
  billing_period         text check (billing_period in ('monthly', 'yearly')),
  paddle_subscription_id text,
  paddle_customer_id     text,
  status                 text not null default 'active'
    check (status in ('active', 'cancelled', 'payment_failed')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.billing_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  event_type      text not null,
  paddle_event_id text not null unique,
  payload         jsonb not null,
  created_at      timestamptz not null default now()
);

-- ===========================================================================
-- INDEXES
-- ===========================================================================

create index idx_org_members_user_id              on public.org_members(user_id);
create index idx_org_members_org_id               on public.org_members(org_id);
create index idx_projects_org_id                  on public.projects(org_id);
create index idx_project_members_user_id          on public.project_members(user_id);
create index idx_project_tokens_project_id        on public.project_tokens(project_id);
create index idx_integrations_org_id              on public.integrations(org_id);
create index idx_aliases_org_id                   on public.aliases(org_id);
create index idx_aliases_integration_id           on public.aliases(integration_id);
create index idx_aliases_org_name                 on public.aliases(org_id, name);
create index idx_templates_org_id                 on public.templates(org_id);
create index idx_specs_project_id                 on public.specs(project_id);
create index idx_specs_path                       on public.specs(project_id, path);
create index idx_spec_publish_targets_spec_id     on public.spec_publish_targets(spec_id);
create index idx_spec_publish_targets_status      on public.spec_publish_targets(status);
create index idx_agent_runs_spec_id               on public.agent_runs(spec_id);
create index idx_agent_runs_status                on public.agent_runs(status);
create index idx_sync_runs_project_id             on public.sync_runs(project_id);
create index idx_subscriptions_user_id            on public.subscriptions(user_id);
create index idx_billing_events_user_id           on public.billing_events(user_id);

-- ===========================================================================
-- SECURITY DEFINER HELPERS (RLS-bypass for membership checks; avoid recursion)
-- ===========================================================================

create or replace function public.is_org_member(_org_id uuid, _roles text[] default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id  = _org_id
      and user_id = auth.uid()
      and (_roles is null or role = any(_roles))
  )
$$;

create or replace function public.is_project_admin(_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = _project_id
      and user_id    = auth.uid()
      and role       = 'admin'
  )
$$;

-- ===========================================================================
-- VAULT FUNCTIONS — integration credentials encryption
-- ===========================================================================

create or replace function public.create_integration_secret(secret_text text, secret_name text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare new_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  select vault.create_secret(secret_text, secret_name) into new_id;
  return new_id;
end;
$$;

create or replace function public.read_integration_secret(secret_id uuid)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare result text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  select decrypted_secret into result from vault.decrypted_secrets where id = secret_id;
  return result;
end;
$$;

create or replace function public.delete_integration_secret(secret_id uuid)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  delete from vault.secrets where id = secret_id;
end;
$$;

revoke all on function public.create_integration_secret(text, text) from public, anon, authenticated;
revoke all on function public.read_integration_secret(uuid) from public, anon, authenticated;
revoke all on function public.delete_integration_secret(uuid) from public, anon, authenticated;
grant execute on function public.create_integration_secret(text, text) to service_role;
grant execute on function public.read_integration_secret(uuid)         to service_role;
grant execute on function public.delete_integration_secret(uuid)       to service_role;

-- ===========================================================================
-- SYNC-RUN COMPLETION RPC
-- ===========================================================================

create or replace function public.complete_sync_spec(
  p_sync_run_id uuid,
  p_spec_result jsonb
) returns table(completed_specs int, total_specs int)
language sql
as $$
  update public.sync_runs
  set
    completed_specs = completed_specs + 1,
    results         = results || jsonb_build_array(p_spec_result)
  where id = p_sync_run_id
  returning completed_specs, total_specs;
$$;

-- ===========================================================================
-- ENABLE RLS
-- ===========================================================================

alter table public.users                 enable row level security;
alter table public.organizations         enable row level security;
alter table public.org_members           enable row level security;
alter table public.org_invites           enable row level security;
alter table public.projects              enable row level security;
alter table public.project_members       enable row level security;
alter table public.project_tokens        enable row level security;
alter table public.integrations          enable row level security;
alter table public.aliases               enable row level security;
alter table public.templates             enable row level security;
alter table public.specs                 enable row level security;
alter table public.spec_publish_targets  enable row level security;
alter table public.agent_runs            enable row level security;
alter table public.sync_runs             enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.billing_events        enable row level security;

-- ===========================================================================
-- RLS POLICIES
-- ===========================================================================

-- users
create policy "users: select own"
  on public.users for select
  using (auth.uid() = id);

create policy "users: update own"
  on public.users for update
  using (auth.uid() = id);

-- organizations
create policy "organizations: select if member"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "organizations: insert (authenticated)"
  on public.organizations for insert
  with check (auth.uid() is not null);

create policy "organizations: update if owner or admin"
  on public.organizations for update
  using (public.is_org_member(id, array['owner', 'admin']));

create policy "organizations: delete if owner"
  on public.organizations for delete
  using (public.is_org_member(id, array['owner']));

-- org_members (use helper to avoid recursion)
create policy "org_members: select own"
  on public.org_members for select
  using (user_id = auth.uid());

create policy "org_members: insert"
  on public.org_members for insert
  with check (
    not exists (select 1 from public.org_members om where om.org_id = org_id)
    or public.is_org_member(org_id, array['owner','admin'])
  );

create policy "org_members: update if owner or admin"
  on public.org_members for update
  using (public.is_org_member(org_members.org_id, array['owner','admin']));

create policy "org_members: delete if owner or admin"
  on public.org_members for delete
  using (public.is_org_member(org_members.org_id, array['owner','admin']));

-- org_invites
create policy "org_invites: select if admin or own email"
  on public.org_invites for select
  using (
    public.is_org_member(org_id, array['owner','admin'])
    or email = (select email from public.users where id = auth.uid())
  );

create policy "org_invites: insert if admin"
  on public.org_invites for insert
  with check (public.is_org_member(org_id, array['owner','admin']));

create policy "org_invites: update if admin"
  on public.org_invites for update
  using (public.is_org_member(org_id, array['owner','admin']));

-- projects
create policy "projects: select if org member"
  on public.projects for select
  using (public.is_org_member(org_id));

create policy "projects: insert if org admin"
  on public.projects for insert
  with check (public.is_org_member(org_id, array['owner', 'admin']));

create policy "projects: update if org admin or project admin"
  on public.projects for update
  using (
    public.is_org_member(projects.org_id, array['owner', 'admin'])
    or public.is_project_admin(projects.id)
  );

create policy "projects: delete if org admin or project admin"
  on public.projects for delete
  using (
    public.is_org_member(projects.org_id, array['owner', 'admin'])
    or public.is_project_admin(projects.id)
  );

-- project_members
create policy "project_members: select if org member"
  on public.project_members for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and public.is_org_member(p.org_id)
    )
  );

create policy "project_members: insert if admin"
  on public.project_members for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (public.is_org_member(p.org_id, array['owner', 'admin']) or public.is_project_admin(p.id))
    )
  );

create policy "project_members: update if admin"
  on public.project_members for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and (public.is_org_member(p.org_id, array['owner', 'admin']) or public.is_project_admin(p.id))
    )
  );

create policy "project_members: delete if admin"
  on public.project_members for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
        and (public.is_org_member(p.org_id, array['owner', 'admin']) or public.is_project_admin(p.id))
    )
  );

-- project_tokens
create policy "project_tokens: select if admin"
  on public.project_tokens for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_tokens.project_id
        and (public.is_org_member(p.org_id, array['owner', 'admin']) or public.is_project_admin(p.id))
    )
  );

create policy "project_tokens: insert if admin"
  on public.project_tokens for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (public.is_org_member(p.org_id, array['owner', 'admin']) or public.is_project_admin(p.id))
    )
  );

create policy "project_tokens: update if admin"
  on public.project_tokens for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_tokens.project_id
        and (public.is_org_member(p.org_id, array['owner', 'admin']) or public.is_project_admin(p.id))
    )
  );

-- integrations
create policy "integrations: select if org member"
  on public.integrations for select
  using (public.is_org_member(org_id));

create policy "integrations: insert if admin"
  on public.integrations for insert
  with check (public.is_org_member(org_id, array['owner', 'admin']));

create policy "integrations: update if admin"
  on public.integrations for update
  using (public.is_org_member(org_id, array['owner', 'admin']));

create policy "integrations: delete if admin"
  on public.integrations for delete
  using (public.is_org_member(org_id, array['owner', 'admin']));

-- aliases
create policy "aliases: select if org member"
  on public.aliases for select
  using (public.is_org_member(org_id));

create policy "aliases: insert if admin"
  on public.aliases for insert
  with check (public.is_org_member(org_id, array['owner', 'admin']));

create policy "aliases: update if admin"
  on public.aliases for update
  using (public.is_org_member(org_id, array['owner', 'admin']));

create policy "aliases: delete if admin"
  on public.aliases for delete
  using (public.is_org_member(org_id, array['owner', 'admin']));

-- templates (org-scoped)
create policy "templates: select if org member"
  on public.templates for select
  using (public.is_org_member(org_id));

create policy "templates: insert if admin"
  on public.templates for insert
  with check (public.is_org_member(org_id, array['owner', 'admin']));

create policy "templates: update if admin"
  on public.templates for update
  using (public.is_org_member(org_id, array['owner', 'admin']));

create policy "templates: delete if admin"
  on public.templates for delete
  using (public.is_org_member(org_id, array['owner', 'admin']));

-- specs (service role writes from publish path; users read)
create policy "specs: select if org member"
  on public.specs for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = specs.project_id
        and public.is_org_member(p.org_id)
    )
  );

-- spec_publish_targets (service role writes from publish path; users read)
create policy "spec_publish_targets: select if org member"
  on public.spec_publish_targets for select
  using (
    exists (
      select 1 from public.specs s
      join public.projects p on p.id = s.project_id
      where s.id = spec_publish_targets.spec_id
        and public.is_org_member(p.org_id)
    )
  );

-- agent_runs (service role writes; users read)
create policy "agent_runs: select if org member"
  on public.agent_runs for select
  using (
    exists (
      select 1 from public.specs s
      join public.projects p on p.id = s.project_id
      where s.id = agent_runs.spec_id
        and public.is_org_member(p.org_id)
    )
  );

-- sync_runs (service role writes; users read)
create policy "sync_runs: select if org member"
  on public.sync_runs for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = sync_runs.project_id
        and public.is_org_member(p.org_id)
    )
  );

-- subscriptions / billing_events (per-user)
create policy "subscriptions: select own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "billing_events: select own"
  on public.billing_events for select
  using (auth.uid() = user_id);

-- ===========================================================================
-- TRIGGERS
-- ===========================================================================

-- Sync new auth.users → public.users + create free subscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Seed default Task Template on org creation (used by `type: task` specs per D4)
create or replace function public.handle_new_org_templates()
returns trigger language plpgsql security definer as $$
begin
  insert into public.templates (org_id, name, description, instructions, is_default, created_by)
  values (
    new.id,
    'Task Template',
    'Default template — transforms specs into structured task documents with acceptance criteria, dependencies, and open questions.',
    'You are a technical documentation agent. Transform the provided engineering spec into a structured task document.

Extract or generate the following sections from the spec:

## Background
Summarise the context and motivation for this task. Why is it being built? What problem does it solve?

## Acceptance Criteria
List clear, testable conditions that must be met for this task to be considered complete.

## Non-Functional Requirements
Extract any performance, scalability, security, or reliability constraints. If none are explicit, infer reasonable ones from context.

## Dependencies
List all external services, APIs, teams, or libraries this task depends on.

## Error Handling
Describe how errors should be handled — what fails, how it is surfaced, and how it recovers.

## Testing Plan
Describe how this task should be tested. Include unit tests, integration tests, and any manual verification steps needed to confirm the acceptance criteria are met.

## Open Questions
List any unresolved questions, ambiguities, or decisions not yet made.

Output clean markdown suitable for publishing to {{target_integration}}.',
    true,
    null
  );
  return new;
end;
$$;

drop trigger if exists on_org_created_templates on public.organizations;
create trigger on_org_created_templates
  after insert on public.organizations
  for each row execute function public.handle_new_org_templates();
