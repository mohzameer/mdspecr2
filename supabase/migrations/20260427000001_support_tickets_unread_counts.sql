-- Track per-side unread message counts on support_tickets.
-- user_unread_count  = messages from admin the user hasn't replied to yet
-- admin_unread_count = messages from user the admin hasn't replied to yet

alter table public.support_tickets
  add column if not exists user_unread_count  integer not null default 0,
  add column if not exists admin_unread_count integer not null default 1; -- new ticket = 1 unread for admin

-- Replace the previous last-message trigger to also maintain the counts.
create or replace function public.update_ticket_last_message()
returns trigger language plpgsql as $$
begin
  update public.support_tickets
  set last_message_at          = new.created_at,
      last_message_sender_role = new.sender_role,
      updated_at               = new.created_at,
      -- When admin sends: increment user's count, reset admin's count
      -- When user sends:  increment admin's count, reset user's count
      user_unread_count  = case when new.sender_role = 'admin' then user_unread_count + 1 else 0 end,
      admin_unread_count = case when new.sender_role = 'user'  then admin_unread_count + 1 else 0 end
  where id = new.ticket_id;
  return new;
end;
$$;
