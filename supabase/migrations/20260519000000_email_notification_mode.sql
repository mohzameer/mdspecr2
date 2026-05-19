alter table public.users
  add column if not exists email_notification_mode text not null default 'always'
    check (email_notification_mode in ('always', 'failures_only', 'never'));

-- Carry forward existing opt-outs: disabled → never
update public.users
  set email_notification_mode = 'never'
  where email_notifications = false;
