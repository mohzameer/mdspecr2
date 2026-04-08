import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { runPublishGroup, UnrecoverableError } from '@/lib/publish/processor'
import type { PublishGroupJobData } from '@/lib/types'

export const maxDuration = 300

async function handler(req: Request): Promise<Response> {
  let data: PublishGroupJobData
  try {
    data = (await req.json()) as PublishGroupJobData
  } catch (parseErr) {
    console.error('[worker/process] body parse failed:', parseErr)
    return Response.json({ status: 'failed', error: 'invalid_body' })
  }

  // Diagnose malformed payloads instead of crashing on `.length` of undefined.
  if (!data || typeof data !== 'object' || !Array.isArray((data as PublishGroupJobData).specs)) {
    console.error(
      `[worker/process] malformed job payload — keys=${data ? Object.keys(data).join(',') : 'null'} ` +
      `specsType=${typeof (data as { specs?: unknown })?.specs}`
    )
    return Response.json({ status: 'failed', error: 'malformed_payload' })
  }

  try {
    await runPublishGroup(data)
    return Response.json({ status: 'ok' })
  } catch (err) {
    if (err instanceof UnrecoverableError) {
      // Return 200 so QStash does not retry
      console.error(`[worker/process] unrecoverable: ${err.message}`)
      return Response.json({ status: 'failed', error: err.message })
    }
    // Non-200 triggers QStash retry with exponential backoff
    throw err
  }
}

export const POST = verifySignatureAppRouter(handler)
