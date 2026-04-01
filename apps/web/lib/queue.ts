import { Queue } from 'bullmq'
import type { PublishSpecJobData, RunAgentJobData } from './types'

// ---------------------------------------------------------------------------
// Upstash Redis connection
// Shared between web (enqueue) and worker (consume).
// ---------------------------------------------------------------------------

const connection = {
  url: process.env.REDIS_URL!,
}

// ---------------------------------------------------------------------------
// Queue definitions
// ---------------------------------------------------------------------------

// Handles: publish_spec, retry_publish
export const publishQueue = new Queue<PublishSpecJobData>('publish', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 30s, ~2m, ~10m, ~30m
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
})

// Handles: run_agent
export const agentsQueue = new Queue<RunAgentJobData>('agents', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
})

// ---------------------------------------------------------------------------
// Per-target rate limit delays (ms) — enforced in worker limiter config
// ---------------------------------------------------------------------------

export const TARGET_RATE_LIMITS = {
  notion: 350,
  confluence: 500,
  clickup: 650,
} as const
