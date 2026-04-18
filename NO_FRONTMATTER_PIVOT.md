# mdspec — No Frontmatter Pivot
**`.mdspecmap` as the sole configuration source**

---

## What Changed

Frontmatter is removed entirely. Spec files are pure markdown — no YAML headers, no mdspec-specific syntax. All configuration that previously lived in frontmatter now lives in `.mdspecmap`.

The `specs:` and `links:` sections are merged into a single `specs:` section keyed by file path. Path-as-key gives YAML-level duplicate detection for free, O(1) lookup at any scale, and zero friction — paths are already unique in a repo, no invented names required.

---

## What Was in Frontmatter → Where It Lives Now

| Was in frontmatter | Now in `.mdspecmap` |
|---|---|
| `title` | `specs[path].title` |
| `targets` | `mappings[].folder` |
| `mdspec_agent` | `specs[path].agent` |
| `mdspec_no_agent` | `specs[path].agent: none` |
| `task_id` / `mdspec_taskid` | `specs[path].id` |

`mdspec_id` and `publish` are removed. mdspec_id is replaced by the path key itself. publish mode is removed — mdspec has no control over when CI runs.

---

## Updated `.mdspecmap` Format

```yaml
# .mdspecmap
version: 1

sync_all_on_first_run: false

mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    skip:
      - DRAFT_*.md
      - _*.md

  - folder: docs/tasks
    integration: clickup
    parent: dev-tasks

  - folder: docs/architecture
    integration: notion
    parent: arch-docs

  - folder: docs/architecture
    integration: confluence
    parent: arch-confluence

# Optional — per-spec config, keyed by file path
# Only needed when you want a stable ID, custom title, agent, or task link
# Specs not listed here are auto-configured from their path
specs:
  docs/specs/checkout-retry.md:
    title: Checkout Retry Policy        # overrides H1/filename-derived title
    agent: task_template                # agent template to apply
    id: CU-182                          # native ID to adopt on first publish (any integration)

  docs/specs/auth/sso-setup.md:
    agent: none                         # explicitly opt out of folder agent
    id: CU-291

  docs/specs/sla-policy.md:
    id: CU-305                          # just link an existing record — nothing else needed
```

---

## `specs:` Section

Keyed by file path relative to repo root. Every field is optional. Add only what you need.

| Field | Type | What it does |
|---|---|---|
| `title` | string | Page title in the target tool. Overrides H1 heading and filename derivation. |
| `agent` | string | Agent template name to apply before publishing. Set to `none` to opt out of a folder-level agent. |
| `id` | string | Native ID of an existing page, doc, or task in the target tool. On first publish, mdspec adopts it and updates it from then on. Works across all integrations. |

### Path as key — why it works

```yaml
specs:
  docs/specs/sla-policy.md:    # ← the key IS the path, no invention needed
    task: CU-305
```

- YAML rejects duplicate keys automatically — no CLI validation needed
- O(1) lookup at any scale — the CLI maps each incoming file path directly to its config entry
- Zero friction — the path already exists, nothing to invent
- Self-documenting — you read the key and immediately know which file it is

### Renames

If a file is renamed, the `specs:` entry key is now stale. The old entry stops matching. Title overrides, agent config, and task links for that file are lost until the user updates the key to the new path. This is intentional — the onus is on the user. Git rename detection still fires and the page in the target tool updates in-place on that commit regardless.

---

## ID Resolution

The file path is always the mdspec_id. No other identifier exists.

---

## Title Resolution Order

```
1. specs[path].title           → explicit title in .mdspecmap
2. First # H1 in markdown      → heading at top of file
3. Filename without extension  → checkout-retry.md → Checkout Retry
```

---

## Task Wiring

`specs[path].task` is the only place task wiring is declared. It applies only to `target: task` (ClickUp task_list) mappings. Ignored for document mode and non-ClickUp integrations.

On first publish, mdspec resolves the task ID to a native ClickUp ID and stores it in the ledger. Subsequent publishes update the same task without re-resolving.

```yaml
specs:
  docs/tasks/long-job-convert.md:
    id: 86ev2bkbk
```

---

## Spec Files Are Pure Markdown

```markdown
# Checkout Retry Policy

This spec describes the retry behaviour for the checkout service.

## Overview
...
```

No YAML header. No mdspec syntax. Just content. Any `.md` file in a mapped folder is a valid spec. Teams can adopt mdspec without touching existing spec files at all.

---

## CLI Changes

### Frontmatter parsing removed

```typescript
// Before
const { data: frontmatter, content } = matter(fileContent)
const title = frontmatter.title || deriveFromFilename(path)
const agent = frontmatter.mdspec_agent
const taskId = frontmatter.task_id

// After
const content = fileContent   // raw markdown, no parsing
const specConfig = resolveSpecConfig(filePath, mdspecmap)
const title = specConfig.title
const agent = specConfig.agent
const idRef = specConfig.id
```

### `resolveSpecConfig` logic

```typescript
function resolveSpecConfig(filePath: string, map: MdspecMap): ResolvedSpecConfig {
  const entry = map.specs?.[filePath]   // O(1) map lookup

  return {
    id: filePath,                        // path is always the ID
    title: entry?.title ?? extractH1(content) ?? deriveFromFilename(filePath),
    agent: entry?.agent,
    id: entry?.id,
  }
}
```

### SpecArtifact payload

```typescript
interface SpecArtifact {
  path: string
  previous_path?: string      // rename detection — unchanged
  mdspec_id: string           // always the file path
  title: string               // resolved by CLI: specs.title > H1 > filename
  hash: string
  content: string             // raw markdown, no frontmatter
  id_ref?: string             // resolved from specs[path].id
  agent?: string              // resolved from specs[path].agent or folder mapping
}

## Task Wiring

`specs[path].id` is the only place external record wiring is declared. It works across all integrations:
- ClickUp: task ID or doc ID
- Notion: page ID
- Confluence: page ID
```

---

## Agent Resolution Order

```
1. specs[path].agent: none     → explicitly no agent (highest priority)
2. specs[path].agent: template → explicit agent for this spec
3. mappings[].agent            → folder-level agent assignment
4. no agent                    → publish raw markdown
```

---

## What Doesn't Change

- Folder mapping and alias resolution — identical
- Skip patterns — identical
- Rename detection via `git diff --name-status` — identical
- Server-side routing and publishing — identical
- Agent transformation pipeline — identical
- QStash job delivery — identical

---

## Migration from Frontmatter

For teams upgrading from a frontmatter-based project:

1. Run `npx mdspec migrate` — reads all frontmatter in spec files, generates `specs:` entries in `.mdspecmap` keyed by path, strips frontmatter from spec files
2. Review generated `.mdspecmap`
3. Commit both the updated `.mdspecmap` and cleaned spec files
4. Push — CI publishes normally, ledger matches via path

`npx mdspec migrate` is idempotent — safe to run multiple times.

---

*End of No Frontmatter Pivot Spec*
