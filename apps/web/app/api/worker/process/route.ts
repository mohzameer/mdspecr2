import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { runPublishGroup, UnrecoverableError } from '@/lib/publish/processor'
import type { PublishGroupJobData } from '@/lib/types'

export const maxDuration = 300

async function handler(req: Request): Promise<Response> {
  const data = (await req.json()) as PublishGroupJobData

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
