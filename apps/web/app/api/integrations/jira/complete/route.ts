import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { readCredentials, storeCredentials, deleteCredentials } from '@/lib/credentials'
import { resolveOrgId } from '@/lib/resolveOrgId'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const orgId = await resolveOrgId(supabase, user.id, cookieStore)
  if (!orgId) return NextResponse.json({ error: 'no org selected' }, { status: 400 })

  const { pendingSecretId, cloudId, siteUrl, projectKey } = await request.json()
  if (!pendingSecretId || !cloudId || !siteUrl || !projectKey) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  let tokens: { access_token: string; refresh_token: string; expires_at: string }
  try {
    const raw = await readCredentials(service, pendingSecretId)
    tokens = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Session expired. Please reconnect.' }, { status: 400 })
  }

  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    site_url: siteUrl,
    cloud_id: cloudId,
    project_key: projectKey,
  }

  const { data: existing } = await service
    .from('integrations')
    .select('credentials_secret_id')
    .eq('org_id', orgId)
    .eq('type', 'jira')
    .maybeSingle()

  const secretId = await storeCredentials(service, JSON.stringify(credentials), `integration:${orgId}:jira:${randomUUID()}`)

  const { error } = await service
    .from('integrations')
    .upsert(
      {
        org_id: orgId,
        type: 'jira',
        status: 'connected',
        credentials_secret_id: secretId,
        config: { site_url: siteUrl, project_key: projectKey },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,type' }
    )

  if (error) {
    await deleteCredentials(service, secretId).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Clean up old secret and pending secret.
  if (existing?.credentials_secret_id) {
    await deleteCredentials(service, existing.credentials_secret_id).catch(() => {})
  }
  await deleteCredentials(service, pendingSecretId).catch(() => {})

  return NextResponse.json({ ok: true })
}
