mdspec — Queue Migration Spec
BullMQ + Railway + Upstash Redis → Upstash QStash

What We're Doing
Replacing the BullMQ + Railway worker + Upstash Redis setup with Upstash QStash. The job processing logic stays identical — it moves from apps/worker/jobs/ into two new Vercel API routes. Railway and Upstash Redis are deleted manually.

What Gets Deleted
Manually delete (external services only):

Railway service
Upstash Redis database

Remove from environment only:

REDIS_URL from Vercel dashboard and local .env

Remove from codebase:

bullmq npm package
ioredis npm package

Keep in codebase:

apps/worker/ — retained as-is, dormant, ready to reactivate if needed
railway.toml — stays in repo for future reactivation

The worker folder and Railway config are kept intact. Only the npm packages and external services are removed.

What Gets Added
Install:
bashpnpm add @upstash/qstash
New environment variables (from Upstash dashboard → QStash):
bashQSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...
Two new API routes:
apps/web/app/api/worker/process/route.ts
apps/web/app/api/worker/agent/route.ts

New Routes
/api/worker/process/route.ts
Replaces apps/worker/jobs/publishSpec.ts. QStash calls this via HTTP POST when a publish job is ready. Signature verified — rejects any call not from QStash.
typescriptimport { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { createClient } from '@/lib/supabase'
import { publishToTarget } from '@/lib/publish'

async function handler(req: Request) {
  const { spec, project_id, target } = await req.json()

  try {
    const externalUrl = await publishToTarget(spec, target)

    await createClient()
      .from('spec_publish_targets')
      .update({
        status: 'published',
        external_url: externalUrl,
        published_at: new Date().toISOString()
      })
      .eq('spec_id', spec.id)
      .eq('target_type', target.type)

    return Response.json({ status: 'published' })

  } catch (error) {
    await createClient()
      .from('spec_publish_targets')
      .update({
        status: 'failed',
        last_error: error.message,
        retry_count: spec.retry_count + 1
      })
      .eq('spec_id', spec.id)
      .eq('target_type', target.type)

    // throw so QStash retries automatically with exponential backoff
    throw error
  }
}

export const POST = verifySignatureAppRouter(handler)
/api/worker/agent/route.ts
Replaces apps/worker/jobs/runAgent.ts. Runs the LLM transformation then enqueues a publish job for the transformed content.
typescriptimport { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { Client } from '@upstash/qstash'
import { runAgentTransformation } from '@/lib/agents'

const qstash = new Client({ token: process.env.QSTASH_TOKEN! })

async function handler(req: Request) {
  const { spec, template_id, project_id, targets } = await req.json()

  // run LLM transformation
  const transformed = await runAgentTransformation(spec, template_id)

  // enqueue one publish job per target with transformed content
  for (const target of targets) {
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/worker/process`,
      body: {
        spec: { ...spec, content: transformed },
        project_id,
        target
      },
      retries: 5,
      backoff: 'exponential'
    })
  }

  return Response.json({ status: 'transformed' })
}

export const POST = verifySignatureAppRouter(handler)

Updated /api/publish/route.ts
Only the enqueue call changes. Everything else — token validation, repo check, ledger write — stays identical.
typescript// Remove
import { publishQueue } from '@/lib/bullmq'
await publishQueue.add('publish_spec', jobData, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 }
})

// Add
import { Client } from '@upstash/qstash'
const qstash = new Client({ token: process.env.QSTASH_TOKEN! })

// one job per spec × target — keep jobs small for Vercel 60s timeout
for (const spec of payload.specs) {
  for (const target of resolvedTargets) {

    // if folder has agent assigned, route to agent first
    if (spec.agentTemplateId) {
      await qstash.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/worker/agent`,
        body: { spec, template_id: spec.agentTemplateId, project_id, targets: [target] },
        retries: 3,
        backoff: 'exponential'
      })
    } else {
      await qstash.publishJSON({
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/worker/process`,
        body: { spec, project_id, target },
        retries: 5,
        backoff: 'exponential'
      })
    }
  }
}

Updated Monorepo Structure
apps/
  web/
    app/
      api/
        publish/
          route.ts             ← updated (QStash enqueue)
        webhooks/
          paddle/
            route.ts
        worker/                ← NEW
          process/
            route.ts           ← publish job handler
          agent/
            route.ts           ← agent transformation handler
  worker/                      ← DELETED
  cli/                         ← unchanged
  extension/                   ← unchanged (future)

Key Constraints
One spec × one target per QStash message — never batch multiple targets into one message. Vercel functions have a 60 second timeout. Keeping jobs granular ensures each completes well within the limit.
Agent jobs are always two messages — one to /api/worker/agent for transformation, one to /api/worker/process for publish. Never chain both in a single function call.
QStash free tier is 500 messages/day — each spec × target = 1 message. Sufficient for V1. Upgrade to pay-as-you-go ($1 per 100K messages) if exceeded.
/api/worker/* routes are public endpoints — verifySignatureAppRouter from @upstash/qstash/nextjs rejects any request not signed by QStash. Never remove this wrapper.

Cost After Migration
BeforeAfterUpstash Redis$0RemovedRailway$1/moRemovedUpstash QStash—$0 (free tier)Total$1/mo$0/mo

End of Queue Migration Spec