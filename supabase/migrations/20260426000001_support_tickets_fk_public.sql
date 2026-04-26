-- Fix support_tickets and ticket_messages FKs to reference public.users
-- instead of auth.users so PostgREST can resolve the users(email) join.

alter table public.support_tickets
  drop constraint support_tickets_user_id_fkey,
  add constraint support_tickets_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade;

alter table public.ticket_messages
  drop constraint ticket_messages_sender_id_fkey,
  add constraint ticket_messages_sender_id_fkey
    foreign key (sender_id) references public.users(id) on delete cascade;
