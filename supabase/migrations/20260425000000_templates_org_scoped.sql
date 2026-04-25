-- Make templates org-scoped instead of project-scoped.
-- Templates are now shared across all projects within an org.

-- ---------------------------------------------------------------------------
-- 1. Add org_id column (nullable for backfill)
-- ---------------------------------------------------------------------------
alter table public.templates
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Backfill org_id from the projects table
-- ---------------------------------------------------------------------------
update public.templates t
set org_id = p.org_id
from public.projects p
where p.id = t.project_id
  and t.org_id is null;

-- ---------------------------------------------------------------------------
-- 3. Make org_id NOT NULL now that it's backfilled
-- ---------------------------------------------------------------------------
alter table public.templates
  alter column org_id set not null;

-- ---------------------------------------------------------------------------
-- 4. Drop old RLS policies before dropping project_id (they depend on it)
-- ---------------------------------------------------------------------------
drop policy if exists "templates: select if org member" on public.templates;
drop policy if exists "templates: insert if admin" on public.templates;
drop policy if exists "templates: update if admin" on public.templates;
drop policy if exists "templates: delete if admin" on public.templates;

-- ---------------------------------------------------------------------------
-- 5. Drop project_id foreign key and column
-- ---------------------------------------------------------------------------
alter table public.templates
  drop column project_id;

-- ---------------------------------------------------------------------------
-- 6. Update index
-- ---------------------------------------------------------------------------
drop index if exists idx_templates_project_id;
create index if not exists idx_templates_org_id on public.templates(org_id);

-- ---------------------------------------------------------------------------
-- 7. Create new RLS policies scoped to org_id
-- ---------------------------------------------------------------------------

create policy "templates: select if org member"
  on public.templates for select
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = templates.org_id
        and om.user_id = auth.uid()
    )
  );

create policy "templates: insert if admin"
  on public.templates for insert
  with check (
    public.is_org_member(org_id, array['owner', 'admin'])
  );

create policy "templates: update if admin"
  on public.templates for update
  using (
    public.is_org_member(templates.org_id, array['owner', 'admin'])
  );

create policy "templates: delete if admin"
  on public.templates for delete
  using (
    public.is_org_member(templates.org_id, array['owner', 'admin'])
  );

-- ---------------------------------------------------------------------------
-- 8. Move default template seed trigger from project creation → org creation
-- ---------------------------------------------------------------------------
drop trigger if exists on_project_created_templates on public.projects;

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
