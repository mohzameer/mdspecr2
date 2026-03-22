# mdspec V1 Product Specification
**CI-First Engineering Spec Publishing Infrastructure**

---

## 1. Overview

mdspec is a CI-driven infrastructure system that publishes engineering specification markdown files from source repositories into organizational documentation systems such as Notion, Confluence, and ClickUp.

**It is NOT:**
- a markdown editor
- a documentation hosting platform
- a real-time sync tool
- a repository management bot
- a VS Code / IDE extension

**It IS:**
- a deterministic spec publishing runtime
- a delivery control plane
- a spec version ledger
- a spec snapshot store

Repositories act as drafting zones.
Documentation tools act as consumption surfaces.
mdspec acts as the delivery backbone.

---

## 2. Core Principles

### 2.1 Source of Truth Model
- Git repository = draft / authoring source
- Documentation tool (Notion / Confluence / ClickUp) = published spec surface
- mdspec = publishing infrastructure + internal ledger

mdspec does not become primary document storage in V1.

### 2.2 CI-First Execution

All spec publishing happens only during CI pipeline execution.

There is:
- no repo webhook pull model
- no background sync
- no realtime publish

Publishing happens on:
- merge to main (recommended)
- configurable push triggers

### 2.3 No Automatic Repository Mutation

mdspec never:
- deletes spec files
- moves spec files
- commits into repositories

Teams manage repository cleanup manually.

### 2.4 One Repository Per Project

Each project is bound to exactly one repository. This is a hard constraint enforced at the API level on every publish request. See Section 18 for enforcement details.

### 2.5 Spec Snapshots for Local Context

Developers can download the latest published snapshot of any spec as a `.md` file directly from the Dashboard. This allows teams to pull specs locally for use as AI coding context (Cursor, Windsurf, Claude etc.) without needing an IDE extension or manual copy-paste from the target tool.

---

## 3. System Architecture

```
Developer → Git Repository → CI Pipeline → mdspec CLI → Next.js API → Supabase (DB + Auth)
                                                                            ↓
                                                                 Upstash Redis (BullMQ queue)
                                                                            ↓
                                                              Railway Worker (BullMQ processor)
                                                                            ↓
                                                         Target Tools (Notion / Confluence / ClickUp)
```

**Stack**

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js App Router, React, Tailwind CSS | |
| API | Next.js API Routes (`/app/api/`) | |
| Auth | Supabase Auth | Email, magic link, GitHub OAuth, Google OAuth |
| Database | Supabase Postgres | Direct queries via `@supabase/supabase-js` |
| Realtime | Supabase Realtime | Live dashboard job status updates |
| Credential encryption | Supabase Vault | Integration tokens encrypted at rest |
| Job queue | BullMQ + Upstash Redis | Async publish jobs and agent runs |
| Worker | Railway (free plan, $1/mo) | Always-on BullMQ worker process |
| CLI | Node.js binary (`npx mdspec`) | Bundled via tsup, published to npm |
| Hosting | Vercel Pro | Frontend + API routes |

> No Prisma. All DB access uses the Supabase JS client directly via `supabase.from()` and `supabase.rpc()`.

---

## 3.1 Monorepo Structure

Everything lives in a single repository. The CLI, worker, dashboard, and API share types and utilities from a common `lib/` folder. Three separate deployable surfaces are produced from the same codebase.

```
mdspec/
  app/                           ← Next.js App Router (Vercel)
    api/
      publish/
        route.ts                 ← POST /api/publish
      auth/
        route.ts
    (dashboard)/
      page.tsx
      projects/
        page.tsx
      integrations/
        page.tsx
      activity/
        page.tsx
    layout.tsx
  worker/                        ← BullMQ worker (Railway)
    index.ts                     ← worker entry point
    queues/
      publish.ts                 ← publish queue processor
      agents.ts                  ← agent queue processor
    jobs/
      publishSpec.ts             ← delivers one spec to one target
      runAgent.ts                ← runs transformation template
  cli/                           ← mdspec CLI (npm: npx mdspec)
    index.ts                     ← CLI entry point
    commands/
      publish.ts                 ← mdspec publish command
  lib/                           ← shared across app, worker, and cli
    supabase.ts                  ← Supabase client
    bullmq.ts                    ← BullMQ queue definitions
    types.ts                     ← shared TypeScript types (payload schemas etc.)
    constants.ts
  package.json
  railway.toml                   ← tells Railway to run worker/index.ts
  tsup.config.ts                 ← bundles cli/ into standalone npm package
```

**Deployment mapping:**

| Folder | Deployed to | How |
|---|---|---|
| `app/` | Vercel | Auto-deploy on push to main |
| `worker/` | Railway | `startCommand = "node worker/index.ts"` in `railway.toml` |
| `cli/` | npm registry | `npx mdspec` — bundled via tsup, published separately |

**Why monorepo:**
The CLI payload schema and the `/api/publish` route must stay in sync. A single `lib/types.ts` governs both — making it impossible to ship a CLI that sends a payload the API doesn't understand. Types are the contract, and the monorepo enforces it automatically.

---

## 4. User Registration & First-Time Experience

### 4.1 Sign Up

Users register via Supabase Auth using any supported method:
- Email + password
- Magic link (email)
- GitHub OAuth
- Google OAuth

