import { createSupabaseServiceClient } from '@/lib/db-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publishToNotion, getNotionPageParentId } from './adapters/notion'
import { publishToConfluence } from './adapters/confluence'
import { publishSingleSpec, publishSpecAsPage, publishAsTask, clickUpDocExists, clickUpPageExists, resolveToNativeTaskId, getClickUpDocParent, getClickUpTaskListId } from './adapters/clickup'
import { publishToS3, buildS3Key, s3ObjectExists } from './adapters/s3'
import { resolveFolderMapping } from '@/lib/folder-mapping'
import { runAgentInline } from '@/lib/agents/processor'
import { readCredentials } from '@/lib/credentials'
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
  // Generic per-mapping frontmatter key map (canonical-attr → frontmatter-key)
  frontmatterMap: Record<string, string> | null
  // S3-only
  s3RootPrefix: string | null
  s3MaintainHierarchy: boolean
  s3MatchedFolder: string        // needed to compute relative path when hierarchy=true
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
    .select('credentials_secret_id, status')
    .eq('id', integration_id)
    .single()

  if (integrationError || !integration) {
    throw new UnrecoverableError(`Integration ${integration_id} not found`)
  }

  if (!integration.credentials_secret_id) {
    throw new UnrecoverableError('Integration credentials missing — reconnect required')
  }

  let credentials: Record<string, unknown>
  try {
    const plaintext = await readCredentials(supabase, integration.credentials_secret_id)
    credentials = JSON.parse(plaintext)
  } catch (err) {
    throw new UnrecoverableError(`Invalid integration credentials: ${(err as Error).message}`)
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
    frontmatterMap: data.frontmatter_map ?? null,
    s3RootPrefix: null,
    s3MaintainHierarchy: false,
    s3MatchedFolder: '',
  }

  if (target_type === 'clickup') {
    await setupClickupGroupContext(ctx, data.matched_folder ?? specs[0].path.split('/').slice(0, -1).join('/'), data.clickup_mode ?? 'doc')
  } else if (target_type === 's3') {
    // Seed prefix from job data; folder_mappings lookup may override it for folder-scoped mappings
    ctx.s3RootPrefix = data.s3_root_prefix ?? null
    await setupS3GroupContext(ctx, data.matched_folder ?? specs[0].path.split('/').slice(0, -1).join('/'))
  } else if (target_type === 'notion') {
    await setupNotionGroupContext(ctx, data.matched_folder ?? specs[0].path.split('/').slice(0, -1).join('/'))
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

      // Per-spec failure — record and continue with remaining specs.
      // If the remote rejected the update because it (or its parent) is archived,
      // clear the stored pointer so the next sync starts fresh rather than
      // retrying the same stale ID forever.
      const isArchivedError = (err as { code?: string }).code === 'validation_error' && message.includes('archived')
      const sptPatch: Record<string, unknown> = { status: 'failed', last_error: `${status ? `(${status}) ` : ''}${message}` }
      if (isArchivedError) sptPatch.external_page_id = null
      await supabase
        .from('spec_publish_targets')
        .update(sptPatch)
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
    // DB folder_mappings.frontmatter_map wins over job-level (more specific)
    if (mapping.frontmatter_map) {
      ctx.frontmatterMap = mapping.frontmatter_map as Record<string, string>
    }
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

    // Verify the selected doc still exists in ClickUp, AND that it lives
    // under the current folder mapping target. If the user re-pointed the
    // mapping to a different space/folder, the old shared doc is now in
    // the wrong place — abandon it so a fresh one gets created under the
    // correct parent (Notion-parity self-healing).
    const clickupCreds = {
      api_token: credentials.api_token as string,
      workspace_id: credentials.workspace_id as string,
    }
    const parentRes = await getClickUpDocParent(clickupCreds, ctx.sharedSubDocId)
    if (!parentRes.ok) {
      console.log(`[publish] selected parent doc ${ctx.sharedSubDocId} missing — falling back to flat mode`)
      ctx.sharedSubDocId = null
      ctx.isMultiMode = false
    } else if (ctx.folderMappingTargetId && parentRes.parent !== ctx.folderMappingTargetId) {
      console.log(`[publish] shared doc ${ctx.sharedSubDocId} parent=${parentRes.parent ?? '(none)'} != expected=${ctx.folderMappingTargetId} — abandoning, will recreate under correct parent`)
      ctx.sharedSubDocId = null
      // Clear bookkeeping so the first spec creates a new shared doc.
      if (ctx.sharedSubRowId) {
        await supabase
          .from('folder_mappings')
          .update({ clickup_doc_id: null })
          .eq('id', ctx.sharedSubRowId)
      }
    }
  }

  console.log(`[publish] group mode=${ctx.isMultiMode ? 'multi' : 'flat'} mapping=${ctx.folderMappingPath ?? 'none'} docId=${ctx.sharedSubDocId ?? 'none'}`)
}

