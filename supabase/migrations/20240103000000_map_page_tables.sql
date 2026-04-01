-- mdspec Map Page — Migration
-- Adds: templates, folder_mappings, agent_runs tables
-- Includes: RLS policies, seed trigger for default Task Template, indexes

-- ===========================================================================
-- TABLES
-- ===========================================================================

create table if not exists public.templates (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null,
  description  text,
  instructions text not null check (char_length(instructions) <= 4000),
  is_default   boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists public.folder_mappings (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  folder_path    text not null,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  template_id    uuid references public.templates(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (project_id, folder_path, integration_id)
);

create table if not exists public.agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  spec_id             uuid not null references public.specs(id) on delete cascade,
  template_id         uuid references public.templates(id) on delete set null,
  trigger             text not null check (trigger in ('folder_mapping', 'frontmatter')),
  raw_content         text not null,
  transformed_content text,
  status              text not null check (status in ('queued', 'running', 'completed', 'failed')),
  error               text,
  duration_ms         int,
  created_at          timestamptz default now(),
  completed_at        timestamptz
);

-- ===========================================================================
-- ENABLE RLS
-- ===========================================================================

alter table public.templates enable row level security;
alter table public.folder_mappings enable row level security;
alter table public.agent_runs enable row level security;

-- ===========================================================================
-- RLS POLICIES — templates
-- ===========================================================================

-- Org members can read templates for their projects
create policy "templates: select if org member"
  on public.templates for select
  using (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = templates.project_id
        and om.user_id = auth.uid()
    )
  );

-- Org admin/owner or project admin can create templates
create policy "templates: insert if admin"
  on public.templates for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_member(p.org_id, array['owner', 'admin'])
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- Org admin/owner or project admin can update templates
create policy "templates: update if admin"
  on public.templates for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = templates.project_id
        and public.is_org_member(p.org_id, array['owner', 'admin'])
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = templates.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- Org admin/owner or project admin can delete templates (default template protected at app layer)
create policy "templates: delete if admin"
  on public.templates for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = templates.project_id
        and public.is_org_member(p.org_id, array['owner', 'admin'])
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = templates.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- ===========================================================================
-- RLS POLICIES — folder_mappings
-- ===========================================================================

create policy "folder_mappings: select if org member"
  on public.folder_mappings for select
  using (
    exists (
      select 1 from public.projects p
      join public.org_members om on om.org_id = p.org_id
      where p.id = folder_mappings.project_id
        and om.user_id = auth.uid()
    )
  );

create policy "folder_mappings: insert if admin"
  on public.folder_mappings for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_member(p.org_id, array['owner', 'admin'])
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "folder_mappings: update if admin"
  on public.folder_mappings for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = folder_mappings.project_id
        and public.is_org_member(p.org_id, array['owner', 'admin'])
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = folder_mappings.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create policy "folder_mappings: delete if admin"
  on public.folder_mappings for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = folder_mappings.project_id
        and public.is_org_member(p.org_id, array['owner', 'admin'])
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = folder_mappings.project_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

-- ===========================================================================
-- RLS POLICIES — agent_runs (service role writes; users read)
-- ===========================================================================

create policy "agent_runs: select if org member"
  on public.agent_runs for select
  using (
    exists (
      select 1 from public.specs s
      join public.projects p on p.id = s.project_id
      join public.org_members om on om.org_id = p.org_id
      where s.id = agent_runs.spec_id
        and om.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- SEED TRIGGER — insert default Task Template when a project is created
-- ===========================================================================

create or replace function public.handle_new_project_templates()
returns trigger language plpgsql security definer as $$
begin
  insert into public.templates (project_id, name, description, instructions, is_default, created_by)
  values (
    new.id,
    'Task Template',
    'Default template — transforms specs into structured task documents with acceptance criteria, dependencies, and open questions.',
    'You are a technical documentation agent. Transform the provided engineering spec into a structured task document.

Extract or generate the following sections from the spec content:

## {{acceptance_criteria}}
List clear, testable acceptance criteria based on the spec requirements.

## {{non_functional_requirements}}
Extract any non-functional requirements mentioned. If none are explicit, infer reasonable ones from context.

## {{dependencies}}
List all external services, APIs, teams, or libraries this spec depends on.

## {{open_questions}}
List any unresolved questions, ambiguities, or decisions not yet made in the spec.

## {{error_handling}}
Describe how errors should be handled based on the spec context.

Preserve the original spec content above these sections.
Output clean markdown suitable for publishing to {{target_integration}}.',
    true,
    null
  );
  return new;
end;
$$;

drop trigger if exists on_project_created_templates on public.projects;
create trigger on_project_created_templates
  after insert on public.projects
  for each row execute function public.handle_new_project_templates();

-- ===========================================================================
-- INDEXES
-- ===========================================================================

create index if not exists idx_templates_project_id
  on public.templates(project_id);

create index if not exists idx_folder_mappings_project_id
  on public.folder_mappings(project_id);

create index if not exists idx_folder_mappings_lookup
  on public.folder_mappings(project_id, folder_path);

create index if not exists idx_agent_runs_spec_id
  on public.agent_runs(spec_id);

create index if not exists idx_agent_runs_status
  on public.agent_runs(status);
