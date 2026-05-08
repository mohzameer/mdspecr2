# mdspec

**CI-First Engineering Spec Publishing Infrastructure**

mdspec publishes engineering specification markdown files from source repositories into organizational documentation systems — Notion, Confluence, and ClickUp — triggered by CI pipelines.

---

## What it is

- A deterministic spec publishing runtime
- A delivery control plane
- A spec version ledger
- An IDE discovery layer

## What it is not

- A markdown editor
- A documentation hosting platform
- A real-time sync tool

---

## Repository Structure

```
mdspec/
  apps/
    web/          Next.js app (Vercel) — dashboard + API routes
    worker/       BullMQ worker (Railway) — processes publish jobs
    cli/          npx mdspec binary — runs inside CI pipelines
  package.json    Workspace root
  APP_SPEC.md     Full product specification
```

`apps/worker` imports shared types and queue definitions directly from `apps/web/lib/`.  
`apps/cli` is standalone — makes HTTP calls only, no shared imports.

---

## apps/web

The Next.js frontend and API layer.

**Stack:** Next.js 15 App Router · React · Tailwind CSS · Supabase Auth · Supabase Postgres · Supabase Realtime · BullMQ

```
apps/web/
  app/              Next.js App Router pages and API routes
  lib/
    db.ts           Supabase client (browser, server, service role)
    queue.ts        BullMQ queue definitions (publish + agents)
    types.ts        Shared TypeScript types for payloads and DB rows
  middleware.ts     Session refresh + auth redirect guard
  .env.example      Required environment variables
```

**Setup:**

```bash
cd apps/web
cp .env.example .env.local
# fill in Supabase and Redis credentials
npm run dev
```

**Environment variables:**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `REDIS_URL` | Upstash Redis connection string |

---

## apps/worker

Always-on BullMQ worker deployed on Railway ($1/mo).

Reads jobs from Upstash Redis and delivers specs to Notion, Confluence, and ClickUp. Handles rate limiting, exponential backoff retry, and folder hierarchy resolution.

```
apps/worker/
  src/
    index.ts        Worker entry point
  .env.example      Required environment variables
```

**Setup:**

```bash
cd apps/worker
cp .env.example .env
npm install
npm run dev
```

---

## apps/cli

The `npx mdspec` binary that runs inside CI pipelines.

```bash
# In your GitHub Actions workflow:
- run: npx mdspec publish --project proj_xxx
  env:
    MDSPEC_TOKEN: ${{ secrets.MDSPEC_TOKEN }}
```

---

## How publishing works

1. Spec merged to `main` in your repo
2. CI runs `npx mdspec publish --project <id>`
3. CLI detects changed `.md` files via `git diff`
4. CLI POSTs artifact payload to `POST /api/publish`
5. API validates token + enforces one-repo-per-project
6. Specs written to Supabase ledger (`queued`)
7. One BullMQ job enqueued per spec × target
8. `202 Accepted` returned — CI unblocks immediately
9. Railway worker delivers to Notion / Confluence / ClickUp
10. Dashboard reflects live status via Supabase Realtime

---

## Service costs

| Service | Role | Plan | Cost |
|---|---|---|---|
| Supabase | DB + Auth + Realtime + Vault | Free → Pro | $0 → $25/mo |
| Vercel | Frontend + API | Pro | $20/mo |
| Upstash Redis | BullMQ queue | Free | $0 |
| Railway | BullMQ worker | Free | $1/mo |
| **Total** | | | **$21/mo launch** |

---

---

## Testing

**Unit tests (CLI):** `apps/cli/src/__tests__/` — covers subfolder filtering, depth, skip patterns, distributed map merging, spec artifact building, and error handling. See [`apps/cli/TESTS.md`](./apps/cli/TESTS.md) for a full breakdown.

```bash
cd apps/cli && npm test
```

**End-to-end integration tests:** `/Users/mfmz/testmdspecdocs` — a live test repo that publishes real docs to S3, ClickUp, and Notion on every push and verifies the results via a polling verify script. Covers routing modes, subfolder filtering, per-folder parent overrides, and content sync. See that repo's `README.md` for full scenario documentation.

---

See [`APP_SPEC.md`](./APP_SPEC.md) for the full product specification.
