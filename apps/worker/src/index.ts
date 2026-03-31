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
import { publishProcessor } from './processors/publishProcessor.js'
import { agentProcessor } from './processors/agentProcessor.js'

const connection = { url: process.env.REDIS_URL! }

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

console.log('mdspec worker started — listening on publish and agents queues')
