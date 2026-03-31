import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/db-server'
import bcrypt from 'bcryptjs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const authHeader = request.headers.get('Authorization')
  const rawToken = authHeader?.replace('Bearer ', '').trim()

  if (!rawToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createSupabaseServiceClient()

  // Fetch active tokens for the project
  const { data: tokens } = await supabase
    .from('project_tokens')
    .select('id, token_hash')
    .eq('project_id', projectId)
    .eq('revoked', false)

  let valid = false
  for (const token of tokens ?? []) {
    if (await bcrypt.compare(rawToken, token.token_hash)) {
      valid = true
      break
    }
  }

  if (!valid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, spec_dirs, registered_repo')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ spec_dirs: project.spec_dirs, name: project.name })
}
