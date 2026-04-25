import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const orgId = cookieStore.get('current_org_id')?.value
  if (!orgId) return NextResponse.json({ error: 'no org selected' }, { status: 400 })

  // Check org admin/owner
  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: ownerMember } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .single()

  const { data: subscription } = ownerMember
    ? await supabase.from('subscriptions').select('plan').eq('user_id', ownerMember.user_id).single()
    : { data: null }

  if (!subscription || subscription.plan === 'free') {
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
    if ((count ?? 0) >= 1) {
      return NextResponse.json({ error: 'project_limit_reached', limit: 1 }, { status: 402 })
    }
  }

  const { name, description, spec_dirs } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ org_id: orgId, name: name.trim(), description: description?.trim() ?? null, spec_dirs: spec_dirs ?? [] })
    .select()
    .single()

  if (error || !project) return NextResponse.json({ error: 'failed to create project' }, { status: 500 })

  return NextResponse.json(project, { status: 201 })
}
