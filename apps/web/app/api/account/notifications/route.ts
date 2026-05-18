import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: { email_notifications?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  if (typeof body.email_notifications !== 'boolean') {
    return Response.json({ error: 'email_notifications must be a boolean' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('users')
    .update({ email_notifications: body.email_notifications })
    .eq('id', user.id)

  if (error) {
    console.error('[account/notifications] update error', error)
    return Response.json({ error: 'update_failed' }, { status: 500 })
  }

  return Response.json({ email_notifications: body.email_notifications })
}
