import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'
import { resolveOrgId } from '@/lib/resolveOrgId'

async function getOrgAndRole() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, orgId: null, canEdit: false }

  const cookieStore = await cookies()
  const orgId = await resolveOrgId(supabase, user.id, cookieStore)
  if (!orgId) return { supabase, user, orgId: null, canEdit: false }

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  const canEdit = member?.role === 'owner' || member?.role === 'admin'
  return { supabase, user, orgId, canEdit }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const { supabase, user, orgId, canEdit } = await getOrgAndRole()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') update.name = body.name.trim()
  if (typeof body.description === 'string' || body.description === null) update.description = body.description
  if (typeof body.instructions === 'string') {
    if (body.instructions.length > 4000) return NextResponse.json({ error: 'instructions_too_long' }, { status: 400 })
    update.instructions = body.instructions
  }

  const { error } = await supabase
    .from('templates')
    .update(update)
    .eq('id', templateId)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const { supabase, user, orgId, canEdit } = await getOrgAndRole()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Don't allow deleting the default Task Template
  const { data: tmpl } = await supabase
    .from('templates')
    .select('is_default')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .single()
  if (tmpl?.is_default) return NextResponse.json({ error: 'cannot_delete_default' }, { status: 400 })

  const { error } = await supabase
    .from('templates')
    .delete()
    .eq('id', templateId)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
