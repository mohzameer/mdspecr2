alter table public.folder_mappings
  add column if not exists clickup_mode text
    check (clickup_mode in ('doc', 'task_list'))
    default 'doc';

alter table public.folder_mappings
  add column if not exists clickup_list_id text;