On first sign-in, a row is created in the `users` table linked to `auth.users.id`.

### 4.2 First-Time Landing

After sign-up, the user lands on a **blank dashboard** with no organizations or projects. They are presented with a single call to action:

```
You don't belong to any organization yet.
→ Create your first organization
→ Ask a teammate to invite you
```

The user cannot access any product functionality until they are a member of at least one organization.

### 4.3 Creating an Organization

A user can create as many organizations as they need. Each organization is independent with its own members, projects, integrations, and billing.

**Create org flow:**
1. Enter organization name
2. Org is created, user is assigned `owner` role automatically
3. User is redirected to the new org dashboard

### 4.4 Switching Organizations

The top navigation includes an org switcher dropdown. Users see all orgs they are a member of and can switch between them at any time. Each org has its own isolated dashboard, projects, and integrations.

---

## 5. Identity and Resource Hierarchy

### 5.1 User
- A user has one Supabase Auth identity.
- A user may belong to multiple organizations with different roles in each.
- A user may have different roles across projects within the same org.

### 5.2 Organization
- Represents a company, department, team, or product group.
- Billing and integrations are scoped at org level.
- A user can own or be a member of multiple orgs simultaneously.

### 5.3 Project
- Represents a logical spec delivery domain within an org.
- Examples: Checkout Platform, Payments Service, Mobile App.
- Scoped to exactly one repository.
- A user can have different roles on different projects within the same org.

---

## 6. Roles & Permissions

mdspec uses a two-tier permission model: **org-level roles** and **project-level roles**. Both tiers are active simultaneously. Project role wins for project-scoped actions — an org `member` can be a project `admin` and exercise full admin rights on that specific project.

### 6.1 Org-Level Roles

| Role | Description |
|---|---|
| `owner` | Full control. Assigned automatically to org creator. Only one owner per org. |
| `admin` | Can manage members, projects, and integrations. Cannot delete the org. |
| `member` | Read-only access to org-level resources. Capabilities determined by project role. |

**Org-level permission matrix:**

| Action | Owner | Admin | Member |
|---|---|---|---|
| View org dashboard | ✅ | ✅ | ✅ |
| Create projects | ✅ | ✅ | ❌ |
| Manage integrations (Notion, Confluence, ClickUp) | ✅ | ✅ | ❌ |
| Invite members | ✅ | ✅ | ❌ |
| Remove members | ✅ | ✅ | ❌ |
| Change member org roles | ✅ | ✅ | ❌ |
| Delete org | ✅ | ❌ | ❌ |
| Transfer org ownership | ✅ | ❌ | ❌ |

### 6.2 Project-Level Roles

Project roles are assigned per user per project. A user must be an org member before they can be assigned a project role.

| Role | Description |
|---|---|
| `admin` | Full control over the project. |
| `member` | Can view specs, download snapshots, and trigger manual publishes. Cannot change config or tokens. |
| `viewer` | Read-only. Can view and download published specs only. |

**Project-level permission matrix:**

| Action | Org Owner | Org Admin | Project Admin | Project Member | Project Viewer |
|---|---|---|---|---|---|
| View published specs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Download spec snapshot (.md) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Trigger manual publish | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit project config (spec dirs, targets) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage CI tokens (create, revoke) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign project roles to members | ✅ | ✅ | ✅ | ❌ | ❌ |
| Change registered repo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete project | ✅ | ✅ | ✅ | ❌ | ❌ |

### 6.3 Role Resolution Rules

- Org `owner` and org `admin` have implicit project admin rights on all projects within their org — no explicit project role assignment required.
- Org `member` capabilities on a project are determined entirely by their assigned project role.
- An org `member` CAN be assigned `project admin` — project role wins for that project's actions.
- A user with no project role assigned defaults to `viewer` on projects they can see.
- Users cannot see projects they have no role on, unless they are org `owner` or `admin`.

### 6.4 Role Change Rules

- Only org `owner` can transfer org ownership.
- Org `owner` cannot be demoted by anyone except themselves (via ownership transfer).
- Project roles can be assigned by org `owner`, org `admin`, or project `admin`.
- A user cannot assign a role higher than their own.

---

## 7. Member Invites

### 7.1 Invite by Email

Org `owner` and org `admin` can invite users to the organization by email.

**Invite flow:**
1. Dashboard → Settings → Members → Invite Member
2. Enter email address
3. Select org role (`admin` or `member`)
4. Invite email sent via Supabase Auth

**Invite email contains:**
- Org name and inviter name
- Accept invite button (deep link with signed token)
- Link expiry: **7 days**

**On accept:**
- If invitee has no mdspec account → taken through sign-up first, then auto-joined to the org
- If invitee already has an account → auto-joined to the org immediately
- User lands on the org dashboard after joining

**Invite states:**

| State | Meaning |
|---|---|
| `pending` | Invite sent, not yet accepted |
| `accepted` | User joined the org |
| `expired` | 7-day window passed, not accepted |
| `revoked` | Manually cancelled by admin before acceptance |

Pending and expired invites are visible in Dashboard → Settings → Members. Admins can resend or revoke any pending invite.

### 7.2 Project Role Assignment After Join

