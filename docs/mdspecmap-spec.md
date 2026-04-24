# `.mdspecmap` — Configuration File Specification
**mdspec — Distributed Model**

---

## 1. Overview

`.mdspecmap` is a YAML file that can be placed in **any folder** in the repo. Its location defines its scope: the folder it lives in, and all subfolders by default, are synced according to the mappings declared inside it.

There is no single root config file. Every `.mdspecmap` is self-contained and governs the subtree it sits in. A file at the repo root behaves identically to one in any other folder — it maps the root folder and its subfolders, nothing more.

Teams place `.mdspecmap` files only where syncing is needed. Folders with no `.mdspecmap` anywhere in their ancestor chain are silently excluded from publishing.

---

## 2. Scope Rules

### 2.1 Location = Scope

The folder containing the `.mdspecmap` is implicitly its scope. No folder path needs to be declared inside the file — the file's own position in the repo defines what it governs.

```
repo/
├── docs/
│   ├── api/
│   │   ├── .mdspecmap      ← governs docs/api/ and all subfolders
│   │   ├── v1/auth.md
│   │   └── v2/auth.md
│   └── tasks/
│       ├── .mdspecmap      ← governs docs/tasks/ and all subfolders
│       └── sprint-24.md
└── .mdspecmap              ← governs repo root and all subfolders
```

### 2.2 Nearest Ancestor Wins

A file is governed by the nearest `.mdspecmap` in its ancestor chain. If `docs/api/` has its own `.mdspecmap`, files inside it are not governed by any `.mdspecmap` higher up.

```
docs/
├── .mdspecmap          ← governs docs/general.md
├── general.md
└── api/
    ├── .mdspecmap      ← governs docs/api/reference.md
    └── reference.md    ← governed here only
```

`docs/api/reference.md` is governed by `docs/api/.mdspecmap`. The `docs/.mdspecmap` is irrelevant for anything inside `docs/api/`.

### 2.3 No `.mdspecmap` in Ancestry

If a file has no `.mdspecmap` in any ancestor folder, it is not published. No error is raised — it is silently excluded.

---

## 3. File Format

```yaml
# docs/api/.mdspecmap
version: 1

sync_all_on_first_run: false

sub_folders: true           # default — sync this folder and all subfolders

mappings:
  - integration: notion
    parent: api-docs
    skip:
      - DRAFT_*.md
      - _*.md

  - integration: confluence
    parent: api-confluence

specs:
  auth.md:
    title: Authentication Spec
  DRAFT_sso.md:
    title: SSO Draft
    agent: spec_template
  v1/tokens.md:
    id: 86exam62a
    title: Token Lifecycle
```

No `folder:` key is written in `.mdspecmap` files. The CLI sets it from the file's location. Users who include a `folder:` key in any mapping will see a validation error at publish time.

---

## 4. Full Field Reference

| Field | Required | Default | Description |
|---|---|---|---|
| `version` | Yes | — | File format version. Currently `1`. |
| `sync_all_on_first_run` | No | `false` | Publish all in-scope files on the first run for this scope. |
| `sub_folders` | No | `true` | `false` restricts scope to files directly in this folder only — no recursion. |
| `mappings` | Yes | — | Array of integration routing entries. |
| `mappings[].integration` | No | — | Integration type. Omit to create a skip-only entry. |
| `mappings[].target` | No | `document` | `document` or `task`. |
| `mappings[].parent` | No | — | Alias name defined in Dashboard → Integrations → Aliases. |
| `mappings[].list_id` | No | — | ClickUp list ID for `task` target mode. Format: `id:<id>`. |
| `mappings[].space_id` | No | — | ClickUp space/folder ID for `task` target mode. Format: `id:folder:<id>`. |
| `mappings[].skip` | No | — | Glob patterns matched against filename and path relative to this file's location. |
| `mappings[].depth` | No | — | Max folder depth to sync below this scope. Rarely set manually — use `sub_folders: false` instead. |
| `specs` | No | — | Per-file overrides. Keyed by path relative to this `.mdspecmap` file's location. |
| `specs[path].title` | No | — | Override the published title for this spec. Takes precedence over the H1 heading. |
| `specs[path].id` | No | — | Native task/doc ID in the target tool. Used to adopt a pre-existing item on first publish. After adoption the ID is stored in the ledger and `id` has no further effect. |
| `specs[path].agent` | No | — | Agent template to run on this spec before publishing. |

