# mdspec — Unified Spec Attributes
**One `id` + `title` shape — accepted in `.mdspecmap` *and* spec frontmatter — for every integration**

---

## 1. Goal

A spec author should not need to know which integration their folder is
wired to. The folder mapping is the only thing that knows the integration
type — the spec entry stays integration-agnostic.

The shape: **one unified attribute set per spec**, namespace-free,
accepted from either source — `.mdspecmap` `specs[path]` *or* the spec
file's YAML frontmatter. For now the unified shape is just two fields:

```yaml
# .mdspecmap
specs:
  docs/specs/checkout-retry.md:
    id: <native id in whatever tool the folder maps to>
    title: Checkout Retry Policy
```

```markdown
<!-- docs/specs/checkout-retry.md -->
---
id: <native id in whatever tool the folder maps to>
title: Checkout Retry Policy
---

# Checkout Retry Policy
...
```

Both forms produce the identical resolved spec. Authors pick whichever
fits their workflow — frontmatter when the spec file travels with the
record, mapping when central config is preferred.

Everything beyond `id` + `title` (priority, status, parent, labels, block
shape, etc.) is out of scope for v1 — see §6.

---

## 2. The Unified Shape

```yaml
# fields, identical wherever they appear
id:    string   # adopt-existing pointer; integration interprets
title: string   # canonical title; overrides H1 / filename
```

Two equivalent declaration sites:

```yaml
# A) .mdspecmap entry, keyed by repo-relative path
specs:
  <path>:
    id: <…>
    title: <…>
```

```markdown
<!-- B) frontmatter at the top of the spec file -->
---
id: <…>
title: <…>
---
```

Rules:

- `id` is opaque to mdspec. The publish adapter for the resolved
  integration is the only thing that interprets it (ClickUp task ID, JIRA
  issue key, Confluence page ID, Notion page ID, S3 key, …).
- `title` is the same string for every target.
- Both fields are optional. Omitted `title` falls back to H1 → filename.
  Omitted `id` means "create new on first publish".
- Allowlist for both sources: `id`, `title`, `agent`. Any other key is
  rejected with a parse error naming the offending key and file.

---

## 3. Resolution

The CLI calls `resolveSpecConfig(filePath, map, frontmatter)` and merges
the two unified sources. It returns the unified shape directly — no
integration branch:

```ts
type ResolvedSpec = {
  path:  string
  title: string | undefined  // frontmatter.title ?? entry.title ?? H1 ?? filename
  id:    string | undefined  // frontmatter.id    ?? entry.id
}
```

### 3.1 Precedence — frontmatter always wins

Frontmatter wins over `.mdspecmap`, field by field. Rationale: the spec
file is the artifact the author edits day-to-day; central mapping is
infra config. Closer-to-the-content wins.

| Source | `id` | `title` |
|---|---|---|
| Spec frontmatter | wins if set | wins if set |
| `.mdspecmap` `specs[path]` | fallback | fallback |
| H1 / filename | — | fallback for `title` only |

Conflict (both set, different values) is **not** an error — frontmatter
silently wins. The CLI emits an info-level log noting which source was
used per spec, so debugging stays cheap.

### 3.2 Payload

The publish payload carries `{ path, title, id, title_source, id_source }`
per spec, plus the folder mapping. `*_source` is `"frontmatter" |
"mapping" | "derived" | null` — kept for the server-side audit trail and
ledger debugging. Adapters ignore it.

---

## 4. Adoption Lifecycle (unchanged from `mdspecmap-spec.md` §5.1)

1. First publish: `id` present → server resolves to native record, stores
   in `spec_publish_targets.external_page_id`, then ignores `id` from then
   on.
2. Subsequent publishes: ledger drives updates.
3. Deleted in tool: ledger entry cleared, re-resolves from `id` if still
   present, else creates new.

This is integration-agnostic by design — the same lifecycle holds whether
the adapter is ClickUp, JIRA, Confluence, Notion, or S3.

---

## 5. Validation

Parser rejects unknown keys in **both** sources. Allowlist is
`{ id, title, agent }`.

```
specs[docs/specs/x.md]: unknown key 'clickup_task_id'.
  Allowed keys: id, title, agent.

docs/specs/x.md: unknown frontmatter key 'jira_issue_key'.
  Allowed keys: id, title, agent.
```

Hard error, not a warning. There are no existing users to migrate.

---

## 6. Out of Scope (v2+)

Fields that legitimately differ across tools — not in v1:

