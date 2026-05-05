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
