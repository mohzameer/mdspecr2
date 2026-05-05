-- Encrypt integration credentials at rest via Supabase Vault.
--
-- Replaces the plaintext `integrations.credentials` column with a
-- `credentials_secret_id` reference into vault.secrets. Decryption happens
-- only through SECURITY DEFINER RPCs callable by service_role.

create extension if not exists supabase_vault with schema vault cascade;

alter table public.integrations
  add column if not exists credentials_secret_id uuid;

-- Create a vault secret. Returns the secret id.
create or replace function public.create_integration_secret(secret_text text, secret_name text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare new_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  select vault.create_secret(secret_text, secret_name) into new_id;
  return new_id;
end;
$$;

-- Read a vault secret. Returns the plaintext.
create or replace function public.read_integration_secret(secret_id uuid)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare result text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  select decrypted_secret into result from vault.decrypted_secrets where id = secret_id;
  return result;
end;
$$;

-- Delete a vault secret.
create or replace function public.delete_integration_secret(secret_id uuid)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  delete from vault.secrets where id = secret_id;
end;
$$;

revoke all on function public.create_integration_secret(text, text) from public, anon, authenticated;
revoke all on function public.read_integration_secret(uuid) from public, anon, authenticated;
revoke all on function public.delete_integration_secret(uuid) from public, anon, authenticated;

grant execute on function public.create_integration_secret(text, text) to service_role;
grant execute on function public.read_integration_secret(uuid) to service_role;
grant execute on function public.delete_integration_secret(uuid) to service_role;
