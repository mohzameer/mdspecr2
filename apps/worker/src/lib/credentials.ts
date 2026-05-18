import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function readCredentials(
  supabase: SupabaseClient,
  secretId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('read_integration_secret', { secret_id: secretId })
  if (error) throw new Error(`vault.read_secret failed: ${error.message}`)
  if (data == null) throw new Error('vault secret not found')
  return data as string
}

export async function storeCredentials(
  supabase: SupabaseClient,
  plaintext: string,
  secretName: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_integration_secret', {
    secret_text: plaintext,
    secret_name: `${secretName}:${randomUUID()}`,
  })
  if (error || !data) throw new Error(`vault.create_secret failed: ${error?.message ?? 'no id returned'}`)
  return data as string
}

export async function deleteCredentials(
  supabase: SupabaseClient,
  secretId: string
): Promise<void> {
  const { error } = await supabase.rpc('delete_integration_secret', { secret_id: secretId })
  if (error) throw new Error(`vault.delete_secret failed: ${error.message}`)
}