After a member joins the org, a project `admin` or org `admin` can assign them a project role from Dashboard → Project → Settings → Members.

---

## 8. Project Creation

Any org `owner` or `admin` can create projects within an organization.

**Create project wizard steps:**
1. **Project Basics** — name, description
2. **Spec Directory Config** — enter one or more paths (e.g. `/specs`, `/docs/rfc`)
3. **CI Token** — generate token, copy GitHub Actions snippet (shown once)
4. **Target Integration** — connect Notion, Confluence, or ClickUp (or skip, configure later)
5. **Agent Template** *(optional)* — select transformation template

A project can be created without a target integration — specs will be ingested and stored in the ledger but not published to any tool until an integration is connected.

---

## 9. Authentication & Token Management

### 9.1 Auth Provider: Supabase Auth

| Method | V1 Support |
|---|---|
| Email + password | Yes |
| Magic link (email) | Yes |
| GitHub OAuth | Yes |
| Google OAuth | Yes |
| SSO / SAML | Out of scope V1 |

Sessions are managed via `@supabase/ssr` in Next.js. Session cookies are set server-side via middleware. Row-Level Security (RLS) is enabled on all Supabase tables — policies enforce org-scoped and project-scoped data access throughout.

### 9.2 CI Publish Token (MDSPEC_TOKEN)

CI tokens are machine tokens scoped to a project, entirely separate from user sessions.

| Token Type | Scope | Created By |
|---|---|---|
| `MDSPEC_TOKEN` | Per-project publish token | Project admin via Dashboard |
| User session | Dashboard + API access | Supabase Auth |

**Token generation:**
- Generated in Dashboard → Project Settings → CI Token.
- Format: `mds_<project_id_short>_<random_hex_32>` (URL-safe, ~64 chars).
- Stored as a **bcrypt hash** in Supabase. Raw value shown **once** at creation only.
- After creation, only the last 6 characters are displayed for identification.

**Token scoping:**
- Each token is scoped to exactly one project.
- A project may have up to **3 active tokens** simultaneously (supports rotation).
- Tokens carry no user identity — they authenticate the project publish action only.
- Validation happens in `/api/publish` via lookup against the `project_tokens` table.

**Token rotation and revocation:**
- New tokens can be generated at any time; old tokens stay active until explicitly revoked.
- Revocation is immediate — in-flight publishes with a revoked token return `401`.
- Revoked tokens are soft-deleted (retained for audit log).

**Token storage guidance (shown to user at creation):**
```
Store as a GitHub Actions secret:
  Settings → Secrets → Actions → New repository secret
  Name: MDSPEC_TOKEN
  Value: mds_xxx_...
```

---

## 10. CLI Runtime Behaviour

### 10.1 Invocation
```bash
mdspec publish --project <project_id>
```
Executed inside CI job after repository checkout.

### 10.2 Spec Directory Discovery
Configured during project creation. CLI recursively scans for `.md` files within all configured directories.

Examples:
- `/specs`
- `/docs/rfc`
- `/services/payments/specs`

### 10.3 Change Detection Strategy

**Primary:**
```bash
git diff --name-only <base>...HEAD
```
CLI filters only markdown files inside configured spec directories.

**Fallback:**
Compute SHA256 hash of all specs, compare with last known hash in ledger.

If no spec changes detected: CLI exits `0` with a no-op message.

### 10.4 Spec Processing

For each changed spec:
1. Read markdown
2. Parse frontmatter
3. Normalize content
4. Compute SHA256 content hash

### 10.5 Artifact Payload

CLI sends payload to `POST /api/publish`:

```json
{
  "project_id": "proj_xxx",
  "repo_name": "acme/payments",
  "branch": "main",
  "commit_sha": "a7c2d...",
  "specs": [
    {
      "path": "specs/payments/checkout-retry.md",
      "hash": "sha256:abc...",
      "frontmatter": {},
      "content": "..."
    }
  ]
}
```

### 10.6 CLI Output

```
✓ Published  specs/payments/checkout-retry.md → Notion
✓ Published  specs/auth/sso-setup.md          → Confluence
✓ Published  specs/deploy-runbook.md          → ClickUp
✗ Failed     specs/auth-flow.md               → Notion (permission denied)
— Skipped    specs/old-spec.md                (no changes)
```

---

## 11. Frontmatter Schema (V1)

Frontmatter is optional. If omitted, project default targets are used.

```yaml
---
title: Checkout Retry Policy
targets:
  - notion: payments-docs
  - confluence: eng-wiki
  - clickup: doc_xxx
task_id: CU-182
publish: on-merge
mdspec_id: spec_checkout_retry
---
```

| Key | Required | Description |
|---|---|---|
| `title` | No | Display name in target tool. Falls back to filename. |
| `targets` | No | Override project-level target routing for this spec. |
| `task_id` | No | Links spec to external task (ClickUp, Jira, Linear). |
| `publish` | No | `on-merge` (default) or `manual`. |
| `mdspec_id` | No | Stable unique identifier. See Section 11.1. |

### 11.1 mdspec_id Rules

- `mdspec_id` must be unique within a project.
- If absent, the ledger uses the spec `path` as the unique key.
- CLI validates format: lowercase alphanumeric + underscores, max 64 chars.
- Invalid values warn and fall back to path key — publish is not blocked.

