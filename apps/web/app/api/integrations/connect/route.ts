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

  const { type, credentials, config } = await request.json()

  // TODO: Encrypt credentials via Supabase Vault before storing
  const { error } = await supabase
    .from('integrations')
    .upsert(
      { org_id: orgId, type, status: 'connected', credentials, config, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,type' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
