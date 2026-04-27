import { Resend } from 'resend'
import { createSupabaseServiceClient } from '@/lib/db-server'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'MDSpec <support@mdspec.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mdspec.dev'

function unsubscribeUrl(userId: string) {
  return `${APP_URL}/api/support/unsubscribe?uid=${userId}`
}

function unsubscribeFooter(userId: string) {
  return `<p style="color:#9ca3af;font-size:11px;margin-top:24px">
    You're receiving this because you submitted a support ticket on mdspec. &nbsp;
    <a href="${unsubscribeUrl(userId)}" style="color:#9ca3af">Unsubscribe</a>
  </p>`
}

async function isEmailEnabled(userId: string): Promise<boolean> {
  const { data } = await createSupabaseServiceClient()
    .from('users')
    .select('email_notifications')
    .eq('id', userId)
    .single()
  return data?.email_notifications !== false
}

export async function sendUserNewReplyEmail({
  userId,
  toEmail,
  ticketTitle,
  ticketId,
}: {
  userId: string
  toEmail: string
  ticketTitle: string
  ticketId: string
}) {
  if (!process.env.RESEND_API_KEY) return
  if (!(await isEmailEnabled(userId))) return

  const subject = `New reply on your support ticket: ${ticketTitle}`
  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html: `
        <p>Hi,</p>
        <p>The support team has replied to your ticket <strong>${ticketTitle}</strong>.</p>
        <p><a href="${APP_URL}/settings/support/${ticketId}">View the conversation →</a></p>
        ${unsubscribeFooter(userId)}
      `,
    })
    console.log('[email] sent user_reply_notification to', toEmail, 'for ticket', ticketId)
  } catch (err) {
    console.error('[email] failed user_reply_notification to', toEmail, err)
  }
}

export async function sendAdminNewReplyEmail({
  adminEmails,
  userEmail,
  ticketTitle,
  ticketId,
}: {
  adminEmails: string[]
  userEmail: string
  ticketTitle: string
  ticketId: string
}) {
  if (!process.env.RESEND_API_KEY || adminEmails.length === 0) return

  const subject = `User replied on ticket: ${ticketTitle}`
  try {
    await resend.emails.send({
      from: FROM,
      to: adminEmails,
      subject,
      html: `
        <p>${userEmail} has replied to support ticket <strong>${ticketTitle}</strong>.</p>
        <p><a href="${APP_URL}/support-tickets/${ticketId}">View the ticket →</a></p>
      `,
    })
    console.log('[email] sent admin_reply_notification to', adminEmails, 'for ticket', ticketId)
  } catch (err) {
    console.error('[email] failed admin_reply_notification to', adminEmails, err)
  }
}
