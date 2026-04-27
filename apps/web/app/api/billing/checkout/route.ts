import { createSupabaseServerClient } from '@/lib/db-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') === 'yearly' ? 'yearly' : 'monthly'

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.redirect(new URL('/login', request.url))

  const priceId = period === 'yearly'
    ? process.env.PADDLE_PRICE_YEARLY
    : process.env.PADDLE_PRICE_MONTHLY

  const apiBase = process.env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox'
    ? 'https://sandbox-api.paddle.com'
    : 'https://api.paddle.com'

  console.log('[billing/checkout] debug', {
    PADDLE_ENV: process.env.NEXT_PUBLIC_PADDLE_ENV,
    apiBase,
    priceId,
    keyPrefix: process.env.PADDLE_API_KEY?.slice(0, 12),
  })

  const res = await fetch(`${apiBase}/transactions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { user_id: user.id },
    }),
  })

  const json = await res.json()
  const transactionId = json?.data?.id
  if (!transactionId) {
    console.error('[billing/checkout] Paddle error', { status: res.status, body: json })
    return Response.json({ error: 'checkout_failed' }, { status: 500 })
  }

  return Response.json({ transactionId })
}
