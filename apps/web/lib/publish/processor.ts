import { createSupabaseServiceClient } from '@/lib/db-server'
import { publishToNotion } from './adapters/notion'
import { publishToConfluence } from './adapters/confluence'
import { publishSingleSpec, publishSpecAsPage, clickUpDocExists } from './adapters/clickup'
import { resolveFolderMapping } from '@/lib/folder-mapping'
import { getAncestorFolders } from '@/lib/folder-hierarchy'
import type { PublishSpecJobData } from '@/lib/types'
import type { Client } from '@upstash/qstash'

// Terminal error — QStash should not retry
export class UnrecoverableError extends Error {
  readonly unrecoverable = true
}

export async function runPublishJob(
  data: PublishSpecJobData,
  attemptsMade: number,
  maxAttempts: number,
  enqueueAgentJob: (jobData: object) => Promise<void>
): Promise<void> {
  const { spec_id, spec_publish_target_id, integration_id, target_type, content, path, frontmatter, project_id } = data
  const supabase = createSupabaseServiceClient()

  // Agent routing — skip if already processed by agent
  if (frontmatter._agent_processed) {
    console.log(`[publish] skipping agent routing — content already transformed`)
  }
  const resolution = frontmatter._agent_processed
    ? { shouldRunAgent: false, templateId: null, trigger: null }
    : await resolveFolderMapping(supabase, project_id, path, frontmatter)

  if (resolution.shouldRunAgent && resolution.templateId) {
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
      await enqueueAgentJob({
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
  }

  // Fetch integration credentials
  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('credentials, config, status')
    .eq('id', integration_id)
    .single()

  if (integrationError || !integration) {
    throw new UnrecoverableError(`Integration ${integration_id} not found`)
  }

  const { data: target } = await supabase
    .from('spec_publish_targets')
    .select('external_page_id, retry_count')
    .eq('id', spec_publish_target_id)
    .single()

  let existingPageId = target?.external_page_id ?? null
  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(integration.credentials)
  } catch {
    throw new UnrecoverableError('Invalid integration credentials JSON')
  }

  // For ClickUp: verify remote doc still exists
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

  // Skip if content unchanged
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

  // Look up folder mapping for ClickUp routing
  let folderMappingTargetId: string | null = null
  let folderMappingId: string | null = null
  let folderMappingClickupDocId: string | null = null
  let folderMappingClickupPageId: string | null = null
  let folderMappingPath: string | null = null

  if (target_type === 'clickup') {
    const ancestors = getAncestorFolders(path).slice().reverse()
    if (ancestors.length > 0) {
      const normalisedPaths = ancestors.map((a) => a.path)
      const pathVariants = [...new Set(normalisedPaths.flatMap((p) => [p, `/${p}`, `${p}/`, `/${p}/`]))]
      const { data: mappings } = await supabase
        .from('folder_mappings')
        .select('id, folder_path, target_id, clickup_doc_id, clickup_page_id')
        .eq('project_id', project_id)
        .eq('integration_id', integration_id)
        .in('folder_path', pathVariants)
        .is('clickup_doc_id', null)  // exclude auto-created subfolder grouping rows — those are bookkeeping, not user mappings
      if (mappings && mappings.length > 0) {
        for (const a of ancestors) {
          const norm = a.path
          const match = mappings.find((m) => m.folder_path.replace(/^\//, '').replace(/\/$/, '') === norm)
          if (match) {
            folderMappingTargetId = match.target_id ?? null
            folderMappingId = match.id
            folderMappingClickupDocId = match.clickup_doc_id ?? null
            folderMappingClickupPageId = match.clickup_page_id ?? null
            folderMappingPath = norm
            break
          }
        }
      }
    }
  }

  try {
    let result: { page_id?: string; doc_id?: string; page_url?: string; doc_url?: string }

    switch (target_type) {
      case 'notion':
        result = await publishToNotion(
          { token: credentials.token as string, root_page_id: credentials.root_page_id as string },
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
          existingPageId
        )
        break

      case 'clickup': {
        const clickupCreds = {
          api_token: credentials.api_token as string,
          workspace_id: credentials.workspace_id as string,
        }

        // The immediate parent of this spec determines the grouping unit.
        // If the immediate parent IS the mapping folder, always single mode.
        // If the immediate parent is a subfolder of the mapping folder, group by that subfolder.
        const immediateParent = path.split('/').slice(0, -1).join('/')
        const isDirectlyInMappingFolder = immediateParent === folderMappingPath

        let siblingCount = 0
        let groupingPath = immediateParent
        if (!isDirectlyInMappingFolder && groupingPath) {
          const { count } = await supabase
            .from('specs')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project_id)
            .like('path', `${groupingPath}/%`)
          siblingCount = count ?? 0
        }

        const isMultiMode = !isDirectlyInMappingFolder && siblingCount > 1

        console.log(`[publish] clickup spec=${spec_id} path=${path} immediateParent=${immediateParent} mode=${isMultiMode ? 'multi' : 'single'} siblings=${siblingCount}`)

        if (isMultiMode && folderMappingId) {
          const folderName = groupingPath.split('/').pop() ?? 'Specs'

          // Look up or create a folder_mappings row for the subfolder to persist doc/page IDs
          let subRow: { id: string; clickup_doc_id: string | null; clickup_page_id: string | null } | null = null

          const { data: existingSub } = await supabase
            .from('folder_mappings')
            .select('id, clickup_doc_id, clickup_page_id')
            .eq('project_id', project_id)
            .eq('integration_id', integration_id)
            .eq('folder_path', groupingPath)
            .single()

          if (existingSub) {
            subRow = existingSub
          } else {
            const { data: created } = await supabase
              .from('folder_mappings')
              .insert({ project_id, integration_id, folder_path: groupingPath })
              .select('id, clickup_doc_id, clickup_page_id')
              .single()
            subRow = created
          }

          const subId = subRow?.id ?? null
          const subDocId = subRow?.clickup_doc_id ?? null
          const subPageId = subRow?.clickup_page_id ?? null

          const multiResult = await publishSpecAsPage(
            clickupCreds,
            spec,
            subDocId,
            subPageId,
            existingPageId,
            folderName,
            folderMappingTargetId
          )
          if (subId) {
            const mappingUpdates: Record<string, string> = {}
            if (!subDocId && multiResult.doc_id) mappingUpdates.clickup_doc_id = multiResult.doc_id
            if (!subPageId && multiResult.folder_page_id) mappingUpdates.clickup_page_id = multiResult.folder_page_id
            if (Object.keys(mappingUpdates).length > 0) {
              await supabase.from('folder_mappings').update(mappingUpdates).eq('id', subId)
            }
          }
          result = { doc_id: multiResult.page_id, doc_url: multiResult.doc_url }
        } else {
          result = await publishSingleSpec(clickupCreds, spec, existingPageId, folderMappingTargetId)
        }
        break
      }

      default:
        throw new UnrecoverableError(`Unknown target type: ${target_type}`)
    }

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

    if (status === 400 || status === 422) {
      await supabase
        .from('spec_publish_targets')
        .update({ status: 'failed', last_error: `Payload error (${status}): ${message}` })
        .eq('id', spec_publish_target_id)
      throw new UnrecoverableError(message)
    }

    if (attemptsMade >= maxAttempts - 1) {
      await supabase
        .from('spec_publish_targets')
        .update({ status: 'failed', last_error: message, retry_count: attemptsMade + 1 })
        .eq('id', spec_publish_target_id)
    } else {
      await supabase
        .from('spec_publish_targets')
        .update({ retry_count: (target?.retry_count ?? 0) + 1, last_error: message })
        .eq('id', spec_publish_target_id)
    }

    throw err
  }
}
