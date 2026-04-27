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
    console.error('[paddle webhook] invalid signature', { signature, secretPrefix: secret.slice(0, 10) })
    return Response.json({ error: 'invalid_signature' }, { status: 400 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    console.error('[paddle webhook] invalid json', rawBody.slice(0, 200))
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const eventType = event.event_type as string
  const eventId = event.notification_id as string
  const data = event.data as Record<string, unknown>
  const customData = data?.custom_data as Record<string, string> | undefined
  let userId = customData?.user_id

  const supabase = createSupabaseServiceClient()

  // Subscription events don't carry transaction custom_data — look up by paddle_subscription_id
  if (!userId) {
    const subscriptionId = data?.id as string | undefined
    if (subscriptionId) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('paddle_subscription_id', subscriptionId)
        .maybeSingle()
      userId = sub?.user_id
    }
  }

  console.log('[paddle webhook] received', { eventType, eventId, userId, customData })

  if (!userId || !eventId) {
    console.error('[paddle webhook] missing user_id or event_id', { userId, eventId, customData, dataId: data?.id })
    return Response.json({ error: 'missing user_id or event_id' }, { status: 400 })
  }

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
  let dbError: unknown = null

  switch (eventType) {
    case 'subscription.created': {
      const { error } = await supabase
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
      dbError = error
      break
    }

    case 'subscription.updated': {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          billing_period: billingPeriod,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      dbError = error
      break
    }

    case 'subscription.cancelled': {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          plan: 'free',
          status: 'cancelled',
          cancelled_at: currentPeriodEnd ?? new Date().toISOString(),
          paddle_subscription_id: null,
          paddle_customer_id: null,
          billing_period: null,
          current_period_start: null,
          current_period_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      dbError = error
      break
    }

    case 'transaction.completed': {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      dbError = error
      break
    }

    case 'transaction.payment_failed': {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'payment_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      dbError = error
      break
    }

    default:
      console.log('[paddle webhook] unhandled event type', eventType)
  }

  if (dbError) {
    console.error('[paddle webhook] db update failed', { eventType, userId, error: dbError })
    return Response.json({ error: 'db_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
