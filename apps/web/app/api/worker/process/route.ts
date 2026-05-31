import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { runPublishJob, UnrecoverableError } from '@/lib/publish/processor'
import { recordSpecAndMaybeNotify } from '@/lib/emailNotifier'
import type { PublishJobData } from '@/lib/types'

export const maxDuration = 300

async function handler(req: Request): Promise<Response> {
  let data: PublishJobData
  try {
    data = (await req.json()) as PublishJobData
  } catch (parseErr) {
    console.error('[worker/process] body parse failed:', parseErr)
    return Response.json({ status: 'failed', error: 'invalid_body' })
  }

  if (!data || typeof data !== 'object' || typeof data.spec_id !== 'string') {
    console.error(`[worker/process] malformed job payload — keys=${data ? Object.keys(data).join(',') : 'null'}`)
    return Response.json({ status: 'failed', error: 'malformed_payload' })
  }

  try {
    await runPublishJob(data)
    await recordSpecAndMaybeNotify(data)
    return Response.json({ status: 'ok' })
  } catch (err) {
    if (err instanceof UnrecoverableError) {
      // Return 200 so QStash does not retry
      console.error(`[worker/process] unrecoverable: ${err.message}`)
      await recordSpecAndMaybeNotify(data)
      return Response.json({ status: 'failed', error: err.message })
    }
    // Non-200 triggers QStash retry with exponential backoff
    throw err
  }
}

export const POST = verifySignatureAppRouter(handler)
