# VPS Migration Plan

Moving mdspec from Vercel + Railway + Supabase to a self-hosted VPS with PostgreSQL.

---

## Current Stack

| Layer | Service | Cost |
|---|---|---|
| Frontend + API | Vercel (Next.js 15) | $20/mo |
| DB + Auth + Realtime | Supabase | $0–$25/mo |
| Queue | QStash (Upstash HTTP queue) | $0 |
| **Total** | | **$20–$45/mo** |

> **Note:** The queue is QStash — an HTTP-based message queue where Upstash calls your webhook endpoint with the job payload. `apps/worker` contains BullMQ code but is not the active queue path. BullMQ is the right replacement for VPS (see below).

---

## What Supabase Bundles (Must Replace Individually)

| Supabase Feature | Used In |
|---|---|
| Postgres | All DB queries across `apps/web` and `apps/worker` |
| Auth | Sessions, JWTs, OAuth, middleware guard |
| Realtime | Live publish status on the dashboard |
| JS client | `apps/web/lib/db.ts` — used throughout the app |

---

## VPS Options

| Provider | Spec | Cost | Notes |
|---|---|---|---|
| **Hetzner CX22** | 2 vCPU, 4 GB RAM, 40 GB SSD | ~$5/mo | Best value — recommended starting point |
| **Hetzner CX32** | 4 vCPU, 8 GB RAM, 80 GB SSD | ~$9/mo | Comfortable headroom for growth |
| DigitalOcean Basic | 2 GB RAM | $12/mo | Easy UX, US/EU regions |
| Fly.io | shared-cpu-2x, 4 GB | $10–15/mo | PaaS-like, no SSH required |

**Recommendation: Hetzner CX22.** Runs Postgres + Next.js + job worker + Redis with room to spare at the lowest cost.

---

## Target Architecture

```
Internet
    │
    ▼
Nginx (443 / 80)  ←  SSL via Certbot (Let's Encrypt)
    │
    └──▶  Next.js :3000       (pm2 — apps/web)
               │
               │  enqueues jobs
               ▼
          Redis :6379  ←──  BullMQ
               │
               ▼
          Worker process    (pm2 — apps/worker)

localhost only:
    PostgreSQL :5432
    Redis      :6379
```

All processes run on a single VPS. Postgres and Redis are bound to localhost — not exposed to the internet.

---

## Replacement Decisions

### Postgres — Self-hosted PostgreSQL 16

No library change required. Dump from Supabase, restore to the VPS.

```bash
# On your local machine
pg_dump "$SUPABASE_DB_URL" > mdspec_dump.sql

# On the VPS
psql -U postgres -d mdspec < mdspec_dump.sql
```

Update all connection strings to point at `postgresql://localhost:5432/mdspec`.

---

### Supabase JS Client — Drizzle ORM

Replace `apps/web/lib/db.ts` (Supabase client) with Drizzle ORM + `postgres.js`.

**Why Drizzle:**
- TypeScript-first schema definitions (no separate schema files)
- Lightweight — no heavy runtime
- SQL-like query builder — minimal learning curve
- Generates and tracks migrations in code

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

New `apps/web/lib/db.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client)
```

Schema lives in `apps/web/lib/schema.ts`. Migrations run via `drizzle-kit generate` + `drizzle-kit migrate`.

---

### Auth — Better Auth

Replace Supabase Auth (sessions, JWTs, OAuth, middleware).

**Why Better Auth:**
- TypeScript-first, built for Next.js App Router
- Handles email/password, OAuth (Google, GitHub), magic links
- Stores sessions in your own Postgres — no vendor
- Simpler API than Auth.js for App Router

```bash
npm install better-auth
```

Key changes:
- `apps/web/lib/auth.ts` — configure Better Auth with the Drizzle adapter
- `apps/web/middleware.ts` — replace Supabase session guard with Better Auth session check
- All `supabase.auth.*` calls in API routes → `auth.api.*`

**Alternative: Auth.js v5 (NextAuth)**
- Mature, large ecosystem, more examples online
- Slightly more boilerplate for App Router
- Good choice if you prefer a well-documented path

---

### Realtime — Server-Sent Events (SSE)

The dashboard polls publish job status live via Supabase Realtime. Replace with an SSE endpoint — no new infrastructure needed.

```ts
// apps/web/app/api/status/stream/route.ts
export async function GET(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const interval = setInterval(async () => {
        const jobs = await db.select().from(publishJobs).where(...)
        controller.enqueue(`data: ${JSON.stringify(jobs)}\n\n`)
      }, 2000)

      req.signal.addEventListener('abort', () => clearInterval(interval))
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    }
  })
}
```

Dashboard components switch from `supabase.channel()` to `new EventSource('/api/status/stream')`.

**Alternatives if SSE is too simple:**
- **Soketi** — self-hosted Pusher-compatible WebSocket server, runs on same VPS
- **Ably / Pusher** — managed, $0–$29/mo, drop-in replacement, minimal code change

---

### Queue — Replace QStash with BullMQ + Redis (or pg-boss)

