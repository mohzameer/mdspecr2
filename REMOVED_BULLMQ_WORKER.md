# Removed: BullMQ / Railway Worker

## What it was

`apps/worker/` was a standalone Node.js worker deployed on Railway that consumed a BullMQ queue (backed by Redis) to process publish jobs for Notion, Confluence, and ClickUp.

### Stack
- **Runtime**: Node.js (ESM, TypeScript via `tsx`)
- **Queue**: BullMQ + Redis (`REDIS_URL`)
- **Hosting**: Railway (always-on service, `nixpacks.toml` + `railway.toml`)
- **Concurrency**: 5 publish workers, 3 agent workers

### Key files (now deleted)
- `apps/worker/src/index.ts` — BullMQ Worker setup, health-check HTTP server
- `apps/worker/src/processors/publishProcessor.ts` — job handler: loaded credentials from Supabase Vault, called adapters, handled retries/auth errors
- `apps/worker/src/processors/agentProcessor.ts` — ran LLM transformation templates before publishing
- `apps/worker/src/adapters/confluence.ts` — Confluence Basic Auth + OAuth adapter
- `apps/worker/src/adapters/notion.ts` — Notion adapter
- `apps/worker/src/adapters/clickup.ts` — ClickUp adapter
- `apps/worker/src/lib/` — credentials, rate limiter, folder hierarchy, queue, LLM client

### Why it was removed

The active publish path moved to a **QStash-based flow** inside `apps/web/lib/publish/processor.ts`, triggered by the CLI webhook. The BullMQ worker was explicitly flagged as legacy in `apps/worker/src/index.ts`:

> "Nothing in `apps/web` currently enqueues to this BullMQ worker — if it is reactivated, its adapters / resolveFolderMapping / publishProcessor must be ported to the unified contract before use."

The Railway service and Redis dependency were removed along with the code.

### Active replacement

| Old (BullMQ/Railway) | New (QStash/Vercel) |
|---|---|
| `apps/worker/src/processors/publishProcessor.ts` | `apps/web/lib/publish/processor.ts` |
| `apps/worker/src/adapters/confluence.ts` | `apps/web/lib/publish/adapters/confluence.ts` |
| `apps/worker/src/adapters/notion.ts` | `apps/web/lib/publish/adapters/notion.ts` |
| `apps/worker/src/adapters/clickup.ts` | `apps/web/lib/publish/adapters/clickup.ts` |
| Redis + BullMQ queue | QStash HTTP queue |
| Railway deployment | Vercel serverless functions |
