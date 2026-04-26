import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const service = createSupabaseServiceClient()
  const [{ error: userErr }, { error: subErr }] = await Promise.all([
    service.from('users').upsert(
      { id: user.id, email: user.email },
      { onConflict: 'id', ignoreDuplicates: true }
    ),
    service.from('subscriptions').upsert(
      { user_id: user.id, plan: 'free', status: 'active' },
      { onConflict: 'user_id', ignoreDuplicates: true }
    ),
  ])

  if (userErr) console.error('[auth/setup] user upsert failed', { userId: user.id, error: userErr.message })
  if (subErr) console.error('[auth/setup] subscription upsert failed', { userId: user.id, error: subErr.message })

  return NextResponse.json({ ok: true })
}
