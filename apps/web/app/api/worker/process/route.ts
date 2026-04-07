import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { Client } from '@upstash/qstash'
import { runPublishJob, UnrecoverableError } from '@/lib/publish/processor'
import type { PublishSpecJobData } from '@/lib/types'

export const maxDuration = 300

const qstash = new Client({ token: process.env.QSTASH_TOKEN! })

const MAX_ATTEMPTS = 5

async function handler(req: Request): Promise<Response> {
  const attemptsMade = parseInt(req.headers.get('upstash-message-id') ? '0' : '0')
  const retryCount = parseInt(req.headers.get('upstash-retry-count') ?? '0')

  const data = await req.json() as PublishSpecJobData

  try {
    await runPublishJob(
      data,
      retryCount,
      MAX_ATTEMPTS,
      async (jobData) => {
        await qstash.publishJSON({
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/worker/agent`,
          body: jobData,
          retries: 3,
        })
      }
    )
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
