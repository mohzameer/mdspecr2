-- mdspec V1 — Initial Schema Migration
-- Apply this in your Supabase SQL editor or via supabase db push

-- ===========================================================================
-- TABLES
-- ===========================================================================

create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz default now()
);

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz default now()
);

create table if not exists public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz default now(),
  unique (org_id, user_id)
);

create table if not exists public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  invited_by  uuid references auth.users(id),
  email       text not null,
  role        text not null check (role in ('admin', 'member')),
  token_hash  text not null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  registered_repo text,
  spec_dirs       text[] default '{}'::text[],
  created_at      timestamptz default now()
);

create table if not exists public.project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'member', 'viewer')),
  created_at timestamptz default now(),
  unique (project_id, user_id)
);

create table if not exists public.project_tokens (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  token_hash  text not null,
  token_hint  text not null,
  revoked     boolean default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  revoked_at  timestamptz
);

create table if not exists public.integrations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  type        text not null check (type in ('notion', 'confluence', 'clickup')),
  status      text not null default 'disconnected' check (status in ('connected', 'unhealthy', 'disconnected')),
  credentials text not null default '',
  config      jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (org_id, type)
);

create table if not exists public.specs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  repo         text not null,
  path         text not null,
  mdspec_id    text,
  commit_sha   text not null,
  content_hash text not null,
  content      text not null,
  frontmatter  jsonb,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (project_id, path)
);

create table if not exists public.spec_publish_targets (
  id               uuid primary key default gen_random_uuid(),
  spec_id          uuid not null references public.specs(id) on delete cascade,
  integration_id   uuid not null references public.integrations(id) on delete cascade,
  target_type      text not null check (target_type in ('notion', 'confluence', 'clickup')),
  external_page_id text,
  external_url     text,
  status           text not null default 'queued' check (status in ('queued', 'published', 'failed')),
  retry_count      int default 0,
  last_error       text,
  published_at     timestamptz
);

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade unique,
  plan                   text not null default 'free' check (plan in ('free', 'pro')),
  billing_period         text check (billing_period in ('monthly', 'yearly')),
  paddle_subscription_id text,
  paddle_customer_id     text,
  status                 text not null default 'active' check (status in ('active', 'cancelled', 'payment_failed')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create table if not exists public.billing_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  event_type      text not null,
  paddle_event_id text not null unique,
  payload         jsonb not null,
  created_at      timestamptz default now()
);

-- ===========================================================================
-- ENABLE RLS
-- ===========================================================================

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_tokens enable row level security;
alter table public.integrations enable row level security;
alter table public.specs enable row level security;
alter table public.spec_publish_targets enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;

-- ===========================================================================
-- RLS POLICIES
-- ===========================================================================

-- users
create policy "users: select own row"
  on public.users for select
  using (auth.uid() = id);

-- organizations
create policy "organizations: select if member"
  on public.organizations for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = organizations.id
        and org_members.user_id = auth.uid()
    )
  );

create policy "organizations: insert (authenticated)"
  on public.organizations for insert
  with check (auth.uid() is not null);

create policy "organizations: update if owner or admin"
  on public.organizations for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = organizations.id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

create policy "organizations: delete if owner"
  on public.organizations for delete
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = organizations.id
        and org_members.user_id = auth.uid()
        and org_members.role = 'owner'
    )
  );

-- org_members
create policy "org_members: select if same org"
  on public.org_members for select
  using (
    exists (
      select 1 from public.org_members om2
      where om2.org_id = org_members.org_id
        and om2.user_id = auth.uid()
    )
  );

create policy "org_members: insert if owner or admin (or first member)"
  on public.org_members for insert
  with check (
    not exists (select 1 from public.org_members om2 where om2.org_id = org_id)
    or exists (
      select 1 from public.org_members om2
      where om2.org_id = org_id
        and om2.user_id = auth.uid()
        and om2.role in ('owner', 'admin')
    )
  );

create policy "org_members: update if owner or admin"
  on public.org_members for update
  using (
    exists (
      select 1 from public.org_members om2
      where om2.org_id = org_members.org_id
        and om2.user_id = auth.uid()
        and om2.role in ('owner', 'admin')
    )
  );

create policy "org_members: delete if owner or admin"
  on public.org_members for delete
  using (
    exists (
      select 1 from public.org_members om2
      where om2.org_id = org_members.org_id
        and om2.user_id = auth.uid()
        and om2.role in ('owner', 'admin')
    )
  );

-- org_invites
create policy "org_invites: select if org admin or own email"
  on public.org_invites for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_invites.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
    or email = (select email from public.users where id = auth.uid())
  );

