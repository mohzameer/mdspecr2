# mdspec — No Frontmatter Pivot
**`.mdspecmap` as the sole configuration source**

---

## What Changed

Frontmatter is removed entirely. Spec files are pure markdown — no YAML headers, no mdspec-specific syntax. All configuration that previously lived in frontmatter now lives in `.mdspecmap`.

---

## What Was in Frontmatter → Where It Lives Now

| Was in frontmatter | Now in `.mdspecmap` |
|---|---|
| `mdspec_id` | `specs.{id}` key |
| `title` | `specs.{id}.title` |
| `targets` | `mappings[].folder` |
| `mdspec_agent` | `specs.{id}.agent` |
| `mdspec_no_agent` | `specs.{id}.agent: none` |
| `publish` | `specs.{id}.publish` |
| `task_id` | `links.{mdspec_id}: task_ref` |

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

# Optional — assign stable mdspec_id, override title, set agent, set publish mode
# Only needed when you want stability or per-spec config
# Specs not listed here get auto-ID from their file path
specs:
  checkout_retry:
    path: docs/specs/checkout-retry.md
    title: Checkout Retry Policy        # overrides filename-derived title
    agent: task_template                # agent template to apply
    publish: on-merge                   # on-merge (default) | manual

  auth_spec_v2:
    path: docs/specs/auth/sso-setup.md
    agent: none                         # explicitly opt out of folder agent

  payments_onboarding:
    path: docs/specs/payments/onboarding.md

# Task and external wiring — keyed by mdspec_id
# Works for both explicit IDs (specs: section) and auto-IDs (path-derived)
links:
  checkout_retry: CU-182              # ClickUp task
  auth_spec_v2: CU-291
  payments_onboarding: JRA-4421       # Jira ticket
  docs/specs/sla-policy.md: CU-305   # auto-ID spec — path is the key
```

---

## ID Resolution

### Explicit `mdspec_id` (via `specs:` section)

```yaml
specs:
  checkout_retry:
    path: docs/specs/checkout-retry.md
```

- `mdspec_id` = `checkout_retry`
- Stable regardless of where the file moves
- If file moves, update `path` in `.mdspecmap` → page updates in-place in target tool
- Used as key in `links:` section

### Auto-ID (no `specs:` entry)

- `mdspec_id` = relative file path from repo root (e.g. `docs/specs/sla-policy.md`)
- Changes if file moves → new page created, old page orphaned in target tool
- Team cleans up manually — consistent with mdspec's no-deletion principle
- Used as key in `links:` section using the path directly

### Priority — explicit always wins over auto:

```
specs: section entry exists  → use declared mdspec_id
No specs: entry              → use file path as ID
```

---

## Links Section

The `links:` section wires specs to external tasks. Keyed by `mdspec_id` (explicit or auto path-based).

```yaml
links:
  checkout_retry: CU-182           # explicit mdspec_id → ClickUp task
  docs/specs/sla.md: CU-305        # auto-ID spec → ClickUp task
  auth_spec_v2: JRA-4421           # explicit mdspec_id → Jira ticket
```

No `task_id` field exists anywhere else in the system. `links:` is the only place task wiring is declared.

**Future extensibility** — links section can expand without breaking existing format:

```yaml
links:
  checkout_retry:
    task: CU-182               # ClickUp / Jira task
    pr: 441                    # GitHub PR (future)
    adr: arch_decision_12      # another mdspec_id (future)
```

Both formats (scalar and map) are valid. CLI handles both.

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
const title = specConfig?.title || deriveFromFilename(path)
const agent = specConfig?.agent
const taskId = mdspecmap.links?.[specConfig.id]
```

### `resolveSpecConfig` logic

```typescript
function resolveSpecConfig(filePath: string, map: MdspecMap) {
  // check if this path has an explicit specs: entry
  const explicit = Object.entries(map.specs ?? {}).find(
    ([id, spec]) => spec.path === filePath
  )

  if (explicit) {
    return {
      id: explicit[0],          // the declared mdspec_id
      ...explicit[1]            // title, agent, publish etc.
    }
  }

  // fall back to auto-ID from path
  return {
    id: filePath,               // path is the ID
    title: deriveFromFilename(filePath),
    agent: resolveFolder(filePath, map)?.agent ?? null,
    publish: 'on-merge'
  }
}
```

### SpecArtifact payload — unchanged structure

The server sees the same `SpecArtifact` shape as before. The CLI resolves everything from `.mdspecmap` and injects it before sending — zero server-side changes needed.

```typescript
interface SpecArtifact {
  path: string
  previous_path?: string      // rename detection — unchanged
  mdspec_id: string           // resolved by CLI from .mdspecmap
  title: string               // resolved by CLI
  hash: string
  content: string             // raw markdown, no frontmatter
  task_ref?: string           // resolved from links: section
  agent?: string              // resolved from specs: or folder mapping
  publish: 'on-merge' | 'manual'
}
```

---

## Agent Resolution Order

Without frontmatter, agent resolution is purely from `.mdspecmap`:

```
1. specs.{id}.agent: none     → explicitly no agent (highest priority)
2. specs.{id}.agent: template → explicit agent for this spec
3. mappings[].agent           → folder-level agent assignment
4. parent folder agent        → inherited
5. no agent                   → publish raw markdown
```

---

## Title Resolution Order

```
1. specs.{id}.title           → explicit title in .mdspecmap
2. First H1 in markdown       → # Heading at top of file
3. Filename without extension → checkout-retry → Checkout Retry
```

---

## Publish Mode Resolution

```
1. specs.{id}.publish: manual    → only publish when manually triggered
2. specs.{id}.publish: on-merge  → publish on every merge (default)
3. No entry                      → on-merge
```

---

## What Doesn't Change

- Folder mapping and alias resolution — identical
- Skip patterns — identical
- Rename detection via `git diff --name-status` — identical
- File move behaviour (auto-ID changes, old page orphaned) — identical
- Server-side routing and publishing — identical
- Agent transformation pipeline — identical
- QStash job delivery — identical

---

## Migration from Frontmatter

For teams upgrading from a frontmatter-based project:

1. Run `npx mdspec migrate` — reads all frontmatter in spec files, generates `specs:` and `links:` sections in `.mdspecmap`, strips frontmatter from spec files
2. Review generated `.mdspecmap`
3. Commit both the updated `.mdspecmap` and cleaned spec files
4. Push — CI publishes normally, ledger matches via `mdspec_id`

`npx mdspec migrate` is idempotent — safe to run multiple times.

---

*End of No Frontmatter Pivot Spec*
