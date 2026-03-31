# mdspec V1 — Build Plan

## Structure

```
mdspec/
  apps/
    web/          Next.js (Vercel) — dashboard + API routes
      lib/
        db.ts     Supabase client (browser / server / service role)
        queue.ts  BullMQ queue definitions
        types.ts  Shared payload + DB row types
    worker/       Railway BullMQ worker
    cli/          npx mdspec binary
  package.json    npm workspaces root
```

`apps/worker` imports directly from `apps/web/lib/` via workspace.
`apps/cli` is standalone — HTTP calls only.

---

## Phases

---

### Phase 1 — Foundation ✅

> Monorepo scaffolded, Next.js + Tailwind + Supabase wired, shared lib in place.

- [x] Root `package.json` with npm workspaces
- [x] `apps/web` — Next.js 15, Tailwind CSS, App Router
- [x] `apps/web/lib/db.ts` — Supabase browser / server / service role clients
- [x] `apps/web/lib/queue.ts` — BullMQ queue definitions (`publish`, `agents`)
- [x] `apps/web/lib/types.ts` — all payload types, DB row types, job data shapes
- [x] `apps/web/middleware.ts` — session refresh + auth redirect guard
- [x] `apps/web/.env.example`
- [x] `apps/worker` stub — `package.json`, `tsconfig.json`, `src/index.ts`
- [x] `apps/cli` stub — `package.json`, `tsconfig.json`, `src/index.ts`
- [x] `.gitignore` at root + per app
- [x] `README.md`

---

### Phase 2 — Database Schema ✅

> All Supabase tables created with RLS policies. Migrations committed.

- [x] Migration: `users` (public mirror of auth.users)
- [x] Migration: `organizations`
- [x] Migration: `org_members` (role: owner | admin | member)
- [x] Migration: `org_invites` (status: pending | accepted | expired | revoked)
- [x] Migration: `projects` (registered_repo, spec_dirs)
- [x] Migration: `project_members` (role: admin | member | viewer)
- [x] Migration: `project_tokens` (bcrypt hash, token_hint, revoked)
- [x] Migration: `integrations` (credentials via Supabase Vault)
- [x] Migration: `specs`
- [x] Migration: `spec_publish_targets`
- [x] Migration: `subscriptions` (plan: free | pro, billing_period, paddle IDs, status, period dates)
- [x] Migration: `billing_events` (audit log — raw Paddle webhook payloads, idempotency key)
- [x] RLS policies — org-scoped access on all tables
- [x] RLS policies — project-scoped access on project tables
- [x] `users` sync trigger: create user row on first `auth.users` insert
- [x] `subscriptions` insert trigger: create a `free` subscription row whenever a new org is created
- [x] Indexes for common query patterns
- [ ] Create Supabase project and wire env vars ← **deploy step**

---

### Phase 3 — Auth ✅

> All auth methods working. Protected routes redirect to `/login`.

- [x] Email + password sign-up / sign-in
- [x] Magic link (email)
- [x] GitHub OAuth
- [x] Google OAuth
- [x] `/login` page
- [x] `/auth/callback` route (OAuth + magic link exchange)
- [x] `/auth/confirm` route (email verification)
- [x] Post-auth redirect to dashboard
- [x] Session middleware already in place (Phase 1)
- [ ] Enable GitHub + Google OAuth providers in Supabase dashboard ← **deploy step**

---

### Phase 4 — Dashboard UI Shell ✅

> All pages navigable. Sidebar, org switcher, layouts in place.

- [x] Root layout with sidebar (`app/(dashboard)/layout.tsx`)
- [x] Sidebar: Dashboard | Projects | Integrations | Activity | Settings
- [x] Organization switcher (top nav dropdown — switch org or create new)
- [x] Dashboard page — spec count, project count, live activity feed (Supabase Realtime)
- [x] Projects page — list with repo name, spec dirs
- [x] Integrations page — Notion / Confluence / ClickUp health states + connect forms
- [x] Activity page — org-level publish history with error messages
- [x] Settings page
  - [x] Organization settings (edit name)
  - [x] Members — view, invite by email, change role, pending invites
  - [x] Billing — current plan, renewal date, payment_failed warning
- [x] Project sub-pages (per project)
  - [x] Specs view — folder hierarchy, status per target, download snapshot / zip
  - [x] Activity — live feed via Supabase Realtime
  - [x] Settings
    - [x] General (name, description, spec dirs)
    - [x] Repository (view / update registered_repo)
    - [x] CI Tokens (generate, list hints, revoke)
    - [x] Members (add/remove project members, change role)

