import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: userData } = await service.from('users').select('role').eq('id', user.id).single()
  if (userData?.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 })

  const { user_id } = await request.json()
  if (!user_id) return Response.json({ error: 'missing user_id' }, { status: 400 })

  const { error } = await service
    .from('subscriptions')
    .update({
      plan: 'free',
      status: 'active',
      paddle_subscription_id: null,
      paddle_customer_id: null,
      billing_period: null,
      current_period_start: null,
      current_period_end: null,
      cancelled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)

  if (error) {
    console.error('[admin/billing/deactivate]', error)
    return Response.json({ error: 'db_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