create policy "org_invites: insert if org admin"
  on public.org_invites for insert
  with check (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

create policy "org_invites: update if org admin"
  on public.org_invites for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_invites.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

-- projects
create policy "projects: select if org member"
  on public.projects for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = projects.org_id
        and org_members.user_id = auth.uid()
    )
  );

create policy "projects: insert if org owner or admin"
  on public.projects for insert
  with check (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

create policy "projects: update if org owner/admin or project admin"
  on public.projects for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = projects.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.project_members
      where project_members.project_id = projects.id
        and project_members.user_id = auth.uid()
        and project_members.role = 'admin'
    )
  );

create policy "projects: delete if org owner/admin or project admin"
  on public.projects for delete
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = projects.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.project_members
      where project_members.project_id = projects.id
        and project_members.user_id = auth.uid()
        and project_members.role = 'admin'
    )
  );

-- project_members
create policy "project_members: select if org member"
  on public.project_members for select
  using (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = project_members.project_id
        and om.user_id = auth.uid()
    )
  );

create policy "project_members: insert if org/project admin"
  on public.project_members for insert
  with check (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.project_members pm2
      where pm2.project_id = project_id
        and pm2.user_id = auth.uid()
        and pm2.role = 'admin'
    )
  );

create policy "project_members: update if org/project admin"
  on public.project_members for update
  using (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = project_members.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.project_members pm2
      where pm2.project_id = project_members.project_id
        and pm2.user_id = auth.uid()
        and pm2.role = 'admin'
    )
  );

create policy "project_members: delete if org/project admin"
  on public.project_members for delete
  using (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = project_members.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.project_members pm2
      where pm2.project_id = project_members.project_id
        and pm2.user_id = auth.uid()
        and pm2.role = 'admin'
    )
  );

-- project_tokens
create policy "project_tokens: select if org/project admin"
  on public.project_tokens for select
  using (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = project_tokens.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_tokens.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "project_tokens: insert if org/project admin"
  on public.project_tokens for insert
  with check (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "project_tokens: update if org/project admin"
  on public.project_tokens for update
  using (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = project_tokens.project_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_tokens.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- integrations
create policy "integrations: select if org member"
  on public.integrations for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = integrations.org_id
        and org_members.user_id = auth.uid()
    )
  );

create policy "integrations: insert if org owner or admin"
  on public.integrations for insert
  with check (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

create policy "integrations: update if org owner or admin"
  on public.integrations for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = integrations.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

create policy "integrations: delete if org owner or admin"
  on public.integrations for delete
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = integrations.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

-- specs (service role handles writes from API/worker)
create policy "specs: select if org member"
  on public.specs for select
  using (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = specs.project_id
        and om.user_id = auth.uid()
    )
  );

-- spec_publish_targets (service role handles writes from API/worker)
create policy "spec_publish_targets: select if org member"
  on public.spec_publish_targets for select
  using (
    exists (
      select 1 from public.specs s
      join public.projects p on p.id = s.project_id
      join public.org_members om on om.org_id = p.org_id
      where s.id = spec_publish_targets.spec_id
        and om.user_id = auth.uid()
    )
  );

-- subscriptions (service role handles writes from webhook handler)
create policy "subscriptions: select if org member"
  on public.subscriptions for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = subscriptions.org_id
        and org_members.user_id = auth.uid()
    )
  );

-- billing_events (service role handles writes from webhook handler)
create policy "billing_events: select if org owner"
  on public.billing_events for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = billing_events.org_id
        and org_members.user_id = auth.uid()
        and org_members.role = 'owner'
    )
  );

-- ===========================================================================
-- TRIGGERS
-- ===========================================================================

-- Sync new auth.users into public.users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Create free subscription when a new org is created
create or replace function public.handle_new_org()
returns trigger language plpgsql security definer as $$
begin
  insert into public.subscriptions (org_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (org_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_org_created on public.organizations;
create trigger on_org_created
  after insert on public.organizations
  for each row execute function public.handle_new_org();

-- ===========================================================================
-- INDEXES
-- ===========================================================================

create index if not exists idx_org_members_user_id on public.org_members(user_id);
create index if not exists idx_org_members_org_id on public.org_members(org_id);
create index if not exists idx_projects_org_id on public.projects(org_id);
create index if not exists idx_project_members_user_id on public.project_members(user_id);
create index if not exists idx_project_tokens_project_id on public.project_tokens(project_id);
create index if not exists idx_specs_project_id on public.specs(project_id);
create index if not exists idx_spec_publish_targets_spec_id on public.spec_publish_targets(spec_id);
create index if not exists idx_spec_publish_targets_status on public.spec_publish_targets(status);
create index if not exists idx_billing_events_org_id on public.billing_events(org_id);
create index if not exists idx_integrations_org_id on public.integrations(org_id);
