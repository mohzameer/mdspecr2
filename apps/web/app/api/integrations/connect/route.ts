import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { storeCredentials, deleteCredentials } from '@/lib/credentials'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const orgId = cookieStore.get('current_org_id')?.value
  if (!orgId) return NextResponse.json({ error: 'no org selected' }, { status: 400 })

  const { type, credentials, config } = await request.json()

  const service = createSupabaseServiceClient()

  // Look up existing integration to know if we need to delete the prior secret
  const { data: existing } = await service
    .from('integrations')
    .select('credentials_secret_id')
    .eq('org_id', orgId)
    .eq('type', type)
    .maybeSingle()

  const secretId = await storeCredentials(service, credentials, `integration:${orgId}:${type}:${randomUUID()}`)

  const { error } = await service
    .from('integrations')
    .upsert(
      {
        org_id: orgId,
        type,
        status: 'connected',
        credentials_secret_id: secretId,
        credentials: '',
        config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,type' }
    )

  if (error) {
    await deleteCredentials(service, secretId).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (existing?.credentials_secret_id) {
    await deleteCredentials(service, existing.credentials_secret_id).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
