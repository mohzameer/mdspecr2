import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { readCredentials } from '@/lib/credentials'

const CLICKUP_API_V3 = 'https://api.clickup.com/api/v3'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, type, status, credentials_secret_id, org_id')
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
  if (!integration.credentials_secret_id) return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })

  let credentials: { api_token: string; workspace_id: string }
  try {
    const plaintext = await readCredentials(createSupabaseServiceClient(), integration.credentials_secret_id)
    credentials = JSON.parse(plaintext)
  } catch {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })
  }

  const headers = { Authorization: credentials.api_token }

  try {
    const url = new URL(req.url)
    const parentType = url.searchParams.get('parent_type') // 'space' | 'folder' | null (workspace)
    const parentId = url.searchParams.get('parent_id')

    const params: Record<string, string> = { deleted: 'false', archived: 'false' }
    if (parentType && parentId) {
      params.parent_type = parentType === 'space' ? '4' : '5'
      params.parent_id = parentId
    }

    const qs = new URLSearchParams(params).toString()
    const res = await fetch(
      `${CLICKUP_API_V3}/workspaces/${credentials.workspace_id}/docs?${qs}`,
      { headers }
    )

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: 'clickup_auth_failed' }, { status: 502 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'clickup_fetch_failed' }, { status: 502 })
    }

    const data = await res.json()
    const docs: Array<{ id: string; name: string }> = data.data ?? data.docs ?? []

    return NextResponse.json(docs.map((d) => ({ id: d.id, name: d.name })))
  } catch {
    return NextResponse.json({ error: 'clickup_fetch_failed' }, { status: 502 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, type, status, credentials_secret_id, org_id')
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
  if (!integration.credentials_secret_id) return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })

  let credentials: { api_token: string; workspace_id: string }
  try {
    const plaintext = await readCredentials(createSupabaseServiceClient(), integration.credentials_secret_id)
    credentials = JSON.parse(plaintext)
  } catch {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })
  }

  const { name, target_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name_required' }, { status: 400 })

  const headers = { Authorization: credentials.api_token, 'Content-Type': 'application/json' }

  const docPayload: Record<string, unknown> = { name: name.trim(), visibility: 'PUBLIC', create_page: false }
  if (target_id?.startsWith('space:')) {
    docPayload.parent = { id: target_id.slice(6), type: 4 }
  } else if (target_id?.startsWith('folder:')) {
    docPayload.parent = { id: target_id.slice(7), type: 5 }
  }

  try {
    const res = await fetch(
      `https://api.clickup.com/api/v3/workspaces/${credentials.workspace_id}/docs`,
      { method: 'POST', headers, body: JSON.stringify(docPayload) }
    )
    if (!res.ok) return NextResponse.json({ error: 'clickup_create_failed' }, { status: 502 })
    const data = await res.json()
    const doc = data.data ?? data
    return NextResponse.json({ id: doc.id, name: doc.name ?? name.trim() }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'clickup_create_failed' }, { status: 502 })
  }
}
