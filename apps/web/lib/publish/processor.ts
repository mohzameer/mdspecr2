import { createSupabaseServiceClient } from '@/lib/db-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publishToNotion } from './adapters/notion'
import { publishToConfluence } from './adapters/confluence'
import { publishSingleSpec, publishSpecAsPage, publishAsTask, clickUpDocExists, resolveToNativeTaskId } from './adapters/clickup'
import { resolveFolderMapping } from '@/lib/folder-mapping'
import { runAgentInline } from '@/lib/agents/processor'
import type { PublishGroupJobData, PublishGroupSpec, IntegrationType } from '@/lib/types'

// Terminal error — QStash should not retry
export class UnrecoverableError extends Error {
  readonly unrecoverable = true
}

interface GroupContext {
  supabase: SupabaseClient
  credentials: Record<string, unknown>
  integration_id: string
  project_id: string
  target_type: IntegrationType
  // ClickUp-only shared state
  folderMappingTargetId: string | null
  folderMappingPath: string | null
  folderMappingId: string | null
  isMultiMode: boolean
  groupingPath: string | null
  groupFolderName: string | null
  sharedSubRowId: string | null
  sharedSubDocId: string | null
  // In-memory cache: sub-folder path → ClickUp section page ID (created on demand)
  sectionPageIds: Map<string, string>
  // Whether to preserve folder hierarchy as sections inside the parent doc (hidden/disabled for now)
  preserveHierarchy: boolean
  // Task list mode
  clickupMode: 'doc' | 'task_list'
  clickupListId: string | null
  clickupUseCustomTaskIds: boolean
  clickupFrontmatterMap: Record<string, string> | null
}

export async function runPublishGroup(data: PublishGroupJobData): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { project_id, integration_id, target_type, specs } = data

  if (specs.length === 0) {
    console.log(`[publish] empty group — nothing to do`)
    return
  }

  console.log(`[publish] group start — integration=${integration_id} target=${target_type} specs=${specs.length}`)

  // -- Fetch integration credentials once ------------------------------------
  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('credentials, status')
    .eq('id', integration_id)
    .single()

  if (integrationError || !integration) {
    throw new UnrecoverableError(`Integration ${integration_id} not found`)
  }

  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(integration.credentials)
  } catch {
    throw new UnrecoverableError('Invalid integration credentials JSON')
  }

  // -- Resolve folder mapping for the group (all specs share immediateParent) -
  const ctx: GroupContext = {
    supabase,
    credentials,
    integration_id,
    project_id,
    target_type,
    folderMappingTargetId: null,
    folderMappingPath: null,
    folderMappingId: null,
    isMultiMode: false,
    groupingPath: null,
    groupFolderName: null,
    sharedSubRowId: null,
    sharedSubDocId: null,
    sectionPageIds: new Map(),
    preserveHierarchy: false,
    clickupMode: 'doc',
    clickupListId: null,
    clickupUseCustomTaskIds: false,
    clickupFrontmatterMap: null,
  }

  if (target_type === 'clickup') {
    await setupClickupGroupContext(ctx, data.matched_folder ?? specs[0].path.split('/').slice(0, -1).join('/'), data.clickup_mode ?? 'doc')
  }

  // -- Iterate specs sequentially --------------------------------------------
  for (const spec of specs) {
    try {
      await processOneSpec(ctx, spec)
    } catch (err) {
      const error = err as { response?: { status?: number }; message?: string }
      const status = error.response?.status
      const message = error.message ?? String(err)

      if (status === 401 || status === 403) {
        // Auth failure affects all specs — mark integration unhealthy and abort group
        await supabase
          .from('integrations')
          .update({ status: 'unhealthy', updated_at: new Date().toISOString() })
          .eq('id', integration_id)
        await supabase
          .from('spec_publish_targets')
          .update({ status: 'failed', last_error: `Auth error (${status}): ${message}` })
          .eq('id', spec.spec_publish_target_id)
        throw new UnrecoverableError(`Auth error on integration ${integration_id}: ${message}`)
      }

      // Per-spec failure — record and continue with remaining specs
      await supabase
        .from('spec_publish_targets')
        .update({ status: 'failed', last_error: `${status ? `(${status}) ` : ''}${message}` })
        .eq('id', spec.spec_publish_target_id)
      console.error(`[publish] spec ${spec.spec_id} failed: ${message}`)
    }
  }

  console.log(`[publish] group done — integration=${integration_id} specs=${specs.length}`)
}

