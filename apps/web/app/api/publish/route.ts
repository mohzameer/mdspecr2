import bcrypt from 'bcryptjs'
import { createSupabaseServiceClient } from '@/lib/db-server'
import { Client } from '@upstash/qstash'
import type { PublishPayload, PublishGroupJobData, PublishGroupSpec, IntegrationType, MdspecMapConfig } from '@/lib/types'

const qstash = new Client({ token: process.env.QSTASH_TOKEN! })


function resolveTitle(path: string, frontmatter: Record<string, unknown>): string {
  if (frontmatter?.title && typeof frontmatter.title === 'string') {
    return frontmatter.title
  }
  const filename = path.split('/').pop() ?? path
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ')
}

function normalizeFolder(folder: string): string {
  const raw = folder.trim()
  if (raw === '/' || raw === '' || raw === '.') return ''
  return raw.replace(/^\//, '').replace(/\/$/, '')
}

export async function POST(request: Request) {
  try {
    // -------------------------------------------------------------------------
    // Authentication: Bearer token validation
    // -------------------------------------------------------------------------
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'invalid_token' }, { status: 401 })
    }

    const rawToken = authHeader.slice(7).trim()

    // Token format: mds_<project_id_short 8 chars>_<hex32>
    const tokenMatch = rawToken.match(/^mds_([a-zA-Z0-9]{8})_[a-f0-9]{32}$/)
    if (!tokenMatch) {
      return Response.json({ error: 'invalid_token' }, { status: 401 })
    }

    const projectIdShort = tokenMatch[1]
    const supabase = createSupabaseServiceClient()

    // Fetch non-revoked project_tokens joined with projects
    const { data: allTokens } = await supabase
      .from('project_tokens')
      .select('id, project_id, token_hash')
      .eq('revoked', false)

    // Find matching token by bcrypt compare
    let matchedProjectId: string | null = null
    for (const t of allTokens ?? []) {
      if (!t.project_id.replace(/-/g, '').startsWith(projectIdShort)) continue
      if (await bcrypt.compare(rawToken, t.token_hash)) {
        matchedProjectId = t.project_id
        break
      }
    }

    if (!matchedProjectId) {
      return Response.json({ error: 'invalid_token' }, { status: 401 })
    }

    // -------------------------------------------------------------------------
    // Parse and validate payload
    // -------------------------------------------------------------------------
    let payload: PublishPayload
    try {
      payload = await request.json()
    } catch (parseErr) {
      console.error('[publish] invalid_json', parseErr)
      return Response.json({ error: 'invalid_json' }, { status: 400 })
    }

    const { project_id, repo_name, branch, commit_sha, commit_timestamp, specs, config } = payload

    if (!project_id || !repo_name || !branch || !commit_sha || !Array.isArray(specs) || specs.length === 0) {
      console.error('[publish] missing_required_fields', { project_id, repo_name, branch, commit_sha, specs_is_array: Array.isArray(specs), specs_length: Array.isArray(specs) ? specs.length : null })
      return Response.json({ error: 'missing_required_fields' }, { status: 400 })
    }

    if (!config || config.version !== 1 || !Array.isArray(config.mappings)) {
      console.error('[publish] missing_or_invalid_config', { config_version: config?.version, mappings_is_array: Array.isArray(config?.mappings) })
      return Response.json({ error: 'missing_or_invalid_config' }, { status: 400 })
    }

    // Token must belong to the stated project
    if (matchedProjectId !== project_id) {
      return Response.json({ error: 'invalid_token' }, { status: 401 })
    }

    // -------------------------------------------------------------------------
    // Fetch project
    // -------------------------------------------------------------------------
    const { data: project } = await supabase
      .from('projects')
      .select('id, org_id, registered_repo')
      .eq('id', project_id)
      .single()

    if (!project) return Response.json({ error: 'project_not_found' }, { status: 404 })

    // -------------------------------------------------------------------------
    // Repo enforcement
    // -------------------------------------------------------------------------
    if (project.registered_repo && project.registered_repo !== repo_name) {
      return Response.json({
        error: 'repo_mismatch',
        registered: project.registered_repo,
        received: repo_name,
      }, { status: 403 })
    }

    // -------------------------------------------------------------------------
    // Free tier enforcement — subscription is per-user (the org owner)
    // -------------------------------------------------------------------------
    const { data: ownerMember } = await supabase
      .from('org_members')
      .select('user_id')
      .eq('org_id', project.org_id)
      .eq('role', 'owner')
      .single()

    const { data: subscription } = ownerMember
      ? await supabase
          .from('subscriptions')
          .select('plan')
          .eq('user_id', ownerMember.user_id)
          .single()
      : { data: null }

    let upgradeNudge = false

    if (!subscription || subscription.plan === 'free') {
      const { data: projectSpecs } = await supabase
        .from('specs')
        .select('id, path')
        .eq('project_id', project_id)

      const specIds = (projectSpecs ?? []).map((s) => s.id)
      const { count: syncedCount } = specIds.length > 0
        ? await supabase
            .from('spec_publish_targets')
            .select('spec_id', { count: 'exact', head: true })
            .in('spec_id', specIds)
        : { count: 0 }

      const existingSyncedPaths = new Set((projectSpecs ?? []).map((s) => s.path))
      const newSpecs = specs.filter((s) => !existingSyncedPaths.has(s.path))
      const synced = syncedCount ?? 0

      if (newSpecs.length > 0 && synced + newSpecs.length > 10) {
        return Response.json({
          error: 'spec_limit_reached',
          limit: 10,
          upgrade_url: 'https://mdspec.dev/upgrade',
        }, { status: 402 })
      }

      if (synced + newSpecs.length >= 8) {
        upgradeNudge = true
      }
    }

    // -------------------------------------------------------------------------
    // Register repo on first publish
    // -------------------------------------------------------------------------
    if (!project.registered_repo) {
      await supabase
        .from('projects')
        .update({ registered_repo: repo_name })
        .eq('id', project_id)
    }

    // -------------------------------------------------------------------------
    // Resolve aliases from payload config
    // -------------------------------------------------------------------------
    const mappingsWithParent = config.mappings.filter((m) => m.parent && m.integration)
    const aliasNames = [...new Set(mappingsWithParent.map((m) => m.parent!))]

    // Fetch all aliases for this org
    const { data: orgAliases } = aliasNames.length > 0
      ? await supabase
          .from('aliases')
          .select('name, integration_id, native_id, integrations(type)')
          .eq('org_id', project.org_id)
          .in('name', aliasNames)
      : { data: [] }

    const resolvedAliases = new Map<string, { integration_id: string; native_id: string; type: string }>()
    for (const a of orgAliases ?? []) {
      const intType = (a.integrations as unknown as { type: string })?.type
      if (intType) {
        resolvedAliases.set(a.name, { integration_id: a.integration_id, native_id: a.native_id, type: intType })
      }
    }

    // Check for unresolved aliases — hard block
    const unresolvedAliases: Array<{ alias: string; folder: string; suggestion?: string }> = []
    for (const m of mappingsWithParent) {
      if (!resolvedAliases.has(m.parent!)) {
        // Find closest match for suggestion
        const allAliasNames = (orgAliases ?? []).map((a) => a.name)
        const suggestion = findClosestMatch(m.parent!, allAliasNames)
        unresolvedAliases.push({ alias: m.parent!, folder: m.folder, suggestion })
      }
    }

    if (unresolvedAliases.length > 0) {
      return Response.json({
        error: 'unresolved_aliases',
        aliases: unresolvedAliases,
      }, { status: 422 })
    }

    // Also verify alias integration type matches mapping integration type
    for (const m of mappingsWithParent) {
      const resolved = resolvedAliases.get(m.parent!)
      if (resolved && resolved.type !== m.integration) {
        return Response.json({
          error: 'alias_integration_mismatch',
          alias: m.parent,
          expected: m.integration,
          actual: resolved.type,
        }, { status: 422 })
      }
    }

    // -------------------------------------------------------------------------
    // Fetch active integrations for this org
    // -------------------------------------------------------------------------
    const { data: integrations } = await supabase
      .from('integrations')
      .select('id, type')
      .eq('org_id', project.org_id)
      .eq('status', 'connected')

    const activeIntegrations = integrations ?? []

    // Build integration type → id map
    const integrationByType = new Map<string, string>()
    for (const i of activeIntegrations) {
      integrationByType.set(i.type, i.id)
    }

    // -------------------------------------------------------------------------
    // Route specs using payload config (not DB)
    // -------------------------------------------------------------------------
    // Get integration-bearing mappings (skip-only entries have no integration)
    const integrationMappings = config.mappings.filter((m) => m.integration)

    const groups = new Map<string, {
      integration_id: string
      target_type: IntegrationType
      clickup_mode: string
      matched_folder: string
      specs: PublishGroupSpec[]
    }>()
    let savedCount = 0

    for (const spec of specs) {
      console.log(`[publish] processing spec path=${spec.path}`)

      // Handle renames: update existing spec path
      if (spec.previous_path) {
        const { data: existingSpec } = await supabase
          .from('specs')
          .select('id')
          .eq('project_id', project_id)
          .eq('path', spec.previous_path)
          .maybeSingle()

        if (existingSpec) {
          await supabase
            .from('specs')
            .update({ path: spec.path, updated_at: new Date().toISOString() })
            .eq('id', existingSpec.id)
          console.log(`[publish] renamed spec ${spec.previous_path} → ${spec.path}`)
        }
      }

      const { data: upsertedSpec, error: specError } = await supabase
        .from('specs')
        .upsert(
          {
            project_id,
            repo: repo_name,
            path: spec.path,
            mdspec_id: (spec.frontmatter?.mdspec_id as string) ?? null,
            commit_sha,
            content_hash: spec.hash,
            title: resolveTitle(spec.path, spec.frontmatter ?? {}),
            frontmatter: spec.frontmatter ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,path' }
        )
        .select('id')
        .single()

      if (specError || !upsertedSpec) {
        console.error(`[publish] spec upsert failed path=${spec.path} error=${specError?.message}`)
        continue
      }

      console.log(`[publish] spec upserted id=${upsertedSpec.id} path=${spec.path}`)
      savedCount++

      // Route to the single most-specific (longest prefix) matching mapping.
      // If a subfolder is explicitly mapped, specs under it are owned by that
      // mapping only — shallower/root mappings are skipped for those specs.
      let bestMapping: typeof integrationMappings[number] | null = null
      let bestFolderLength = -1

      for (const mapping of integrationMappings) {
        const normalizedMappingFolder = normalizeFolder(mapping.folder)

        const specInFolder = normalizedMappingFolder === '' ||
          spec.path.startsWith(normalizedMappingFolder + '/') ||
          spec.path === normalizedMappingFolder

        if (!specInFolder) continue

        // Check depth limit if set
        if (mapping.depth !== undefined) {
          const relative = normalizedMappingFolder === ''
            ? spec.path
            : spec.path.slice(normalizedMappingFolder.length + 1)
          const segments = relative.split('/').filter(Boolean)
          if (segments.length > mapping.depth) continue
        }

        // Pick the longest (most specific) match
        if (normalizedMappingFolder.length > bestFolderLength) {
          bestFolderLength = normalizedMappingFolder.length
          bestMapping = mapping
        }
      }

      if (bestMapping) {
        const intType = bestMapping.integration!
        const normalizedMappingFolder = normalizeFolder(bestMapping.folder)

        // Resolve integration_id — prefer alias resolution, fall back to type lookup
        let integrationId: string | undefined
        if (bestMapping.parent && resolvedAliases.has(bestMapping.parent)) {
          integrationId = resolvedAliases.get(bestMapping.parent)!.integration_id
        } else {
          integrationId = integrationByType.get(intType)
        }

        if (!integrationId) {
          console.log(`[publish] skipping spec=${spec.path} integration=${intType} — no connected integration`)
        } else {
          // Determine clickup_mode from target field
          const mode = intType === 'clickup' && bestMapping.target === 'task' ? 'task_list' : 'doc'

          // Upsert publish target
          const { data: existingTarget } = await supabase
            .from('spec_publish_targets')
            .select('id, external_page_id, status')
            .eq('spec_id', upsertedSpec.id)
            .eq('integration_id', integrationId)
            .eq('clickup_mode', mode)
            .maybeSingle()

          const { data: target, error: targetError } = existingTarget
            ? await supabase
                .from('spec_publish_targets')
                .update({ status: 'queued', retry_count: 0, last_error: null })
                .eq('id', existingTarget.id)
                .select('id, external_page_id')
                .single()
            : await supabase
                .from('spec_publish_targets')
                .insert({
                  spec_id: upsertedSpec.id,
                  integration_id: integrationId,
                  target_type: intType,
                  clickup_mode: mode,
                  status: 'queued',
                  retry_count: 0,
                  last_error: null,
                })
                .select('id, external_page_id')
                .single()

          if (!target) {
            console.error(`[publish] publish target upsert failed spec=${upsertedSpec.id} integration=${integrationId} mode=${mode} error=${targetError?.message}`)
          } else {
            // Accumulate into group
            const groupKey = `${integrationId}::${normalizedMappingFolder}::${mode}`
            if (!groups.has(groupKey)) {
              groups.set(groupKey, {
                integration_id: integrationId,
                target_type: intType as IntegrationType,
                clickup_mode: mode,
                matched_folder: normalizedMappingFolder,
                specs: [],
              })
            }
            groups.get(groupKey)!.specs.push({
              spec_id: upsertedSpec.id,
              spec_publish_target_id: target.id,
              path: spec.path,
              title: resolveTitle(spec.path, spec.frontmatter ?? {}),
              content: spec.content,
              content_hash: spec.hash,
              frontmatter: spec.frontmatter ?? {},
            })
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Enqueue one QStash job per group
    // -------------------------------------------------------------------------
    let queuedCount = 0

    for (const [groupKey, group] of groups) {
      const jobData: PublishGroupJobData = {
        project_id,
        integration_id: group.integration_id,
        target_type: group.target_type,
        specs: group.specs,
        clickup_mode: group.clickup_mode as 'doc' | 'task_list',
        matched_folder: group.matched_folder,
      }

      try {
        await qstash.publishJSON({
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/worker/process`,
          body: jobData,
          retries: 5,
        })
        console.log(`[publish] group enqueued key=${groupKey} specs=${group.specs.length}`)
        queuedCount += group.specs.length
      } catch (queueErr) {
        console.error(`[publish] failed to enqueue group key=${groupKey} error=${(queueErr as Error).message}`)
      }
    }

    // -------------------------------------------------------------------------
    // Config reconciliation — atomic timestamp check
    // -------------------------------------------------------------------------
    if (commit_timestamp) {
      try {
        await supabase.rpc('reconcile_config' as never, {
          p_project_id: project_id,
          p_commit_sha: commit_sha,
          p_commit_timestamp: commit_timestamp,
        })
        console.log(`[publish] config reconciled for project=${project_id}`)
      } catch (err) {
        // Non-fatal — reconciliation is best-effort (function may not exist yet)
        console.error(`[publish] config reconciliation failed: ${(err as Error).message}`)
      }

      // Update folder_mappings in DB to mirror config (for UI display)
      await reconcileFolderMappings(supabase, project_id, config, resolvedAliases, integrationByType)
    }

    // -------------------------------------------------------------------------
    // Response
    // -------------------------------------------------------------------------
    return Response.json(
      {
        accepted: true,
        saved: savedCount,
        queued: queuedCount,
        ...(upgradeNudge ? { upgrade_nudge: true } : {}),
      },
      { status: 202 }
    )
  } catch (err) {
    console.error('[/api/publish]', err)
    return Response.json({ error: 'internal_error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findClosestMatch(target: string, candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined

  let bestMatch: string | undefined
  let bestScore = Infinity

  for (const candidate of candidates) {
    const score = levenshtein(target, candidate)
    if (score < bestScore && score <= 3) {
      bestScore = score
      bestMatch = candidate
    }
  }

  return bestMatch
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }

  return dp[m][n]
}

async function reconcileFolderMappings(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  projectId: string,
  config: MdspecMapConfig,
  resolvedAliases: Map<string, { integration_id: string; native_id: string; type: string }>,
  integrationByType: Map<string, string>
): Promise<void> {
  try {
    for (const mapping of config.mappings) {
      if (!mapping.integration) continue

      let integrationId: string | undefined
      if (mapping.parent && resolvedAliases.has(mapping.parent)) {
        integrationId = resolvedAliases.get(mapping.parent)!.integration_id
      } else {
        integrationId = integrationByType.get(mapping.integration)
      }

      if (!integrationId) continue

      const normalizedFolder = normalizeFolder(mapping.folder)
      const mode = mapping.integration === 'clickup' && mapping.target === 'task' ? 'task_list' : 'doc'

      await supabase
        .from('folder_mappings')
        .upsert(
          {
            project_id: projectId,
            folder_path: normalizedFolder,
            integration_id: integrationId,
            clickup_mode: mode,
            skip_patterns: mapping.skip ?? [],
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,folder_path,integration_id,clickup_mode' }
        )
    }

    console.log(`[publish] folder_mappings reconciled for project=${projectId}`)
  } catch (err) {
    console.error(`[publish] folder_mappings reconciliation failed: ${(err as Error).message}`)
  }
}