---

## 12. Folder Structure Mirroring

mdspec preserves the repository folder structure when publishing to target tools. The directory hierarchy of `.md` files in the repo is mirrored as a nested page/document hierarchy in Notion, Confluence, and ClickUp.

### 12.1 How It Works

Given a repo with this structure:
```
specs/
  payments/
    checkout-retry.md
    refund-policy.md
  auth/
    sso-setup.md
  sla-policy.md
```

mdspec creates the equivalent hierarchy in the target tool:

```
Payments Service                  ← project root page (created once on first publish)
  └── specs/
        ├── payments/
        │     ├── checkout-retry
        │     └── refund-policy
        ├── auth/
        │     └── sso-setup
        └── sla-policy
```

### 12.2 Root Page

Each project gets a single root page created in the target tool on first publish. All spec folders and pages nest under this root. The root page title defaults to the project name and is configurable in Project Settings.

### 12.3 Folder Pages

Intermediate folder levels are created as parent pages (Notion / Confluence) or folders (ClickUp) automatically. They exist purely as structural containers and are not editable via mdspec.

If a folder is renamed in the repo, the old folder page remains in the target tool and a new one is created. mdspec does not delete or rename existing pages — teams manage cleanup manually.

### 12.4 Page Identity and Updates

Each spec page is identified by its `mdspec_id` (if set) or its `path` relative to the repo root. On subsequent publishes the existing page is **updated in place** — not deleted and recreated. This preserves any comments, reactions, or manual annotations added in the target tool.

### 12.5 Target-Specific Behaviour

| Target | Folder representation | Page update method |
|---|---|---|
| Notion | Nested sub-pages | Update page blocks via Notion API |
| Confluence | Page tree (parent/child pages) | Update page body via Confluence API |
| ClickUp | Nested Docs | Update doc content via ClickUp Docs API |

---

## 13. Spec Snapshot Download

Developers can download the latest published snapshot of any spec as a `.md` file directly from the Dashboard. This is the primary mechanism for pulling specs locally for use as AI coding context (Cursor, Windsurf, Claude etc.).

### 13.1 Download Flow

- Dashboard → Project → Specs → select spec → Download snapshot
- Returns the latest published content as a `.md` file
- Filename: `<mdspec_id or path slug>-snapshot.md`
- Content is pulled from the `specs.content` column in the Supabase ledger (the last successfully published version)

### 13.2 What the Snapshot Contains

The downloaded file is the normalized markdown content as it was last published — including frontmatter. It reflects the ledger state, not the live repo state. If the repo has unpublished changes, the snapshot will not include them until the next CI publish runs.

### 13.3 Who Can Download

Any user with at minimum `viewer` project role can download snapshots. See Section 6.2 permission matrix.

### 13.4 Bulk Download (V1)

Users can download all specs in a project as a `.zip` archive from Dashboard → Project → Download all snapshots. The zip preserves the folder structure matching the repo hierarchy.

```
acme-payments-snapshots.zip
  └── specs/
        ├── payments/
        │     ├── checkout-retry.md
        │     └── refund-policy.md
        ├── auth/
        │     └── sso-setup.md
        └── sla-policy.md
```

---

## 14. Target Routing

**Resolution order:**
1. Spec frontmatter `targets`
2. Project default targets

**Supported targets (V1):**
- Notion
- Confluence
- ClickUp

Target integrations are configured at org level and available to all projects within that org.

---

## 15. Target Integration Authentication

### 15.1 Notion Integration

- Auth method: Notion Internal Integration Token.
- Setup: Dashboard → Integrations → Connect Notion → paste token.
- Token stored encrypted at rest via Supabase Vault.
- Required permissions: `Insert content`, `Read content`, `Update content`.
- The project root page must be explicitly shared with the mdspec integration inside Notion. Child pages inherit access automatically.

**Credential expiry:** Internal tokens do not expire unless revoked. `401` from Notion flags the integration as `unhealthy` and queues retry for up to 24 hours.

### 15.2 Confluence Integration

- Auth method: Confluence API Token (Basic Auth: email + token).
- Setup: Dashboard → Integrations → Connect Confluence → enter base URL, email, token.
- Credentials stored encrypted via Supabase Vault.
- Required permissions: `Create page`, `Edit page` on target space.

**Credential expiry:** Atlassian tokens do not expire unless revoked. Same `unhealthy` + 24-hour retry queue as Notion.

### 15.3 ClickUp Integration

- Auth method: ClickUp OAuth 2.0 (preferred) or Personal API Token.
- Setup: Dashboard → Integrations → Connect ClickUp → complete OAuth flow or paste personal token.
- Required permissions: access to Docs in the target workspace/space.
- Spec content is published as a **ClickUp Doc** (not a task).
- `task_id` in frontmatter can reference a ClickUp task ID to link the published doc to a specific task.

**ClickUp Doc targeting in frontmatter:**
```yaml
targets:
  - clickup: doc_abc123        # Update an existing ClickUp Doc root
  - clickup: space_xyz/docs    # Create under a space
```

**Credential expiry:** ClickUp OAuth tokens expire. mdspec stores the refresh token and re-authenticates automatically. If refresh fails, integration is flagged `unhealthy`.

