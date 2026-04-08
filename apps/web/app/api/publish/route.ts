import bcrypt from 'bcryptjs'
import { createSupabaseServiceClient } from '@/lib/db-server'
import { Client } from '@upstash/qstash'
import type { PublishPayload, PublishGroupJobData, PublishGroupSpec, IntegrationType } from '@/lib/types'

const qstash = new Client({ token: process.env.QSTASH_TOKEN! })

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
      // Quick hint check: the project_id (stripped of dashes) should start with projectIdShort
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
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 })
    }

    const { project_id, repo_name, branch, commit_sha, specs } = payload

    if (!project_id || !repo_name || !branch || !commit_sha || !Array.isArray(specs) || specs.length === 0) {
      return Response.json({ error: 'missing_required_fields' }, { status: 400 })
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
    // Free tier enforcement
    // -------------------------------------------------------------------------
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('org_id', project.org_id)
      .single()

    let upgradeNudge = false

    if (!subscription || subscription.plan === 'free') {
      const { count: existingCount } = await supabase
        .from('specs')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project_id)

      const existing = existingCount ?? 0

      // Count new specs (paths not yet in the table)
      const { data: existingPaths } = await supabase
        .from('specs')
        .select('path')
        .eq('project_id', project_id)

      const existingPathSet = new Set((existingPaths ?? []).map((s) => s.path))
      const newSpecs = specs.filter((s) => !existingPathSet.has(s.path))

      if (existing >= 10) {
        return Response.json({
          error: 'spec_limit_reached',
          limit: 10,
          upgrade_url: 'https://mdspec.dev/upgrade',
        }, { status: 402 })
      }

      if (existing + newSpecs.length >= 10) {
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
    // Fetch active integrations for this org
    // -------------------------------------------------------------------------
    const { data: integrations, error: integrationsError } = await supabase
      .from('integrations')
      .select('id, type')
      .eq('org_id', project.org_id)
      .eq('status', 'connected')

    console.log(`[publish] org=${project.org_id} integrations=${JSON.stringify(integrations)} error=${integrationsError?.message ?? 'none'}`)

    const activeIntegrations = integrations ?? []

    if (activeIntegrations.length === 0) {
      console.log(`[publish] no active integrations for org=${project.org_id} — nothing to enqueue`)
    }

    // -------------------------------------------------------------------------
    // Filter specs to only those under mapped folders
    // -------------------------------------------------------------------------
    const { data: folderMappings } = await supabase
      .from('folder_mappings')
      .select('folder_path')
      .eq('project_id', project_id)

    const mappedPaths = [...new Set((folderMappings ?? []).map((m) => m.folder_path.replace(/^\//, '').replace(/\/$/, '')))]  // normalise legacy entries that may have slashes

    const specsToProcess = specs.filter((s) => {
      const normalised = s.path.replace(/^\//, '')
      return mappedPaths.some((mp) => normalised === mp || normalised.startsWith(mp + '/'))
    })

    if (specsToProcess.length < specs.length) {
      console.log(`[publish] filtered ${specs.length - specsToProcess.length} spec(s) outside mapped folders`)
    }

    // -------------------------------------------------------------------------
    // Upsert specs + publish targets, accumulate into groups keyed by
    // (integration_id, immediateParent). All specs in a group will be
    // processed sequentially by a single worker invocation, eliminating the
    // cross-worker race on shared ClickUp folder docs.
    // -------------------------------------------------------------------------
    const groups = new Map<string, { integration_id: string; target_type: IntegrationType; specs: PublishGroupSpec[] }>()

    for (const spec of specsToProcess) {
      console.log(`[publish] processing spec path=${spec.path}`)

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
            content: spec.content,
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

      // Determine target integrations (from frontmatter or all active)
      const frontmatterTargets = spec.frontmatter?.targets as Array<Record<string, string>> | undefined
      let targetIntegrations = activeIntegrations

      if (frontmatterTargets && frontmatterTargets.length > 0) {
        const targetTypes = frontmatterTargets.flatMap((t) => Object.keys(t))
        targetIntegrations = activeIntegrations.filter((i) => targetTypes.includes(i.type))
        console.log(`[publish] frontmatter targets=${JSON.stringify(targetTypes)} matched integrations=${targetIntegrations.map(i => i.type).join(',')}`)
      }

      const immediateParent = spec.path.split('/').slice(0, -1).join('/')

      for (const integration of targetIntegrations) {
        // Upsert the publish target row
        const { data: existingTarget } = await supabase
          .from('spec_publish_targets')
          .select('id, external_page_id, status')
          .eq('spec_id', upsertedSpec.id)
          .eq('integration_id', integration.id)
          .single()

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
                integration_id: integration.id,
                target_type: integration.type,
                status: 'queued',
                retry_count: 0,
                last_error: null,
              })
              .select('id, external_page_id')
              .single()

        if (!target) {
          console.error(`[publish] publish target upsert failed spec=${upsertedSpec.id} integration=${integration.id} error=${targetError?.message}`)
          continue
        }

        // Accumulate into the correct group
        const groupKey = `${integration.id}::${immediateParent}`
        let group = groups.get(groupKey)
        if (!group) {
          group = { integration_id: integration.id, target_type: integration.type as IntegrationType, specs: [] }
          groups.set(groupKey, group)
        }
        group.specs.push({
          spec_id: upsertedSpec.id,
          spec_publish_target_id: target.id,
          path: spec.path,
          content: spec.content,
          content_hash: spec.hash,
          frontmatter: spec.frontmatter ?? {},
        })
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
    // Response
    // -------------------------------------------------------------------------
    const filteredCount = specs.length - specsToProcess.length

    return Response.json(
      {
        accepted: true,
        queued: queuedCount,
        ...(filteredCount > 0 ? { filtered: filteredCount } : {}),
        ...(upgradeNudge ? { upgrade_nudge: true } : {}),
      },
      { status: 202 }
    )
  } catch (err) {
    console.error('[/api/publish]', err)
    return Response.json({ error: 'internal_error' }, { status: 500 })
  }
}
