import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { readCredentials } from '@/lib/credentials'
import axios from 'axios'

interface ConfluencePageItem { id: string; title: string }

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
  if (integration.type !== 'confluence') return NextResponse.json({ error: 'not_confluence' }, { status: 400 })
  if (integration.status !== 'connected') return NextResponse.json({ error: 'not_connected' }, { status: 400 })
  if (!integration.credentials_secret_id) return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })

  let credentials: { base_url: string; email: string; token: string; space_key: string }
  try {
    const plaintext = await readCredentials(createSupabaseServiceClient(), integration.credentials_secret_id)
    credentials = JSON.parse(plaintext)
  } catch {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })
  }

  const base = credentials.base_url.replace(/\/$/, '')
  const auth = { username: credentials.email, password: credentials.token }
  const parentId = req.nextUrl.searchParams.get('parent_id')

  try {
    if (parentId) {
      // Fetch children of a specific page
      const res = await axios.get(`${base}/wiki/rest/api/content/${parentId}/child/page`, {
        auth,
        params: { limit: 50, orderby: 'title' },
      })
      const pages: ConfluencePageItem[] = (res.data.results ?? []).map((p: { id: string; title: string }) => ({
        id: p.id,
        title: p.title,
      }))
      return NextResponse.json({ ok: true, pages })
    }

    // Fetch all pages in the space, ordered by title
    const res = await axios.get(`${base}/wiki/rest/api/content`, {
      auth,
      params: {
        spaceKey: credentials.space_key,
        type: 'page',
        limit: 50,
        orderby: 'title',
      },
    })
    const pages: ConfluencePageItem[] = (res.data.results ?? [])
      .map((p: { id: string; title: string }) => ({ id: p.id, title: p.title }))

    return NextResponse.json({ ok: true, pages })
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 401 || status === 403) {
      return NextResponse.json({ ok: false, error: 'Authentication failed. Check your Confluence credentials.' }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: 'Could not load Confluence pages.' }, { status: 400 })
  }
}
