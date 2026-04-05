/**
 * mdspec BullMQ Worker
 * Deployed on Railway (always-on).
 *
 * Processes:
 *   publish queue  — deliver specs to Notion, Confluence, ClickUp
 *   agents queue   — run transformation templates (task_summary, release_notes, full_publish)
 *
 * Env vars required:
 *   REDIS_URL
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

import { Worker } from 'bullmq'
import { createServer } from 'node:http'
import { publishProcessor } from './processors/publishProcessor.js'
import { agentProcessor } from './processors/agentProcessor.js'

const redisUrl = process.env.REDIS_URL!
const connection = {
  url: redisUrl,
  maxRetriesPerRequest: null,
  ...(redisUrl?.startsWith('rediss://') ? { tls: {} } : {}),
}

// Publish worker: 5 concurrent jobs, exponential backoff handled by BullMQ
const publishWorker = new Worker('publish', publishProcessor, {
  connection,
  concurrency: 5,
})

// Agent worker: 3 concurrent jobs
const agentsWorker = new Worker('agents', agentProcessor, {
  connection,
  concurrency: 3,
})

publishWorker.on('error', (err) => {
  console.error('[publish] worker error:', err)
})

agentsWorker.on('error', (err) => {
  console.error('[agents] worker error:', err)
})

publishWorker.on('completed', (job) => {
  console.log(`[publish] ✓ job ${job.id} completed`)
})

publishWorker.on('failed', (job, err) => {
  console.error(`[publish] ✗ job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`)
})

agentsWorker.on('completed', (job) => {
  console.log(`[agents] ✓ job ${job.id} completed`)
})

agentsWorker.on('failed', (job, err) => {
  console.error(`[agents] ✗ job ${job?.id} failed: ${err.message}`)
})

async function shutdown() {
  console.log('Shutting down workers…')
  await publishWorker.close()
  await agentsWorker.close()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

process.on('uncaughtException', (err) => {
  console.error('[worker] uncaughtException:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandledRejection:', reason)
  process.exit(1)
})

// Health check server — lets Railway verify the container is up
const PORT = process.env.PORT ?? 3001

const REQUIRED_ENV = [
  'REDIS_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
]

const OPTIONAL_ENV = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
]

createServer((req, res) => {
  if (req.url === '/health') {
    const required = REQUIRED_ENV.map((key) => ({
      key,
      set: !!process.env[key],
    }))
    const optional = OPTIONAL_ENV.map((key) => ({
      key,
      set: !!process.env[key],
    }))
    const allRequiredSet = required.every((v) => v.set)

    res.writeHead(allRequiredSet ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: allRequiredSet ? 'ok' : 'misconfigured',
      uptime: process.uptime(),
      env: { required, optional },
    }, null, 2))
  } else {
    res.writeHead(404)
    res.end()
  }
}).listen(PORT, () => {
  console.log(`mdspec worker started — health check on :${PORT}/health`)
})
