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

### Phase 2 — Database Schema

> All Supabase tables created with RLS policies. Migrations committed.

- [ ] Create Supabase project and wire env vars
- [ ] Migration: `organizations`
- [ ] Migration: `org_members` (role: owner | admin | member)
- [ ] Migration: `org_invites` (status: pending | accepted | expired | revoked)
- [ ] Migration: `projects` (registered_repo, spec_dirs)
- [ ] Migration: `project_members` (role: admin | member | viewer)
- [ ] Migration: `project_tokens` (bcrypt hash, token_hint, revoked)
- [ ] Migration: `integrations` (credentials via Supabase Vault)
- [ ] Migration: `specs`
- [ ] Migration: `spec_publish_targets`
- [ ] Migration: `subscriptions` (plan: free | pro, billing_period, paddle IDs, status, period dates)
- [ ] Migration: `billing_events` (audit log — raw Paddle webhook payloads, idempotency key)
- [ ] RLS policies — org-scoped access on all tables
- [ ] RLS policies — project-scoped access on project tables
- [ ] `users` sync trigger: create user row on first `auth.users` insert
- [ ] `subscriptions` insert trigger: create a `free` subscription row whenever a new org is created

---

### Phase 3 — Auth

> All auth methods working. Protected routes redirect to `/login`.

- [ ] Email + password sign-up / sign-in
- [ ] Magic link (email)
- [ ] GitHub OAuth
- [ ] Google OAuth
- [ ] `/login` page
- [ ] `/auth/callback` route (OAuth + magic link exchange)
- [ ] `/auth/confirm` route (email verification)
- [ ] Post-auth redirect to dashboard
- [ ] Session middleware already in place (Phase 1)

---

### Phase 4 — Dashboard UI Shell

> All pages navigable. Sidebar, org switcher, layouts in place.

- [ ] Root layout with sidebar
- [ ] Sidebar: Dashboard | Projects | Integrations | Activity | Settings
- [ ] Organization switcher (top nav dropdown — switch org or create new)
- [ ] Dashboard page — last sync time, spec count, live activity feed (Supabase Realtime)
- [ ] Projects page — list with repo name, last publish status, spec dirs, targets
- [ ] Integrations page — Notion / Confluence / ClickUp health states
- [ ] Activity page — per-spec publish history with error messages
- [ ] Settings page
  - [ ] Organization settings
  - [ ] Members — view, invite by email, change role, revoke invite
- [ ] Project sub-pages (per project)
  - [ ] Specs view — folder hierarchy, status per target, download snapshot / zip
  - [ ] Activity — live feed via Supabase Realtime
  - [ ] Settings
    - [ ] General (name, description, spec dirs)
    - [ ] Repository (view / update registered_repo)
    - [ ] CI Tokens (generate, list hints, revoke)
    - [ ] Members (add/remove project members, change role)

---

### Phase 5 — Onboarding Wizard

> New users can create an org + project and get their first CI snippet in one flow.

- [ ] Step 1 — Project Basics (name, description)
- [ ] Step 2 — Spec Directory Config (enter paths e.g. `/specs`, `/docs/rfc`)
- [ ] Step 3 — CI Token (generate, display once, copy snippet)
- [ ] Step 4 — Target Integration (connect Notion / Confluence / ClickUp)
- [ ] Step 5 — Agent Template (optional)
- [ ] `Pending first publish` state with inline CI snippet panel
- [ ] First publish handshake → `Connected` banner on first artifact received

---

### Phase 6 — CI Token Management

> Tokens can be generated, shown once, listed by hint, and revoked.

- [ ] Token generation: format `mds_<project_id_short>_<random_hex_32>`
- [ ] Store as bcrypt hash; show raw value once at creation only
- [ ] Display last 6 chars as token hint in UI
- [ ] Enforce max 3 active tokens per project
- [ ] Revocation: soft-delete, immediate `401` for revoked tokens
- [ ] Retain revoked tokens for audit log

---

### Phase 7 — `/api/publish` Route

> CLI can POST artifacts and receive `202 Accepted` immediately.

- [ ] `POST /api/publish`
  - [ ] Validate `MDSPEC_TOKEN` (bcrypt compare against `project_tokens`)
  - [ ] Validate `repo_name` matches `projects.registered_repo` → `403` if mismatch
  - [ ] On first publish: set `registered_repo`, log to Activity
  - [ ] **Free tier enforcement**: check org plan → if `free` and distinct spec count ≥ 10 → return `402` with upgrade prompt
  - [ ] Upgrade nudge in response body when publish would bring free count to exactly 10
  - [ ] Upsert specs into `specs` table (status: `queued`)
  - [ ] Insert rows into `spec_publish_targets` per spec × integration
  - [ ] Enqueue one BullMQ job per spec × target into Upstash Redis
  - [ ] Return `202 Accepted` immediately

---

### Phase 8 — Railway Worker

> Jobs are consumed, folder hierarchies resolved, pages created/updated in target tools.

