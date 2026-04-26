-- Track last message sender on support_tickets so the list views
-- can show an unread badge without an extra query per ticket.

alter table public.support_tickets
  add column if not exists last_message_at          timestamptz,
  add column if not exists last_message_sender_role text check (last_message_sender_role in ('user', 'admin'));

-- On new ticket creation, seed the columns so admin sees it as unread immediately.
create or replace function public.seed_support_ticket_last_message()
returns trigger language plpgsql as $$
begin
  new.last_message_at          := new.created_at;
  new.last_message_sender_role := 'user';
  return new;
end;
$$;

create trigger support_tickets_seed_last_message
  before insert on public.support_tickets
  for each row execute function public.seed_support_ticket_last_message();

-- On each new ticket_message, update the parent ticket.
create or replace function public.update_ticket_last_message()
returns trigger language plpgsql as $$
begin
  update public.support_tickets
  set last_message_at          = new.created_at,
      last_message_sender_role = new.sender_role,
      updated_at               = new.created_at
  where id = new.ticket_id;
  return new;
end;
$$;

create trigger ticket_messages_update_last_message
  after insert on public.ticket_messages
  for each row execute function public.update_ticket_last_message();
