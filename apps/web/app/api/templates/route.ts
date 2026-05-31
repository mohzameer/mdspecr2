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

export async function GET() {
  const { supabase, user, orgId } = await getOrgAndRole()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 })

  const { data, error } = await supabase
    .from('templates')
    .select('id, name, description, instructions, is_default, created_at, updated_at')
    .eq('org_id', orgId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { supabase, user, orgId, canEdit } = await getOrgAndRole()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { name, description, instructions } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name_required' }, { status: 400 })
  if (!instructions?.trim()) return NextResponse.json({ error: 'instructions_required' }, { status: 400 })
  if (instructions.length > 4000) return NextResponse.json({ error: 'instructions_too_long' }, { status: 400 })

  const { data, error } = await supabase
    .from('templates')
    .insert({
      org_id: orgId,
      name: name.trim(),
      description: description?.trim() ?? null,
      instructions: instructions.trim(),
      is_default: false,
      created_by: user.id,
    })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
