# mdspec — Frontmatter-Based Routing Specification
**Simplified routing for everyone — solo developers and enterprise teams**

---

## 1. Overview

mdspec routes markdown specs to their destination using frontmatter declared in each file. No `.mdspecmap` config file. No folder detection. No alias system. No Map Page.

Every markdown file declares exactly where it goes. Files without frontmatter are silently ignored.

Branch names are used to automatically extract task IDs — linking specs to tasks without any manual configuration. Frontmatter + branch name = completely automatic syncing.

---

## 2. Core Principle

```
Frontmatter = routing config
Branch name = automatic task ID extraction
File without frontmatter = not synced
File with frontmatter = synced to declared destination
```

The developer reads any `.md` file and knows instantly where it publishes. No external config to consult. No inheritance chain to trace. No folder structure to understand.

Branch task ID extraction is fully automatic — if the branch name contains a task ID matching the configured pattern, mdspec links the spec to that task without any frontmatter required for the parent field.

---

## 3. Frontmatter Schema

```yaml
---
id: checkout-retry              # optional — stable identifier
type: wiki                      # required — determines agent template
integration: notion             # optional — overrides org default
parent: eng-docs                # optional — destination parent
---
```

### 3.1 Field Reference

| Field | Required | Description |
|---|---|---|
| `id` | No | Stable identifier for this spec. Used for deduplication and ledger tracking. Falls back to file path if absent. |
| `type` | Yes | Document type. Determines agent transformation template applied before publishing. |
| `integration` | No | Target integration. Falls back to org default integration if absent. |
| `parent` | No | Parent page, doc, task, or folder in the target integration. Falls back to branch task ID extraction, then integration root if absent. Explicit frontmatter always wins over branch detection. |

### 3.2 Type Values

| Type | Description | Default Agent Template |
|---|---|---|
| `wiki` | General documentation, guides, onboarding | None — published as-is |
| `task` | Task or feature spec for a project management tool | Task Template |
| `adr` | Architecture Decision Record | ADR Template |
| `rfc` | Request for Comments | RFC Template |
| `api` | API reference documentation | API Reference Template |
| `runbook` | Operational runbook for on-call engineers | Runbook Template |
| `data-model` | Database schema and entity documentation | Data Model Template |
| `security` | Security review documentation | Security Review Template |
| `release` | Release notes | Release Notes Template |
| `sprint` | Sprint brief | Sprint Brief Template |

### 3.3 Branch Task ID Extraction

mdspec automatically extracts task IDs from branch names using a regex pattern configured once per project. When a spec has no `parent` declared in frontmatter, the extracted task ID is used as the parent automatically.

**Common branch naming patterns:**

```
feature/CU-182-checkout-retry     → CU-182  (ClickUp)
fix/JRA-4421-auth-bug             → JRA-4421 (Jira)
feat/LIN-291-payments             → LIN-291  (Linear)
CU-182-checkout                   → CU-182  (no prefix)
```

**Default pattern (matches all common formats):**

```
[A-Z]+-\d+
```

Matches any uppercase prefix followed by a hyphen and digits. Covers ClickUp, Jira, Linear, GitHub Issues, and most common task ID formats simultaneously.

**Resolution priority:**

```
1. frontmatter.parent    ← explicit, always wins
2. branch task ID        ← automatic extraction
3. integration root      ← final fallback
```

### 3.4 Integration Values

```
notion
confluence
clickup
s3
```

### 3.5 Parent Field

The `parent` field accepts three formats:

**Alias (recommended):**
```yaml
parent: eng-docs    # alias defined in Dashboard → Integrations
```

**Native ID:**
```yaml
parent: abc123def456    # Notion page ID, ClickUp doc ID etc.
```

**URL:**
```yaml
parent: https://notion.so/Engineering-abc123def456
```

URL is resolved to a native ID on first publish and cached. Subsequent publishes use the cached ID.

**Absent:**
```yaml
# no parent field
# spec is published at the integration root
```

---

## 4. Examples

### 4.1 Wiki document to Notion

```yaml
---
type: wiki
integration: notion
parent: eng-docs
---

# Auth Flow

This document describes the authentication flow...
```

Published as a page under the `eng-docs` alias in Notion. No transformation — raw markdown published.

### 4.2 Task spec to ClickUp