// ---------------------------------------------------------------------------
// ClickUp group context: resolve user mapping, decide single vs multi mode,
// and — critically — verify/recreate the shared subfolder doc ONCE so all
// specs in the group reuse the same doc/root page.
// ---------------------------------------------------------------------------
async function setupClickupGroupContext(ctx: GroupContext, matchedFolder: string, clickupMode: 'doc' | 'task_list'): Promise<void> {
  const { supabase, project_id, integration_id, credentials } = ctx

  // Use the matched folder directly — already resolved by the publish route via longest-prefix.
  // Root-level specs (empty string) use single mode.
  const rootFolder = matchedFolder
  if (!rootFolder) return

  // Set mode on context so processOneSpec can dispatch correctly.
  ctx.clickupMode = clickupMode

  // Resolve the folder mapping row for this (project, integration, folder, mode).
  // Rows carry user config (target_id, list_id, frontmatter_map, etc.) and also
  // serve as the bookkeeping record for the shared folder doc (doc mode only).
  const { data: mapping } = await supabase
    .from('folder_mappings')
    .select('id, folder_path, target_id, clickup_list_id, clickup_use_custom_task_ids, frontmatter_map, clickup_doc_id, clickup_page_id')
    .eq('project_id', project_id)
    .eq('integration_id', integration_id)
    .eq('clickup_mode', clickupMode)
    .eq('folder_path', rootFolder)
    .maybeSingle()

  if (mapping) {
    ctx.folderMappingTargetId = mapping.target_id ?? null
    ctx.folderMappingId = mapping.id
    ctx.folderMappingPath = rootFolder
    ctx.clickupListId = mapping.clickup_list_id ?? null
    ctx.clickupUseCustomTaskIds = mapping.clickup_use_custom_task_ids ?? false
    ctx.clickupFrontmatterMap = (mapping.frontmatter_map as Record<string, string> | null) ?? null
    // If user explicitly selected a parent doc, use it as the shared doc ID —
    // no auto-creation needed, no race condition possible.
    if (mapping.clickup_doc_id) {
      ctx.sharedSubDocId = mapping.clickup_doc_id
    }
  }

  // Task list mode: no shared folder doc to manage — exit here.
  if (clickupMode === 'task_list') {
    console.log(`[publish] group task_list — mapping=${ctx.folderMappingPath ?? 'none'} listId=${ctx.clickupListId ?? 'none'}`)
    return
  }

  if (!mapping) {
    throw new UnrecoverableError(`No folder mapping found for ${ctx.groupingPath} — cannot proceed`)
  }

  ctx.sharedSubRowId = mapping.id

  // If user selected a parent doc, use it (multi-mode — pages published inside it, flat by default).
  // If no doc selected, specs publish flat to the destination root (single mode per spec).
  // preserveHierarchy checkbox (hidden/disabled for now) would re-enable subfolder sections.
  if (ctx.sharedSubDocId) {
    ctx.isMultiMode = true
    ctx.preserveHierarchy = false // hidden checkbox — disabled, pages always flat under parent doc
    ctx.groupingPath = rootFolder
    ctx.groupFolderName = rootFolder

    // Verify the selected doc still exists in ClickUp
    const clickupCreds = {
      api_token: credentials.api_token as string,
      workspace_id: credentials.workspace_id as string,
    }
    const stillExists = await clickUpDocExists(clickupCreds, ctx.sharedSubDocId)
    if (!stillExists) {
      console.log(`[publish] selected parent doc ${ctx.sharedSubDocId} missing — falling back to flat mode`)
      ctx.sharedSubDocId = null
      ctx.isMultiMode = false
    }
  }

  console.log(`[publish] group mode=${ctx.isMultiMode ? 'multi' : 'flat'} mapping=${ctx.folderMappingPath ?? 'none'} docId=${ctx.sharedSubDocId ?? 'none'}`)
}