---

### Phase 5 — Onboarding Wizard ✅

> New users can create an org + project and get their first CI snippet in one flow.

- [x] Step 1 — Organization (create org)
- [x] Step 2 — Project Basics (name, description)
- [x] Step 3 — Spec Directory Config (enter paths e.g. `/specs`, `/docs/rfc`)
- [x] Step 4 — CI Token (generate, display once, copy snippet + GitHub Actions YAML)
- [x] Step 5 — Target Integration (link to integrations or skip)
- [x] `Pending first publish` state with inline CI snippet panel (on Specs page)

---

### Phase 6 — CI Token Management ✅

> Tokens can be generated, shown once, listed by hint, and revoked.

- [x] Token generation: format `mds_<project_id_short>_<random_hex_32>`
- [x] Store as bcrypt hash; show raw value once at creation only
- [x] Display last 6 chars as token hint in UI
- [x] Enforce max 3 active tokens per project
- [x] Revocation: soft-delete, immediate `401` for revoked tokens
- [x] Retain revoked tokens for audit log
- [x] `GET /api/tokens/list` — list tokens for project
- [x] `POST /api/tokens/generate` — generate new token
- [x] `POST /api/tokens/revoke` — revoke token

---

### Phase 7 — `/api/publish` Route ✅

> CLI can POST artifacts and receive `202 Accepted` immediately.

- [x] `POST /api/publish`
  - [x] Validate `MDSPEC_TOKEN` (bcrypt compare against `project_tokens`)
  - [x] Validate `repo_name` matches `projects.registered_repo` → `403` if mismatch
  - [x] On first publish: set `registered_repo`
  - [x] **Free tier enforcement**: check org plan → if `free` and distinct spec count ≥ 10 → return `402` with upgrade prompt
  - [x] Upgrade nudge in response body when publish would bring free count to exactly 10
  - [x] Upsert specs into `specs` table
  - [x] Upsert rows into `spec_publish_targets` per spec × integration
  - [x] Enqueue one BullMQ job per spec × target into Upstash Redis
  - [x] Return `202 Accepted` immediately
- [x] `GET /api/projects/[projectId]/config` — returns `spec_dirs` (token-authenticated, used by CLI)

---

### Phase 8 — Railway Worker ✅

> Jobs are consumed, folder hierarchies resolved, pages created/updated in target tools.

- [x] Worker entry point consuming `publish` and `agents` queues (`src/index.ts`)
- [x] Rate limiter: Notion 350ms · Confluence 500ms · ClickUp 650ms (`src/lib/rateLimiter.ts`)
- [x] Retry: exponential backoff 5s / 30s / 2m / 10m / 30m (5 attempts max — via BullMQ)
- [x] Folder hierarchy resolver (`src/lib/folderHierarchy.ts`)
- [x] Notion adapter (`src/adapters/notion.ts`)
  - [x] Create nested sub-pages
  - [x] Update existing page blocks (clear + re-append)
  - [x] Store `external_page_id` + `external_url` in ledger
- [x] Confluence adapter (`src/adapters/confluence.ts`)
  - [x] Create page tree (parent/child pages)
  - [x] Update page body via REST API (Basic Auth)
- [x] ClickUp adapter (`src/adapters/clickup.ts`)
  - [x] Create/update Docs
  - [x] `task_id` frontmatter → link doc to task
- [x] On success → update `spec_publish_targets` to `published`
- [x] On terminal failure → update to `failed`, store `last_error`
- [x] Integration health update → flag `unhealthy` on auth/permission errors
- [x] `railway.toml` — build + deploy config
- [ ] Deploy to Railway and wire env vars ← **deploy step**

---

### Phase 9 — CLI (`npx mdspec`) ✅

> `npx mdspec publish --project <id>` works end-to-end in CI.

- [x] `publish` command with `--project` flag (Commander)
- [x] Read `MDSPEC_TOKEN` from env
- [x] Git diff change detection (`git diff --name-only <base>...HEAD`)
- [x] Fallback: publish all specs if git diff fails
- [x] Recursive `.md` scan within configured spec dirs
- [x] Frontmatter parsing (`gray-matter`)
- [x] SHA256 content hash per spec
- [x] `mdspec_id` validation (lowercase alphanumeric + underscores, max 64 chars)
- [x] Build and POST artifact payload to `/api/publish`
- [x] Formatted stdout: Queued ✓ / Failed ✗ / Skipped —
- [x] Repo mismatch error output with guidance message
- [x] `402` response → print limit-hit message with upgrade URL
- [x] Exit `0` on success or no-op, non-zero on hard failure
- [x] Publish as npm binary (`bin` in `package.json`)
- [x] Build via `tsup` (ESM bundle)
- [ ] Publish to npm registry ← **deploy step**

