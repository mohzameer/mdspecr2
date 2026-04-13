import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

const CLICKUP_API = 'https://api.clickup.com/api/v2'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params
  const { searchParams } = new URL(req.url)
  const spaceId = searchParams.get('space_id')
  if (!spaceId) return NextResponse.json({ error: 'space_id_required' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, type, status, credentials, org_id')
    .eq('id', integrationId)
    .single()

  if (!integration) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', integration.org_id)
    .eq('user_id', user.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (integration.type !== 'clickup') return NextResponse.json({ error: 'not_clickup' }, { status: 400 })
  if (integration.status !== 'connected') return NextResponse.json({ error: 'not_connected' }, { status: 400 })

  let credentials: { api_token: string; workspace_id: string }
  try {
    credentials = JSON.parse(integration.credentials)
  } catch {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `${CLICKUP_API}/space/${spaceId}/list?archived=false`,
      { headers: { Authorization: credentials.api_token } }
    )
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: 'clickup_auth_failed' }, { status: 502 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'clickup_fetch_failed' }, { status: 502 })
    }
    const data = await res.json()
    const lists: Array<{ id: string; name: string }> = data.lists ?? []
    return NextResponse.json({ lists: lists.map((l) => ({ id: l.id, name: l.name })) })
  } catch {
    return NextResponse.json({ error: 'clickup_fetch_failed' }, { status: 502 })
  }
}
