-- ===========================================================================
-- Move subscriptions and billing_events to be per-user instead of per-org.
-- A user gets exactly one subscription (created on signup).
-- Users are also blocked from owning more than one org at the API layer.
-- ===========================================================================

-- 1. Drop the old org-scoped trigger/function
drop trigger if exists on_org_created on public.organizations;
drop function if exists public.handle_new_org();

-- 2. Drop RLS policies that depend on org_id BEFORE dropping the columns
drop policy if exists "subscriptions: select if org member" on public.subscriptions;
drop policy if exists "billing_events: select if org owner" on public.billing_events;

-- 3. Recreate subscriptions with user_id
alter table public.subscriptions drop constraint if exists subscriptions_org_id_fkey;

-- Add nullable first so existing rows don't immediately violate NOT NULL
alter table public.subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Backfill: set user_id to the org owner for each existing subscription
update public.subscriptions s
set user_id = om.user_id
from public.org_members om
where om.org_id = s.org_id
  and om.role = 'owner';

-- Drop any rows that had no matching owner (orphaned orgs)
delete from public.subscriptions where user_id is null;

-- Now safe to enforce NOT NULL and uniqueness
alter table public.subscriptions alter column user_id set not null;
alter table public.subscriptions drop constraint if exists subscriptions_user_id_key;
alter table public.subscriptions add constraint subscriptions_user_id_key unique (user_id);

alter table public.subscriptions drop column if exists org_id;

-- 4. Recreate billing_events with user_id
alter table public.billing_events drop constraint if exists billing_events_org_id_fkey;

-- Add nullable first
alter table public.billing_events
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Backfill billing_events from org owner
update public.billing_events be
set user_id = om.user_id
from public.org_members om
where om.org_id = be.org_id
  and om.role = 'owner';

-- Drop orphaned rows
delete from public.billing_events where user_id is null;

alter table public.billing_events alter column user_id set not null;
alter table public.billing_events drop column if exists org_id;

-- 5. New RLS: users can only see their own rows
create policy "subscriptions: select own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "billing_events: select own"
  on public.billing_events for select
  using (auth.uid() = user_id);

-- 6. Extend handle_new_user to also create a free subscription on signup
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

-- 7. Indexes for fast user_id lookups
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_billing_events_user_id on public.billing_events(user_id);
