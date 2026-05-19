import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

const VALID_MODES = ['always', 'failures_only', 'never'] as const
type NotificationMode = typeof VALID_MODES[number]

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: { email_notification_mode?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  if (!VALID_MODES.includes(body.email_notification_mode as NotificationMode)) {
    return Response.json(
      { error: `email_notification_mode must be one of: ${VALID_MODES.join(', ')}` },
      { status: 400 }
    )
  }

  const mode = body.email_notification_mode as NotificationMode
  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('users')
    .update({ email_notification_mode: mode })
    .eq('id', user.id)

  if (error) {
    console.error('[account/notifications] update error', error)
    return Response.json({ error: 'update_failed' }, { status: 500 })
  }

  return Response.json({ email_notification_mode: mode })
}
