import { createSupabaseServerClient } from '@/lib/db-server'

const PADDLE_API_BASE = process.env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox'
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com'

export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('paddle_subscription_id, status, plan')
    .eq('user_id', user.id)
    .single()

  if (!sub || sub.plan === 'free') {
    return Response.json({ error: 'no_active_subscription' }, { status: 400 })
  }
  if (sub.status === 'cancelled') {
    return Response.json({ error: 'already_cancelled' }, { status: 400 })
  }
  if (!sub.paddle_subscription_id) {
    return Response.json({ error: 'no_paddle_subscription' }, { status: 400 })
  }

const res = await fetch(`${PADDLE_API_BASE}/subscriptions/${sub.paddle_subscription_id}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ effective_from: 'next_billing_period' }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Subscription already has a pending cancel scheduled — treat as success
    if (body?.error?.code === 'subscription_locked_pending_changes') {
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('user_id', user.id)
      return Response.json({ ok: true })
    }
    console.error('[billing/cancel] Paddle error', body)
    return Response.json({ error: 'paddle_error' }, { status: 502 })
  }

  // Optimistically mark as cancelled in DB — the webhook will also fire and confirm
  await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', user.id)

  return Response.json({ ok: true })
}
