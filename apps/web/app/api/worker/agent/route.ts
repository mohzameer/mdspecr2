import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { Client } from '@upstash/qstash'
import { runAgentJob } from '@/lib/agents/processor'
import type { RunAgentJobData } from '@/lib/types'

export const maxDuration = 300

const qstash = new Client({ token: process.env.QSTASH_TOKEN! })

async function handler(req: Request): Promise<Response> {
  const data = await req.json() as RunAgentJobData

  await runAgentJob(data, async (jobData) => {
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/worker/process`,
      body: jobData,
      retries: 5,
    })
  })

  return Response.json({ status: 'ok' })
}

export const POST = verifySignatureAppRouter(handler)
