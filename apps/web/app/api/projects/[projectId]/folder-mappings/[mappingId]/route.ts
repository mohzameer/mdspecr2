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
  { params }: { params: Promise<{ projectId: string; mappingId: string }> }
) {
  const { projectId, mappingId } = await params
  const { supabase, user, project, canEdit } = await getProjectAndRole(projectId)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const { template_id, target_id, clickup_mode, clickup_list_id, frontmatter_map } = body

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('template_id' in body) patch.template_id = template_id ?? null
  if ('target_id' in body) patch.target_id = target_id ?? null
  if ('clickup_mode' in body) patch.clickup_mode = clickup_mode ?? null
  if ('clickup_list_id' in body) patch.clickup_list_id = clickup_list_id ?? null
  if ('frontmatter_map' in body) patch.frontmatter_map = frontmatter_map ?? null

  const { data: mapping, error } = await supabase
    .from('folder_mappings')
    .update(patch)
    .eq('id', mappingId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (error || !mapping) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  return NextResponse.json(mapping)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; mappingId: string }> }
) {
  const { projectId, mappingId } = await params
  const { supabase, user, project, canEdit } = await getProjectAndRole(projectId)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { error } = await supabase
    .from('folder_mappings')
    .delete()
    .eq('id', mappingId)
    .eq('project_id', projectId)

  if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
