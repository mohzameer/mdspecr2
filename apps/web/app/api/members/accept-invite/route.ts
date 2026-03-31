import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { createHash } from 'crypto'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Redirect to login with the invite token as next param
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(`/api/members/accept-invite?token=${token}`)}`, request.url)
    )
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { data: invite } = await supabase
    .from('org_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .single()

  if (!invite) return NextResponse.json({ error: 'invalid invite token' }, { status: 400 })
  if (invite.status !== 'pending') return NextResponse.json({ error: `invite is ${invite.status}` }, { status: 400 })
  if (new Date(invite.expires_at) < new Date()) {
    await supabase.from('org_invites').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: 'invite expired' }, { status: 400 })
  }

  // Add to org
  await supabase.from('org_members').upsert(
    { org_id: invite.org_id, user_id: user.id, role: invite.role },
    { onConflict: 'org_id,user_id' }
  )

  // Mark invite accepted
  await supabase.from('org_invites').update({ status: 'accepted' }).eq('id', invite.id)

  // Switch to this org
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set('current_org_id', invite.org_id, { path: '/', httpOnly: true, sameSite: 'lax' })

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
