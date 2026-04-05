import { Queue } from 'bullmq'

// ---------------------------------------------------------------------------
// Local worker queue definitions — mirrors apps/web/lib/queue.ts
// Used by the worker to enqueue downstream jobs after agent processing.
// ---------------------------------------------------------------------------

const redisUrl = process.env.REDIS_URL!
const connection = {
  url: redisUrl,
  maxRetriesPerRequest: null,
  ...(redisUrl?.startsWith('rediss://') ? { tls: {} } : {}),
}

export const publishQueue = new Queue('publish', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
})

export const agentsQueue = new Queue('agents', {
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
