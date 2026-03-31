import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { randomBytes, createHash } from 'crypto'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { org_id, email, role } = await request.json()
  if (!org_id || !email || !role) {
    return NextResponse.json({ error: 'org_id, email, and role required' }, { status: 400 })
  }

  // Check user is org admin/owner
  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', org_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invite, error } = await supabase
    .from('org_invites')
    .insert({
      org_id,
      invited_by: user.id,
      email,
      role,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // In production, send invite email here with the rawToken as the link parameter
  // For V1, return the invite token for testing purposes
  return NextResponse.json({ invite_id: invite.id, token: rawToken }, { status: 201 })
}
