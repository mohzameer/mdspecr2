import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token_id } = await request.json()
  if (!token_id) return NextResponse.json({ error: 'token_id required' }, { status: 400 })

  const serviceClient = createSupabaseServiceClient()

  // Fetch the token to get project_id and verify it exists
  const { data: existingToken } = await serviceClient
    .from('project_tokens')
    .select('id, project_id, revoked')
    .eq('id', token_id)
    .single()

  if (!existingToken) return NextResponse.json({ error: 'token not found' }, { status: 404 })
  if (existingToken.revoked) return NextResponse.json({ error: 'token already revoked' }, { status: 422 })

  const project_id = existingToken.project_id

  // Check user is org admin/owner or project admin
  const { data: project } = await serviceClient
    .from('projects')
    .select('org_id')
    .eq('id', project_id)
    .single()

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

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

  // Revoke the old token
  const { error: revokeError } = await serviceClient
    .from('project_tokens')
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq('id', token_id)

  if (revokeError) return NextResponse.json({ error: 'failed to revoke token' }, { status: 500 })

  // Generate new token
  const projectIdShort = project_id.replace(/-/g, '').slice(0, 8)
  const randomHex = randomBytes(16).toString('hex')
  const rawToken = `mds_${projectIdShort}_${randomHex}`
  const tokenHint = rawToken.slice(-6)
  const tokenHash = await bcrypt.hash(rawToken, 10)

  const { error: insertError } = await serviceClient.from('project_tokens').insert({
    project_id,
    token_hash: tokenHash,
    token_hint: tokenHint,
    created_by: user.id,
  })

  if (insertError) return NextResponse.json({ error: 'failed to create replacement token' }, { status: 500 })

  return NextResponse.json({ token: rawToken }, { status: 201 })
}
