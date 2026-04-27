alter table public.users
  add column if not exists email_notifications boolean not null default true;
