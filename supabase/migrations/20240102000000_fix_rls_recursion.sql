-- Fix infinite recursion in org_members RLS policies
-- The original policies queried org_members from within org_members policies → recursion
-- Fix: use a SECURITY DEFINER function that bypasses RLS for the membership check

-- ---------------------------------------------------------------------------
-- Helper function — bypasses RLS to check membership
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(
  _org_id  uuid,
  _roles   text[] default null
)
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

-- ---------------------------------------------------------------------------
-- Drop old recursive policies on org_members
-- ---------------------------------------------------------------------------

drop policy if exists "org_members: select if same org"          on public.org_members;
drop policy if exists "org_members: insert if owner or admin (or first member)" on public.org_members;
drop policy if exists "org_members: update if owner or admin"    on public.org_members;
drop policy if exists "org_members: delete if owner or admin"    on public.org_members;

-- ---------------------------------------------------------------------------
-- Recreate without recursion
-- ---------------------------------------------------------------------------

-- Each user can see their own membership rows
create policy "org_members: select own"
  on public.org_members for select
  using (user_id = auth.uid());

-- Allow insert if:
--   (a) no members exist yet for this org (first member = creator), OR
--   (b) caller is already owner/admin of the org (via security definer fn)
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

-- ---------------------------------------------------------------------------
-- Also fix organizations policies that query org_members directly
-- ---------------------------------------------------------------------------

drop policy if exists "organizations: select if member"          on public.organizations;
drop policy if exists "organizations: update if owner or admin"  on public.organizations;
drop policy if exists "organizations: delete if owner"           on public.organizations;

create policy "organizations: select if member"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "organizations: update if owner or admin"
  on public.organizations for update
  using (public.is_org_member(id, array['owner','admin']));

create policy "organizations: delete if owner"
  on public.organizations for delete
  using (public.is_org_member(id, array['owner']));