QStash is HTTP-push based — Upstash calls your webhook. On a VPS this model still works, but you now have persistent processes so a proper worker queue is simpler and cheaper.

#### Option A: BullMQ + self-hosted Redis (recommended)

`apps/worker` already has BullMQ installed. The worker code is written and ready — it just needs to be pointed at a local Redis instance instead of Upstash.

```bash
sudo apt install redis-server
sudo systemctl enable redis
```

Changes needed:
- `apps/web/app/api/publish/route.ts` — replace `qstash.publishJSON(...)` with a BullMQ `Queue.add(...)` call
- `apps/worker/src/index.ts` — update `REDIS_URL` env var to `redis://localhost:6379`
- Remove `@upstash/qstash` dependency from `apps/web`

```ts
// apps/web/lib/queue.ts (new)
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const connection = new IORedis(process.env.REDIS_URL!)
export const publishQueue = new Queue('publish', { connection })
```

`apps/web` enqueues → Redis stores job → `apps/worker` polls and processes. The worker's existing adapter code is unchanged.

#### Option B: pg-boss (Postgres-native, no Redis)

[pg-boss](https://github.com/timgit/pg-boss) is a job queue that lives entirely inside your Postgres database — no Redis required.

- Jobs stored in a `pgboss` schema in your existing Postgres DB
- Web app inserts a job row; worker process polls and picks it up
- One fewer service to run and maintain

```bash
npm install pg-boss
```

**Trade-off:** pg-boss is simpler operationally, but BullMQ has more features (rate limiting, repeatable jobs, UI via Bull Board). Since the `apps/worker` code is already written for BullMQ, Option A has less migration work.

---

## Deployment Setup

### 1. Provision VPS (Ubuntu 24.04 LTS)

```bash
# Install Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
npm install -g pm2

# Install PostgreSQL 16
sudo apt install -y postgresql-16

# Install Redis
sudo apt install -y redis-server

# Install Nginx + Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Nginx Config

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. PM2 Process Config

`ecosystem.config.js` at monorepo root:

```js
module.exports = {
  apps: [
    {
      name: 'web',
      cwd: './apps/web',
      script: 'npm',
      args: 'run start',
      env: { NODE_ENV: 'production', PORT: 3000 }
    },
    {
      name: 'worker',
      cwd: './apps/worker',
      script: 'npm',
      args: 'run start',
      env: { NODE_ENV: 'production' }
    }
  ]
}
```

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Environment Variables

**`apps/web/.env`**

```env
DATABASE_URL=postgresql://mdspec:password@localhost:5432/mdspec
REDIS_URL=redis://localhost:6379
BETTER_AUTH_SECRET=<random 32-byte string>
BETTER_AUTH_URL=https://yourdomain.com
# Remove QSTASH_TOKEN — no longer needed
```

**`apps/worker/.env`**

```env
DATABASE_URL=postgresql://mdspec:password@localhost:5432/mdspec
REDIS_URL=redis://localhost:6379
```

---

## Migration Sequence

| # | Step | Effort | Risk |
|---|---|---|---|
| 1 | Provision VPS, install Nginx + Node + PM2 + Postgres + Redis | Low | Low |
| 2 | Migrate Postgres data from Supabase | Low | Low |
| 3 | Replace Supabase JS client with Drizzle ORM | High | Medium |
| 4 | Replace QStash with BullMQ + Redis (swap `route.ts` enqueue call) | Medium | Medium |
| 5 | Migrate auth to Better Auth | High | High |
| 6 | Replace Supabase Realtime with SSE | Medium | Low |
| 7 | Deploy via PM2 + Nginx + Certbot | Low | Low |
| 8 | Update CLI `MDSPEC_API_URL` to new domain | Low | Low |
| 9 | Cut DNS, verify end-to-end publish flow | Low | Medium |

Start with steps 1–2 (infrastructure, no code changes). Tackle Drizzle (step 3) before Auth (step 5) since auth depends on the DB layer being stable. Step 4 (queue swap) is independent and can run in parallel with steps 3–6.

---

## Cost After Migration

| Service | Role | Cost |
|---|---|---|
| Hetzner CX22 | Everything | ~$5/mo |
| Certbot | SSL | Free |
| **Total** | | **~$5/mo** |

Savings vs. current minimum: **~$16/mo**. Savings vs. Supabase Pro tier: **~$41/mo**.

---

## What You Give Up

- **Supabase Dashboard** — no GUI for the DB (use TablePlus or pgAdmin locally)
- **Supabase Managed Backups** — set up `pg_dump` cron job manually
- **Auto-scaling** — VPS is fixed size; upgrade plan if traffic grows
- **Zero-downtime deploys** — need to set up rolling restarts via PM2 or add a second VPS later

---

## Recommended Next Steps

1. **Scaffold Drizzle schema** from existing Supabase table definitions
2. **Wire up Better Auth** for Next.js App Router with Drizzle adapter
3. **Replace Realtime** with SSE endpoint + update dashboard components
4. **Provision Hetzner CX22** and run a staging deploy before cutting DNS