### 15.4 Integration Health States

| State | Meaning |
|---|---|
| `connected` | Last publish to this integration succeeded |
| `unhealthy` | Last publish returned auth or permission error |
| `disconnected` | Credentials removed or revoked by user |

Health is displayed in Dashboard → Integrations.

---

## 16. BullMQ & Upstash Redis

### 16.1 Why a Job Queue Is Needed

When a CI job calls `POST /api/publish`, the payload may contain multiple specs each needing delivery to multiple targets. Each delivery involves an outbound HTTP call to a third-party API, rate limit handling, and retry logic with exponential backoff.

If this ran synchronously inside the API route:
- The CI job would hang for potentially minutes waiting for all publishes and retries
- A single third-party timeout would fail the entire publish request
- Vercel Pro function timeout is 60 seconds — not enough for a large multi-target changeset with retries
- No clean way to surface partial failures or per-spec status

### 16.2 What BullMQ + Upstash Provides

BullMQ is the job queue library. Upstash Redis is the managed Redis store BullMQ runs on top of — storing all queued jobs, retry state, delayed job scheduling, and concurrency control. Upstash is fully managed (no ops, no patching) and free at V1 volume.

```
POST /api/publish
  └─ Validate MDSPEC_TOKEN
  └─ Validate repo_name matches registered repo (→ 403 if mismatch)
  └─ Write specs to Supabase ledger (status: queued)
  └─ Enqueue one BullMQ job per spec × target into Upstash Redis
  └─ Return 202 Accepted immediately ← CLI unblocks here

Railway Worker (always-on, $1/mo)
  └─ Reads jobs from Upstash Redis via BullMQ
  └─ Processes jobs with concurrency control
  └─ Applies per-target rate limit delays
  └─ Resolves folder hierarchy, creates/updates pages in correct nesting
  └─ On success → updates Supabase ledger (status: published, external_url)
  └─ On retryable failure → re-enqueues with backoff delay in Upstash
  └─ On terminal failure → updates Supabase ledger (status: failed, last_error)
  └─ On agent job → runs transformation, re-enqueues publish with output
```

### 16.3 Job Types

| Queue | Job | Description |
|---|---|---|
| `publish` | `publish_spec` | Deliver one spec to one target, resolve folder hierarchy |
| `publish` | `retry_publish` | Retry a failed publish after backoff delay |
| `agents` | `run_agent` | Execute a transformation template on ingested spec |
| `agents` | `task_summary` | Generate task summary, post to ClickUp / Jira task |

### 16.4 Worker Environment Variables

```
REDIS_URL=...               # Upstash Redis connection string
SUPABASE_URL=...            # Supabase project URL
SUPABASE_SERVICE_KEY=...    # Supabase service role key
```

No Railway SDK. No Railway-specific config. Worker is portable to any Node.js host in under 30 minutes.

---

## 17. Error Handling & Retry Semantics

### 17.1 Error Categories

| Category | Example | Retry? |
|---|---|---|
| Auth failure | Invalid `MDSPEC_TOKEN` | No |
| Repo mismatch | Wrong repo publishing to project | No (hard reject, 403) |
| Permission error | Target page not shared with integration | No |
| Rate limit | 429 from Notion / Confluence / ClickUp | Yes |
| Transient network | Timeout, 5xx from target | Yes |
| Payload error | Malformed spec, oversized content | No |

### 17.2 Retry Policy

- Retries apply to rate limit and transient network errors only.
- Strategy: **exponential backoff** — 5s, 30s, 2m, 10m, 30m (5 attempts max).
- BullMQ handles backoff natively via `attempts` and `backoff` job options.
- After 5 failed attempts, job moves to BullMQ `failed` state and Supabase ledger is updated to `failed`.

### 17.3 Rate Limiting per Target

- Notion: ~3 req/s → 350ms delay between Notion jobs in worker.
- Confluence: conservative 500ms delay.
- ClickUp: 100 req/min → 650ms delay.
- All delays enforced in the BullMQ worker via `limiter` config, not in the CLI.

### 17.4 Failure Surfacing

Failed jobs appear in:
- Dashboard → Activity (error reason from ledger, live via Supabase Realtime)
- CLI stdout: `202 Accepted — 3 specs queued` (CLI does not block on job completion)

---

## 18. Repository Enforcement (One Repo Per Project)

### 18.1 Registration

On the **first publish** to a project, the `repo_name` from the CLI payload is stored as `projects.registered_repo` automatically. No manual configuration required.

### 18.2 Enforcement

On every **subsequent publish**, the API compares the incoming `repo_name` against `projects.registered_repo`:

```
if payload.repo_name ≠ projects.registered_repo
  → return 403 Forbidden
  → log mismatch to Dashboard Activity
  → reject entire payload, no specs processed
```

### 18.3 Changing the Registered Repo

A project `admin`, org `admin`, or org `owner` can update `registered_repo` from Dashboard → Project Settings → Repository. Required when a repo is renamed or migrated.

### 18.4 CLI Error on Mismatch

```
✗ Rejected   repo mismatch
             registered: acme/payments
             received:   acme/payments-v2

             Update the registered repo in Project Settings if this is intentional.
```

---

