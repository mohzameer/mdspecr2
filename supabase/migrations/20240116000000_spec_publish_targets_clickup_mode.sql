-- Add clickup_mode to spec_publish_targets so a spec can have one target row
-- per (integration, mode) — enabling the same ClickUp integration to receive
-- both a Doc publish and a task_list publish for the same spec.
-- Existing rows get the default 'doc' value, preserving uniqueness.

alter table public.spec_publish_targets
  add column if not exists clickup_mode text not null default 'doc'
  check (clickup_mode in ('doc', 'task_list'));

alter table public.spec_publish_targets
  drop constraint spec_publish_targets_spec_id_integration_id_key;

alter table public.spec_publish_targets
  add constraint spec_publish_targets_spec_id_integration_id_clickup_mode_key
  unique (spec_id, integration_id, clickup_mode);
