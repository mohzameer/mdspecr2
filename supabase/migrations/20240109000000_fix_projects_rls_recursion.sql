-- Fix infinite recursion in projects UPDATE/DELETE policies.
--
-- The original policies checked project_members directly. The project_members
-- SELECT policy in turn reads projects, creating a cycle:
--   projects UPDATE → project_members SELECT → projects SELECT → (detected as recursion)
--
-- Fix: introduce a SECURITY DEFINER helper (bypasses RLS) for project admin
-- checks, mirroring the is_org_member pattern from migration 20240102.

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

-- Recreate UPDATE policy using security definer helpers
drop policy if exists "projects: update if org owner/admin or project admin" on public.projects;
create policy "projects: update if org owner/admin or project admin"
  on public.projects for update
  using (
    public.is_org_member(projects.org_id, array['owner', 'admin'])
    or public.is_project_admin(projects.id)
  );

-- Recreate DELETE policy using security definer helpers
drop policy if exists "projects: delete if org owner/admin or project admin" on public.projects;
create policy "projects: delete if org owner/admin or project admin"
  on public.projects for delete
  using (
    public.is_org_member(projects.org_id, array['owner', 'admin'])
    or public.is_project_admin(projects.id)
  );