### Valid `integration` values

```
notion | confluence | clickup
```

### Valid `target` values

```
document (default) | task
```

---

## 5. `specs:` Section

The `specs:` block provides per-file overrides. Keys are paths **relative to the `.mdspecmap` file's location**.

```yaml
# src/hooks/.mdspecmap
version: 1
mappings:
  - integration: clickup
    target: task
    list_id: id:901817533430

specs:
  INFO7.md:
    id: 86exam62a        # adopt this existing ClickUp task on first publish
    title: History
  INFO8.md:
    title: Event Log
  sub/deeper.md:         # works for nested paths too
    id: 86exam63b
```

After the CLI resolves this file's scope (`src/hooks`), all keys are normalized to repo-relative paths before being sent in the payload:

```
src/hooks/INFO7.md  → id_ref: 86exam62a, title: History
src/hooks/INFO8.md  → title: Event Log
src/hooks/sub/deeper.md → id_ref: 86exam63b
```

The server uses `id_ref` to look up the native task/doc ID and update it instead of creating a new one.

### 5.1 `id` adoption lifecycle

1. First publish: `id` is present in `.mdspecmap` → server resolves the native ID and stores it in the `spec_publish_targets` ledger.
2. All subsequent publishes: ledger `external_page_id` is used directly. The `id` field in `.mdspecmap` is ignored.
3. If the target item is deleted in the tool: the stored ID goes stale. The server detects this, clears the ledger entry, and re-resolves from `id` if still present. If not found, a new item is created.

---

## 6. `sub_folders` — Restricting Recursion

By default a `.mdspecmap` syncs its folder and all subfolders. Set `sub_folders: false` to restrict it to files directly in the folder only.

```yaml
# marketing/copy/.mdspecmap
version: 1

sub_folders: false

mappings:
  - integration: notion
    parent: marketing-copy
```

Files in `marketing/copy/archive/` or any other subfolder are ignored by this file.

| `sub_folders` | Behaviour |
|---|---|
| `true` (default) | Sync this folder and all subfolders recursively. |
| `false` | Sync only files directly in this folder. |

The CLI converts `sub_folders: false` to `depth: 1` before building the payload. The `sub_folders` key is never sent to the server.

---

## 7. Skip Patterns

Patterns in `skip:` are matched against the filename and the path relative to the `.mdspecmap` file's location.

```yaml
mappings:
  - integration: notion
    parent: eng-docs
    skip:
      - DRAFT_*.md          # filename match
      - _*.md               # filename match
      - "**/scratch/**"     # relative path match
      - v1/*                # relative path prefix
```

Skipped files are logged by the CLI:

```
— Skipped    docs/api/DRAFT_auth.md (skip pattern: DRAFT_*.md)
— Skipped    src/utils/helper.md (no .mdspecmap in scope)
```

To prevent a subtree that has its own `.mdspecmap` from also matching a parent map, add it to the parent's skip list:

```yaml
# docs/.mdspecmap
mappings:
  - integration: notion
    parent: general-docs
    skip:
      - api/**          # docs/api/ has its own .mdspecmap
```

---

## 8. Multiple Integrations per Scope

A folder can map to multiple integrations simultaneously. Each mapping is independent:

```yaml
# docs/architecture/.mdspecmap
version: 1

mappings:
  - integration: notion
    parent: arch-docs

  - integration: confluence
    parent: arch-confluence
```

Every in-scope file is published to both. Failure on one does not block the other.

---

## 9. Aliases

Aliases are the bridge between `.mdspecmap` and integrations. They are human-readable names defined in the Dashboard that map to a native container ID in the target tool (Notion page, Confluence space, ClickUp doc folder).

