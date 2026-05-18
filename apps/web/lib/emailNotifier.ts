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

export interface SyncResultGroup {
  target_type: string
  specs: SyncResultSpec[]
}

export interface SendSyncEmailParams {
  to: string
  projectName: string
  syncedAt: string
  groups: SyncResultGroup[]
}

const TARGET_LABELS: Record<string, string> = {
  notion: 'Notion',
  confluence: 'Confluence',
  clickup: 'ClickUp',
  s3: 'S3',
}

const TARGET_ICONS: Record<string, string> = {
  notion: '📄',
  confluence: '🔷',
  clickup: '🟣',
  s3: '🪣',
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

function integrationSection(group: SyncResultGroup): string {
  const label = TARGET_LABELS[group.target_type] ?? group.target_type
  const icon = TARGET_ICONS[group.target_type] ?? ''
  const succeeded = group.specs.filter((s) => s.status === 'published').length
  const failed = group.specs.filter((s) => s.status !== 'published').length

  const pill = failed > 0
    ? `<span style="font-size:11px;font-weight:600;color:#dc2626;">${succeeded} published · ${failed} failed</span>`
    : `<span style="font-size:11px;font-weight:600;color:#16a34a;">${succeeded} published</span>`

  const rows = group.specs.map(specRow).join('')

  return `
    <!-- Integration header -->
    <tr>
      <td style="background:#f4f4f5;border-top:1px solid #e4e4e7;padding:8px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;font-weight:700;color:#3f3f46;text-transform:uppercase;letter-spacing:0.06em;">
              ${icon}&nbsp;${label}
            </td>
            <td align="right">${pill}</td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Specs -->
    ${rows}`
}

function buildHtml(params: SendSyncEmailParams): string {
  const { projectName, syncedAt, groups } = params

  const totalSucceeded = groups.reduce((n, g) => n + g.specs.filter((s) => s.status === 'published').length, 0)
  const totalFailed = groups.reduce((n, g) => n + g.specs.filter((s) => s.status !== 'published').length, 0)
  const totalSpecs = totalSucceeded + totalFailed

  const summaryColor = totalFailed > 0 ? '#dc2626' : '#16a34a'
  const summaryText =
    totalFailed > 0
      ? `${totalSucceeded} published &nbsp;·&nbsp; <span style="color:#dc2626;">${totalFailed} failed</span>`
      : `${totalSucceeded} of ${totalSpecs} published successfully`

  const integrationNames = groups.map((g) => TARGET_LABELS[g.target_type] ?? g.target_type).join(', ')

  const date = new Date(syncedAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'UTC',
  })

  const sections = groups.map(integrationSection).join('')

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
            <td style="background:#ffffff;padding:24px 28px 8px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <div style="font-size:18px;font-weight:600;color:#18181b;">${projectName}</div>
              <div style="margin-top:4px;font-size:13px;color:#71717a;">
                → <strong style="color:#3f3f46;">${integrationNames}</strong> &nbsp;·&nbsp; ${date}
              </div>
            </td>
          </tr>

          <!-- Summary pill -->
          <tr>
            <td style="background:#ffffff;padding:12px 28px 20px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <div style="display:inline-block;padding:6px 14px;border-radius:9999px;font-size:13px;font-weight:600;border:1.5px solid ${summaryColor}33;background:${totalFailed > 0 ? '#fff1f2' : '#f0fdf4'};color:${summaryColor};">
                ${summaryText}
              </div>
            </td>
          </tr>

          <!-- Per-integration sections -->
          <tr>
            <td style="background:#ffffff;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${sections}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;padding:16px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#a1a1aa;">
                    You're receiving this because sync email notifications are enabled.&nbsp;
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

  const totalFailed = params.groups.reduce((n, g) => n + g.specs.filter((s) => s.status !== 'published').length, 0)
  const subject = totalFailed > 0
    ? `[mdspec] Sync completed with ${totalFailed} failure${totalFailed > 1 ? 's' : ''} — ${params.projectName}`
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
// Called from worker/process after each group completes.
// Atomically records the group result. When this is the last group for the
// sync run, fetches all accumulated results and sends one consolidated email.
// Falls back to per-group email if no sync_run_id is present (legacy path).
// ---------------------------------------------------------------------------
export async function maybeSendSyncSummary(jobData: {
  project_id: string
  integration_id: string
  target_type: string
  sync_run_id?: string
  specs: Array<{ spec_publish_target_id: string; path: string; title?: string }>
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  try {
    const supabase = createSupabaseServiceClient()

    // Fetch final publish statuses for this group
    const targetIds = jobData.specs.map((s) => s.spec_publish_target_id)
    const { data: targets } = await supabase
      .from('spec_publish_targets')
      .select('id, status, external_url, last_error')
      .in('id', targetIds)

    const statusById = new Map((targets ?? []).map((t) => [t.id, t]))
    const groupSpecs: SyncResultSpec[] = jobData.specs.map((s) => {
      const t = statusById.get(s.spec_publish_target_id)
      return {
        path: s.path,
        title: s.title,
        status: t?.status ?? 'failed',
        external_url: t?.external_url ?? null,
        last_error: t?.last_error ?? null,
      }
    })

    const groupResult = { target_type: jobData.target_type, specs: groupSpecs }

    // -----------------------------------------------------------------------
    // No sync_run_id → single-group publish (or legacy). Send immediately.
    // -----------------------------------------------------------------------
    if (!jobData.sync_run_id) {
      const recipientInfo = await fetchRecipient(supabase, jobData.project_id)
      if (!recipientInfo) return

      await sendSyncEmail({
        to: recipientInfo.email,
        projectName: recipientInfo.projectName,
        syncedAt: new Date().toISOString(),
        groups: [groupResult],
      })
      console.log(`[emailNotifier] sync email sent (single group) to ${recipientInfo.email}`)
      return
    }

    // -----------------------------------------------------------------------
    // Atomically record this group. If we're the last, collect all results
    // and send the consolidated email.
    // -----------------------------------------------------------------------
    const { data: rows } = await supabase.rpc('complete_sync_group' as never, {
      p_sync_run_id: jobData.sync_run_id,
      p_group_result: groupResult,
    }) as { data: Array<{ completed_groups: number; total_groups: number }> | null }

    const row = rows?.[0]
    if (!row) {
      console.warn(`[emailNotifier] complete_sync_group returned no row for run ${jobData.sync_run_id}`)
      return
    }

    if (row.completed_groups < row.total_groups) {
      // Other groups still in flight — not our turn to send.
      console.log(`[emailNotifier] run ${jobData.sync_run_id}: ${row.completed_groups}/${row.total_groups} groups done`)
      return
    }

    // Last group — fetch accumulated results and send.
    const { data: syncRun } = await supabase
      .from('sync_runs')
      .select('results')
      .eq('id', jobData.sync_run_id)
      .single()

    const allGroups: SyncResultGroup[] = (syncRun?.results as SyncResultGroup[] | null) ?? [groupResult]

    const recipientInfo = await fetchRecipient(supabase, jobData.project_id)
    if (!recipientInfo) return

    await sendSyncEmail({
      to: recipientInfo.email,
      projectName: recipientInfo.projectName,
      syncedAt: new Date().toISOString(),
      groups: allGroups,
    })

    console.log(`[emailNotifier] consolidated sync email sent to ${recipientInfo.email} (${allGroups.length} integrations, run ${jobData.sync_run_id})`)

    // Clean up — best-effort, non-blocking
    supabase.from('sync_runs').delete().eq('id', jobData.sync_run_id).then(() => {})
  } catch (err) {
    // Never let email logic break the worker response
    console.error('[emailNotifier] maybeSendSyncSummary error:', err)
  }
}

// ---------------------------------------------------------------------------
// Shared helper: look up org owner + check email_notifications preference
// ---------------------------------------------------------------------------
async function fetchRecipient(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  projectId: string
): Promise<{ email: string; projectName: string } | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id, name')
    .eq('id', projectId)
    .single()

  if (!project) return null

  const { data: ownerMember } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', project.org_id)
    .eq('role', 'owner')
    .single()

  if (!ownerMember) return null

  const { data: user } = await supabase
    .from('users')
    .select('email, email_notifications')
    .eq('id', ownerMember.user_id)
    .single()

  if (!user?.email_notifications) return null

  return { email: user.email, projectName: project.name ?? projectId }
}
