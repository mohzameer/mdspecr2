import bcrypt from 'bcryptjs'
import { Client } from '@upstash/qstash'
import { createSupabaseServiceClient } from '@/lib/db-server'
import type { PublishPayload, SpecArtifact, PublishJobData, IntegrationType } from '@/lib/types'

const qstash = new Client({ token: process.env.QSTASH_TOKEN! })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mdspec.dev'
const SUPPORTED_TYPES = new Set(['wiki', 'task'])

// Per-integration QStash flow control (spec §8.2).
const RATE_LIMITS = {
  notion:     { rate: 3,   period: '1s'  as const, parallelism: 5  },
  confluence: { rate: 2,   period: '1s'  as const, parallelism: 5  },
  clickup:    { rate: 100, period: '60s' as const, parallelism: 10 },
  jira:       { rate: 2,   period: '1s'  as const, parallelism: 5  },
  s3:         { rate: 100, period: '1s'  as const, parallelism: 20 },
} satisfies Record<IntegrationType, { rate: number; period: `${number}s`; parallelism: number }>

// ---------------------------------------------------------------------------
// Token validation — matches CLI Bearer token against project_tokens
// ---------------------------------------------------------------------------

async function validateToken(rawToken: string): Promise<string | null> {
  // Token format: mds_<project_id_short 8 chars>_<hex32>
  const tokenMatch = rawToken.match(/^mds_([a-zA-Z0-9]{8})_[a-f0-9]{32}$/)
  if (!tokenMatch) return null

  const projectIdShort = tokenMatch[1]
  const supabase = createSupabaseServiceClient()

  const { data: allTokens } = await supabase
    .from('project_tokens')
    .select('id, project_id, token_hash')
    .eq('revoked', false)

  for (const t of allTokens ?? []) {
    if (!t.project_id.replace(/-/g, '').startsWith(projectIdShort)) continue
    if (await bcrypt.compare(rawToken, t.token_hash)) return t.project_id
  }
  return null
}

// ---------------------------------------------------------------------------
// Spec validation — per spec §3, narrowed to v1 supported types (D4)
// ---------------------------------------------------------------------------

function validateSpec(spec: SpecArtifact): string | null {
  if (typeof spec.path !== 'string' || !spec.path) return 'spec.path required'
  if (typeof spec.id !== 'string' || !spec.id) return 'spec.id required'
  // type is optional — falls back to project.default_type
  if (spec.type !== null && (typeof spec.type !== 'string' || !SUPPORTED_TYPES.has(spec.type))) {
    return `spec.type must be one of: wiki, task (got "${spec.type}")`
  }
  if (typeof spec.content !== 'string') return 'spec.content required'
  if (typeof spec.hash !== 'string') return 'spec.hash required'
  return null
}

// ---------------------------------------------------------------------------
// Parent resolution — alias lookup at the route layer. URLs and bare IDs
// pass through to the processor (which has integration credentials for
// URL → native ID resolution).
// ---------------------------------------------------------------------------

async function resolveParent(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  parent: string | null,
  orgId: string,
  integrationId: string
): Promise<string | null> {
  if (!parent) return null
  if (parent.startsWith('http://') || parent.startsWith('https://')) return parent

  const { data: alias } = await supabase
    .from('aliases')
    .select('native_id, integration_id')
    .eq('org_id', orgId)
    .eq('name', parent)
    .maybeSingle()

  if (alias && alias.integration_id === integrationId) return alias.native_id
  // Not an alias for this integration — treat as native ID
  return parent
}