- [ ] Worker entry point consuming `publish` and `agents` queues
- [ ] Rate limiter: Notion 350ms · Confluence 500ms · ClickUp 650ms
- [ ] Retry: exponential backoff 5s / 30s / 2m / 10m / 30m (5 attempts max)
- [ ] Folder hierarchy resolver — parse spec path, create intermediate folder pages
- [ ] Notion adapter
  - [ ] Create nested sub-pages
  - [ ] Update existing page blocks
  - [ ] Store `external_page_id` + `external_url` in ledger
- [ ] Confluence adapter
  - [ ] Create page tree (parent/child pages)
  - [ ] Update page body via REST API (Basic Auth)
- [ ] ClickUp adapter
  - [ ] Create/update Docs (not tasks)
  - [ ] OAuth token refresh on expiry
  - [ ] `task_id` frontmatter → link doc to task
- [ ] On success → update `spec_publish_targets` to `published`
- [ ] On terminal failure → update to `failed`, store `last_error`
- [ ] Agent jobs: `run_agent`, `task_summary`
- [ ] Integration health update → flag `unhealthy` on auth/permission errors

---

### Phase 9 — CLI (`npx mdspec`)

> `npx mdspec publish --project <id>` works end-to-end in CI.

- [ ] `publish` command with `--project` flag
- [ ] Read `MDSPEC_TOKEN` from env
- [ ] Git diff change detection (`git diff --name-only <base>...HEAD`)
- [ ] Fallback: SHA256 hash comparison against ledger
- [ ] Recursive `.md` scan within configured spec dirs
- [ ] Frontmatter parsing (`gray-matter`)
- [ ] SHA256 content hash per spec
- [ ] `mdspec_id` validation (lowercase alphanumeric + underscores, max 64 chars)
- [ ] Build and POST artifact payload to `/api/publish`
- [ ] Formatted stdout: Published ✓ / Failed ✗ / Skipped —
- [ ] Repo mismatch error output with guidance message
- [ ] Exit `0` on success or no-op, non-zero on hard failure
- [ ] Publish as npm binary (`bin` in `package.json`)

---

### Phase 10 — Agent Layer

> Transformation templates run post-ingestion via BullMQ.

- [ ] `full_publish` template (passthrough)
- [ ] `task_summary` template
- [ ] `release_notes` template
- [ ] Agent job status surfaced in Dashboard → Project → Activity

---

### Phase 11 — Billing & Subscriptions

> Paddle integrated. Free tier enforced. Upgrade flow works end-to-end.

**Pricing tiers:**
- Free — 1 org, 1 project, 10 specs published
- Pro — $12/mo or $100/yr, unlimited everything

**Paddle setup:**
- [ ] Create Paddle account and configure two products: `pri_pro_monthly` ($12/mo) · `pri_pro_yearly` ($100/yr)
- [ ] Install `@paddle/paddle-js` in `apps/web`
- [ ] Wire `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` env vars

**Checkout flow:**
- [ ] **Upgrade to Pro** button in sidebar and project pages (visible to org owner only)
- [ ] Paddle.js overlay embedded in dashboard — opens on upgrade click
- [ ] Pass `org_id` as custom data in Paddle checkout for webhook correlation

**Webhook handler:**
- [ ] `POST /api/webhooks/paddle` — verify Paddle webhook signature before processing
- [ ] Handle `subscription.created` → set org plan to `pro`, store `paddle_subscription_id` + `paddle_customer_id`
- [ ] Handle `subscription.updated` → update billing period, renewal dates
- [ ] Handle `subscription.cancelled` → set plan back to `free` at `current_period_end`
- [ ] Handle `subscription.payment_succeeded` → log to `billing_events`, extend period
- [ ] Handle `subscription.payment_failed` → set subscription status to `payment_failed`, show dashboard warning
- [ ] Idempotency: check `billing_events.paddle_event_id` before processing any event
- [ ] Store raw payload in `billing_events` for audit

**Dashboard billing UI:**
- [ ] Pricing page (`/pricing`) — tier comparison table with monthly/yearly toggle
- [ ] Pricing policy notice on pricing page (30-day notice for monthly, locked rate for annual)
- [ ] Upgrade banner across all pages when free tier limit is hit
- [ ] Upgrade button prominent in sidebar
- [ ] Billing section in Settings — current plan, billing period, next renewal date, cancel option
- [ ] `payment_failed` warning banner with retry/update payment link
- [ ] Dashboard reflects Pro status immediately via Supabase Realtime after webhook

**CLI free tier output:**
- [ ] `402` response → print limit-hit message with upgrade URL (`https://mdspec.dev/upgrade`)

---

## Build Order

```
Phase 1 ✅ Foundation
  ↓
Phase 2   Database Schema        ← includes subscriptions + billing_events tables
  ↓
Phase 3   Auth
  ↓
Phase 4   Dashboard UI Shell  ←─┐
Phase 5   Onboarding Wizard      │  can run in parallel
Phase 6   CI Token Management  ──┘
  ↓
Phase 7   /api/publish            ← includes free tier enforcement (402)
  ↓
Phase 8   Railway Worker  ←─┐
Phase 9   CLI              ──┘  can run in parallel
  ↓
Phase 10  Agent Layer
  ↓
Phase 11  Billing & Subscriptions  ← Paddle checkout, webhooks, upgrade UI
```