```yaml
---
id: checkout-retry-task
type: task
integration: clickup
parent: dev-sprint-list
---

# Checkout Retry Policy

This spec describes the retry behaviour...
```

Task Template transformation applied. Published as a ClickUp task under `dev-sprint-list`.

### 4.3 Automatic task linking via branch name

```yaml
---
type: task
---

# Checkout Retry Policy

This spec describes the retry behaviour...
```

Branch name: `feature/CU-182-checkout-retry`

mdspec extracts `CU-182` from the branch name automatically. No `parent` field needed. Spec is published to ClickUp task CU-182 via Task Template transformation.

**Same file, different branches:**

```
branch: feature/CU-182-checkout  → links to CU-182
branch: feature/CU-291-auth      → links to CU-291
branch: main                     → no task ID → integration root
```

Same spec file. Different branch. Different task linked. Completely automatic.

### 4.4 Explicit parent overrides branch

```yaml
---
type: adr
parent: arch-decisions    # explicit — overrides branch task ID
---

# ADR 001 — Queue Technology Choice
```

Branch is `feature/CU-182-checkout-retry` but this ADR goes to `arch-decisions` because frontmatter is explicit. Frontmatter always wins.

### 4.5 ADR to Confluence

```yaml
---
id: adr-001-queue-choice
type: adr
integration: confluence
parent: arch-decisions
---

# ADR 001 — Queue Technology Choice

## Context
We needed to choose a job queue...
```

ADR Template transformation applied. Published as a Confluence page under `arch-decisions`.

### 4.4 Minimal — uses org defaults

```yaml
---
type: wiki
---

# SLA Policy

This document describes our SLA...
```

Uses org default integration. Published at integration root. No transformation.

### 4.5 File without frontmatter — ignored

```markdown
# Draft Notes

Just some scratch notes...
```

No frontmatter. CLI skips this file silently. Nothing is published.

---

## 5. Resolution Logic

### 5.1 Full resolution chain

```
For each changed .md file:

1. Parse frontmatter
   → No frontmatter → skip silently
   → Has frontmatter, no type → skip with warning

2. Extract branch task ID
   → Get branch name from GITHUB_REF_NAME or git command
   → Apply project.branch_task_id_pattern regex
   → Store extracted task ID (e.g. CU-182) for parent resolution

3. Resolve integration
   → frontmatter.integration present → use it
   → absent → use org.default_integration
   → no default set → error with clear message

4. Resolve parent
   → frontmatter.parent present → resolve alias/ID/URL (explicit wins)
   → frontmatter.parent absent + branch task ID extracted → use task ID
   → frontmatter.parent absent + no branch task ID → use integration root

5. Resolve agent template
   → AGENT_TEMPLATES[type] → apply transformation
   → type has no template (e.g. wiki) → publish as-is

6. Resolve id
   → frontmatter.id present → use it
   → absent → use file path as stable key

7. Enqueue publish job
```

### 5.2 Agent template resolution

```typescript
const AGENT_TEMPLATES: Record<string, string | null> = {
  wiki:       null,                      // publish as-is
  task:       'task_template',
  adr:        'adr_template',
  rfc:        'rfc_template',
  api:        'api_reference_template',
  runbook:    'runbook_template',
  'data-model': 'data_model_template',
  security:   'security_review_template',
  release:    'release_notes_template',
  sprint:     'sprint_brief_template',
}
```

Default templates ship with every account. Users can customise per-type templates in Dashboard → Templates.

### 5.3 Integration resolution

```typescript
function resolveIntegration(
  frontmatter: Frontmatter,
  org: Org
): Integration {
  const type = frontmatter.integration ?? org.default_integration

  if (!type) {
    throw new PublishError(
      'no_integration',
      'No integration declared in frontmatter and no default integration set.',
      'Set a default integration in Dashboard → Settings → Default Integration'
    )
  }

  const integration = org.integrations.find(i => i.type === type)

  if (!integration) {
    throw new PublishError(
      'integration_not_connected',
      `Integration '${type}' is not connected to your account.`,
      `Connect ${type} in Dashboard → Integrations`
    )
  }

  return integration
}
```

### 5.4 Parent resolution

