alter table public.spec_publish_targets
  add constraint spec_publish_targets_spec_id_integration_id_key
  unique (spec_id, integration_id);
