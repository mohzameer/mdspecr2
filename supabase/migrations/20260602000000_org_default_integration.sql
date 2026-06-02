-- Org-level default integration. Used as the fallback when a spec declares no
-- integration: and the target project has no default_integration of its own.
-- Resolution order at publish time: spec.integration → project.default_integration
-- → organizations.default_integration → error.

alter table public.organizations
  add column default_integration text
    check (default_integration is null or default_integration in ('notion', 'confluence', 'clickup', 'jira', 's3'));
