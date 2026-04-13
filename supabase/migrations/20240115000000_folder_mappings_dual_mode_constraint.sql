-- Allow the same folder + integration to have both doc and task_list modes
-- (e.g. publish to a ClickUp Doc AND to a ClickUp task list from one folder).
-- The clickup_mode column (added in 20240110) defaults to 'doc', so all
-- existing rows retain their uniqueness after this constraint swap.

alter table public.folder_mappings
  drop constraint folder_mappings_project_id_folder_path_integration_id_key;

alter table public.folder_mappings
  add constraint folder_mappings_project_id_folder_path_integration_id_clickup_mode_key
  unique (project_id, folder_path, integration_id, clickup_mode);
