import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

async function getOrgAdmin(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
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

// PATCH /api/aliases/[aliasId] — update alias
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ aliasId: string }> }
) {
  const { aliasId } = await params
  const supabase = await createSupabaseServerClient()
  const { user, orgId, isAdmin } = await getOrgAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 })
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name !== undefined) {
    if (!/^[a-z0-9][a-z0-9\-]{0,63}$/.test(body.name)) {
      return NextResponse.json({ error: 'Invalid alias name format' }, { status: 400 })
    }
    updates.name = body.name
  }
  if (body.native_id !== undefined) updates.native_id = body.native_id
  if (body.native_url !== undefined) updates.native_url = body.native_url
  if (body.display_name !== undefined) updates.display_name = body.display_name

  const { data: alias, error } = await supabase
    .from('aliases')
    .update(updates)
    .eq('id', aliasId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Alias name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!alias) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(alias)
}

// DELETE /api/aliases/[aliasId] — delete alias
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ aliasId: string }> }
) {
  const { aliasId } = await params
  const supabase = await createSupabaseServerClient()
  const { user, orgId, isAdmin } = await getOrgAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 })
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { error } = await supabase
    .from('aliases')
    .delete()
    .eq('id', aliasId)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
