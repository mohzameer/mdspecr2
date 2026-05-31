import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: project, error } = await supabase
    .from('projects')
    .select('id, name, description, registered_repo, default_integration, default_type, publish_count, created_at')
    .eq('id', projectId)
    .single()

  if (error || !project) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(project)
}
