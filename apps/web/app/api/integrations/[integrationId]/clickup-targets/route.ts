import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { readCredentials } from '@/lib/credentials'

const CLICKUP_API = 'https://api.clickup.com/api/v2'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Verify integration belongs to a user's org
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, type, status, credentials_secret_id, org_id')
    .eq('id', integrationId)
    .single()

  if (!integration) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Confirm user is a member of that org
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
    const spacesRes = await fetch(
      `${CLICKUP_API}/team/${credentials.workspace_id}/space?archived=false`,
      { headers }
    )
    if (spacesRes.status === 401 || spacesRes.status === 403) {
      return NextResponse.json({ error: 'clickup_auth_failed' }, { status: 502 })
    }
    if (!spacesRes.ok) {
      return NextResponse.json({ error: 'clickup_fetch_failed' }, { status: 502 })
    }
    const spacesData = await spacesRes.json()
    const spaces: Array<{ id: string; name: string }> = spacesData.spaces ?? []

    const targets: Array<{ id: string; name: string; kind: 'space' | 'folder'; space_name?: string }> =
      spaces.map((s) => ({ id: `space:${s.id}`, name: s.name, kind: 'space' }))

    const folderResults = await Promise.allSettled(
      spaces.map(async (space) => {
        const res = await fetch(
          `${CLICKUP_API}/space/${space.id}/folder?archived=false`,
          { headers }
        )
        if (!res.ok) return []
        const data = await res.json()
        const folders: Array<{ id: string; name: string }> = data.folders ?? []
        return folders.map((f) => ({
          id: `folder:${f.id}`,
          name: f.name,
          kind: 'folder' as const,
          space_name: space.name,
        }))
      })
    )

    for (const r of folderResults) {
      if (r.status === 'fulfilled') targets.push(...r.value)
    }

    return NextResponse.json(targets)
  } catch {
    return NextResponse.json({ error: 'clickup_fetch_failed' }, { status: 502 })
  }
}