## 19. Dashboard (Control Plane UI)

### 19.1 Organization Switcher
Top navigation dropdown. Shows all orgs the user is a member of. Users can switch between orgs or create a new one from the dropdown.

### 19.2 Dashboard View

Live via Supabase Realtime. Shows:
- last sync time
- specs published count
- recent activity feed

```
specs/payments/checkout-retry.md  →  synced to Notion         2m ago
specs/auth/sso-setup.md           →  failed (permission)       5m ago
specs/sla-policy.md               →  queued (retrying)         8m ago
```

### 19.3 First Publish Handshake

- Dashboard shows `Pending first publish` with inline CI snippet panel until first artifact is received.
- On first publish: `repo_name` stored as `projects.registered_repo`. Dashboard transitions to `Connected` with green banner — *"First publish received from `acme/payments` @ `main`"*.

### 19.4 Specs View

Per-project spec browser showing:
- full folder hierarchy mirroring the repo structure
- publish status per spec per target
- last published timestamp and commit SHA
- link to open published page in target tool
- **Download snapshot** button per spec (`.md` file)
- **Download all snapshots** button (`.zip` archive preserving folder structure)

### 19.5 Projects Page
Each project displays:
- connected repository name
- last publish status per target
- configured spec directories
- configured targets
- project members and their roles

### 19.6 Members & Settings Page (Org level)

Accessible by org `owner` and `admin`:
- View all org members and their roles
- Invite new members by email
- Change member org roles
- Revoke or resend pending invites
- View invite status (`pending` / `accepted` / `expired` / `revoked`)

### 19.7 Sidebar Structure
```
Dashboard
Projects
  └── [Project Name]
        ├── Specs
        ├── Activity
        └── Settings
              ├── General
              ├── Repository
              ├── CI Tokens
              └── Members
Integrations
Activity
Settings
  └── Members
  └── Organization
```

---

## 20. Agent Layer (V1)

Agents are transformation templates that run asynchronously via BullMQ on the Railway worker after artifact ingestion. They do not execute inside CI.

**Supported templates:**
- full spec publish
- task summary generation
- release note formatter

Agent job status is visible in Dashboard → Project → Activity.

---

## 21. CI Integration Model

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0  # Required for git diff change detection

- run: npx mdspec publish --project proj_xxx
  env:
    MDSPEC_TOKEN: ${{ secrets.MDSPEC_TOKEN }}
```

`fetch-depth: 0` is required. Without it, only the latest commit is fetched and diff-based change detection falls back to full hash comparison.

No GitHub OAuth or repo read permission required.

---

## 22. Spec Ledger (Supabase Postgres)

**`organizations` table:**
```sql
id              uuid primary key default gen_random_uuid()
name            text not null
created_at      timestamptz default now()
```

**`org_members` table:**
```sql
id              uuid primary key default gen_random_uuid()
org_id          uuid references organizations(id)
user_id         uuid references auth.users(id)
role            text not null  -- 'owner' | 'admin' | 'member'
created_at      timestamptz default now()
```

**`org_invites` table:**
```sql
id              uuid primary key default gen_random_uuid()
org_id          uuid references organizations(id)
invited_by      uuid references auth.users(id)
email           text not null
role            text not null  -- 'admin' | 'member'
token_hash      text not null
status          text not null  -- 'pending' | 'accepted' | 'expired' | 'revoked'
expires_at      timestamptz not null
created_at      timestamptz default now()
```

**`projects` table:**
```sql
id              uuid primary key default gen_random_uuid()
org_id          uuid references organizations(id)
name            text not null
description     text
registered_repo text
spec_dirs       text[]
created_at      timestamptz default now()
```

**`project_members` table:**
```sql
id              uuid primary key default gen_random_uuid()
project_id      uuid references projects(id)
user_id         uuid references auth.users(id)
role            text not null  -- 'admin' | 'member' | 'viewer'
created_at      timestamptz default now()
```

**`project_tokens` table:**
```sql
id              uuid primary key default gen_random_uuid()
project_id      uuid references projects(id)
token_hash      text not null
token_hint      text not null
revoked         boolean default false
created_by      uuid references auth.users(id)
created_at      timestamptz default now()
revoked_at      timestamptz
```

**`integrations` table:**
```sql
id              uuid primary key default gen_random_uuid()
org_id          uuid references organizations(id)
type            text not null  -- 'notion' | 'confluence' | 'clickup'
status          text not null  -- 'connected' | 'unhealthy' | 'disconnected'
credentials     text not null  -- encrypted via Supabase Vault
config          jsonb
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

