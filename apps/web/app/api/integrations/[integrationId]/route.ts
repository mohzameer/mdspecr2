import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

// PATCH /api/integrations/:id — update an integration's config.
// v1 supports the ClickUp default task list (and the set of selectable lists).
// A spec with type=task and no parent: routes to config.default_list_id.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, type, org_id, config')
    .eq('id', integrationId)
    .single()

  if (!integration) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', integration.org_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: { default_list_id?: string | null; lists?: Array<{ id: string; name: string }> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (integration.type !== 'clickup') {
    return NextResponse.json({ error: 'unsupported_integration' }, { status: 400 })
  }

  const config = { ...(integration.config as Record<string, unknown> | null ?? {}) }

  if ('default_list_id' in body) {
    config.default_list_id = body.default_list_id || null
  }
  if (Array.isArray(body.lists)) {
    config.lists = body.lists.map((l) => ({ id: String(l.id), name: String(l.name) }))
  }

  const { error } = await supabase
    .from('integrations')
    .update({ config, updated_at: new Date().toISOString() })
    .eq('id', integrationId)

  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, config })
}
