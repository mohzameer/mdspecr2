import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const { supabase, user, project } = await getProjectAndRole(projectId)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: templates, error } = await supabase
    .from('templates')
    .select('*')
    .eq('org_id', project.org_id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })

  // Count how many folder_mappings reference each template
  const { data: mappingCounts } = await supabase
    .from('folder_mappings')
    .select('template_id')
    .eq('project_id', projectId)
    .not('template_id', 'is', null)

  const countMap: Record<string, number> = {}
  for (const row of mappingCounts ?? []) {
    if (row.template_id) countMap[row.template_id] = (countMap[row.template_id] ?? 0) + 1
  }

  const result = (templates ?? []).map((t) => ({ ...t, folder_count: countMap[t.id] ?? 0 }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const { supabase, user, project, canEdit } = await getProjectAndRole(projectId)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!canEdit) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, instructions } = body

  if (!name?.trim()) return NextResponse.json({ error: 'name_required' }, { status: 400 })
  if (!instructions?.trim()) return NextResponse.json({ error: 'instructions_required' }, { status: 400 })
  if (instructions.length > 4000) return NextResponse.json({ error: 'instructions_too_long' }, { status: 400 })

  const { data: template, error } = await supabase
    .from('templates')
    .insert({
      org_id: project.org_id,
      name: name.trim(),
      description: description?.trim() ?? null,
      instructions: instructions.trim(),
      is_default: false,
      created_by: user.id,
    })
    .select()
    .single()

  if (error || !template) return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  return NextResponse.json(template, { status: 201 })
}
