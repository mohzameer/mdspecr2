import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  // Verify the caller is authenticated and belongs to the project's org
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects')
    .select('org_id')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: orgMember } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', project.org_id)
    .eq('user_id', user.id)
    .single()

  if (!orgMember) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Use service client to bypass RLS for the bulk delete
  const service = createSupabaseServiceClient()
  const { error, count } = await service
    .from('specs')
    .delete({ count: 'exact' })
    .eq('project_id', projectId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: count })
}
