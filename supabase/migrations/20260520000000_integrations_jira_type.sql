-- Add 'jira' to the allowed integration types
alter table public.integrations
  drop constraint if exists integrations_type_check;

alter table public.integrations
  add constraint integrations_type_check
  check (type in ('notion', 'confluence', 'clickup', 's3', 'jira'));

-- Add 'jira' to the allowed target types in spec_publish_targets
alter table public.spec_publish_targets
  drop constraint if exists spec_publish_targets_target_type_check;

alter table public.spec_publish_targets
  add constraint spec_publish_targets_target_type_check
  check (target_type in ('notion', 'confluence', 'clickup', 's3', 'jira'));

-- Per-folder Jira issue type override (Story / Task / Epic / Bug).
-- Falls back to 'Task' when null. The Jira project key override reuses
-- the existing folder_mappings.target_id column (same as Confluence/S3).
alter table public.folder_mappings
  add column if not exists jira_issue_type text;
