import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

async function getOrgId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, orgId: null, isAdmin: false }

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .single()

  if (!member) return { user, orgId: null, isAdmin: false }

  return {
    user,
    orgId: member.org_id as string,
    isAdmin: ['owner', 'admin'].includes(member.role),
  }
}

// GET /api/aliases — list all aliases for the current org
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { user, orgId } = await getOrgId(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 })

  const { data: aliases, error } = await supabase
    .from('aliases')
    .select('*, integrations(id, type, status)')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(aliases ?? [])
}

// POST /api/aliases — create a new alias
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { user, orgId, isAdmin } = await getOrgId(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 })
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, integration_id, native_id, native_url, display_name } = body

  if (!name || !integration_id || !native_id) {
    return NextResponse.json({ error: 'name, integration_id, and native_id are required' }, { status: 400 })
  }

  // Validate name format: lowercase alphanumeric + hyphens
  if (!/^[a-z0-9][a-z0-9\-]{0,63}$/.test(name)) {
    return NextResponse.json({ error: 'Alias name must be lowercase alphanumeric with hyphens, 1-64 chars, starting with a letter or number' }, { status: 400 })
  }

  // Verify integration belongs to this org and is connected
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, status')
    .eq('id', integration_id)
    .eq('org_id', orgId)
    .single()

  if (!integration) return NextResponse.json({ error: 'integration_not_found' }, { status: 404 })
  if (integration.status !== 'connected') {
    return NextResponse.json({ error: 'integration_not_connected' }, { status: 400 })
  }

  const { data: alias, error } = await supabase
    .from('aliases')
    .insert({
      org_id: orgId,
      integration_id,
      name,
      native_id,
      native_url: native_url ?? null,
      display_name: display_name ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Alias name "${name}" already exists in this org` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(alias, { status: 201 })
}