// ---------------------------------------------------------------------------
// Notion group context: read folder_mappings.target_id so the per-folder
// destination (sub-page picked in the dashboard) overrides the integration
// default root_page_id. Without this, changing the destination via the UI
// has no effect on actual publishing.
// ---------------------------------------------------------------------------
async function setupNotionGroupContext(ctx: GroupContext, matchedFolder: string): Promise<void> {
  const { supabase, project_id, integration_id } = ctx

  const { data: mapping } = await supabase
    .from('folder_mappings')
    .select('id, folder_path, target_id, frontmatter_map')
    .eq('project_id', project_id)
    .eq('integration_id', integration_id)
    .eq('folder_path', matchedFolder)
    .maybeSingle()

  if (mapping) {
    ctx.folderMappingTargetId = (mapping.target_id as string | null) ?? null
    ctx.folderMappingId = mapping.id as string
    ctx.folderMappingPath = matchedFolder
    if (mapping.frontmatter_map) {
      ctx.frontmatterMap = mapping.frontmatter_map as Record<string, string>
    }
  }

  console.log(`[publish:notion] folder=${matchedFolder} target_id=${ctx.folderMappingTargetId ?? '(none)'}`)
}

// ---------------------------------------------------------------------------
// S3 group context: resolve folder mapping for s3_format and root prefix
// ---------------------------------------------------------------------------
async function setupS3GroupContext(ctx: GroupContext, matchedFolder: string): Promise<void> {
  const { supabase, project_id, integration_id } = ctx

  const { data: mapping } = await supabase
    .from('folder_mappings')
    .select('id, target_id, s3_maintain_hierarchy, frontmatter_map')
    .eq('project_id', project_id)
    .eq('integration_id', integration_id)
    .eq('folder_path', matchedFolder)
    .maybeSingle()

  if (mapping) {
    ctx.folderMappingId = mapping.id
    ctx.folderMappingPath = matchedFolder
    // folder_mappings.target_id overrides the job-level prefix for folder-scoped mappings
    if (mapping.target_id !== null) ctx.s3RootPrefix = mapping.target_id
    ctx.s3MaintainHierarchy = (mapping.s3_maintain_hierarchy as boolean | null) ?? false
    ctx.s3MatchedFolder = matchedFolder
    if (mapping.frontmatter_map) {
      ctx.frontmatterMap = mapping.frontmatter_map as Record<string, string>
    }
  }

  console.log(`[publish:s3] folder=${matchedFolder} prefix=${ctx.s3RootPrefix ?? '(none)'} hierarchy=${ctx.s3MaintainHierarchy}`)
}