```typescript
async function resolveParent(
  parent: string | undefined,
  integration: Integration
): Promise<string | null> {
  if (!parent) {
    return null  // use integration root
  }

  // check if it's an alias
  const alias = await getAlias(parent, integration.org_id)
  if (alias) {
    return alias.native_id
  }

  // check if it's a URL — resolve to native ID
  if (parent.startsWith('https://')) {
    const nativeId = await resolveUrlToNativeId(parent, integration)
    await cacheResolvedParent(parent, nativeId)  // cache for future publishes
    return nativeId
  }

  // treat as native ID directly
  return parent
}
```

---

## 6. CLI Behaviour

### 6.1 Invocation

```bash
npx mdspec publish --project proj_xxx
```

Unchanged from current CLI. Same git diff detection. Same payload structure.

### 6.2 Change Detection

```bash
git diff --name-status $BEFORE $GITHUB_SHA
```

Returns added, modified, renamed, and deleted files. CLI filters to `.md` files only.

### 6.3 Branch Task ID Extraction

```typescript
function getCurrentBranch(): string {
  return (
    process.env.GITHUB_REF_NAME      ??   // GitHub Actions
    process.env.CI_COMMIT_BRANCH     ??   // GitLab CI
    process.env.CIRCLE_BRANCH        ??   // CircleCI
    process.env.BITBUCKET_BRANCH     ??   // Bitbucket
    process.env.GIT_BRANCH           ??   // Jenkins
    execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  )
}

function extractTaskId(
  branch: string,
  pattern: string | null
): string | null {
  if (!pattern) return null
  const match = branch.match(new RegExp(pattern))
  return match ? match[0] : null
}

// usage in CLI
const branch = getCurrentBranch()
const branchTaskId = extractTaskId(
  branch,
  project.branch_task_id_pattern   // fetched from API on startup
)
```

### 6.4 Processing Each File

```typescript
for (const filePath of changedMdFiles) {
  // read file
  const raw = fs.readFileSync(filePath, 'utf-8')

  // parse frontmatter
  const { data: frontmatter, content } = matter(raw)

  // no frontmatter — skip silently
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    results.push({ path: filePath, status: 'skipped', reason: 'no frontmatter' })
    continue
  }

  // no type — skip with warning
  if (!frontmatter.type) {
    results.push({ path: filePath, status: 'skipped', reason: 'no type declared' })
    continue
  }

  // build spec artifact
  specs.push({
    path: filePath,
    id: frontmatter.id ?? filePath,
    type: frontmatter.type,
    integration: frontmatter.integration ?? null,  // null = use org default
    parent: frontmatter.parent ?? null,
    content,
    hash: sha256(content),
    frontmatter
  })
}
```

### 6.5 Artifact Payload

```typescript
interface SpecArtifact {
  path: string
  previous_path?: string      // set on rename
  id: string                  // frontmatter.id or file path
  type: string                // wiki | task | adr | rfc | api | ...
  integration: string | null  // null = use org default
  parent: string | null       // alias, native ID, URL, or null
  content: string
  hash: string
  frontmatter: Record<string, unknown>
}

interface PublishPayload {
  project_id: string
  repo_name: string
  branch: string              // branch name for task ID extraction
  commit_sha: string
  commit_timestamp: number
  specs: SpecArtifact[]
}
```

### 6.6 CLI Output

```
✓ Published  docs/specs/checkout-retry.md → ClickUp (task) [CU-182 from branch]
✓ Published  docs/specs/auth-flow.md → Notion (wiki)
✓ Published  docs/adrs/adr-001.md → Confluence (adr) [parent: arch-decisions]
✗ Failed     docs/specs/sla.md → Notion (permission denied)
— Skipped    docs/scratch/notes.md (no frontmatter)
— Skipped    docs/specs/draft.md (no type declared)
— Skipped    docs/specs/old.md (deleted from repo)
```

### 6.7 Rename Handling

```bash
git diff --name-status returns:
R090    docs/specs/auth.md    docs/specs/authentication.md
```

CLI sets `previous_path` in the artifact. Server finds the existing ledger entry by `previous_path`, updates it to the new path, updates the page title in the target tool in-place. No orphaned pages.

### 6.8 Deleted Files

Files appearing as deleted in git diff are skipped. Published pages remain in target tools. Team cleans up manually. This is intentional — mdspec never deletes content from target tools.

---

## 7. Frontmatter Migration Helper

For teams with existing markdown files that need frontmatter added:

