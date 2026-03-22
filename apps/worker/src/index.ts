/**
 * mdspec BullMQ Worker
 * Deployed on Railway (always-on, $1/mo).
 *
 * Reads jobs from Upstash Redis and processes:
 *   - publish_spec   → deliver one spec to one target (Notion / Confluence / ClickUp)
 *   - retry_publish  → retry a failed publish after backoff delay
 *   - run_agent      → execute a transformation template on an ingested spec
 *   - task_summary   → generate a task summary and post to linked task
 *
 * Env vars required:
 *   REDIS_URL
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

// TODO: implement processors
console.log('mdspec worker — starting')