// ---------------------------------------------------------------------------
// Per-spec processing inside an already-resolved group context
// ---------------------------------------------------------------------------
async function processOneSpec(ctx: GroupContext, spec: PublishGroupSpec): Promise<void> {
  const { supabase, credentials, project_id, target_type } = ctx
  const { spec_id, spec_publish_target_id, path, content_hash } = spec
  let { content } = spec

  // -- Agent routing ---------------------------------------------------------
  // Unified `spec.agent` (resolved by CLI: frontmatter.agent > specs[path].agent)
  // wins over folder-mapping templates. `agent: 'none'` opts out entirely.
  const resolution = await resolveFolderMapping(supabase, project_id, path, spec.agent, ctx.integration_id, ctx.clickupMode)
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

  // -- Unified `id` is authoritative (UNIFIED_ATTRIBUTES_SPEC §4) -----------
  // Resolved `id` (frontmatter wins over .mdspecmap specs[path].id) is the
  // source of truth on every publish. If it differs from the stored binding,
  // re-point the ledger; if it matches, no-op. Removing `id` from frontmatter
  // and mapping falls back to the existing binding.
  // Integration-agnostic — adapter interprets `spec.id` per its native ID format.
  if (spec.id) {
    let resolved: string | null = spec.id
    if (target_type === 'clickup' && ctx.clickupMode === 'task_list') {
      const clickupCreds = { api_token: credentials.api_token as string, workspace_id: credentials.workspace_id as string }
      resolved = await resolveToNativeTaskId(clickupCreds, spec.id, ctx.clickupUseCustomTaskIds)
      console.log(`[publish] unified id="${spec.id}" → native ${resolved ?? 'null'}`)
    }
    if (resolved && resolved !== existingPageId) {
      console.warn(`[publish] re-pointing spec ${spec_id} from ${existingPageId ?? '(none)'} to ${resolved} (id_source=${spec.id_source ?? 'unknown'})`)
      existingPageId = resolved
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: resolved })
        .eq('id', spec_publish_target_id)
    }
  }

  // For ClickUp doc mode (single/flat): verify the stored doc still exists.
  // task_list mode stores a task ID, not a doc ID — skip this check for it.
  if (target_type === 'clickup' && existingPageId && !ctx.isMultiMode && ctx.clickupMode !== 'task_list') {
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

  // ClickUp doc mode (single/flat) self-heal: the .mdspecmap parent is
  // authoritative. If the stored doc lives under a different parent than
  // the current folder mapping target, abandon it and create fresh — the
  // ClickUp API can't move docs between spaces/folders, and we never want
  // to keep updating a doc in the wrong place.
  if (target_type === 'clickup' && existingPageId && !ctx.isMultiMode && ctx.clickupMode !== 'task_list' && ctx.folderMappingTargetId) {
    const parentRes = await getClickUpDocParent(
      { api_token: credentials.api_token as string, workspace_id: credentials.workspace_id as string },
      existingPageId
    )
    if (parentRes.ok && parentRes.parent !== ctx.folderMappingTargetId) {
      console.log(`[publish] clickup doc ${existingPageId} parent=${parentRes.parent ?? '(none)'} != expected=${ctx.folderMappingTargetId} — recreating spec ${spec_id} under correct parent`)
      existingPageId = null
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: null, external_url: null })
        .eq('id', spec_publish_target_id)
    }
  }

  // ClickUp task mode self-heal: if the stored task lives in a different
  // list than the current folder mapping (user re-pointed the list, or a
  // previous publish raced ahead of a destination cascade), abandon it
  // and create fresh in the correct list. ClickUp can't move tasks
  // between lists via the task PUT endpoint.
  if (target_type === 'clickup' && existingPageId && ctx.clickupMode === 'task_list' && ctx.clickupListId) {
    const listRes = await getClickUpTaskListId(
      { api_token: credentials.api_token as string, workspace_id: credentials.workspace_id as string },
      existingPageId,
      ctx.clickupUseCustomTaskIds
    )
    if (!listRes.ok) {
      console.log(`[publish] clickup task ${existingPageId} missing — recreating spec ${spec_id}`)
      existingPageId = null
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: null, external_url: null })
        .eq('id', spec_publish_target_id)
    } else if (listRes.listId !== ctx.clickupListId) {
      console.log(`[publish] clickup task ${existingPageId} list=${listRes.listId ?? '(none)'} != expected=${ctx.clickupListId} — recreating spec ${spec_id} in correct list`)
      existingPageId = null
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: null, external_url: null })
        .eq('id', spec_publish_target_id)
    }
  }

  // In multi-mode, the stored page ID may be a stale flat-mode doc ID — verify it
  // actually exists as a page inside the current parent doc before allowing a skip.
  if (ctx.isMultiMode && existingPageId && ctx.sharedSubDocId) {
    const clickupCreds = { api_token: credentials.api_token as string, workspace_id: credentials.workspace_id as string }
    const pageExists = await clickUpPageExists(clickupCreds, ctx.sharedSubDocId, existingPageId)
    if (!pageExists) {
      console.log(`[publish] page ${existingPageId} not found in doc ${ctx.sharedSubDocId} — will republish spec ${spec_id}`)
      existingPageId = null
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: null, external_url: null })
        .eq('id', spec_publish_target_id)
    }
  }

  // For Notion (page mode only): the .mdspecmap parent is authoritative. If
  // the stored page lives under a different parent than the current
  // target_id (because the user re-pointed the mapping, or a previous
  // publish raced ahead of a destination cascade), abandon it and create
  // fresh under the new parent. Notion's API can't move pages, and we
  // never want to be stuck updating a page in the wrong place. Database
  // mode is exempt: rows are parented by data_source, not page, and the
  // page-id parent check doesn't apply.
  if (target_type === 'notion' && existingPageId && credentials.mode !== 'database') {
    const expectedParentId = ctx.folderMappingTargetId ?? (credentials.root_page_id as string | undefined) ?? null
    if (expectedParentId) {
      const parentRes = await getNotionPageParentId(credentials.token as string, existingPageId)
      if (!parentRes.ok) {
        console.log(`[publish] notion page ${existingPageId} missing/archived — recreating spec ${spec_id}`)
        existingPageId = null
        await supabase
          .from('spec_publish_targets')
          .update({ external_page_id: null, external_url: null })
          .eq('id', spec_publish_target_id)
      } else if (parentRes.parentId !== expectedParentId) {
        console.log(`[publish] notion page ${existingPageId} parent=${parentRes.parentId ?? '(none)'} != expected=${expectedParentId} — recreating spec ${spec_id} under correct parent`)
        existingPageId = null
        await supabase
          .from('spec_publish_targets')
          .update({ external_page_id: null, external_url: null })
          .eq('id', spec_publish_target_id)
      }
    }
  }

  // S3 self-heal: the .mdspecmap-driven config (root prefix +
  // maintain-hierarchy) is authoritative. If the stored object key no
  // longer matches what we'd compute now (because the user re-pointed
  // parent_dir or toggled hierarchy), abandon it locally so the next
  // publishToS3 writes at the correct key. The previous object will be
  // orphaned at its old key — that's fine; we never want to keep
  // updating the wrong location. Skip when spec.id is declared: that's
  // an explicit user-chosen key and wins over the computed key.
  if (target_type === 's3' && existingPageId && !spec.id) {
    const expectedKey = buildS3Key(path, ctx.s3RootPrefix, {
      maintainHierarchy: ctx.s3MaintainHierarchy,
      matchedFolder: ctx.s3MatchedFolder,
    })
    if (existingPageId !== expectedKey) {
      console.log(`[publish] s3 stored key=${existingPageId} != expected=${expectedKey} — republishing spec ${spec_id} at correct key`)
      existingPageId = null
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: null, external_url: null })
        .eq('id', spec_publish_target_id)
    }
  }

  // For S3: verify the object still exists before allowing a skip.
  // This handles the case where the bucket changed or objects were deleted.
  if (target_type === 's3' && existingPageId) {
    const s3Creds = credentials as { access_key_id: string; secret_access_key: string; bucket: string; region: string }
    const exists = await s3ObjectExists(s3Creds, existingPageId)
    if (!exists) {
      console.log(`[publish] s3 object ${existingPageId} missing — republishing spec ${spec_id}`)
      existingPageId = null
      await supabase
        .from('spec_publish_targets')
        .update({ external_page_id: null, external_url: null })
        .eq('id', spec_publish_target_id)
    }
  }

  // Resolve title once here so all adapters use the same value
  const specPayload = { path, content, resolvedTitle: spec.title }

  // -- Dispatch to adapter ---------------------------------------------------
  let result: { page_id?: string; doc_id?: string; page_url?: string; doc_url?: string }

  switch (target_type) {
    case 'notion':
      result = await publishToNotion(
        {
          token: credentials.token as string,
          root_page_id: ctx.folderMappingTargetId ?? (credentials.root_page_id as string),
          mode: credentials.mode as 'page' | 'database' | undefined,
          database_id: credentials.database_id as string | undefined,
          data_source_id: credentials.data_source_id as string | undefined,
        },
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

        console.log(`[publish:task] spec=${spec_id} path=${path} existingPageId=${existingPageId ?? '(none)'}`)

        let taskResult = await publishAsTask(clickupCreds, specPayload, existingPageId, ctx.clickupListId, ctx.frontmatterMap)

        // Stored ID was stale (task deleted in ClickUp) — try to re-resolve from
        // the unified id before falling through to create a brand new task.
        if (taskResult.previousIdStale) {
          console.log(`[publish:task] stale stored id — re-checking unified id: ${spec.id ?? '(not set)'}`)
          let resolvedId: string | null = null
          if (spec.id) {
            resolvedId = await resolveToNativeTaskId(clickupCreds, spec.id, ctx.clickupUseCustomTaskIds)
            console.log(`[publish:task] re-resolve "${spec.id}" → ${resolvedId ?? 'null'}`)
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

    case 's3': {
      const s3Creds = {
        access_key_id: credentials.access_key_id as string,
        secret_access_key: credentials.secret_access_key as string,
        bucket: credentials.bucket as string,
        region: credentials.region as string,
      }
      // Unified `id` (already adopted into existingPageId upstream) overrides the
      // computed object key — declared key wins.
      const objectKey = existingPageId ?? buildS3Key(path, ctx.s3RootPrefix, {
        maintainHierarchy: ctx.s3MaintainHierarchy,
        matchedFolder: ctx.s3MatchedFolder,
      })
      result = await publishToS3(s3Creds, specPayload, objectKey)
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
      content_hash: content_hash ?? null,
      published_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', spec_publish_target_id)
}
