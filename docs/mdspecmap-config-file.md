# `.mdspecmap` — Repo-Local Configuration File
**mdspec V1 — Finalized Specification**

---

## 1. Overview

`.mdspecmap` is a YAML file committed to the repo root. It is the **sole source of truth** for folder-to-integration mappings and skip patterns. There is no fallback to UI-stored config — projects without `.mdspecmap` do not publish.

The UI is a configuration assistant only. It manages integration aliases (the human-readable names referenced in the file) and generates a downloadable `.mdspecmap` to get teams started. After that, developers work directly in the file.

---

## 2. File Format

```yaml
# .mdspecmap
version: 1

# Controls behaviour on first publish (when no specs exist in ledger yet)
# false = start empty, only publish files changed in subsequent commits (default)
# true  = publish all files found in spec_dirs on first run
sync_all_on_first_run: false

mappings:
  # Folder → integration mapping using alias name
  - folder: docs/specs
    integration: notion
    parent: eng-docs           # alias defined in Dashboard → Integrations → Aliases
    skip:
      - DRAFT_*.md
      - _*.md

  - folder: docs/tasks
    integration: clickup
    parent: dev-tasks
    skip:
      - README.md

  - folder: docs/api
    integration: confluence
    parent: payments-wiki

  # Multiple integrations for the same folder — fully supported
  - folder: docs/architecture
    integration: notion
    parent: arch-docs

  - folder: docs/architecture
    integration: confluence
    parent: arch-confluence

  # Project-wide skip patterns — no integration, just exclusions
  - folder: /
    skip:
      - "**/scratch/**"
      - "**/_*.md"
      - CHANGELOG.md
```

### Field Reference

| Field | Required | Description |
|---|---|---|
| `version` | Yes | File format version. Currently `1`. |
| `sync_all_on_first_run` | No | Default `false`. Set `true` to publish all specs on first run. |
| `mappings[].folder` | Yes | Relative folder path from repo root. `/` means project root. |
| `mappings[].integration` | No | Integration type. Omit for skip-only entries. |
| `mappings[].target` | No | `document` (default) or `task`. Maps to the integration's native concept. |
| `mappings[].parent` | No | Alias name defined in Dashboard → Integrations → Aliases. |
| `mappings[].skip` | No | Glob patterns matched against filename and full relative path. |

---

## 3. Aliases

Aliases are the bridge between the file and the integration. They are human-readable names defined once in the UI that map to a native container ID in the target tool (Notion page, Confluence space, ClickUp doc folder).

### 3.1 Why Aliases

The `.mdspecmap` file is committed to the repo. It must be safe to commit to public repos. Aliases contain no sensitive information — just a name the team recognises. The native ID resolution happens server-side at publish time, never in the file.

```yaml
parent: eng-docs          # safe to commit — means nothing outside the org
# server resolves → notion_page_id: abc123def456
```

### 3.2 Defining Aliases

Aliases are defined in Dashboard → Integrations → [Integration] → Aliases.

```
Dashboard → Integrations → Notion → Aliases

eng-docs          → Engineering page        [ Edit ] [ Delete ]
payments-docs     → Payments & Billing      [ Edit ] [ Delete ]
arch-docs         → Architecture wiki       [ Edit ] [ Delete ]

[ + New Alias ]
```

When creating an alias:
1. Enter a name (lowercase, hyphens allowed, unique per org)
2. Browse or search the connected integration for the target container
3. Save — alias is immediately available for use in `.mdspecmap`

### 3.3 Alias Resolution at Publish Time

The server resolves `alias name → integration_id + native_id` for the org at publish time using the `aliases` table. The resolved native ID is used to create/update pages in the correct location.

### 3.4 Hard Block on Unknown Alias

If `.mdspecmap` references an alias that doesn't exist in the DB, the entire publish is blocked — no specs are published. The developer sees the error immediately in CI output.

```
✗ Rejected   unknown alias 'eng-doc' in .mdspecmap
             Did you mean 'eng-docs'?
             Define aliases in Dashboard → Integrations → Aliases
```

No partial publishes. Fix the alias, push again.

### 3.5 Aliases Database Schema

```sql
id              uuid primary key default gen_random_uuid()
org_id          uuid references organizations(id)
integration_id  uuid references integrations(id)
name            text not null        -- referenced in .mdspecmap
native_id       text not null        -- resolved container ID in target tool
native_url      text                 -- stored for UI display only
display_name    text                 -- human label shown in UI
created_by      uuid references auth.users(id)
created_at      timestamptz default now()
updated_at      timestamptz default now()

unique(org_id, name)                 -- alias names unique per org
```

---

## 4. Folder Structure Mirroring

Once the parent alias is resolved, the repo's subfolder structure beneath the mapped folder is mirrored automatically in the target tool.

