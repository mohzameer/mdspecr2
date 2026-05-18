import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'
import { resolveOrgId } from '@/lib/resolveOrgId'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cookieStore = await cookies()
  const orgId = await resolveOrgId(supabase, user.id, cookieStore)
  if (!orgId) return NextResponse.json({ error: 'no org' }, { status: 400 })

  const { type } = await request.json()

  await supabase
    .from('integrations')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('type', type)

  return NextResponse.json({ ok: true })
}