**`specs` table:**
```sql
id              uuid primary key default gen_random_uuid()
project_id      uuid references projects(id)
repo            text not null
path            text not null
mdspec_id       text
commit_sha      text not null
content_hash    text not null
content         text not null  -- latest published snapshot, used for downloads
frontmatter     jsonb
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

**`spec_publish_targets` table:**
```sql
id              uuid primary key default gen_random_uuid()
spec_id         uuid references specs(id)
integration_id  uuid references integrations(id)
target_type     text not null  -- 'notion' | 'confluence' | 'clickup'
external_page_id text
external_url    text
status          text not null  -- 'queued' | 'published' | 'failed'
retry_count     int default 0
last_error      text
published_at    timestamptz
```

RLS policies enforce org-scoped and project-scoped access on all tables throughout.

---

## 23. Spec Externalization Lifecycle

1. Spec authored in repo
2. Spec merged to main
3. CI triggers `mdspec publish`
4. CLI detects changed specs via git diff
5. CLI sends artifact payload to `POST /api/publish`
6. API validates `MDSPEC_TOKEN`
7. API validates `repo_name` matches `projects.registered_repo` → `403` if mismatch
8. Specs written to Supabase ledger (`specs` table, status: `queued`)
9. One BullMQ job enqueued per spec × target into Upstash Redis
10. `202 Accepted` returned to CLI immediately
11. Railway worker picks up jobs from Upstash Redis
12. Worker resolves folder hierarchy, creates/updates pages in target tools
13. Supabase ledger updated (`published` or `failed`)
14. Dashboard reflects live status via Supabase Realtime
15. Spec externalized — team may delete file from repo if desired
16. Latest snapshot available for download from Dashboard at any time

---

## 24. Service Infrastructure & Costs

### 24.1 Supabase

**Role:** Postgres database, Auth, Realtime (live dashboard), Vault (credential encryption).

| Plan | Cost | Limits |
|---|---|---|
| Free | $0/mo | 500MB DB, 50,000 MAU, 2 projects |
| Pro | $25/mo | 8GB DB, 100,000 MAU, unlimited projects |

**Recommendation:** Start on Free. Move to Pro when you have paying customers or exceed 2 Supabase projects.

### 24.2 Vercel

**Role:** Hosting for Next.js frontend and API routes.

| Plan | Cost | Notes |
|---|---|---|
| Hobby | $0/mo | Personal use only, 10s function timeout |
| Pro | $20/mo | Commercial use, 60s function timeout, team members |

**Recommendation:** Pro from day one. Hobby prohibits commercial use and 10s timeout is insufficient under real publish load.

### 24.3 Upstash Redis

**Role:** Managed Redis store for BullMQ. Stores queued jobs, retry state, delayed scheduling, and concurrency control.

| Plan | Cost | Limits |
|---|---|---|
| Free | $0/mo | 10,000 commands/day, 256MB |
| Pay-as-you-go | ~$0.20 per 100K commands | No hard limits |

**Recommendation:** Free tier sufficient for V1. Each publish consumes ~5–10 Redis commands.

### 24.4 Railway (BullMQ Worker)

**Role:** Always-on BullMQ worker. Cannot run on Vercel — requires a persistent long-running process.

| Plan | Cost | Limits |
|---|---|---|
| Free (after 30-day trial) | $1/mo | 0.5 vCPU, 0.5GB RAM |
| Hobby | $5/mo | More resources |

**Recommendation:** Free plan at $1/mo for V1. Worker sits well under 200MB RAM idle. Zero Railway-specific code — portable to any Node.js host in 30 minutes.

### 24.5 Monthly Cost Summary

| Service | Role | Plan | Monthly Cost |
|---|---|---|---|
| Supabase | DB + Auth + Realtime + Vault | Free → Pro | $0 → $25 |
| Vercel | Frontend + API | Pro | $20 |
| Upstash Redis | BullMQ job queue | Free | $0 |
| Railway | BullMQ worker | Free (after trial) | $1 |
| **Total** | | | **$21/mo launch → $46/mo post-revenue** |

### 24.6 Cost Scaling (Illustrative)

| Stage | Supabase | Vercel | Upstash | Railway | Total |
|---|---|---|---|---|---|
| Pre-revenue | $0 | $20 | $0 | $1 | **$21/mo** |
| Early customers | $25 | $20 | ~$2 | $1 | **$48/mo** |
| Growth | $25 | $20 | ~$10 | $5 | **$60/mo** |

---

## 25. Billing & Pricing

### 25.1 Pricing Tiers

| | Free | Pro |
|---|---|---|
| **Monthly** | $0 | $12/mo |
| **Yearly** | $0 | $100/yr (~$8.33/mo) |
| **Yearly saving** | — | ~30% ($44/yr) |
| Organizations | 1 | Unlimited |
| Projects | 1 | Unlimited |
| Specs published | 10 | Unlimited |
| Team members | Unlimited | Unlimited |
| Target integrations | All (Notion, Confluence, ClickUp) | All |
| Snapshot downloads | ✅ | ✅ |
| Agent templates | ✅ | ✅ |

**Free tier hard limits:**
- 1 organization
- 1 project within that org
- 10 specs published (unique specs in the ledger, not publish runs)
- When the 10 spec limit is reached, subsequent CI publishes are rejected with a clear upgrade prompt in the CLI and Dashboard

### 25.2 Pricing Policy

mdspec reserves the right to change pricing at any time subject to the following terms:

- **Monthly subscribers:** 30 days written notice before any price change takes effect. Current subscribers may cancel before the new price applies.
- **Annual subscribers:** Price is locked at the rate paid for the current annual period. New pricing applies at renewal.
- **Grandfathering:** Not guaranteed. Early adopter pricing is a benefit of signing up early, not a permanent entitlement.
- **Policy updates:** Terms of Service governs all pricing commitments. mdspec may introduce new tiers, retire existing tiers, or restructure limits with appropriate notice.

This policy is displayed on the pricing page and accepted as part of the sign-up Terms of Service.

### 25.3 Paddle Integration

Billing is handled entirely by **Paddle** as the Merchant of Record. Paddle handles payment processing, tax collection, invoicing, and compliance globally. mdspec never stores card details.

**Paddle products configured:**

| Product | Paddle price ID | Billing |
|---|---|---|
| mdspec Pro Monthly | `pri_pro_monthly` | $12/mo recurring |
| mdspec Pro Yearly | `pri_pro_yearly` | $100/yr recurring |

**Checkout flow:**
1. User clicks **Upgrade to Pro** in Dashboard
2. Paddle.js overlay opens (embedded in Next.js dashboard)
3. User completes payment in Paddle checkout
4. Paddle fires `subscription.created` webhook
5. mdspec webhook handler updates org subscription in Supabase
6. Dashboard reflects Pro status immediately via Supabase Realtime

**Webhook endpoint:** `POST /api/webhooks/paddle`

Paddle webhook events handled in V1:

| Event | Action |
|---|---|
| `subscription.created` | Set org plan to `pro`, store `paddle_subscription_id` |
| `subscription.updated` | Update plan, billing period, next renewal date |
| `subscription.cancelled` | Set org plan to `free` at period end |
| `subscription.payment_succeeded` | Log payment, extend subscription period |
| `subscription.payment_failed` | Flag org as `payment_failed`, show Dashboard warning |

**Webhook security:** All Paddle webhooks are verified using Paddle's webhook signature before processing.

### 25.4 Free Tier Enforcement

Free tier limits are enforced at the API level in `/api/publish`:

```
On publish request:
  └─ Check org plan
  └─ If plan = 'free'
        └─ Count distinct specs in ledger for this project
        └─ If count >= 10
              → return 402 Payment Required
              → log limit hit to Dashboard Activity
              → reject payload, no specs processed
        └─ If count < 10
              → allow publish
              → if this publish would push count to 10, show upgrade nudge in response
