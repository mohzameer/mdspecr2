alter table public.folder_mappings
  add column if not exists clickup_use_custom_task_ids boolean not null default false;