```
Repo:                              Notion (parent: eng-docs → Engineering):
docs/api/                       →  Engineering /
  v1/auth.md                    →    v1 / auth
  v1/tokens.md                  →    v1 / tokens
  v2/auth.md                    →    v2 / auth
```

Sub-levels are created if they don't exist. Existing containers are never duplicated.

### 4.1 Target-Specific Container Types

| Integration | Document container | Task container |
|---|---|---|
| Notion | Page | Page |
| Confluence | Page (parent/child) | Page |
| ClickUp | Doc folder | List |

---

## 5. Skip Patterns

Skip patterns are glob patterns matched against both the filename and the full relative path from repo root.

```yaml
skip:
  - DRAFT_*.md          # matches filename
  - _*.md               # matches filename
  - "**/scratch/**"     # matches path
  - docs/specs/old/*    # matches path prefix
```

Patterns defined on a specific folder apply only to that folder. Patterns defined on `/` apply project-wide.

Project-wide patterns are evaluated first, then folder-level patterns. A file excluded by any pattern is skipped.

---

## 6. CLI Behaviour

### 6.1 Reading the File

On every publish run the CLI:
1. Reads `.mdspecmap` from repo root
2. Validates the file structure — exits with error if invalid YAML or missing required fields
3. Applies skip patterns locally before building the spec list
4. Sends the parsed config in the publish payload alongside specs

If `.mdspecmap` is absent the CLI exits with a clear error:

```
✗ Error   .mdspecmap not found at repo root
          Run `npx mdspec init` to generate one, or visit your project
          in the mdspec Dashboard to download a starter file.
```

### 6.2 Change Detection

The CLI uses `git diff --name-status` (not `--name-only`) to detect file status:

```bash
git diff --name-status $BEFORE $GITHUB_SHA
```

Output format:
```
M       docs/specs/checkout-retry.md      # modified
A       docs/specs/new-feature.md         # added
D       docs/specs/old-spec.md            # deleted
R090    docs/specs/auth.md docs/specs/authentication.md  # renamed
```

| Status | Action |
|---|---|
| `M` modified | Read and publish updated content |
| `A` added | Read and publish as new spec |
| `D` deleted | Skip silently — published page stays in target tool |
| `R` renamed | Publish with `previous_path` set — server updates page in-place |

### 6.3 First Run Handling

When `BEFORE` is all zeros (first push to branch):

```typescript
if (!before || before === '0000000000000000000000000000000000000000') {
  if (config.sync_all_on_first_run === true) {
    // publish all spec files in configured directories
    return getAllSpecFiles(specDirs)
  } else {
    // default: start empty, nothing to publish on first run
    console.log('— First run, sync_all_on_first_run is false. No specs published.')
    return []
  }
}
```

### 6.4 Artifact Payload

```typescript
interface PublishPayload {
  project_id: string
  repo_name: string
  branch: string
  commit_sha: string
  commit_timestamp: number      // unix timestamp from git log -1 --format=%ct
  specs: SpecArtifact[]
  config: MdspecMapConfig       // parsed .mdspecmap — always required
}

interface SpecArtifact {
  path: string
  previous_path?: string        // set on rename, undefined otherwise
  hash: string
  content: string
  frontmatter: object
}
```

### 6.5 CLI Output

```
✓ Published  docs/specs/checkout-retry.md → Notion (eng-docs)
✓ Published  docs/specs/auth.md → Confluence (payments-wiki)  [renamed from docs/specs/authentication.md]
✗ Failed     docs/specs/sla.md → Notion (unknown alias 'eng-doc')
— Skipped    docs/specs/DRAFT_payments.md (skip pattern: DRAFT_*.md)
— Skipped    docs/specs/old-spec.md (deleted from repo)
```

---

## 7. Server Behaviour

### 7.1 Config is Payload-First

The server uses the config from the publish payload directly for routing that batch of specs. It does not read folder mappings from the DB for routing. The DB is updated after routing, not before.

```
Publish arrives
  └─ Validate MDSPEC_TOKEN
  └─ Validate repo_name matches registered_repo
  └─ Snapshot commit_timestamp from payload
  └─ Resolve aliases → native IDs for this org
  └─ Route specs using payload config (not DB)
  └─ Enqueue BullMQ / QStash jobs with resolved routing
  └─ Return 202 Accepted immediately
  └─ After processing: atomically update DB config if this commit is newest
```

### 7.2 Queue Ordering — First Commit Wins

Jobs are processed in enqueue order. The first publish to arrive is processed first. This is the natural behaviour of the queue — no special handling needed.

Config reconciliation to the DB uses an atomic timestamp check to ensure the DB always reflects the newest commit's config regardless of processing order:

```sql
-- Postgres function — atomic, no race condition possible
UPDATE projects
SET
  last_config_commit_sha = $new_sha,
  last_config_commit_timestamp = $new_timestamp,
  last_config_reconciled_at = now()
WHERE
  id = $project_id
  AND (
    last_config_commit_timestamp IS NULL
    OR last_config_commit_timestamp < $new_timestamp
  )
RETURNING updated
```

If the update returns `updated = false`, a newer commit already reconciled config — this commit's config update is skipped. Specs still published normally.

### 7.3 Rename Handling

When a spec arrives with `previous_path` set:
1. Find the existing ledger entry by `previous_path`
2. Update `path` to the new path
3. Update the page title in the target tool in-place
4. Preserve the `external_page_id` — no new page created, no orphan

### 7.4 Deleted Files

When a spec is deleted from the repo it is not included in the payload. The server takes no action. The published page remains in the target tool. The ledger entry remains. The team manages cleanup in the target tool manually.

This is a feature — teams can remove specs from the repo when they're no longer actively maintained without losing their published documentation.

### 7.5 Alias Validation

Before enqueuing any jobs the server validates all aliases in the payload config:

```typescript
const unresolvedAliases = await validateAliases(config.mappings, org_id)

if (unresolvedAliases.length > 0) {
  // return 422 with details — do not enqueue any jobs
  return Response.json({
    error: 'unresolved_aliases',
    aliases: unresolvedAliases.map(a => ({
      alias: a.name,
      folder: a.folder,
      suggestion: findClosestAlias(a.name, org_id)
    }))
  }, { status: 422 })
}
```

Hard block — no partial publishes when aliases are invalid.

---

## 8. UI Role — Configuration Assistant

The UI has no awareness of what's committed to the repo. It never reads, syncs, diffs, or locks against the file. Its role is:

1. **Manage integration connections** — OAuth flows, credentials, tokens
2. **Manage aliases** — create, edit, delete alias→native ID mappings
3. **Generate starter `.mdspecmap`** — visual form that produces a downloadable file
4. **Show publish activity** — Dashboard, Activity feed, spec status

### 8.1 Generating a Starter File

Dashboard → Project → Map → Download .mdspecmap

The UI presents a form:
- Folder paths (user types them)
- Integration per folder (dropdown of connected integrations)
- Parent alias per folder (dropdown of defined aliases for that integration)
- Skip patterns (text input)
- `sync_all_on_first_run` toggle (default: off)

On download, generates a valid `.mdspecmap` and downloads it. The user commits it to the repo.

### 8.2 `mdspec init` CLI Command

Alternative to the UI for generating a starter file:

```bash
npx mdspec init --project proj_xxx
```

Fetches connected integrations and defined aliases from the API, presents an interactive prompt, writes `.mdspecmap` to the repo root.

---

## 9. Validation

### 9.1 CLI Validation at Publish Time

The CLI validates `.mdspecmap` before sending the payload:

```
✗ Error   .mdspecmap validation failed:
          - mappings[0].folder: required field missing
          - mappings[1].integration: unknown value 'notiom' (did you mean 'notion'?)
          - version: must be 1
```

Publish is blocked until the file is valid.

### 9.2 Valid Integration Values

```
notion | confluence | clickup
```

### 9.3 Valid Target Values

```
document (default) | task
```

---

## 10. Multiple Integrations per Folder

A folder can map to multiple integrations simultaneously. Each mapping is an independent entry:

```yaml
- folder: docs/architecture
  integration: notion
  parent: arch-docs

- folder: docs/architecture
  integration: confluence
  parent: arch-confluence
```

Each spec in `docs/architecture/` is published to both Notion and Confluence independently. Failure on one does not block the other.

---

## 11. DB Schema Changes

**`aliases` table** — new:
```sql
id              uuid primary key default gen_random_uuid()
org_id          uuid references organizations(id)
integration_id  uuid references integrations(id)
name            text not null
native_id       text not null
native_url      text
display_name    text
created_by      uuid references auth.users(id)
created_at      timestamptz default now()
updated_at      timestamptz default now()
unique(org_id, name)
```

**`projects` table** — new columns:
```sql
last_config_commit_sha          text
last_config_commit_timestamp    bigint    -- unix timestamp
last_config_reconciled_at       timestamptz
```

**`folder_mappings` table** — retained for UI display and audit only. No longer load-bearing for routing. Updated by server after each successful config reconciliation.

---

## 12. What Does Not Live in `.mdspecmap`

These always live in the UI only and are never referenced in the file:

- Integration OAuth credentials and tokens
- Billing and subscription management
- Org and project creation
- Member invites and roles
- Agent template definitions

The file only references already-connected integrations by alias. It cannot connect, configure, or modify integration auth.

---

## 13. Out of Scope for V1

- S3 integration target
- Backward compatibility with projects without `.mdspecmap`
- UI-based config fallback
- Auto-detection of folder structure from repo

---

*End of `.mdspecmap` Specification — mdspec V1*