```bash
npx mdspec add-frontmatter --dir docs/specs --type wiki --integration notion
```

Walks the directory, adds default frontmatter to every `.md` file that doesn't already have it:

```yaml
---
type: wiki
integration: notion
---
```

Prints a summary:

```
Added frontmatter to 23 files
Skipped 4 files (already have frontmatter)
Skipped 2 files (non-markdown)

Review changes: git diff
Commit when ready: git add -A && git commit -m "add mdspec frontmatter"
```

Idempotent — safe to run multiple times. Never overwrites existing frontmatter.

---

## 8. Server Behaviour

### 8.1 Publish Route

```typescript
// app/api/publish/route.ts

export async function POST(req: Request) {
  const payload: PublishPayload = await req.json()

  // validate MDSPEC_TOKEN
  const project = await validateToken(payload.project_id, req)
  if (!project) {
    return Response.json({ error: 'Invalid token' }, { status: 401 })
  }

  // validate repo matches registered repo
  if (project.registered_repo &&
      payload.repo_name !== project.registered_repo) {
    return Response.json({
      error: 'repo_mismatch',
      registered: project.registered_repo,
      received: payload.repo_name
    }, { status: 403 })
  }

  // register repo on first publish
  if (!project.registered_repo) {
    await supabase
      .from('projects')
      .update({ registered_repo: payload.repo_name })
      .eq('id', project.id)
  }

  // fetch org integrations and default integration
  const org = await getOrgWithIntegrations(project.org_id)

  // extract task ID from branch name
  const branchTaskId = project.branch_task_id_pattern
    ? extractTaskId(payload.branch, project.branch_task_id_pattern)
    : null

  // process each spec
  for (const spec of payload.specs) {
    // write to ledger
    await upsertSpec(spec, project.id, payload.commit_sha)

    // resolve integration
    const integration = resolveIntegration(spec, org)

    // resolve parent — frontmatter wins, then branch task ID, then root
    const parentId = await resolveParent(
      spec.parent,        // frontmatter.parent (explicit, wins)
      branchTaskId,       // extracted from branch name (automatic)
      integration
    )

    // resolve agent template
    const agentTemplate = AGENT_TEMPLATES[spec.type] ?? null

    // enqueue publish job
    await qstash.publishJSON({
      url: `${APP_URL}/api/worker/process`,
      body: {
        spec_id: spec.id,
        spec_path: spec.path,
        content: spec.content,
        type: spec.type,
        integration_id: integration.id,
        parent_id: parentId,
        agent_template: agentTemplate,
        commit_sha: payload.commit_sha,
        project_id: project.id
      },
      retries: 5,
      backoff: 'exponential',
      flowControl: {
        key: integration.type,
        rate: RATE_LIMITS[integration.type].rate,
        period: RATE_LIMITS[integration.type].period,
        parallelism: RATE_LIMITS[integration.type].parallelism
      }
    })
  }

  return Response.json({ status: 'queued', count: payload.specs.length }, { status: 202 })
}
```

### 8.2 Rate Limits Per Integration

```typescript
const RATE_LIMITS = {
  notion:     { rate: 3,   period: '1s', parallelism: 5  },
  confluence: { rate: 2,   period: '1s', parallelism: 5  },
  clickup:    { rate: 100, period: '1m', parallelism: 10 },
  s3:         { rate: 100, period: '1s', parallelism: 20 },
}
```

Enforced by QStash flow control. Not in the CLI. Not in the worker.

---

## 9. Database Schema

### 9.1 Simplified `specs` table

```sql
CREATE TABLE specs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id),
  path            text not null,
  spec_id         text not null,          -- frontmatter.id or path
  type            text not null,          -- wiki | task | adr | rfc | ...
  commit_sha      text not null,
  content_hash    text not null,          -- for deduplication
  frontmatter     jsonb,                  -- full frontmatter stored
  deleted_from_repo boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  unique(project_id, spec_id)
);
```

### 9.2 `spec_publish_targets` table

```sql
CREATE TABLE spec_publish_targets (
  id              uuid primary key default gen_random_uuid(),
  spec_id         uuid references specs(id),
  integration_id  uuid references integrations(id),
  external_id     text,                   -- native page/task ID in target tool
  external_url    text,                   -- direct link to published page
  status          text not null,          -- queued | published | failed
  retry_count     int default 0,
  last_error      text,
  published_at    timestamptz
);
```