- Status / state mapping (Open ↔ To Do ↔ In Progress ↔ Done)
- Priority levels (low/med/high vs. P0–P4 vs. Notion select)
- Parent / hierarchy reference (folder, space, list, page)
- Labels / tags
- Assignee
- Custom fields

Each gets its own unified key with an adapter-side mapping table when
needed. Out of scope for the id+title pivot.

---

## 7. Build Plan

Order matters — do not parallelise.

1. **Mapping schema** — `.mdspecmap` parser accepts exactly
   `{ id, title, agent }` inside `specs[path]`. Reject anything else with
   a helpful error. Add unit tests in
   `apps/cli/src/__tests__/readMdspecMap.test.ts`.
2. **Frontmatter parser** — minimal frontmatter reader (e.g. `gray-matter`)
   gated to the same `{ id, title, agent }` allowlist. Strip the
   frontmatter from the markdown body before downstream processing so the
   published content is unchanged.
3. **Resolver** — `resolveSpecConfig(filePath, map, frontmatter)` merges
   the two sources with frontmatter-wins precedence (§3.1) and returns
   the unified `ResolvedSpec`.
4. **Payload** — publish payload spec entry is `{ path, title, id,
   title_source, id_source }`. Update `buildSpecArtifact` and its tests.
5. **Server adapters** — every adapter (ClickUp, JIRA, Confluence, Notion,
   S3) consumes the unified `id` field. No per-integration field names
   anywhere.
6. **Docs** — update `NO_FRONTMATTER_PIVOT.md` (note this supersedes the
   no-frontmatter stance for `id`/`title`/`agent`), `CLICKUP_TASKS_SPEC.md`
   §4, `JIRA_CONFLUENCE_NOTION_SPEC.md` §2.4, `S3_INTEGRATION_SPEC.md` to
   point at this spec for the canonical attribute shape.

---

## 8. Complexity Analysis

### 8.1 Per-step

| # | Step | Surface area | Complexity | Why |
|---|---|---|---|---|
| 1 | Mapping schema | `apps/cli/src` parser + 1 test file | **Low** | Allowlist of keys + a rejection branch. Pure local change, no I/O. |
| 2 | Frontmatter parser | New CLI module + tests + dependency | **Low–Medium** | New parser path. `gray-matter` is small but it touches every spec read. |
| 3 | Resolver merge | `resolveSpecConfig` + callers | **Low** | Two-source merge, frontmatter-wins. ~15 LOC. |
| 4 | Payload shape | CLI build + server ingest contract | **Medium** | Wire-format change. CLI and server must agree. |
| 5 | Adapters (×5) | One file each, server-side | **Medium total** | Per-adapter swap is ~10 LOC; uniform across integrations. |
| 6 | Docs | 4 spec files | **Low** | Cross-references + supersession note. |

**Net engineering cost:** small. No backwards-compat work, no migration
tooling, no shim — just build the unified path and ship.

### 8.2 Algorithmic complexity

Unchanged from today. Resolver is O(1) per spec (path-keyed map lookup).
Payload build is O(n) in spec count. Frontmatter parsing is O(file size)
but only runs once per spec per publish.

### 8.3 Risks

| Risk | Likelihood | Blast radius | Mitigation |
|---|---|---|---|
| Adapters interpret `id` differently (JIRA expects `ENG-1042`, ClickUp expects `abc123xyz`) | Inherent — by design | Confusing errors when a user wires a folder to the wrong integration | Adapter-side validation: each adapter rejects `id` that doesn't match its native format with a clear message naming the expected shape. |
| Author edits frontmatter and `.mdspecmap` for the same spec, ends up with two divergent `id`s | Medium | Quietly confusing publish behaviour | Frontmatter wins silently (§3.1) + per-spec source log + the `id_source` field on the payload makes the choice auditable. |
| Frontmatter parsed but accidentally rendered into the published body | Low | Visible YAML at top of every page | Frontmatter parser strips before downstream processing — dedicated test in step 2. |
| Frontmatter parser chokes on quirky YAML | Low | Spec fails to publish | Parser errors carry the file path + line; CLI exits non-zero with a readable message rather than swallowing. |
| v2 reconciliation pressure leaks into v1 | Medium | Scope creep | Hard line: anything beyond `id` + `title` is a separate spec. Reviewer enforces. |

### 8.4 What we're explicitly *not* doing

- No legacy per-integration keys (`clickup_task_id`, `jira_issue_key`, …)
  anywhere — no users to migrate, so no shim, no warning, no rename
  guidance. Hard error from day one.
- No multi-integration `id` (e.g. `id: { clickup: …, jira: … }`). A spec
  publishing to two tools needs two entries today; v2 problem.