```

**CLI output when limit is hit:**
```
✗ Rejected   free tier limit reached (10/10 specs)
             Upgrade to Pro to publish unlimited specs.
             → https://mdspec.dev/upgrade
```

**Dashboard behaviour when limit is hit:**
- Banner shown across all pages: *"You've reached the free tier limit. Upgrade to Pro to continue publishing."*
- Upgrade button prominent in sidebar and project pages
- Existing published specs remain accessible — nothing is deleted or locked

### 25.5 Subscription Schema (Supabase)

**`subscriptions` table:**
```sql
id                    uuid primary key default gen_random_uuid()
org_id                uuid references organizations(id) unique
plan                  text not null default 'free'  -- 'free' | 'pro'
billing_period        text           -- 'monthly' | 'yearly' | null (free)
paddle_subscription_id text          -- Paddle subscription ID
paddle_customer_id    text           -- Paddle customer ID
status                text not null default 'active'  -- 'active' | 'cancelled' | 'payment_failed'
current_period_start  timestamptz
current_period_end    timestamptz
cancelled_at          timestamptz
created_at            timestamptz default now()
updated_at            timestamptz default now()
```

**`billing_events` table (audit log):**
```sql
id                    uuid primary key default gen_random_uuid()
org_id                uuid references organizations(id)
event_type            text not null  -- 'subscription.created' | 'payment_succeeded' etc.
paddle_event_id       text not null  -- idempotency key
payload               jsonb          -- raw Paddle webhook payload
created_at            timestamptz default now()
```

### 25.6 Break-Even Analysis

| Customers | Monthly revenue | Infrastructure cost | Profit |
|---|---|---|---|
| 5 monthly | $60/mo | $50/mo | $10/mo |
| 10 monthly | $120/mo | $55/mo | $65/mo |
| 10 annual | $833/mo avg | $55/mo | $778/mo |
| 50 monthly | $600/mo | $100/mo | $500/mo |
| 100 monthly | $1,200/mo | $175/mo | $1,025/mo |

Break-even reached at approximately **5 monthly paying customers.** All annual customers are profitable from day one.

---

## 26. Out of Scope for V1

- automatic repo mutation
- realtime publishing
- spec editing in mdspec
- full spec hosting UI
- PR preview publishing
- governance enforcement rules
- GitHub App automation
- email / Slack failure notifications
- SSO / SAML
- multi-repository per project
- invite by shareable link or email domain auto-join
- VS Code / IDE extension
- CLI pull command (mdspec pull)
- Enterprise tier

---

## 27. Future Expansion Surfaces

- `mdspec pull` CLI command — pull latest snapshot into local repo
- VS Code / Cursor extension — spec browser + selective clone
- Enterprise tier (custom pricing, SSO, compliance)
- multi-repo per project (V2)
- drift detection and auto-pruning
- PR preview publishing
- archive PR bot
- org-wide spec search
- Slack / email failure alerts
- Linear / Jira native task_id linking
- compliance bundles
- spec intelligence graph
- hierarchical spec inheritance (org-level → project-level)
- AI architecture reasoning
- release blast radius analysis
- SSO / SAML
- shareable invite links and domain-based auto-join

---

*End of Specification — mdspec V1*