### 9.3 `projects` table — minimal additions

```sql
ALTER TABLE projects
ADD COLUMN default_integration text;         -- 'notion' | 'clickup' | 'confluence' | 's3'

ALTER TABLE projects
ADD COLUMN branch_task_id_pattern text;      -- regex e.g. '[A-Z]+-\d+', null = disabled
```

No `sync_source` column needed unless GitHub App is added later.

---

## 10. Dashboard — Simplified

Frontmatter routing removes the need for the Map Page entirely. The Dashboard simplifies significantly.

### 10.1 Sidebar

```
Activity          ← what synced, what failed, live via Realtime
Integrations      ← connect Notion, ClickUp, Confluence, S3
Templates         ← customise per-type agent templates
Settings
  Project         ← project name, registered repo, default integration
  CI Token        ← generate and manage MDSPEC_TOKEN
  Members         ← invite team members
  Billing         ← subscription management
```

No Map Page. No alias management (aliases still work but are managed inline in Integrations). No folder config.

### 10.2 Activity Feed

```
✓ checkout-retry.md  → ClickUp   task  2m ago  CU-182 [branch]  [ Open ↗ ]
✓ auth-flow.md       → Notion    wiki  2m ago                   [ Open ↗ ]
✓ adr-001.md         → Confluence adr  2m ago  arch-decisions   [ Open ↗ ]
✗ sla-policy.md      → Notion    wiki  5m ago  Failed ⚠
— draft-notes.md                       5m ago  Skipped (no frontmatter)
```

Type visible per entry. Direct link to published page. Live via Supabase Realtime.

### 10.3 Default Integration Setting

```
Dashboard → Settings → Project

Default Integration
When a spec has no integration declared in frontmatter,
it publishes here.

[ Notion ▼ ]    [ Save ]
```

### 10.4 Branch Task ID Pattern

```
Dashboard → Settings → Project

Branch Task ID Pattern
Automatically extract task IDs from branch names and
link specs to tasks without manual parent configuration.

Pattern (regex):
[ [A-Z]+-\d+                              ]

Test your pattern:
Branch name: [ feature/CU-182-checkout   ]
Result:      ✓ Extracted: CU-182

Quick presets:
[ ClickUp: CU-\d+ ]  [ Jira: [A-Z]+-\d+ ]  [ Linear: [A-Z]+-\d+ ]  [ Clear ]

[ Save ]
```

Stored as `projects.branch_task_id_pattern`. Null = feature disabled.

One dropdown. That's the entire default integration config.

### 10.4 Templates

```
Dashboard → Templates

Type        Template              Actions
────────────────────────────────────────────────
wiki        None (publish as-is)  [ Set template ]
task        Task Template         [ Edit ] [ Reset ]
adr         ADR Template          [ Edit ] [ Reset ]
rfc         RFC Template          [ Edit ] [ Reset ]
api         API Reference         [ Edit ] [ Reset ]
runbook     Runbook Template      [ Edit ] [ Reset ]
data-model  Data Model Template   [ Edit ] [ Reset ]
security    Security Review       [ Edit ] [ Reset ]
release     Release Notes         [ Edit ] [ Reset ]
sprint      Sprint Brief          [ Edit ] [ Reset ]
```

Click Edit → free-form template editor with pool item insertion. Same template editor as before. Just accessed per-type instead of per-folder.

---

## 11. Org Default Integration

The org (or project) can set a default integration. Any spec without an `integration` field in frontmatter uses this default.

```
Dashboard → Settings → Project → Default Integration

[ ClickUp ▼ ]
```

Stored on the project:

```sql
projects.default_integration = 'clickup'
```

Resolution:

```
spec frontmatter.integration → use it
spec has no integration field → use project.default_integration
project has no default → error with clear message
```

---

## 12. Onboarding

### 12.1 Steps

**Step 1 — Connect integration**

```
Connect your documentation tool

[ Notion ]  [ ClickUp ]  [ Confluence ]  [ S3 ]
```

OAuth or token flow. Credentials stored in Supabase Vault.

**Step 2 — Set default integration**

```
Which tool should specs go to by default?

[ Notion ▼ ]    [ Continue ]

You can override this per-file using the integration
field in frontmatter.
```

