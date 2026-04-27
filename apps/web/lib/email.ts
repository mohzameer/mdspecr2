import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'mdspec Support <support@mdspec.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mdspec.dev'

export async function sendUserNewReplyEmail({
  toEmail,
  ticketTitle,
  ticketId,
}: {
  toEmail: string
  ticketTitle: string
  ticketId: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const subject = `New reply on your support ticket: ${ticketTitle}`
  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html: `
        <p>Hi,</p>
        <p>The support team has replied to your ticket <strong>${ticketTitle}</strong>.</p>
        <p>
          <a href="${APP_URL}/settings/support/${ticketId}">View the conversation →</a>
        </p>
        <p style="color:#6b7280;font-size:12px;">You're receiving this because you submitted a support ticket on mdspec.</p>
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
        <p>
          <a href="${APP_URL}/support-tickets/${ticketId}">View the ticket →</a>
        </p>
      `,
    })
    console.log('[email] sent admin_reply_notification to', adminEmails, 'for ticket', ticketId)
  } catch (err) {
    console.error('[email] failed admin_reply_notification to', adminEmails, err)
  }
}