```yaml
parent: eng-docs          # safe to commit — resolves server-side
# server resolves → notion_page_id: abc123def456
```

Aliases contain no credentials. They are org-scoped and can be safely committed to public repos.

### 9.1 Defining Aliases

Dashboard → Integrations → [Integration] → Aliases

```
eng-docs          → Engineering page        [ Edit ] [ Delete ]
api-docs          → API Reference           [ Edit ] [ Delete ]
arch-confluence   → Architecture Space      [ Edit ] [ Delete ]
```

### 9.2 Hard Block on Unknown Alias

If a `.mdspecmap` references an alias that doesn't exist for the org, the entire publish is blocked:

```
✗ Rejected   unknown alias 'eng-doc' in docs/api/.mdspecmap
             Did you mean 'eng-docs'?
             Define aliases in Dashboard → Integrations → Aliases
```

No partial publishes. Fix the alias and push again.

### 9.3 Directly referencing a native ID

For integrations without aliases, use the `id:` prefix to reference a native container ID directly:

```yaml
parent: id:abc123def456   # ClickUp Doc ID, Notion page ID, etc.
```

---

## 10. CLI Behaviour

### 10.1 Discovery

On every publish run the CLI:

1. Walks the full repo tree starting from the working directory.
2. Collects all `.mdspecmap` files found at any depth.
3. Skips `node_modules` and hidden directories (dot-prefixed).
4. For each collected file, records its absolute path and `scopeDir` (repo-relative folder of the file).

If no `.mdspecmap` files are found anywhere in the repo, the CLI exits with:

```
✗ Error   No .mdspecmap files found in the repository.
          Place a .mdspecmap file in any folder you want to sync.
          Run `npx mdspec init` to generate a starter file.
```

### 10.2 Config Resolution

For each discovered `.mdspecmap`:

1. **Read and validate** the raw file.
   - Error if `folder:` is present in any mapping — this key is not supported and indicates an outdated config.
   - Error on unknown `integration` values, invalid `version`, invalid `target` values.

2. **Resolve paths** relative to `scopeDir`:
   - Every mapping's `folder` is set to `scopeDir` (the file's own location).
   - `specs` keys are prefixed with `scopeDir`, converting scope-relative paths to repo-relative paths.
   - `sub_folders: false` is converted to `depth: 1` on all mappings without an explicit `depth`.
   - `sub_folders` is dropped from the resolved config.

3. **Merge** all resolved configs into a single config:
   - `mappings` are combined from all files.
   - `specs` entries are merged — later files win on key collision (deeper `.mdspecmap` wins over shallower).
   - `sync_all_on_first_run: true` if any file sets it.

The merged config is sent in the publish payload as `config`.

### 10.3 Spec Collection

The CLI determines which spec files to include using the merged config's mapping folders as scan roots. For each changed `.md` file:

1. Find its nearest `.mdspecmap` ancestor (nearest-ancestor rule).
2. Check if the file is within a mapped folder from that file's config.
3. Apply skip patterns.
4. If all checks pass, include in payload.

### 10.4 Payload

```typescript
interface PublishPayload {
  project_id: string
  repo_name: string
  branch: string
  commit_sha: string
  commit_timestamp: number          // unix timestamp from git log -1 --format=%ct
  specs: SpecArtifact[]
  config: MdspecMapConfig           // merged, resolved config — always required
}

interface SpecArtifact {
  path: string                      // repo-relative
  previous_path?: string            // set on rename
  hash: string                      // sha256:<hex>
  title: string                     // from specs[path].title > H1 > filename
  id_ref?: string                   // from specs[path].id — for task adoption
  agent?: string                    // from specs[path].agent
  content: string
  frontmatter: object
}
```

`config.mappings[].folder` is always set by the CLI to the `scopeDir` of the owning `.mdspecmap` file. Users never write `folder:` in the file.

### 10.5 Output

