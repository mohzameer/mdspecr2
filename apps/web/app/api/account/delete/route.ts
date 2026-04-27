import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

const PADDLE_API_BASE = process.env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox'
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com'

export async function DELETE() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // 1. Find orgs where this user is the sole owner — delete them so they don't orphan
  const { data: ownedMemberships } = await service
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')

  for (const { org_id } of ownedMemberships ?? []) {
    const { count } = await service
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .eq('role', 'owner')

    if ((count ?? 0) <= 1) {
      await service.from('organizations').delete().eq('id', org_id)
    }
  }

  // 2. Cancel active Paddle subscription (best-effort — don't block deletion on failure)
  const { data: sub } = await service
    .from('subscriptions')
    .select('paddle_subscription_id, status, plan')
    .eq('user_id', user.id)
    .single()

  if (sub?.plan === 'pro' && sub.status === 'active' && sub.paddle_subscription_id) {
    await fetch(`${PADDLE_API_BASE}/subscriptions/${sub.paddle_subscription_id}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ effective_from: 'immediately' }),
    }).catch((err) => console.error('[account/delete] paddle cancel error', err))
  }

  // 3. Delete the auth user — cascades to public.users, org_members, subscriptions, etc.
  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[account/delete] deleteUser error', error)
    return Response.json({ error: 'delete_failed' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
