import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { project_id } = await request.json()
  if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const serviceClient = createSupabaseServiceClient()

  // Fetch project to check org membership
  const { data: project } = await serviceClient
    .from('projects')
    .select('id, org_id')
    .eq('id', project_id)
    .single()

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  // Check user is org admin/owner or project admin
  const { data: orgMembership } = await serviceClient
    .from('org_members')
    .select('role')
    .eq('org_id', project.org_id)
    .eq('user_id', user.id)
    .single()

  const { data: projectMembership } = await serviceClient
    .from('project_members')
    .select('role')
    .eq('project_id', project_id)
    .eq('user_id', user.id)
    .single()

  const isOrgAdmin = orgMembership && ['owner', 'admin'].includes(orgMembership.role)
  const isProjectAdmin = projectMembership?.role === 'admin'

  if (!isOrgAdmin && !isProjectAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Check max 3 active tokens
  const { count } = await serviceClient
    .from('project_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', project_id)
    .eq('revoked', false)

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: 'Maximum 3 active tokens per project. Revoke one first.' }, { status: 422 })
  }

  // Generate token: mds_<project_id_short>_<hex32>
  const projectIdShort = project_id.replace(/-/g, '').slice(0, 8)
  const randomHex = randomBytes(16).toString('hex') // 32 hex chars
  const rawToken = `mds_${projectIdShort}_${randomHex}`
  const tokenHint = rawToken.slice(-6)

  const tokenHash = await bcrypt.hash(rawToken, 10)

  const { error } = await serviceClient.from('project_tokens').insert({
    project_id,
    token_hash: tokenHash,
    token_hint: tokenHint,
    created_by: user.id,
  })

  if (error) return NextResponse.json({ error: 'failed to create token' }, { status: 500 })

  return NextResponse.json({ token: rawToken }, { status: 201 })
}