```
— Found 3 .mdspecmap file(s)
— Scanning folders: / (root), docs/api, src/hooks

✓ Published  docs/api/v2/auth.md → Notion (api-docs)
✓ Published  docs/tasks/sprint-24.md → ClickUp (sprint-tasks)
✓ Published  src/hooks/INFO7.md → ClickUp (task updated: 86exam62a)
✗ Failed     docs/api/sla.md → Notion (unknown alias 'api-doc')
— Skipped    docs/api/DRAFT_payments.md (skip pattern: DRAFT_*.md)
— Skipped    src/utils/helper.md (no .mdspecmap in scope)
```

---

## 11. Server Behaviour

### 11.1 Config is Payload-First

The server routes specs using the config from the publish payload directly. It does not read folder mappings from the DB for routing. The DB is updated after routing, not before.

```
Publish arrives
  └─ Validate MDSPEC_TOKEN
  └─ Validate repo_name matches registered_repo
  └─ Resolve aliases → native IDs for this org
  └─ Route specs using payload config (not DB)
  └─ Enqueue jobs with resolved routing
  └─ Return 202 Accepted immediately
  └─ Atomically update DB config if this commit is newest
```

### 11.2 Routing — Longest-Prefix Match

The server matches each spec's path to a mapping using longest-prefix on `mapping.folder`. This works correctly because the CLI normalizes all mapping folders to repo-relative paths before sending the payload.

```
spec path:   src/hooks/INFO7.md
mappings:    '' (root)  →  notion/eng-docs
             'src'      →  notion/src-docs
             'src/hooks' → clickup/task-list    ← wins (longest prefix)
```

### 11.3 Alias Validation

Before enqueuing any jobs the server validates all aliases in the payload config. Any unresolved alias blocks the entire publish:

```json
{
  "error": "unresolved_aliases",
  "aliases": [
    { "alias": "api-doc", "folder": "docs/api", "suggestion": "api-docs" }
  ]
}
```

### 11.4 Rename Handling

When a spec arrives with `previous_path` set:
1. Find the existing ledger entry by `previous_path`.
2. Update `path` to the new path.
3. Update the page title in the target tool in-place.
4. Preserve the `external_page_id` — no new page created, no orphan.

### 11.5 Deleted Files

Deleted files are not included in the payload. The server takes no action. Published pages remain in the target tool. Teams manage cleanup manually.

---

## 12. UI Role — Configuration Assistant

The UI manages the infrastructure that `.mdspecmap` references. It never reads, syncs, diffs, or locks against the file itself.

**What the UI manages:**
- Integration connections (OAuth flows, credentials, tokens)
- Aliases (create, edit, delete alias → native ID mappings)
- Download `.mdspecmap` files (per-mapping and project-wide)
- Publish activity (Dashboard, Activity feed, spec status)

### 12.1 Per-Mapping Download Button

Dashboard → Project → Map shows a table of all configured folder mappings. Each row has a **Download** button that generates a `.mdspecmap` file pre-filled with that mapping's integration, parent, and target.

The file downloads as an extensionless `.mdspecmap` file (not `.txt`) using `application/octet-stream`. The user drops it into the appropriate folder in their repo and commits it.

### 12.2 `mdspec init` CLI Command

```bash
npx mdspec init --project proj_xxx
```

Fetches connected integrations and defined aliases from the API, runs an interactive prompt, and writes a `.mdspecmap` to the current directory (not necessarily the repo root).

---

## 13. Validation

### 13.1 CLI Validation at Publish Time

The CLI validates each discovered `.mdspecmap` before building the payload:

```
✗ Error   docs/api/.mdspecmap validation failed:
          - mappings[0].folder: not supported — place .mdspecmap
            inside the folder you want to sync
          - mappings[1].integration: unknown value 'notiom'
            (did you mean 'notion'?)
          - version: must be 1
```

Publish is blocked until the file is valid. Each `.mdspecmap` is validated independently — one invalid file blocks the entire publish.

### 13.2 `folder:` Key Is Rejected

The `folder:` key inside a mapping is not supported in the distributed model. If present, the CLI exits with:

