import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/db-server'

function html(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#374151}
    h1{font-size:20px}p{color:#6b7280;font-size:14px}a{color:#111827}</style></head>
    <body><h1>${title}</h1>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const uid    = searchParams.get('uid')
  const action = searchParams.get('action') ?? 'unsubscribe'

  if (!uid) {
    return html('Invalid link', '<p>This unsubscribe link is invalid or has expired.</p>')
  }

  const service = createSupabaseServiceClient()
  const { data: user, error } = await service
    .from('users')
    .select('id, email_notifications')
    .eq('id', uid)
    .single()

  if (error || !user) {
    return html('Invalid link', '<p>This unsubscribe link is invalid or has expired.</p>')
  }

  const unsubscribing = action !== 'resubscribe'
  await service
    .from('users')
    .update({ email_notifications: !unsubscribing })
    .eq('id', uid)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mdspec.dev'

  if (unsubscribing) {
    return html(
      'Unsubscribed',
      `<p>You've been unsubscribed from support ticket email notifications.</p>
       <p><a href="${appUrl}/api/support/unsubscribe?uid=${uid}&action=resubscribe">Resubscribe</a></p>`
    )
  }

  return html(
    'Resubscribed',
    `<p>You'll now receive email notifications for support ticket replies.</p>
     <p><a href="${appUrl}/dashboard">Back to dashboard</a></p>`
  )
}