**Step 2b — Set branch pattern (optional)**

```
Do your branch names contain task IDs?

e.g. feature/CU-182-checkout-retry
     fix/JRA-4421-auth-bug

If yes, mdspec will link specs to tasks automatically.

Branch pattern: [ [A-Z]+-\d+  ]   ← pre-filled with common pattern

[ Use this pattern ]    [ Skip ]
```

**Step 3 — Get CI token**

```
Your CI token: mds_proj_xxx_...    [ Copy ]

Add to GitHub secrets:
  Name:  MDSPEC_TOKEN
  → github.com/your-repo/settings/secrets/actions/new

Add to GitHub Actions:
[ Copy workflow snippet ]
```

**Step 4 — Add frontmatter to a spec**

```
Add this to any markdown file you want to sync:

---
type: wiki
---

That's it. Push and it will appear in Notion.

Want to try it now? Add frontmatter to a file
and push to main.

[ I'll do it now ]    [ Skip for now ]
```

**Step 5 — First publish confirmation**

```
✓ First publish received

auth-flow.md synced to Notion
[ Open in Notion ↗ ]

mdspec is ready. Every markdown file with frontmatter
will sync automatically on every push.
```

Total steps: 5. Time: under 5 minutes.

---

## 13. GitHub Actions Snippet

```yaml
name: mdspec sync
on:
  push:
    branches: [main]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: npx mdspec publish --project <project-id>
        env:
          MDSPEC_TOKEN: ${{ secrets.MDSPEC_TOKEN }}
          GITHUB_EVENT_BEFORE: ${{ github.event.before }}
```

One secret. One run step. Unchanged from before.

---

## 14. What This Replaces

| Removed | Replaced by |
|---|---|
| `.mdspecmap` file | Frontmatter in each file |
| Folder detection | `type` field in frontmatter |
| Inheritance resolution | No inheritance — each file is explicit |
| Alias management UI | Aliases still work as `parent` values |
| Map Page | Templates page (per-type only) |
| Skip patterns | Absence of frontmatter = skip |
| `sync_all_on_first_run` | Files without frontmatter never sync |
| Folder browser | Not needed |
| `sub_folders` config | Not needed |
| Group declarations | Not needed |
| Per-folder agent assignment | Per-type agent templates |

---

## 15. What Stays the Same

```
→ Git diff change detection
→ CLI invocation (npx mdspec publish)
→ MDSPEC_TOKEN authentication
→ QStash job queue
→ Worker and adapters (Notion, ClickUp, Confluence, S3)
→ Agent template system (9 templates ship by default)
→ Supabase ledger
→ Supabase Realtime activity feed
→ Billing (Paddle)
→ Org and project management
→ Member invites and roles
→ Integration health monitoring
→ Retry and backoff logic
→ Rename detection (previous_path)
→ Deleted file handling (skip, page stays)
→ GitHub App (optional, works with frontmatter routing)
```

---

## 16. Migration from .mdspecmap

For existing projects using `.mdspecmap`:

```bash
npx mdspec migrate --from-mapfile
```

Reads the project's `.mdspecmap`, generates frontmatter for each mapped file based on its folder mapping, writes frontmatter to each file, and removes `.mdspecmap`.

```
Reading .mdspecmap...
Found 3 folder mappings:
  docs/specs/ → Notion (wiki)
  docs/tasks/ → ClickUp (task)
  docs/adrs/  → Confluence (adr)

Adding frontmatter to 23 files...
  ✓ docs/specs/checkout.md
  ✓ docs/specs/auth.md
  ✓ docs/tasks/sprint-1.md
  ... (20 more)

Removing .mdspecmap

Review: git diff
Commit: git add -A && git commit -m "migrate to frontmatter routing"
```

---

## 17. The Pitch

```
Name your branch feature/CU-182-my-feature.
Add two lines to your spec:

---
type: task
---

Push.
Your spec appears in ClickUp task CU-182.
Automatically. Every time.
```

Or even simpler — just the branch name does the work:

```
Branch: feature/CU-182-checkout-retry

---
type: task
---

# Checkout Retry Policy
...
```

mdspec reads the branch, finds CU-182, links the spec.
No parent field. No manual config. Completely automatic.

---

*End of Frontmatter Routing Specification — mdspec*