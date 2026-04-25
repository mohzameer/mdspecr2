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

  const apiBase = process.env.PADDLE_ENV === 'sandbox'
    ? 'https://sandbox-api.paddle.com'
    : 'https://api.paddle.com'

  const res = await fetch(`${apiBase}/transactions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { user_id: user.id },
      checkout: {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?upgraded=1`,
      },
    }),
  })

  const json = await res.json()
  const checkoutUrl = json?.data?.checkout?.url
  if (!checkoutUrl) return Response.json({ error: 'checkout_failed' }, { status: 500 })

  return Response.redirect(checkoutUrl)
}
