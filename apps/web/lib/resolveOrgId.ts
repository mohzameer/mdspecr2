import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

/**
 * Resolves the current org ID for a user in API routes.
 * Validates the cookie value against the user's actual memberships.
 * Falls back to the user's first org if the cookie is stale or missing.
 */
export async function resolveOrgId(
  supabase: SupabaseClient,
  userId: string,
  cookieStore: ReadonlyRequestCookies
): Promise<string | null> {
  const cookieOrgId = cookieStore.get('current_org_id')?.value ?? null

  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!memberships || memberships.length === 0) return null

  const orgIds = memberships.map((m) => m.org_id)

  if (cookieOrgId && orgIds.includes(cookieOrgId)) return cookieOrgId

  return orgIds[0]
}
