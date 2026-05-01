-- Drop the support ticket system. The user-facing /settings/support page
-- now just shows a contact email; tickets, messages, and their helper
-- functions/triggers are no longer used.
--
-- Kept intentionally:
--   * public.users.role and public.is_platform_admin() — still used for
--     other admin features (e.g. /admin/users).
--   * public.users.email_notifications — harmless, may be reused later.

drop table if exists public.ticket_messages cascade;
drop table if exists public.support_tickets cascade;

drop function if exists public.touch_support_ticket() cascade;
drop function if exists public.seed_support_ticket_last_message() cascade;
drop function if exists public.update_ticket_last_message() cascade;
