import { Resend } from 'resend'
import { createSupabaseServiceClient } from '@/lib/db-server'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM ?? 'mdspec <noreply@mdspec.dev>'

export interface SyncResultSpec {
  path: string
  title?: string
  status: 'published' | 'failed' | string
  external_url: string | null
  last_error: string | null
}

export interface SendSyncEmailParams {
  to: string
  projectName: string
  targetType: string
  syncedAt: string
  specs: SyncResultSpec[]
}

const TARGET_LABELS: Record<string, string> = {
  notion: 'Notion',
  confluence: 'Confluence',
  clickup: 'ClickUp',
  s3: 'S3',
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

function specRow(spec: SyncResultSpec): string {
  const name = spec.title || fileName(spec.path)
  const pathLabel = `<span style="font-size:11px;color:#71717a;">${spec.path}</span>`

  const destination = spec.external_url
    ? `<a href="${spec.external_url}" style="color:#3b82f6;text-decoration:none;">View →</a>`
    : `<span style="color:#a1a1aa;">—</span>`

  const badge =
    spec.status === 'published'
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:#dcfce7;color:#16a34a;">Published</span>`
      : `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:#fee2e2;color:#dc2626;">Failed</span>`

  const errorRow =
    spec.status !== 'published' && spec.last_error
      ? `<tr>
          <td colspan="3" style="padding:4px 16px 10px 16px;font-size:11px;color:#dc2626;font-family:ui-monospace,monospace;word-break:break-all;">
            ${spec.last_error}
          </td>
        </tr>`
      : ''

  return `
    <tr style="border-top:1px solid #f4f4f5;">
      <td style="padding:10px 16px 4px 16px;vertical-align:top;">
        <div style="font-size:13px;font-weight:500;color:#18181b;">${name}</div>
        <div style="margin-top:2px;">${pathLabel}</div>
      </td>
      <td style="padding:10px 16px 4px 16px;vertical-align:top;font-size:13px;white-space:nowrap;">${destination}</td>
      <td style="padding:10px 16px 4px 16px;vertical-align:top;text-align:right;white-space:nowrap;">${badge}</td>
    </tr>${errorRow}`
}

function buildHtml(params: SendSyncEmailParams): string {
  const { projectName, targetType, syncedAt, specs } = params
  const targetLabel = TARGET_LABELS[targetType] ?? targetType
  const succeeded = specs.filter((s) => s.status === 'published').length
  const failed = specs.filter((s) => s.status !== 'published').length

  const summaryColor = failed > 0 ? '#dc2626' : '#16a34a'
  const summaryText =
    failed > 0
      ? `${succeeded} published &nbsp;·&nbsp; <span style="color:#dc2626;">${failed} failed</span>`
      : `${succeeded} published successfully`

  const rows = specs.map(specRow).join('')

  const date = new Date(syncedAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'UTC',
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Sync summary — ${projectName}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;border-radius:8px 8px 0 0;padding:20px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">mdspec</span>
                  </td>
                  <td align="right">
                    <span style="font-size:12px;color:#a1a1aa;">Sync summary</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Project banner -->
          <tr>
            <td style="background:#ffffff;padding:24px 28px 16px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <div style="font-size:18px;font-weight:600;color:#18181b;">${projectName}</div>
              <div style="margin-top:4px;font-size:13px;color:#71717a;">
                Synced to <strong style="color:#3f3f46;">${targetLabel}</strong> &nbsp;·&nbsp; ${date}
              </div>
            </td>
          </tr>

          <!-- Summary pill -->
          <tr>
            <td style="background:#ffffff;padding:0 28px 20px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <div style="display:inline-block;padding:6px 14px;border-radius:9999px;font-size:13px;font-weight:600;border:1.5px solid ${summaryColor}20;background:${failed > 0 ? '#fff1f2' : '#f0fdf4'};color:${summaryColor};">
                ${summaryText}
              </div>
            </td>
          </tr>

          <!-- Table header -->
          <tr>
            <td style="background:#f4f4f5;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;border-top:1px solid #e4e4e7;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 16px;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;width:60%;">File</td>
                  <td style="padding:8px 16px;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;width:20%;">Destination</td>
                  <td style="padding:8px 16px;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;width:20%;text-align:right;">Status</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Spec rows -->
          <tr>
            <td style="background:#ffffff;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${rows}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;padding:16px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#a1a1aa;">
                    You're receiving this because sync email notifications are enabled.
                    <a href="https://mdspec.dev/settings/account" style="color:#71717a;">Manage preferences</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendSyncEmail(params: SendSyncEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  const { specs } = params
  const failed = specs.filter((s) => s.status !== 'published').length
  const subject = failed > 0
    ? `[mdspec] Sync completed with ${failed} failure${failed > 1 ? 's' : ''} — ${params.projectName}`
    : `[mdspec] Sync completed — ${params.projectName}`

  const html = buildHtml(params)

  const { error } = await resend.emails.send({
    from: FROM,
    to: params.to,
    subject,
    html,
  })

  if (error) {
    console.error('[emailNotifier] failed to send sync email:', error)
  }
}

// ---------------------------------------------------------------------------
// Trigger from worker/process after runPublishGroup completes
// ---------------------------------------------------------------------------
export async function maybeSendSyncSummary(jobData: {
  project_id: string
  integration_id: string
  target_type: string
  specs: Array<{ spec_publish_target_id: string; path: string; title?: string }>
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  try {
    const supabase = createSupabaseServiceClient()

    // Fetch project + org
    const { data: project } = await supabase
      .from('projects')
      .select('id, org_id, name')
      .eq('id', jobData.project_id)
      .single()

    if (!project) return

    // Fetch org owner
    const { data: ownerMember } = await supabase
      .from('org_members')
      .select('user_id')
      .eq('org_id', project.org_id)
      .eq('role', 'owner')
      .single()

    if (!ownerMember) return

    // Check notification preference
    const { data: user } = await supabase
      .from('users')
      .select('email, email_notifications')
      .eq('id', ownerMember.user_id)
      .single()

    if (!user?.email_notifications) return

    // Fetch final publish statuses
    const targetIds = jobData.specs.map((s) => s.spec_publish_target_id)
    const { data: targets } = await supabase
      .from('spec_publish_targets')
      .select('id, status, external_url, last_error')
      .in('id', targetIds)

    if (!targets || targets.length === 0) return

    const statusById = new Map(targets.map((t) => [t.id, t]))

    const specResults: SyncResultSpec[] = jobData.specs.map((s) => {
      const t = statusById.get(s.spec_publish_target_id)
      return {
        path: s.path,
        title: s.title,
        status: t?.status ?? 'failed',
        external_url: t?.external_url ?? null,
        last_error: t?.last_error ?? null,
      }
    })

    await sendSyncEmail({
      to: user.email,
      projectName: project.name ?? jobData.project_id,
      targetType: jobData.target_type,
      syncedAt: new Date().toISOString(),
      specs: specResults,
    })

    console.log(`[emailNotifier] sync summary sent to ${user.email} (${specResults.length} specs)`)
  } catch (err) {
    // Non-fatal — never let email errors break the response
    console.error('[emailNotifier] maybeSendSyncSummary error:', err)
  }
}
