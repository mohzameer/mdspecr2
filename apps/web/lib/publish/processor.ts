import { createSupabaseServiceClient } from '@/lib/db-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publishToNotion } from './adapters/notion'
import {
  publishToConfluence,
  isOAuthCredentials,
  refreshConfluenceToken,
  type ConfluenceOAuthCredentials,
} from './adapters/confluence'
import { publishAsDoc, publishAsTask, type ClickUpCredentials } from './adapters/clickup'
import { publishToS3, buildS3Key } from './adapters/s3'
import { publishToJira, refreshJiraToken, type JiraOAuthCredentials } from './adapters/jira'
import { runAgentInline } from '@/lib/agents/processor'
import { readCredentials, storeCredentials, deleteCredentials } from '@/lib/credentials'
import { sendUnhealthyIntegrationEmail } from '@/lib/emailNotifier'
import type { PublishJobData } from '@/lib/types'

// Terminal error — QStash should not retry
export class UnrecoverableError extends Error {
  readonly unrecoverable = true
}

// ---------------------------------------------------------------------------
// Title resolution — frontmatter doesn't reach the worker, so derive from
// content (first # heading) or fall back to filename stem.
// ---------------------------------------------------------------------------

function resolveTitle(content: string, specPath: string): string {
  for (const line of content.split('\n')) {
    const m = line.match(/^#\s+(.+)$/)
    if (m) return m[1].trim()
  }
  const filename = specPath.split('/').pop() ?? specPath
  return filename.replace(/\.md$/, '')
}

// ---------------------------------------------------------------------------
// Main entry — one spec per job (no folder-mapping groups in v2)
// ---------------------------------------------------------------------------

export async function runPublishJob(data: PublishJobData): Promise<void> {
  const supabase = createSupabaseServiceClient()
  console.log(`[publish] start spec=${data.spec_id} type=${data.spec_type} target=${data.target_type}`)

  // -- Fetch integration + credentials ---------------------------------------
  const { data: integration, error: intErr } = await supabase
    .from('integrations')
    .select('id, type, status, credentials_secret_id')
    .eq('id', data.integration_id)
    .single()

  if (intErr || !integration) {
    throw new UnrecoverableError(`Integration ${data.integration_id} not found`)
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

  // -- Refresh OAuth tokens if expiring within 5 minutes ---------------------
  if (data.target_type === 'confluence' && isOAuthCredentials(credentials as unknown as Parameters<typeof isOAuthCredentials>[0])) {
    let oauthCreds = credentials as unknown as ConfluenceOAuthCredentials
    const expiresAt = new Date(oauthCreds.expires_at).getTime()
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      oauthCreds = await refreshConfluenceToken(oauthCreds)
      const newSecretId = await storeCredentials(supabase, JSON.stringify(oauthCreds), `integration:${integration.id}:confluence`)
      await supabase.from('integrations').update({ credentials_secret_id: newSecretId, updated_at: new Date().toISOString() }).eq('id', integration.id)
      await deleteCredentials(supabase, integration.credentials_secret_id).catch(() => {})
      credentials = oauthCreds as unknown as Record<string, unknown>
    }
  }

  if (data.target_type === 'jira') {
    let oauthCreds = credentials as unknown as JiraOAuthCredentials
    const expiresAt = new Date(oauthCreds.expires_at).getTime()
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      oauthCreds = await refreshJiraToken(oauthCreds)
      const newSecretId = await storeCredentials(supabase, JSON.stringify(oauthCreds), `integration:${integration.id}:jira`)
      await supabase.from('integrations').update({ credentials_secret_id: newSecretId, updated_at: new Date().toISOString() }).eq('id', integration.id)
      await deleteCredentials(supabase, integration.credentials_secret_id).catch(() => {})
      credentials = oauthCreds as unknown as Record<string, unknown>
    }
  }

  // -- Find existing publish target (for self-heal / update path) ------------
  const { data: existingTarget } = await supabase
    .from('spec_publish_targets')
    .select('id, external_id, external_page_id, external_url, content_hash')
    .eq('spec_id', data.spec_id)
    .eq('integration_id', integration.id)
    .maybeSingle()

  // Dedup: skip republish if content hasn't changed since last publish
  if (existingTarget?.content_hash === data.content_hash && existingTarget?.external_id) {
    console.log(`[publish] skipping — content unchanged for spec ${data.spec_id}`)
    await markPublished(supabase, data, existingTarget.external_id, existingTarget.external_url ?? null, data.content_hash, existingTarget.external_page_id ?? null)
    return
  }

  // -- Run agent transformation if a template is attached --------------------
  let content = data.content
  if (data.agent_template) {
    try {
      content = await runAgentInline(supabase, data.spec_id, data.agent_template, data.content, data.target_type)
    } catch (err) {
      await markFailed(supabase, data, `agent failed: ${(err as Error).message}`)
      throw err
    }
  }

  const spec = {
    path: data.spec_path,
    content,
    resolvedTitle: resolveTitle(content, data.spec_path),
  }

  // -- Dispatch to adapter ---------------------------------------------------
  try {
    const result = await dispatchPublish(data, credentials, spec, existingTarget)
    await markPublished(supabase, data, result.external_id, result.external_url, data.content_hash, result.external_page_id ?? null)
  } catch (err) {
    const msg = (err as Error).message
    await markFailed(supabase, data, msg)
    await maybeFlagUnhealthy(supabase, integration, data, err as Error)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Adapter dispatch
// ---------------------------------------------------------------------------

interface PublishResult {
  external_id: string
  external_url: string
  external_page_id?: string
}

async function dispatchPublish(
  data: PublishJobData,
  credentials: Record<string, unknown>,
  spec: { path: string; content: string; resolvedTitle: string },
  existing: { external_id: string | null; external_page_id: string | null } | null
): Promise<PublishResult> {
  const externalId = existing?.external_id ?? null

  switch (data.target_type) {
    case 'notion': {
      const out = await publishToNotion(
        credentials as unknown as Parameters<typeof publishToNotion>[0],
        spec,
        externalId,
        data.parent_id,
      )
      return { external_id: out.page_id, external_url: out.page_url }
    }

    case 'confluence': {
      const out = await publishToConfluence(
        credentials as unknown as Parameters<typeof publishToConfluence>[0],
        spec,
        externalId,
        data.parent_id,
      )
      return { external_id: out.page_id, external_url: out.page_url }
    }

    case 'jira': {
      const out = await publishToJira(credentials as unknown as JiraOAuthCredentials, spec, externalId)
      return { external_id: out.page_id, external_url: out.page_url }
    }

    case 's3': {
      const key = buildS3Key(spec.path, data.parent_id)
      const out = await publishToS3(
        credentials as unknown as Parameters<typeof publishToS3>[0],
        spec,
        key,
      )
      return { external_id: out.page_id, external_url: out.page_url }
    }

    case 'clickup': {
      const creds = credentials as unknown as ClickUpCredentials
      if (data.spec_type === 'task') {
        const listId = data.parent_id
        if (!listId) throw new UnrecoverableError('ClickUp task publish requires a list ID in parent:')
        const out = await publishAsTask(creds, spec, listId, externalId)
        if (out.previousIdStale) {
          const fresh = await publishAsTask(creds, spec, listId, null)
          return { external_id: fresh.task_id, external_url: fresh.task_url }
        }
        return { external_id: out.task_id, external_url: out.task_url }
      }
      // wiki (or any other non-task type on ClickUp) → doc mode
      const existingDoc = existing?.external_id && existing?.external_page_id
        ? { docId: existing.external_id, pageId: existing.external_page_id }
        : null
      const out = await publishAsDoc(creds, spec, data.parent_id, existingDoc)
      return { external_id: out.doc_id, external_url: out.doc_url, external_page_id: out.page_id }
    }

    default:
      throw new UnrecoverableError(`unknown target_type: ${data.target_type as string}`)
  }
}

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------

async function markPublished(
  supabase: SupabaseClient,
  data: PublishJobData,
  externalId: string,
  externalUrl: string | null,
  contentHash: string,
  externalPageId: string | null = null
): Promise<void> {
  await supabase
    .from('spec_publish_targets')
    .update({
      external_id: externalId,
      external_page_id: externalPageId,
      external_url: externalUrl,
      status: 'published',
      last_error: null,
      content_hash: contentHash,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('spec_id', data.spec_id)
    .eq('integration_id', data.integration_id)
}

async function markFailed(
  supabase: SupabaseClient,
  data: PublishJobData,
  errorMessage: string
): Promise<void> {
  const { data: current } = await supabase
    .from('spec_publish_targets')
    .select('retry_count')
    .eq('spec_id', data.spec_id)
    .eq('integration_id', data.integration_id)
    .maybeSingle()

  await supabase
    .from('spec_publish_targets')
    .update({
      status: 'failed',
      last_error: errorMessage,
      retry_count: (current?.retry_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('spec_id', data.spec_id)
    .eq('integration_id', data.integration_id)
}

// ---------------------------------------------------------------------------
// Integration health: flip to 'unhealthy' on auth errors and notify
// ---------------------------------------------------------------------------

const AUTH_ERROR_HINTS = ['401', '403', 'unauthorized', 'invalid_token', 'unauthenticated', 'token rejected']

async function maybeFlagUnhealthy(
  supabase: SupabaseClient,
  integration: { id: string; type: string; status: string | null },
  data: PublishJobData,
  err: Error
): Promise<void> {
  const msg = err.message.toLowerCase()
  if (!AUTH_ERROR_HINTS.some((h) => msg.includes(h))) return
  if (integration.status === 'unhealthy') return

  await supabase
    .from('integrations')
    .update({ status: 'unhealthy', updated_at: new Date().toISOString() })
    .eq('id', integration.id)

  await sendUnhealthyIntegrationEmail({
    integrationId: integration.id,
    integrationType: integration.type,
    projectId: data.project_id,
    errorMessage: err.message,
  }).catch((e) => console.error('[publish] failed to send unhealthy email:', e))
}
