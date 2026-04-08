import { createSupabaseServiceClient } from '@/lib/db-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publishToNotion } from './adapters/notion'
import { publishToConfluence } from './adapters/confluence'
import { publishSingleSpec, publishSpecAsPage, clickUpDocExists } from './adapters/clickup'
import { resolveFolderMapping } from '@/lib/folder-mapping'
import { getAncestorFolders } from '@/lib/folder-hierarchy'
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
  sharedSubPageId: string | null
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
    sharedSubPageId: null,
  }

  if (target_type === 'clickup') {
    await setupClickupGroupContext(ctx, specs[0].path)
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
async function setupClickupGroupContext(ctx: GroupContext, samplePath: string): Promise<void> {
  const { supabase, project_id, integration_id, credentials } = ctx

  // Resolve user-mapped ancestor folder
  const ancestors = getAncestorFolders(samplePath).slice().reverse()
  if (ancestors.length === 0) return

  const normalisedPaths = ancestors.map((a) => a.path)
  const pathVariants = [...new Set(normalisedPaths.flatMap((p) => [p, `/${p}`, `${p}/`, `/${p}/`]))]

  const { data: mappings } = await supabase
    .from('folder_mappings')
    .select('id, folder_path, target_id')
    .eq('project_id', project_id)
    .eq('integration_id', integration_id)
    .in('folder_path', pathVariants)
    .is('clickup_doc_id', null) // exclude auto-created subfolder bookkeeping rows

  if (mappings && mappings.length > 0) {
    for (const a of ancestors) {
      const match = mappings.find(
        (m) => m.folder_path.replace(/^\//, '').replace(/\/$/, '') === a.path
      )
      if (match) {
        ctx.folderMappingTargetId = match.target_id ?? null
        ctx.folderMappingId = match.id
        ctx.folderMappingPath = a.path
        break
      }
    }
  }

  if (!ctx.folderMappingId) return

  // Decide single vs multi mode based on the group's immediateParent
  const immediateParent = samplePath.split('/').slice(0, -1).join('/')
  const isDirectlyInMappingFolder = immediateParent === ctx.folderMappingPath

  if (isDirectlyInMappingFolder || !immediateParent) {
    console.log(`[publish] group single-mode — mapping=${ctx.folderMappingPath}`)
    return
  }

  // Multi mode: all specs in this group share a subfolder doc
  ctx.isMultiMode = true
  ctx.groupingPath = immediateParent
  ctx.groupFolderName = immediateParent.split('/').pop() ?? 'Specs'

  // Lookup or create the subfolder bookkeeping row (single-flight here because
  // this is the only worker processing this group)
  const { data: existingSub } = await supabase
    .from('folder_mappings')
    .select('id, clickup_doc_id, clickup_page_id')
    .eq('project_id', project_id)
    .eq('integration_id', integration_id)
    .eq('folder_path', ctx.groupingPath)
    .maybeSingle()

  let sub = existingSub
  if (!sub) {
    const { data: created } = await supabase
      .from('folder_mappings')
      .insert({ project_id, integration_id, folder_path: ctx.groupingPath })
      .select('id, clickup_doc_id, clickup_page_id')
      .single()
    sub = created ?? null
  }

  if (!sub) {
    throw new UnrecoverableError(`Failed to obtain subfolder bookkeeping row for ${ctx.groupingPath}`)
  }

  ctx.sharedSubRowId = sub.id
  ctx.sharedSubDocId = sub.clickup_doc_id
  ctx.sharedSubPageId = sub.clickup_page_id

  // Verify the stored doc still exists in ClickUp. If it was deleted, clear
  // the stale IDs so the first spec to publish will create a fresh one.
  if (ctx.sharedSubDocId) {
    const clickupCreds = {
      api_token: credentials.api_token as string,
      workspace_id: credentials.workspace_id as string,
    }
    const stillExists = await clickUpDocExists(clickupCreds, ctx.sharedSubDocId)
    if (!stillExists) {
      console.log(`[publish] group multi-mode — stored folder doc ${ctx.sharedSubDocId} missing, will recreate`)
      ctx.sharedSubDocId = null
      ctx.sharedSubPageId = null
      await supabase
        .from('folder_mappings')
        .update({ clickup_doc_id: null, clickup_page_id: null })
        .eq('id', ctx.sharedSubRowId)
    }
  }

  console.log(`[publish] group multi-mode — mapping=${ctx.folderMappingPath} grouping=${ctx.groupingPath} docId=${ctx.sharedSubDocId ?? 'none'} rootPageId=${ctx.sharedSubPageId ?? 'none'}`)
}

// ---------------------------------------------------------------------------
// Per-spec processing inside an already-resolved group context
// ---------------------------------------------------------------------------
async function processOneSpec(ctx: GroupContext, spec: PublishGroupSpec): Promise<void> {
  const { supabase, credentials, project_id, target_type } = ctx
  const { spec_id, spec_publish_target_id, path, frontmatter, content_hash } = spec
  let { content } = spec

  // -- Agent routing ---------------------------------------------------------
  const resolution = await resolveFolderMapping(supabase, project_id, path, frontmatter)
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

  // Skip if content unchanged
  if (existingPageId) {
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

  const specPayload = { path, content, frontmatter }

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

      if (ctx.isMultiMode && ctx.groupFolderName) {
        const multiResult = await publishSpecAsPage(
          clickupCreds,
          specPayload,
          ctx.sharedSubDocId,
          ctx.sharedSubPageId,
          existingPageId,
          ctx.groupFolderName,
          ctx.folderMappingTargetId
        )

        // First spec in the group creates the shared doc/root page — propagate
        // those IDs to the context so subsequent specs reuse them, and persist
        // to the bookkeeping row.
        const updates: Record<string, string> = {}
        if (multiResult.doc_id && multiResult.doc_id !== ctx.sharedSubDocId) {
          ctx.sharedSubDocId = multiResult.doc_id
          updates.clickup_doc_id = multiResult.doc_id
        }
        if (multiResult.folder_page_id && multiResult.folder_page_id !== ctx.sharedSubPageId) {
          ctx.sharedSubPageId = multiResult.folder_page_id
          updates.clickup_page_id = multiResult.folder_page_id
        }
        if (ctx.sharedSubRowId && Object.keys(updates).length > 0) {
          await supabase.from('folder_mappings').update(updates).eq('id', ctx.sharedSubRowId)
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
