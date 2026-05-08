import { Job, UnrecoverableError } from 'bullmq'
import { createWorkerSupabaseClient } from '../lib/supabase.js'
import { rateLimit } from '../lib/rateLimiter.js'
import { publishToNotion } from '../adapters/notion.js'
import { publishToConfluence } from '../adapters/confluence.js'
import { publishSingleSpec, publishSpecAsPage, clickUpDocExists } from '../adapters/clickup.js'
import { resolveFolderMapping } from '../lib/resolveFolderMapping.js'
import { agentsQueue } from '../lib/queue.js'
import { readCredentials } from '../lib/credentials.js'

interface PublishSpecJobData {
  spec_id: string
  spec_publish_target_id: string
  integration_id: string
  target_type: 'notion' | 'confluence' | 'clickup'
  project_id: string
  content: string
  path: string
  frontmatter: Record<string, unknown>
  attempt: number
}

export async function publishProcessor(job: Job<PublishSpecJobData>): Promise<void> {
  const { spec_id, spec_publish_target_id, integration_id, target_type, content, path, frontmatter, project_id } = job.data
  const supabase = createWorkerSupabaseClient()

  // -------------------------------------------------------------------------
  // Agent routing — check if this spec should be transformed before publishing.
  // Skip if this job was already enqueued by the agent processor (content is
  // already transformed) — detect by checking for an existing agent_run row
  // with status 'completed' for this spec_publish_target.
  // -------------------------------------------------------------------------
  const resolution = await resolveFolderMapping(supabase, project_id, path, frontmatter)

  if (resolution.shouldRunAgent && resolution.templateId) {
    // Create agent_runs row
    const { data: agentRun } = await supabase
      .from('agent_runs')
      .insert({
        spec_id,
        template_id: resolution.templateId,
        trigger: resolution.trigger,
        raw_content: content,
        status: 'queued',
      })
      .select('id')
      .single()

    if (agentRun) {
      await agentsQueue.add(`agent:${spec_id}:${integration_id}`, {
        spec_id,
        spec_publish_target_id,
        integration_id,
        project_id,
        template_id: resolution.templateId,
        trigger: resolution.trigger,
        raw_content: content,
        target_integration_type: target_type,
        agent_run_id: agentRun.id,
      })
      console.log(`[publish] agent queued for spec ${spec_id} (template ${resolution.templateId})`)
      return
    }
    // If agent_run insert failed, fall through to direct publish
  }

  // Fetch integration credentials
  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('credentials_secret_id, config, status')
    .eq('id', integration_id)
    .single()

  if (integrationError || !integration) {
    throw new UnrecoverableError(`Integration ${integration_id} not found`)
  }

  if (!integration.credentials_secret_id) {
    throw new UnrecoverableError('Integration credentials missing — reconnect required')
  }

  // Fetch existing external_page_id if any (for updates)
  const { data: target } = await supabase
    .from('spec_publish_targets')
    .select('external_page_id, retry_count')
    .eq('id', spec_publish_target_id)
    .single()

  let existingPageId = target?.external_page_id ?? null
  let credentials: Record<string, unknown>
  try {
    const plaintext = await readCredentials(supabase, integration.credentials_secret_id)
    credentials = JSON.parse(plaintext)
  } catch (err) {
    throw new UnrecoverableError(`Invalid integration credentials: ${(err as Error).message}`)
  }

  // For ClickUp: if we have an existing doc ID, verify it still exists remotely.
  // If deleted, clear existingPageId so the adapter recreates it.
  if (target_type === 'clickup' && existingPageId) {
    const remoteExists = await clickUpDocExists(
      { api_token: credentials.api_token as string, workspace_id: credentials.workspace_id as string },
      existingPageId
    )
    if (!remoteExists) {
      console.log(`[publish] clickup doc ${existingPageId} no longer exists — will recreate`)
      existingPageId = null
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: null, external_url: null })
        .eq('id', spec_publish_target_id)
    }
  }

  // Skip if remote doc exists and content hash hasn't changed
  if (existingPageId) {
    const { data: currentSpec } = await supabase
      .from('specs')
      .select('content_hash')
      .eq('id', spec_id)
      .single()

    const jobContentHash = frontmatter?._content_hash as string | undefined
    if (jobContentHash && currentSpec?.content_hash === jobContentHash) {
      console.log(`[publish] skipping spec ${spec_id} — remote exists and content unchanged`)
      await supabase
        .from('spec_publish_targets')
        .update({ status: 'published' })
        .eq('id', spec_publish_target_id)
      return
    }
  }

  const spec = { path, content, frontmatter }

  // Look up folder mapping for integrations that support per-folder parent override
  let folderMappingTargetId: string | null = null
  let folderMappingId: string | null = null
  let folderMappingClickupDocId: string | null = null
  let folderMappingClickupPageId: string | null = null
  let folderMappingPath: string | null = null
  if (target_type === 'clickup' || target_type === 'confluence') {
    const { getAncestorFolders } = await import('../lib/folderHierarchy.js')
    const ancestors = getAncestorFolders(path).slice().reverse()
    if (ancestors.length > 0) {
      // Normalise ancestor paths and build variants to handle legacy DB entries with leading/trailing slashes
      const normalisedPaths = ancestors.map((a) => a.path)
      const pathVariants = [...new Set(normalisedPaths.flatMap((p) => [p, `/${p}`, `${p}/`, `/${p}/`]))]
      const { data: mappings } = await supabase
        .from('folder_mappings')
        .select('id, folder_path, target_id, clickup_doc_id, clickup_page_id')
        .eq('project_id', project_id)
        .eq('integration_id', integration_id)
        .in('folder_path', pathVariants)
      if (mappings && mappings.length > 0) {
        for (const a of ancestors) {
          const norm = a.path
          const match = mappings.find((m) => m.folder_path.replace(/^\//, '').replace(/\/$/, '') === norm)
          if (match) {
            folderMappingTargetId = match.target_id ?? null
            if (target_type === 'clickup') {
              folderMappingId = match.id
              folderMappingClickupDocId = match.clickup_doc_id ?? null
              folderMappingClickupPageId = match.clickup_page_id ?? null
              folderMappingPath = norm
            }
            break
          }
        }
      }
    }
  }

  // Apply rate limiting
  await rateLimit(target_type)

  try {
    let result: { page_id?: string; doc_id?: string; page_url?: string; doc_url?: string }

    switch (target_type) {
      case 'notion':
        result = await publishToNotion(
          {
            token: credentials.token as string,
            root_page_id: credentials.root_page_id as string,
            mode: credentials.mode as 'page' | 'database' | undefined,
            database_id: credentials.database_id as string | undefined,
            data_source_id: credentials.data_source_id as string | undefined,
          },
          spec,
          existingPageId
        )
        break

      case 'confluence':
        result = await publishToConfluence(
          {
            base_url: credentials.base_url as string,
            email: credentials.email as string,
            token: credentials.token as string,
            space_key: credentials.space_key as string,
          },
          spec,
          existingPageId,
          folderMappingTargetId
        )
        break

      case 'clickup': {
        const clickupCreds = {
          api_token: credentials.api_token as string,
          workspace_id: credentials.workspace_id as string,
        }

        // Count sibling specs in the same folder to determine single vs multi-page mode
        let siblingCount = 0
        if (folderMappingPath) {
          const { count } = await supabase
            .from('specs')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project_id)
            .like('path', `${folderMappingPath}%`)
          siblingCount = count ?? 0
        }

        const isMultiMode = siblingCount > 1

        console.log(`[publish] clickup spec=${spec_id} path=${path}`)
        console.log(`[publish] folderMappingId=${folderMappingId ?? 'none'} folderMappingPath=${folderMappingPath ?? 'none'}`)
        console.log(`[publish] mode=${isMultiMode ? 'multi' : 'single'} siblings=${siblingCount}`)
        console.log(`[publish] folderDocId=${folderMappingClickupDocId ?? 'none'} folderPageId=${folderMappingClickupPageId ?? 'none'}`)
        console.log(`[publish] existingPageId=${existingPageId ?? 'none'}`)

        if (isMultiMode && folderMappingId) {
          const folderName = folderMappingPath?.replace(/\/+$/, '').split('/').pop() ?? 'Specs'
          const multiResult = await publishSpecAsPage(
            clickupCreds,
            spec,
            folderMappingClickupDocId,
            folderMappingClickupPageId,
            existingPageId,
            folderName,
            folderMappingTargetId
          )
          // Save doc id and folder root page id back to folder_mapping if newly created
          const mappingUpdates: Record<string, string> = {}
          if (!folderMappingClickupDocId && multiResult.doc_id) mappingUpdates.clickup_doc_id = multiResult.doc_id
          if (!folderMappingClickupPageId && multiResult.folder_page_id) mappingUpdates.clickup_page_id = multiResult.folder_page_id
          if (Object.keys(mappingUpdates).length > 0) {
            await supabase.from('folder_mappings').update(mappingUpdates).eq('id', folderMappingId)
          }
          // Store the sub-page id as external_page_id so we can update it next time
          result = { doc_id: multiResult.page_id, doc_url: multiResult.doc_url }
        } else {
          result = await publishSingleSpec(
            clickupCreds,
            spec,
            existingPageId,
            folderMappingTargetId
          )
        }
        break
      }

      default:
        throw new UnrecoverableError(`Unknown target type: ${target_type}`)
    }

    // Success — update ledger
    const externalId = result.page_id ?? result.doc_id ?? null
    const externalUrl = result.page_url ?? result.doc_url ?? null

    await supabase
      .from('spec_publish_targets')
      .update({
        status: 'published',
        external_page_id: externalId,
        external_url: externalUrl,
        published_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', spec_publish_target_id)

  } catch (err) {
    const error = err as Record<string, unknown> & { message?: string; response?: { status?: number } }
    const status = error.response?.status as number | undefined
    const message = error.message ?? String(err)

    // Auth / permission errors → terminal failure + mark integration unhealthy
    if (status === 401 || status === 403) {
      await supabase
        .from('integrations')
        .update({ status: 'unhealthy', updated_at: new Date().toISOString() })
        .eq('id', integration_id)

      await supabase
        .from('spec_publish_targets')
        .update({ status: 'failed', last_error: `Auth error (${status}): ${message}` })
        .eq('id', spec_publish_target_id)

      throw new UnrecoverableError(message)
    }

    // Payload errors → terminal failure
    if (status === 400 || status === 422) {
      await supabase
        .from('spec_publish_targets')
        .update({ status: 'failed', last_error: `Payload error (${status}): ${message}` })
        .eq('id', spec_publish_target_id)

      throw new UnrecoverableError(message)
    }

    // After all retries exhausted (BullMQ will set attemptsMade === maxAttempts)
    if (job.attemptsMade >= (job.opts.attempts ?? 5) - 1) {
      await supabase
        .from('spec_publish_targets')
        .update({ status: 'failed', last_error: message, retry_count: job.attemptsMade + 1 })
        .eq('id', spec_publish_target_id)
    } else {
      // Update retry count for transient errors
      await supabase
        .from('spec_publish_targets')
        .update({ retry_count: (target?.retry_count ?? 0) + 1, last_error: message })
        .eq('id', spec_publish_target_id)
    }

    // Re-throw for BullMQ to handle retry
    throw err
  }
}