```
✗ Error   mappings[0].folder: not supported — place .mdspecmap
          inside the folder you want to sync
```

This enforces the distributed model and prevents confusion from mixing the old root-config model with the new per-folder model.

---

## 14. Example Layouts

### 14.1 Monorepo — Each Package Owns Its Docs

```
packages/
├── payments/
│   └── docs/
│       ├── .mdspecmap      ← payments team → Notion (payments-docs)
│       ├── api.md
│       └── webhooks.md
├── auth/
│   └── docs/
│       ├── .mdspecmap      ← auth team → Confluence (auth-wiki)
│       └── tokens.md
└── shared/
    └── docs/
        └── overview.md     ← no .mdspecmap in ancestry → not published
```

### 14.2 Single Folder, No Recursion

```yaml
# marketing/copy/.mdspecmap
version: 1
sub_folders: false
mappings:
  - integration: notion
    parent: marketing-copy
```

Only files directly in `marketing/copy/` are published. Subfolders untouched.

### 14.3 Root-Level File

```yaml
# .mdspecmap  (repo root)
version: 1
mappings:
  - integration: notion
    parent: all-docs
    skip:
      - "**/node_modules/**"
      - "**/CHANGELOG.md"
```

Syncs the root and all subfolders, subject to skip patterns and any more-local `.mdspecmap` files overriding their subtrees.

### 14.4 Adopting Pre-Existing ClickUp Tasks

```yaml
# src/hooks/.mdspecmap
version: 1
mappings:
  - integration: clickup
    target: task
    list_id: id:901817533430

specs:
  INFO7.md:
    id: 86exam62a
    title: History
  INFO8.md:
    id: 86exam63b
    title: Event Log
```

On first publish, `INFO7.md` updates task `86exam62a` instead of creating a new one. The task ID is stored in the ledger. The `id` field in `.mdspecmap` is only needed once — remove it after the first successful adoption if desired.

### 14.5 Nearest-Ancestor Override

```
docs/
├── .mdspecmap              → notion/general-docs  (all of docs/)
│                              skip: api/**
├── general.md              ← governed by docs/.mdspecmap
└── api/
    ├── .mdspecmap          → notion/api-docs  (only docs/api/)
    ├── reference.md        ← governed by docs/api/.mdspecmap
    └── v1/auth.md          ← governed by docs/api/.mdspecmap
```

`docs/.mdspecmap` skips `api/**` to avoid double-routing files that `docs/api/.mdspecmap` already governs.

---

## 15. What Does Not Live in `.mdspecmap`

These always live in the Dashboard only:

- Integration OAuth credentials and tokens
- Billing and subscription management
- Org and project creation
- Member invites and roles
- Agent template definitions
- Alias → native ID mappings (the native ID is never committed to the repo)

The file only references already-connected integrations by alias name. It cannot connect, configure, or modify integration auth.

---

## 16. DB Schema — Relevant Tables

**`aliases` table:**
```sql
id              uuid primary key default gen_random_uuid()
org_id          uuid references organizations(id)
integration_id  uuid references integrations(id)
name            text not null        -- referenced in .mdspecmap as parent:
native_id       text not null        -- resolved container ID in target tool
native_url      text                 -- stored for UI display only
display_name    text                 -- human label shown in UI
created_by      uuid references auth.users(id)
created_at      timestamptz default now()
updated_at      timestamptz default now()
unique(org_id, name)
```

**`spec_publish_targets` table — `external_page_id` column:**
After a spec is first published (or an `id` from `.mdspecmap` is adopted), the native task/doc ID is stored here. On every subsequent publish the server reads this column to update the existing item instead of creating a new one.

**`projects` table — config reconciliation columns:**
```sql
last_config_commit_sha          text
last_config_commit_timestamp    bigint    -- unix timestamp
last_config_reconciled_at       timestamptz
```

Config in the DB is updated only when the incoming commit is newer than the last reconciled commit. This ensures the DB always reflects the newest config regardless of job processing order.

---

*End of `.mdspecmap` Specification — Distributed Model*
