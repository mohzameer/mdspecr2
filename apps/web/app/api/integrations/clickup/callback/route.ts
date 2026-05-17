import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { storeCredentials, deleteCredentials } from '@/lib/credentials'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', APP_URL))

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const base = new URL('/integrations', APP_URL)

  const cookieStore = await cookies()
  const nonce = cookieStore.get('clickup_oauth_nonce')?.value
  cookieStore.delete('clickup_oauth_nonce')

  if (!nonce || !code) {
    base.searchParams.set('error', 'clickup_denied')
    return NextResponse.redirect(base)
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://api.clickup.com/api/v2/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.CLICKUP_CLIENT_ID,
      client_secret: process.env.CLICKUP_CLIENT_SECRET,
      code,
    }),
  })

  if (!tokenRes.ok) {
    base.searchParams.set('error', 'clickup_token')
    return NextResponse.redirect(base)
  }

  const { access_token } = await tokenRes.json()

  // Fetch workspaces (teams)
  const teamsRes = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: access_token },
  })

  if (!teamsRes.ok) {
    base.searchParams.set('error', 'clickup_token')
    return NextResponse.redirect(base)
  }

  const { teams } = await teamsRes.json()
  const workspaces: { id: string; name: string }[] = (teams ?? []).map(
    (t: { id: string; name: string }) => ({ id: t.id, name: t.name })
  )

  if (workspaces.length === 0) {
    base.searchParams.set('error', 'clickup_no_workspace')
    return NextResponse.redirect(base)
  }

  // Single workspace — connect directly without showing a picker
  if (workspaces.length === 1) {
    const orgId = cookieStore.get('current_org_id')?.value
    if (!orgId) {
      base.searchParams.set('error', 'clickup_token')
      return NextResponse.redirect(base)
    }

    const credentials = { api_token: access_token, workspace_id: workspaces[0].id }
    const service = createSupabaseServiceClient()

    const { data: existing } = await service
      .from('integrations')
      .select('credentials_secret_id')
      .eq('org_id', orgId)
      .eq('type', 'clickup')
      .maybeSingle()

    const secretId = await storeCredentials(service, JSON.stringify(credentials), `integration:${orgId}:clickup:${randomUUID()}`)

    await service.from('integrations').upsert(
      { org_id: orgId, type: 'clickup', status: 'connected', credentials_secret_id: secretId, credentials: '', config: credentials, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,type' }
    )

    if (existing?.credentials_secret_id) {
      await deleteCredentials(service, existing.credentials_secret_id).catch(() => {})
    }

    base.searchParams.set('clickup', 'connected')
    return NextResponse.redirect(base)
  }

  // Multiple workspaces — store pending data and show picker
  cookieStore.set('clickup_pending', JSON.stringify({ token: access_token, workspaces }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  })

  base.searchParams.set('setup', 'clickup')
  return NextResponse.redirect(base)
}
