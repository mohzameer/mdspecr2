import { createHmac } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/db-server'

function verifyPaddleSignature(rawBody: string, signature: string, secret: string): boolean {
  const parts = Object.fromEntries(signature.split(';').map((p) => p.split('=')))
  const ts = parts['ts']
  const h1 = parts['h1']
  if (!ts || !h1) return false
  const payload = `${ts}:${rawBody}`
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')
  return hmac === h1
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('Paddle-Signature') ?? ''
  const secret = process.env.PADDLE_WEBHOOK_SECRET

  if (!secret) {
    console.error('[paddle webhook] PADDLE_WEBHOOK_SECRET not set')
    return Response.json({ error: 'webhook not configured' }, { status: 500 })
  }

  if (!verifyPaddleSignature(rawBody, signature, secret)) {
    const parts = Object.fromEntries(signature.split(';').map((p) => p.split('=')))
    const computed = createHmac('sha256', secret).update(`${parts['ts']}:${rawBody}`).digest('hex')
    console.error('[paddle webhook] signature verification failed', {
      secretPrefix: secret.slice(0, 8),
      secretLength: secret.length,
      ts: parts['ts'],
      h1Received: parts['h1'],
      h1Computed: computed,
      bodyLength: rawBody.length,
      bodyPreview: rawBody.slice(0, 100),
    })
    return Response.json({ error: 'invalid_signature' }, { status: 400 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const eventType = event.event_type as string
  const eventId = event.notification_id as string
  const data = event.data as Record<string, unknown>
  const customData = data?.custom_data as Record<string, string> | undefined
  const userId = customData?.user_id

  if (!userId || !eventId) {
    console.error('[paddle webhook] missing user_id or event_id', { eventType, userId, eventId, customData })
    return Response.json({ error: 'missing user_id or event_id' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // Idempotency check
  const { data: existing } = await supabase
    .from('billing_events')
    .select('id')
    .eq('paddle_event_id', eventId)
    .maybeSingle()

  if (existing) return Response.json({ ok: true, skipped: true })

  // Log the event
  await supabase.from('billing_events').insert({
    user_id: userId,
    event_type: eventType,
    paddle_event_id: eventId,
    payload: event,
  })

  const subscriptionId = data?.id as string | undefined
  const customerId = (data?.customer_id ?? (data?.customer as Record<string, unknown>)?.id) as string | undefined
  const billingCycle = data?.billing_cycle as Record<string, string> | undefined
  const billingPeriod = billingCycle?.interval === 'year' ? 'yearly' : 'monthly'
  const currentPeriodStart = (data?.current_billing_period as Record<string, string> | undefined)?.starts_at
  const currentPeriodEnd = (data?.current_billing_period as Record<string, string> | undefined)?.ends_at

  // Process event
  switch (eventType) {
    case 'subscription.created':
      await supabase
        .from('subscriptions')
        .update({
          plan: 'pro',
          status: 'active',
          paddle_subscription_id: subscriptionId,
          paddle_customer_id: customerId,
          billing_period: billingPeriod,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      break

    case 'subscription.updated':
      await supabase
        .from('subscriptions')
        .update({
          billing_period: billingPeriod,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      break

    case 'subscription.cancelled':
      await supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: currentPeriodEnd ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      break

    case 'transaction.completed':
      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      break

    case 'transaction.payment_failed':
      await supabase
        .from('subscriptions')
        .update({
          status: 'payment_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      break
  }

  return Response.json({ ok: true })
}
