import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

async function getProjectAndRole(projectId: string) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, project: null, canEdit: false }

  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id')
    .eq('id', projectId)
    .single()
  if (!project) return { supabase, user, project: null, canEdit: false }

  const { data: orgMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', project.org_id)
    .eq('user_id', user.id)
    .single()

  const { data: projectMember } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()

  const canEdit =
    (orgMember?.role && ['owner', 'admin'].includes(orgMember.role)) ||
    projectMember?.role === 'admin'

  return { supabase, user, project, canEdit: !!canEdit }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; templateId: string }> }
) {
  const { projectId, templateId } = await params
  const { supabase, user, project, canEdit } = await getProjectAndRole(projectId)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, instructions } = body

  if (instructions !== undefined && instructions.length > 4000) {
    return NextResponse.json({ error: 'instructions_too_long' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name.trim()
  if (description !== undefined) updates.description = description?.trim() ?? null
  if (instructions !== undefined) updates.instructions = instructions.trim()

  const { data: template, error } = await supabase
    .from('templates')
    .update(updates)
    .eq('id', templateId)
    .eq('org_id', project.org_id)
    .select()
    .single()

  if (error || !template) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  return NextResponse.json(template)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; templateId: string }> }
) {
  const { projectId, templateId } = await params
  const { supabase, user, project, canEdit } = await getProjectAndRole(projectId)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: template } = await supabase
    .from('templates')
    .select('is_default')
    .eq('id', templateId)
    .eq('org_id', project.org_id)
    .single()

  if (!template) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (template.is_default) {
    return NextResponse.json({ error: 'cannot_delete_default' }, { status: 409 })
  }

  await supabase.from('templates').delete().eq('id', templateId).eq('org_id', project.org_id)
  return new NextResponse(null, { status: 204 })
}
