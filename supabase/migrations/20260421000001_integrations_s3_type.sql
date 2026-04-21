-- Add 's3' to the allowed integration types
alter table public.integrations
  drop constraint if exists integrations_type_check;

alter table public.integrations
  add constraint integrations_type_check
  check (type in ('notion', 'confluence', 'clickup', 's3'));

-- Add 's3' to the allowed target types in spec_publish_targets
alter table public.spec_publish_targets
  drop constraint if exists spec_publish_targets_target_type_check;

alter table public.spec_publish_targets
  add constraint spec_publish_targets_target_type_check
  check (target_type in ('notion', 'confluence', 'clickup', 's3'));
