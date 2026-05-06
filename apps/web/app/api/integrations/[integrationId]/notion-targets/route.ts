import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { readCredentials } from '@/lib/credentials'
import { searchNotionShared, listNotionChildPages } from '@/lib/publish/adapters/notion'

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
  if (integration.type !== 'notion') return NextResponse.json({ error: 'not_notion' }, { status: 400 })
  if (integration.status !== 'connected') return NextResponse.json({ error: 'not_connected' }, { status: 400 })
  if (!integration.credentials_secret_id) return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })

  let credentials: { token: string }
  try {
    const plaintext = await readCredentials(createSupabaseServiceClient(), integration.credentials_secret_id)
    credentials = JSON.parse(plaintext)
  } catch {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })
  }

  const parentId = req.nextUrl.searchParams.get('parent_id')
  const parentKind = req.nextUrl.searchParams.get('parent_kind') === 'database' ? 'database' : 'page'

  if (parentId) {
    const result = await listNotionChildPages(credentials.token, parentId, parentKind)
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  }

  const result = await searchNotionShared(credentials.token)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
