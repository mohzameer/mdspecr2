import { Resend } from 'resend'
import { createSupabaseServiceClient } from '@/lib/db-server'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM ?? 'MDSpec <noreply@mdspec.dev>'

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

  const destination = spec.external_url
    ? `<a href="${spec.external_url}" style="color:#3b82f6;text-decoration:none;font-size:13px;">View &#8594;</a>`
    : `<span style="color:#a1a1aa;font-size:13px;">&#8212;</span>`

  const badgeColor = spec.status === 'published' ? '#16a34a' : '#dc2626'
  const badgeBg    = spec.status === 'published' ? '#dcfce7' : '#fee2e2'
  const badgeText  = spec.status === 'published' ? 'Published' : 'Failed'

  const errorRow =
    spec.status !== 'published' && spec.last_error
      ? `<tr>
          <td colspan="3" style="padding:0 16px 10px 16px;font-size:11px;color:#dc2626;font-family:ui-monospace,monospace;word-break:break-all;">${spec.last_error}</td>
        </tr>`
      : ''

  return `
    <tr style="border-top:1px solid #f4f4f5;">
      <td width="58%" style="padding:10px 8px 4px 16px;vertical-align:top;">
        <div style="font-size:13px;font-weight:500;color:#18181b;margin:0 0 2px 0;">${name}</div>
        <div style="font-size:11px;color:#71717a;">${spec.path}</div>
      </td>
      <td width="24%" style="padding:10px 8px 4px 8px;vertical-align:top;">${destination}</td>
      <td width="18%" style="padding:10px 16px 4px 8px;vertical-align:top;text-align:right;">
        <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${badgeBg};color:${badgeColor};">${badgeText}</span>
      </td>
    </tr>${errorRow}`
}

function integrationSection(group: SyncResultGroup): string {
  const label = TARGET_LABELS[group.target_type] ?? group.target_type
  const icon = TARGET_ICONS[group.target_type] ?? ''
  const succeeded = group.specs.filter((s) => s.status === 'published').length
  const failed = group.specs.filter((s) => s.status !== 'published').length

  const pillColor = failed > 0 ? '#dc2626' : '#16a34a'
  const pillText  = failed > 0
    ? `${succeeded} published &bull; ${failed} failed`
    : `${succeeded} published`

  const rows = group.specs.map(specRow).join('')

  return `
    <tr>
      <td colspan="3" style="background:#f4f4f5;border-top:1px solid #e4e4e7;padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 16px;font-size:12px;font-weight:700;color:#3f3f46;text-transform:uppercase;letter-spacing:0.06em;">${icon}&nbsp;${label}</td>
            <td style="padding:8px 16px;text-align:right;font-size:11px;font-weight:600;color:${pillColor};">${pillText}</td>
          </tr>
        </table>
      </td>
    </tr>
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
      ? `${totalSucceeded} published &bull; <span style="color:#dc2626;">${totalFailed} failed</span>`
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
                    <span style="font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">MDSpec</span>
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
                &#8594; <strong style="color:#3f3f46;">${integrationNames}</strong> &bull; ${date}
              </div>
            </td>
          </tr>

          <!-- Summary pill -->
          <tr>
            <td style="background:#ffffff;padding:12px 28px 20px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 14px;border-radius:10px;font-size:13px;font-weight:600;background:${totalFailed > 0 ? '#fff1f2' : '#f0fdf4'};color:${summaryColor};">
                    ${summaryText}
                  </td>
                </tr>
              </table>
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
    ? `[MDSpec] Sync completed with ${totalFailed} failure${totalFailed > 1 ? 's' : ''} — ${params.projectName}`
    : `[MDSpec] Sync completed — ${params.projectName}`

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
// Sent immediately when an integration is flipped to unhealthy due to an
// auth failure during a sync. Gives the user a direct link to reconnect.
// ---------------------------------------------------------------------------
export async function sendUnhealthyIntegrationEmail(params: {
  integrationId: string
  integrationType: string
  projectId: string
  errorMessage: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  try {
    const supabase = createSupabaseServiceClient()
    const recipientInfo = await fetchRecipient(supabase, params.projectId)
    if (!recipientInfo || recipientInfo.mode === 'never') return

    const label = TARGET_LABELS[params.integrationType] ?? params.integrationType
    const icon = TARGET_ICONS[params.integrationType] ?? ''
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mdspec.dev'}/integrations`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Integration disconnected — ${recipientInfo.projectName}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:#18181b;border-radius:8px 8px 0 0;padding:20px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td><span style="font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">MDSpec</span></td>
                  <td align="right"><span style="font-size:12px;color:#a1a1aa;">Integration alert</span></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              <div style="font-size:15px;font-weight:600;color:#dc2626;margin-bottom:8px;">${icon} ${label} integration disconnected</div>
              <div style="font-size:14px;color:#3f3f46;margin-bottom:4px;">Project: <strong>${recipientInfo.projectName}</strong></div>
              <div style="font-size:13px;color:#71717a;margin-bottom:20px;">A sync failed with an authentication error. Your ${label} integration needs to be reconnected before specs can publish again.</div>
              <div style="background:#fff1f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px;font-family:ui-monospace,monospace;font-size:12px;color:#dc2626;word-break:break-all;margin-bottom:24px;">${params.errorMessage}</div>
              <a href="${dashboardUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">Reconnect ${label} &rarr;</a>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;padding:16px 28px;">
              <span style="font-size:12px;color:#a1a1aa;">You're receiving this because sync email notifications are enabled.&nbsp;<a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mdspec.dev'}/settings/account" style="color:#71717a;">Manage preferences</a></span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const { error } = await resend.emails.send({
      from: FROM,
      to: recipientInfo.email,
      subject: `[MDSpec] ${label} integration disconnected — reconnect required`,
      html,
    })

    if (error) console.error('[emailNotifier] failed to send unhealthy email:', error)
    else console.log(`[emailNotifier] unhealthy integration email sent to ${recipientInfo.email} (${label})`)
  } catch (err) {
    console.error('[emailNotifier] sendUnhealthyIntegrationEmail error:', err)
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

      const hasFailed = groupSpecs.some((s) => s.status !== 'published')
      if (recipientInfo.mode === 'failures_only' && !hasFailed) return

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

    const anyFailed = allGroups.some((g) => g.specs.some((s) => s.status !== 'published'))
    if (recipientInfo.mode === 'failures_only' && !anyFailed) return

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
// Shared helper: look up org owner + resolve notification preference
// ---------------------------------------------------------------------------
async function fetchRecipient(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  projectId: string
): Promise<{ email: string; projectName: string; mode: 'always' | 'failures_only' | 'never' } | null> {
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
    .select('email, email_notification_mode')
    .eq('id', ownerMember.user_id)
    .single()

  const mode = (user?.email_notification_mode ?? 'always') as 'always' | 'failures_only' | 'never'
  if (mode === 'never') return null

  return { email: user!.email, projectName: project.name ?? projectId, mode }
}