// ---------------------------------------------------------------------------
// Per-spec processing inside an already-resolved group context
// ---------------------------------------------------------------------------
async function processOneSpec(ctx: GroupContext, spec: PublishGroupSpec): Promise<void> {
  const { supabase, credentials, project_id, target_type } = ctx
  const { spec_id, spec_publish_target_id, path, frontmatter, content_hash } = spec
  let { content } = spec

  // -- Agent routing ---------------------------------------------------------
  const resolution = await resolveFolderMapping(supabase, project_id, path, frontmatter, ctx.integration_id, ctx.clickupMode)
  if (resolution.shouldRunAgent && resolution.templateId && resolution.trigger) {
    console.log(`[publish] spec ${spec_id} → agent (template ${resolution.templateId})`)
    content = await runAgentInline(
      supabase,
      spec_id,
      resolution.templateId,
      resolution.trigger,
      content,
      target_type
    )
  }

  // -- Fetch current publish target state ------------------------------------
  const { data: target } = await supabase
    .from('spec_publish_targets')
    .select('external_page_id, retry_count')
    .eq('id', spec_publish_target_id)
    .single()

  let existingPageId = target?.external_page_id ?? null

  // For ClickUp single mode: verify the stored doc still exists
  if (target_type === 'clickup' && existingPageId && !ctx.isMultiMode) {
    const remoteExists = await clickUpDocExists(
      { api_token: credentials.api_token as string, workspace_id: credentials.workspace_id as string },
      existingPageId
    )
    if (!remoteExists) {
      console.log(`[publish] clickup doc ${existingPageId} missing — recreating spec ${spec_id}`)
      existingPageId = null
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: null, external_url: null })
        .eq('id', spec_publish_target_id)
    }
  }

  // Skip if content unchanged — but in multi-mode only if the folder doc already exists.
  // If there's no shared doc yet, we must publish to create the folder structure even
  // if content is the same (e.g. transitioning from single-mode to multi-mode).
  const canSkip = existingPageId && (!ctx.isMultiMode || ctx.sharedSubDocId)
  if (canSkip) {
    const { data: currentSpec } = await supabase
      .from('specs')
      .select('content_hash')
      .eq('id', spec_id)
      .single()
    if (content_hash && currentSpec?.content_hash === content_hash) {
      console.log(`[publish] skipping spec ${spec_id} — remote exists and content unchanged`)
      await supabase
        .from('spec_publish_targets')
        .update({ status: 'published' })
        .eq('id', spec_publish_target_id)
      return
    }
  }

  // Resolve title once here so all adapters use the same value
  const specPayload = { path, content, frontmatter, resolvedTitle: spec.title }

  // -- Dispatch to adapter ---------------------------------------------------
  let result: { page_id?: string; doc_id?: string; page_url?: string; doc_url?: string }

  switch (target_type) {
    case 'notion':
      result = await publishToNotion(
        { token: credentials.token as string, root_page_id: credentials.root_page_id as string },
        specPayload,
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
        specPayload,
        existingPageId
      )
      break

    case 'clickup': {
      const clickupCreds = {
        api_token: credentials.api_token as string,
        workspace_id: credentials.workspace_id as string,
      }

      if (ctx.clickupMode === 'task_list') {
        if (!ctx.clickupListId) throw new Error('clickup_list_id not configured for task_list mode')

        console.log(`[publish:task] spec=${spec_id} path=${path}`)
        console.log(`[publish:task] id_ref from .mdspecmap specs: ${spec.id_ref ?? '(not set)'}`)
        console.log(`[publish:task] existingPageId from DB: ${existingPageId ?? '(none)'}`)

        // Adopt task ID from links: section in .mdspecmap (one-time link to a pre-existing task).
        // Resolve to native ID — one GET call here, never again after the native ID is stored.
        if (!existingPageId && spec.id_ref) {
          const nativeId = await resolveToNativeTaskId(clickupCreds, spec.id_ref, ctx.clickupUseCustomTaskIds)
          console.log(`[publish:task] resolveToNativeTaskId("${spec.id_ref}") → ${nativeId ?? 'null (not found)'}`)
          if (nativeId) {
            existingPageId = nativeId
            await supabase
              .from('spec_publish_targets')
              .update({ external_page_id: nativeId })
              .eq('id', spec_publish_target_id)
            console.log(`[publish:task] adopted task ${spec.id_ref} → native id ${nativeId}`)
          } else {
            console.log(`[publish:task] task ref ${spec.id_ref} not found in ClickUp — will create new task`)
          }
        } else if (!existingPageId) {
          console.log(`[publish:task] no id_ref in specs — will create new task`)
        }

        let taskResult = await publishAsTask(clickupCreds, specPayload, existingPageId, ctx.clickupListId, ctx.clickupFrontmatterMap)

        // Stored ID was stale (task deleted in ClickUp) — try to re-resolve from
        // links: section before falling through to create a brand new task.
        if (taskResult.previousIdStale) {
          console.log(`[publish:task] stale stored id — re-checking task_ref: ${spec.id_ref ?? '(not set)'}`)
          let resolvedId: string | null = null
          if (spec.id_ref) {
            resolvedId = await resolveToNativeTaskId(clickupCreds, spec.id_ref, ctx.clickupUseCustomTaskIds)
            console.log(`[publish:task] re-resolve "${spec.id_ref}" → ${resolvedId ?? 'null'}`)
          }
          // Clear stale ID from DB — will be replaced with new one after this publish
          await supabase
            .from('spec_publish_targets')
            .update({ external_page_id: null })
            .eq('id', spec_publish_target_id)
          taskResult = await publishAsTask(clickupCreds, specPayload, resolvedId, ctx.clickupListId)
        }

        result = { page_id: taskResult.task_id, page_url: taskResult.task_url }
      } else if (ctx.isMultiMode && ctx.groupFolderName) {
        const multiResult = await publishSpecAsPage(
          clickupCreds,
          specPayload,
          ctx.sharedSubDocId,
          existingPageId,
          ctx.groupFolderName,
          ctx.folderMappingTargetId,
          ctx.preserveHierarchy ? ctx.sectionPageIds : undefined
        )

        // First spec in the group may create the shared doc — persist its ID
        // to the bookkeeping row and propagate to context for subsequent specs.
        if (multiResult.doc_id && multiResult.doc_id !== ctx.sharedSubDocId) {
          ctx.sharedSubDocId = multiResult.doc_id
          if (ctx.sharedSubRowId) {
            await supabase
              .from('folder_mappings')
              .update({ clickup_doc_id: multiResult.doc_id })
              .eq('id', ctx.sharedSubRowId)
          }
        }

        result = { doc_id: multiResult.page_id, doc_url: multiResult.doc_url }
      } else {
        result = await publishSingleSpec(clickupCreds, specPayload, existingPageId, ctx.folderMappingTargetId)
      }
      break
    }

    default:
      throw new UnrecoverableError(`Unknown target type: ${target_type}`)
  }

  // -- Record success --------------------------------------------------------
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
}