---

### Phase 10 — Agent Layer ✅

> Transformation templates run post-ingestion via BullMQ.

- [x] `full_publish` template (passthrough)
- [x] `task_summary` template — extracts headings + first paragraph
- [x] `release_notes` template — formats h2 sections as release notes
- [x] Agent processor consuming `agents` queue (`src/processors/agentProcessor.ts`)

---

### Phase 11 — Billing & Subscriptions ✅

> Paddle integrated. Free tier enforced. Upgrade flow works end-to-end.

**Pricing tiers:**
- Free — 1 org, 1 project, 10 specs published
- Pro — $12/mo or $100/yr, unlimited everything

**Code complete:**
- [x] `POST /api/webhooks/paddle` — verify Paddle webhook signature before processing
- [x] Handle `subscription.created` → set org plan to `pro`, store `paddle_subscription_id` + `paddle_customer_id`
- [x] Handle `subscription.updated` → update billing period, renewal dates
- [x] Handle `subscription.cancelled` → set plan back to `cancelled` at `current_period_end`
- [x] Handle `transaction.completed` → log to `billing_events`, extend period
- [x] Handle `transaction.payment_failed` → set subscription status to `payment_failed`
- [x] Idempotency: check `billing_events.paddle_event_id` before processing any event
- [x] Store raw payload in `billing_events` for audit
- [x] Pricing page (`/pricing`) — tier comparison table with monthly/yearly toggle
- [x] Pricing policy notice (30-day notice for monthly, locked rate for annual)
- [x] Upgrade banner component (`UpgradeBanner.tsx`) — shown near free tier limit
- [x] Upgrade button (`UpgradeButton.tsx`) — Paddle.js overlay with period toggle
- [x] Billing section in Settings — current plan, billing period, next renewal date
- [x] `payment_failed` warning banner with update payment link
- [x] CLI `402` response → print limit-hit message with upgrade URL

**Deploy steps:**
- [ ] Create Paddle account and configure two products: `pri_pro_monthly` ($12/mo) · `pri_pro_yearly` ($100/yr)
- [ ] Wire `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_PRICE_MONTHLY`, `NEXT_PUBLIC_PADDLE_PRICE_YEARLY` env vars
- [ ] Add Paddle.js script tag to root layout

---

## Deploy Checklist

```
1. Supabase
   - Create project
   - Run supabase/migrations/20240101000000_initial_schema.sql
   - Enable GitHub + Google OAuth providers
   - Copy NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

2. Upstash Redis
   - Create Redis database
   - Copy REDIS_URL

3. npm install (root)
   - npm install

4. Vercel (apps/web)
   - Connect repo, set root directory to apps/web
   - Add all env vars from apps/web/.env.example

5. Railway (apps/worker)
   - Connect repo, point to apps/worker
   - railway.toml handles build + start
   - Add REDIS_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY

6. Paddle
   - Create account, create monthly + yearly products
   - Add webhook endpoint: https://<your-domain>/api/webhooks/paddle
   - Add env vars: PADDLE_WEBHOOK_SECRET, NEXT_PUBLIC_PADDLE_PRICE_MONTHLY, NEXT_PUBLIC_PADDLE_PRICE_YEARLY
   - Add Paddle.js script to apps/web/app/layout.tsx

7. npm (CLI)
   - cd apps/cli && npm run build && npm publish
```

## Build Order

```
Phase 1 ✅ Foundation
  ↓
Phase 2 ✅ Database Schema
  ↓
Phase 3 ✅ Auth
  ↓
Phase 4 ✅ Dashboard UI Shell  ←─┐
Phase 5 ✅ Onboarding Wizard      │  built in parallel
Phase 6 ✅ CI Token Management  ──┘
  ↓
Phase 7 ✅ /api/publish
  ↓
Phase 8 ✅ Railway Worker  ←─┐
Phase 9 ✅ CLI              ──┘  built in parallel
  ↓
Phase 10 ✅ Agent Layer
  ↓
Phase 11 ✅ Billing & Subscriptions
```
