import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Stores plaintext credentials in Supabase Vault and returns the secret id.
 * Caller must use a service-role client.
 */
export async function storeCredentials(
  supabase: SupabaseClient,
  plaintext: string,
  secretName: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_integration_secret', {
    secret_text: plaintext,
    secret_name: secretName,
  })
  if (error || !data) throw new Error(`vault.create_secret failed: ${error?.message ?? 'no id returned'}`)
  return data as string
}

/**
 * Reads decrypted credentials from Supabase Vault.
 * Caller must use a service-role client.
 */
export async function readCredentials(
  supabase: SupabaseClient,
  secretId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('read_integration_secret', { secret_id: secretId })
  if (error) throw new Error(`vault.read_secret failed: ${error.message}`)
  if (data == null) throw new Error('vault secret not found')
  return data as string
}

/**
 * Deletes a vault secret. Caller must use a service-role client.
 */
export async function deleteCredentials(
  supabase: SupabaseClient,
  secretId: string
): Promise<void> {
  const { error } = await supabase.rpc('delete_integration_secret', { secret_id: secretId })
  if (error) throw new Error(`vault.delete_secret failed: ${error.message}`)
}
