import { Job, UnrecoverableError } from 'bullmq'
import { createWorkerSupabaseClient } from '../lib/supabase.js'
import { rateLimit } from '../lib/rateLimiter.js'
import { publishToNotion } from '../adapters/notion.js'
import { publishToConfluence } from '../adapters/confluence.js'
import { publishToClickUp } from '../adapters/clickup.js'

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
  const { spec_id, spec_publish_target_id, integration_id, target_type, content, path, frontmatter } = job.data
  const supabase = createWorkerSupabaseClient()

  // Fetch integration credentials
  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('credentials, config, status')
    .eq('id', integration_id)
    .single()

  if (integrationError || !integration) {
    throw new UnrecoverableError(`Integration ${integration_id} not found`)
  }

  // Fetch existing external_page_id if any (for updates)
  const { data: target } = await supabase
    .from('spec_publish_targets')
    .select('external_page_id, retry_count')
    .eq('id', spec_publish_target_id)
    .single()

  const existingPageId = target?.external_page_id ?? null
  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(integration.credentials)
  } catch {
    throw new UnrecoverableError('Invalid integration credentials JSON')
  }

  const spec = { path, content, frontmatter }

  // Apply rate limiting
  await rateLimit(target_type)

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

      case 'clickup':
        result = await publishToClickUp(
          {
            api_token: credentials.api_token as string,
            workspace_id: credentials.workspace_id as string,
          },
          spec,
          existingPageId
        )
        break

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
