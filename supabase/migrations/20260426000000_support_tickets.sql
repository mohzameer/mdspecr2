-- Support ticket system
-- Adds platform-level admin role to users, support_tickets table, ticket_messages table

-- ---------------------------------------------------------------------------
-- Platform role on public.users
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

-- ---------------------------------------------------------------------------
-- Helper: check if caller is a platform admin (security definer to bypass RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id   = auth.uid()
      and role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------

create table if not exists public.support_tickets (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  title              text        not null,
  category           text        not null,
  body               text        not null,
  criticality_score  integer     not null default 5 check (criticality_score between 1 and 10),
  criticality_label  text        not null default 'medium' check (criticality_label in ('low', 'medium', 'high', 'critical')),
  ai_reasoning       text,
  status             text        not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  submitter_is_paid  boolean     not null default false,
  submitter_plan     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ticket_messages
-- ---------------------------------------------------------------------------

create table if not exists public.ticket_messages (
  id          uuid        primary key default gen_random_uuid(),
  ticket_id   uuid        not null references public.support_tickets(id) on delete cascade,
  sender_id   uuid        not null references auth.users(id) on delete cascade,
  sender_role text        not null check (sender_role in ('user', 'admin')),
  body        text        not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.support_tickets  enable row level security;
alter table public.ticket_messages  enable row level security;

-- ---------------------------------------------------------------------------
-- RLS: support_tickets
-- ---------------------------------------------------------------------------

-- Users can insert their own tickets
create policy "support_tickets: insert own"
  on public.support_tickets for insert
  with check (user_id = auth.uid());

-- Users can read only their own tickets
create policy "support_tickets: select own"
  on public.support_tickets for select
  using (user_id = auth.uid() or public.is_platform_admin());

-- Admins can update any ticket (status changes)
create policy "support_tickets: update admin"
  on public.support_tickets for update
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- RLS: ticket_messages
-- ---------------------------------------------------------------------------

-- Users can insert messages on their own tickets; admins can insert on any
create policy "ticket_messages: insert"
  on public.ticket_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.support_tickets
        where id      = ticket_id
          and user_id = auth.uid()
      )
    )
  );

-- Users can read messages on their own tickets; admins can read all
create policy "ticket_messages: select"
  on public.ticket_messages for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.support_tickets
      where id      = ticket_messages.ticket_id
        and user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Auto-update updated_at on support_tickets
-- ---------------------------------------------------------------------------

create or replace function public.touch_support_ticket()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.touch_support_ticket();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_support_tickets_user_id           on public.support_tickets(user_id);
create index if not exists idx_support_tickets_criticality_score on public.support_tickets(criticality_score desc);
create index if not exists idx_support_tickets_submitter_is_paid on public.support_tickets(submitter_is_paid desc);
create index if not exists idx_support_tickets_status            on public.support_tickets(status);
create index if not exists idx_ticket_messages_ticket_id         on public.ticket_messages(ticket_id);