// ---------------------------------------------------------------------------
// POST /api/publish
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // -- Auth -------------------------------------------------------------------
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'invalid_token' }, { status: 401 })
  }
  const matchedProjectId = await validateToken(authHeader.slice(7).trim())
  if (!matchedProjectId) {
    return Response.json({ error: 'invalid_token' }, { status: 401 })
  }

  // -- Parse payload ----------------------------------------------------------
  let payload: PublishPayload
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { project_id, repo_name, branch, commit_sha, commit_timestamp, specs } = payload

  if (!project_id || !repo_name || !branch || !commit_sha || !commit_timestamp || !Array.isArray(specs) || specs.length === 0) {
    return Response.json({ error: 'missing_required_fields' }, { status: 400 })
  }

  if (project_id !== matchedProjectId) {
    return Response.json({ error: 'project_id_mismatch' }, { status: 403 })
  }

  for (const spec of specs) {
    const err = validateSpec(spec)
    if (err) return Response.json({ error: 'invalid_spec', detail: err, path: spec.path }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // -- Fetch project + org info ----------------------------------------------
  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, org_id, registered_repo, default_integration, default_type')
    .eq('id', matchedProjectId)
    .single()

  if (projectErr || !project) {
    return Response.json({ error: 'project_not_found' }, { status: 404 })
  }

  // -- Repo registration / mismatch check (D11) -------------------------------
  if (project.registered_repo && project.registered_repo !== repo_name) {
    return Response.json({
      error: 'repo_mismatch',
      registered: project.registered_repo,
      received: repo_name,
    }, { status: 403 })
  }
  if (!project.registered_repo) {
    await supabase.from('projects').update({ registered_repo: repo_name }).eq('id', matchedProjectId)
  }

  // -- Fetch org integrations once -------------------------------------------
  const { data: orgIntegrations } = await supabase
    .from('integrations')
    .select('id, type, status')
    .eq('org_id', project.org_id)

  const integrationsByType = new Map<string, { id: string; type: IntegrationType; status: string }>()
  for (const i of orgIntegrations ?? []) {
    integrationsByType.set(i.type, { id: i.id, type: i.type as IntegrationType, status: i.status })
  }

  // -- Fetch default task template (used for type=task; type=wiki has none) --
  const { data: taskTemplate } = await supabase
    .from('templates')
    .select('id')
    .eq('org_id', project.org_id)
    .eq('is_default', true)
    .eq('name', 'Task Template')
    .maybeSingle()
  const taskTemplateId = taskTemplate?.id ?? null

  // -- Create sync_run --------------------------------------------------------
  const { data: syncRun, error: syncRunErr } = await supabase
    .from('sync_runs')
    .insert({ project_id: matchedProjectId, total_specs: specs.length })
    .select('id')
    .single()
  if (syncRunErr || !syncRun) {
    return Response.json({ error: 'sync_run_create_failed' }, { status: 500 })
  }

  // -- Process each spec ------------------------------------------------------
  const results: Array<{ path: string; status: 'queued' | 'rejected'; reason?: string }> = []

  for (const spec of specs) {
    // Resolve integration: spec.integration > project.default_integration
    const targetType = (spec.integration ?? project.default_integration) as IntegrationType | null
    if (!targetType) {
      results.push({ path: spec.path, status: 'rejected', reason: 'no integration declared and no project default set' })
      continue
    }
    const integration = integrationsByType.get(targetType)
    if (!integration) {
      results.push({ path: spec.path, status: 'rejected', reason: `integration "${targetType}" not connected to this org` })
      continue
    }

    // Resolve type: spec.type > project.default_type
    const resolvedType = spec.type ?? project.default_type
    if (!resolvedType || !SUPPORTED_TYPES.has(resolvedType)) {
      results.push({ path: spec.path, status: 'rejected', reason: 'no type declared and no project default_type set' })
      continue
    }

    // Resolve parent (alias lookup; URL/bare pass through to processor)
    const parentId = await resolveParent(supabase, spec.parent, project.org_id, integration.id)

    // Upsert spec row
    const { data: specRow, error: specErr } = await supabase
      .from('specs')
      .upsert({
        project_id: matchedProjectId,
        path: spec.path,
        spec_id: spec.id,
        type: resolvedType,
        commit_sha,
        content_hash: spec.hash,
        frontmatter: spec.frontmatter,
        deleted_from_repo: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,spec_id' })
      .select('id')
      .single()
    if (specErr || !specRow) {
      results.push({ path: spec.path, status: 'rejected', reason: `db error: ${specErr?.message ?? 'unknown'}` })
      continue
    }

    // Upsert spec_publish_target row (status=queued)
    await supabase
      .from('spec_publish_targets')
      .upsert({
        spec_id: specRow.id,
        integration_id: integration.id,
        status: 'queued',
        retry_count: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'spec_id,integration_id' })

    // Resolve agent template (wiki → none, task → org default Task Template)
    const agentTemplate = resolvedType === 'task' ? taskTemplateId : null

    // Enqueue QStash job (one per spec — no folder-mapping groups in v2)
    const jobBody: PublishJobData = {
      project_id: matchedProjectId,
      integration_id: integration.id,
      target_type: targetType,
      spec_id: specRow.id,
      spec_path: spec.path,
      spec_native_id: spec.id,
      spec_type: resolvedType,
      content: spec.content,
      content_hash: spec.hash,
      parent_id: parentId,
      agent_template: agentTemplate,
      commit_sha,
      sync_run_id: syncRun.id,
    }

    const rate = RATE_LIMITS[targetType]
    try {
      await qstash.publishJSON({
        url: `${APP_URL}/api/worker/process`,
        body: jobBody,
        retries: 5,
        flowControl: {
          key: targetType,
          rate: rate.rate,
          period: rate.period,
          parallelism: rate.parallelism,
        },
      })
      results.push({ path: spec.path, status: 'queued' })
    } catch (err) {
      await supabase
        .from('spec_publish_targets')
        .update({ status: 'failed', last_error: `enqueue failed: ${(err as Error).message}` })
        .eq('spec_id', specRow.id)
        .eq('integration_id', integration.id)
      results.push({ path: spec.path, status: 'rejected', reason: `enqueue failed: ${(err as Error).message}` })
    }
  }

  // -- Bump publish_count -----------------------------------------------------
  const queuedCount = results.filter((r) => r.status === 'queued').length
  if (queuedCount > 0) {
    const { data: current } = await supabase
      .from('projects')
      .select('publish_count')
      .eq('id', matchedProjectId)
      .single()
    await supabase
      .from('projects')
      .update({ publish_count: (current?.publish_count ?? 0) + 1 })
      .eq('id', matchedProjectId)
  }

  // If nothing actually queued, mark the sync_run finished by bumping completed=total
  if (queuedCount === 0) {
    await supabase.from('sync_runs').update({ completed_specs: specs.length }).eq('id', syncRun.id)
  }

  return Response.json(
    { status: 'queued', count: queuedCount, total: specs.length, results, sync_run_id: syncRun.id },
    { status: 202 }
  )
}
