# Pattern-Grouped Parents
**Auto-create parent pages from filename patterns or frontmatter**

---

## 1. The Problem

Today, the only way to group related specs under a shared parent in the target tool is to put them in the same subfolder. The folder name becomes the parent (Notion page / Confluence page / ClickUp doc folder / S3 prefix).

This works, but forces a 1:1 mapping between repo layout and target-tool layout. Users want to keep their repo flat (or organised differently) and still produce a clean grouped structure in the target tool.

A common case:

```
docs/
  release-notes-v1.0.md
  release-notes-v1.1.md
  release-notes-v2.0.md
  api-changes-v1.0.md
  api-changes-v2.0.md
  getting-started.md
```

What the user wants in Notion:

```
Engineering /
  Release Notes /
    v1.0
    v1.1
    v2.0
  API Changes /
    v1.0
    v2.0
  Getting Started
```

…without rearranging the repo into `docs/release-notes/` and `docs/api-changes/`.

For S3 the same pattern applies — group prefix becomes a real folder, files land inside it.

---

## 2. The Feature

Add a `groups` field to a mapping in `.mdspecmap`. Each entry declares a **grouping rule**: a pattern that matches files, plus the display name of the synthetic parent the system should create under the mapping's existing `parent:`.

Two pattern kinds are supported:

1. **Filename glob** — `match: "release-notes-*.md"`
2. **Frontmatter field** — `frontmatter: group` (group value is read from each file's frontmatter)

A file may only ever match one group rule per mapping. The first rule that matches wins (in order written).

Files that match no group rule fall through to the existing behaviour: they are filed directly under the mapping's `parent:` (or the mirrored subfolder structure if any).

---

## 3. `.mdspecmap` Syntax

### 3.1 Filename glob

```yaml
mappings:
  - folder: docs
    integration: notion
    parent: alias:eng-docs
    groups:
      - match: "release-notes-*.md"
        name: "Release Notes"
      - match: "api-changes-*.md"
        name: "API Changes"
```

`match` is a glob matched against the **filename only** (not the path). Standard glob syntax — `*`, `?`, `[abc]`. The same patterns we already accept in `skip:`.

`name` is the literal display name used to create the parent container in the target tool. UTF-8, allows spaces and most punctuation. Validated per-platform (see §5).

### 3.2 Frontmatter field

```yaml
mappings:
  - folder: docs
    integration: notion
    parent: alias:eng-docs
    groups:
      - frontmatter: group
```

When `frontmatter:` is used instead of `match:`, the rule reads the named field from each file's frontmatter and uses its value as the group name directly. No `name:` is needed — the frontmatter value *is* the name.

Source file:
```markdown
---
title: v2.0 Release Notes
group: Release Notes
---

# v2.0
…
```

This file ends up under a "Release Notes" parent.

Files where the frontmatter field is missing or empty fall through to the no-group path (just like a filename rule that didn't match).

### 3.3 Combining filename and frontmatter

Both forms can coexist in the same `groups:` list. The list is order-sensitive — first match wins:

```yaml
groups:
  - match: "DRAFT_*.md"           # explicit override
    name: "Drafts"
  - frontmatter: group             # general catch-all
  - match: "release-notes-*.md"   # fallback when no frontmatter
    name: "Release Notes"
```

For a file `DRAFT_release-notes-v2.md` with `group: Release Notes` frontmatter, the first rule wins → it lands under "Drafts".

### 3.4 Reserved name characters

`name:` and frontmatter-supplied group names are trimmed of leading/trailing whitespace. Empty or whitespace-only names are invalid — same hard-block treatment as an unknown alias.

Forward slashes `/` in a name are **not** allowed and hard-fail validation. They would imply nested grouping, which is out of scope for V1 (see §10).

---

## 4. Resolution Order

For each spec file the CLI processes:

```
1. Find the mapping(s) for the file's folder
2. For each mapping:
     a. Walk the `groups:` list in order
     b. First matching rule decides the group name
     c. If a rule matches, the file's target parent =
            <mapping.parent> / <group.name>
     d. If no rule matches, target parent = <mapping.parent>
3. Subfolder mirroring (existing behaviour) applies *beneath* the
   resolved parent. Group lives between `parent:` and any subfolders.
```

Example with subfolders:

```
docs/api/v2/auth.md
  frontmatter: { group: "Auth Suite" }

mapping: { folder: docs/api, parent: alias:eng-docs,
           groups: [ { frontmatter: group } ] }

→ Engineering / Auth Suite / v2 / auth
```

The group sits one level below the mapping's parent and one level above any mirrored subfolder structure.

---

## 5. Per-Platform Behaviour

### 5.1 Notion

The group is created as a child page of the mapping's resolved parent page. Title = the group `name`.

| Step | Action |
|---|---|
| Lookup | Find an existing child page of `parent` whose title exactly matches `name` |
| Create | If none, create one (empty body) |
| File pages | Create/update spec pages as children of the group page |
| Idempotent | Re-publish never duplicates the group — exact-title match is the key |

The Notion page ID for the resolved group is cached in the ledger as the child's `parent_id` so subsequent runs go straight to it.

### 5.2 Confluence

Same as Notion. Group becomes a child page of the resolved space/page parent. Match on exact title under the parent.

### 5.3 ClickUp

For `target: document` — group becomes a sub-doc-folder under the resolved doc-folder parent.

For `target: task` — group becomes a sub-list under the resolved space/list parent. ClickUp list names allow most characters; validated for the small set ClickUp rejects (currently none documented, but we still trim and reject empty).

### 5.4 S3

The group name becomes a literal **path segment** in the S3 key. Spaces and special characters are slugified:

```
parent prefix:  docs/engineering/
group name:     "Release Notes"
file path:      docs/release-notes-v2.0.md
target key:     docs/engineering/release-notes/release-notes-v2.0.md
                                  ^^^^^^^^^^^^^^
                                  slug of the group name
```

Slug rules (consistent with how we generate page-slug fragments today):
- Lowercase
- Spaces → `-`
- Characters outside `[a-z0-9\-_]` stripped
- Multiple `-` collapsed
- Trim leading/trailing `-`

The original group name is preserved in the ledger for UI display. The slug is what lives in the key.

---

## 6. Validation

### 6.1 CLI Validation at Publish Time

The CLI validates each `groups:` entry:

| Check | Failure message |
|---|---|
| Either `match:` or `frontmatter:` present | `groups[N]: must specify either 'match' or 'frontmatter'` |
| Not both `match:` and `frontmatter:` | `groups[N]: 'match' and 'frontmatter' are mutually exclusive` |
| `name:` present when `match:` is | `groups[N]: 'name' is required when using 'match'` |
| `name:` absent when `frontmatter:` is | `groups[N]: 'name' is not used with 'frontmatter' rules` |
| `name:` non-empty after trim | `groups[N].name: must not be empty` |
| `name:` contains no `/` | `groups[N].name: must not contain '/' (nested groups not supported)` |
| `match:` is a valid glob | `groups[N].match: invalid glob pattern` |
| `frontmatter:` is a valid field name | `groups[N].frontmatter: must be a non-empty string` |

Publish is hard-blocked on validation failure — same model as the rest of `.mdspecmap`.

### 6.2 Runtime Failures

Failures that can only be detected per-file at processing time:

| Scenario | Handling |
|---|---|
| Frontmatter rule matched but value is `null`/empty string | Fall through to no-group path |
| Frontmatter rule matched but value contains `/` | Per-file hard fail, surfaced in publish output |
| Frontmatter rule matched but value > 255 chars | Per-file hard fail |
| Group page creation fails on target (network, perms) | Per-file fail, other files in same batch continue |

Per-file failures are reported in CLI output the same way other per-spec failures are:

```
✗ Failed     docs/api-v3.md → Notion (group name contains '/': "v3/beta")
```

---

## 7. UI

### 7.1 Starter `.mdspecmap` Generator

The Dashboard → Project → Map flow gains a "Group files by pattern" section per mapping:

```
Folder: docs/
Integration: Notion
Parent alias: eng-docs

  Grouping rules (optional)
  ─────────────────────────
  [ + Filename pattern ]   [ + Frontmatter field ]

  • match: release-notes-*.md
    name: Release Notes                    [ × Remove ]

  • frontmatter: group                     [ × Remove ]
```

Drag-to-reorder for precedence.

### 7.2 Activity Feed

Existing spec status rows gain a `Group` column when populated:

```
✓ Published    docs/release-notes-v2.0.md   Release Notes   Notion   eng-docs
✓ Published    docs/api-changes-v2.0.md     API Changes     Notion   eng-docs
✓ Published    docs/getting-started.md      —               Notion   eng-docs
```

---

## 8. CLI Output

```
✓ Published   docs/release-notes-v1.0.md → Notion (eng-docs / Release Notes)
✓ Published   docs/release-notes-v1.1.md → Notion (eng-docs / Release Notes)
✓ Published   docs/getting-started.md    → Notion (eng-docs)
✓ Created     Notion page "Release Notes" under eng-docs   (first match in this run)
```

The `Created` line appears once per group per run, the first time the synthetic parent is materialised.

---

## 9. Data Model Changes

### 9.1 `ledger_entries` — new column

```sql
group_name   text   -- resolved group name for this spec, NULL if no group
```

Used for:
- Activity-feed display
- Idempotency: a spec's group can change between commits, in which case the page is moved to the new group's parent (same in-place update model as renames).

### 9.2 `group_parents` — new table

Cache of group-name → native-container-ID resolutions, scoped per project + integration + mapping parent.

```sql
id              uuid primary key default gen_random_uuid()
project_id      uuid references projects(id)
integration_id  uuid references integrations(id)
parent_alias    text not null         -- the mapping's alias, denormalised
parent_native_id text not null        -- resolved native ID of the alias
group_name      text not null
native_id       text not null         -- the group container's native ID
native_url      text
created_at      timestamptz default now()
updated_at      timestamptz default now()

unique(project_id, integration_id, parent_native_id, group_name)
```

On group resolution the server hits this table first. Miss → create in target → insert row. Hit → use cached ID.

### 9.3 Group rename

If a user changes a group's display name in `.mdspecmap` (e.g. `name: "Release Notes"` → `name: "Releases"`), this is treated as a **new group**. The old group page is left intact in the target tool with its existing children. The new group is created and new specs go under it.

This is the same conservative model we use for deletes — no destructive moves driven by config edits. Cleanup is manual.

(A future migration tool can move children if needed, but it is out of scope.)

---

## 10. Out of Scope for V1

- **Nested groups** (`Releases / 2026`) — names cannot contain `/`. Use mirrored subfolders instead.
- **Multiple groups per file** — first match wins. A spec belongs to exactly one group per mapping.
- **Automatic group inference** — no heuristics that infer groups from filename prefixes without an explicit rule.
- **Group-level skip patterns** — `skip:` continues to live at the mapping level.
- **Cross-mapping groups** — each mapping has its own `groups:` list. A "Release Notes" group under one mapping is distinct from a "Release Notes" group under another.

---

## 11. Testing

### 11.1 Unit — `apps/cli/src/__tests__/resolveGroup.test.ts` (new)

| Scenario | Verifies |
|---|---|
| Filename glob matches → group name returned | Basic match |
| Filename glob does not match → null | Fallthrough |
| Frontmatter field present → its value returned | Frontmatter path |
| Frontmatter field missing → null | Fallthrough |
| Frontmatter field empty string → null | Empty handling |
| Two rules, first matches → first wins | Order |
| Two rules, second matches → second wins | Order |
| Frontmatter value with `/` → per-file error | Validation |
| Frontmatter value > 255 chars → per-file error | Validation |
| `match:` and `frontmatter:` both present | Config-level validation error |

### 11.2 Unit — `apps/cli/src/__tests__/readMdspecMap.test.ts` (extend)

Cover each validation rule in §6.1 — well-formed `groups:` blocks parse, malformed ones hard-fail with the listed messages.

### 11.3 Integration — `apps/web/src/__tests__/processor.groups.test.ts` (new)

Stub the integration adapters. Verify the processor:

- Looks up `group_parents` before creating a group container
- Creates and caches when missing
- Reuses cached ID on second file in same batch
- Sets `ledger_entries.group_name` on every published row

### 11.4 End-to-end — `/Users/mfmz/testmdspecdocs`

Add scenarios to the live test repo:

| Scenario | Integration | Verifies |
|---|---|---|
| Two files matching `release-notes-*.md` published with a group rule | Notion | One "Release Notes" page created, both specs under it |
| Same scenario | Confluence | Same |
| Same scenario | ClickUp (doc) | Same |
| Same scenario | S3 | Files land under `release-notes/` prefix |
| Frontmatter-driven group, three distinct values across three files | Notion | Three group pages created, one spec under each |
| Group name with spaces and punctuation | All | Display name preserved on Notion/Confluence/ClickUp, slugified on S3 |
| Mix of grouped and ungrouped files in one mapping | Notion | Ungrouped specs file directly under parent, grouped specs file under their group |
| Group rule + mirrored subfolder | Notion | Group sits between parent and subfolder (§4) |
| Invalid group name (`v1/beta`) via frontmatter | Notion | Per-file failure, other files in batch publish |

---

## 12. API Docs

Update `apps/web/app/docs/api-reference/page.tsx`:

- **NAV sidebar** — new `groups: pattern grouping` entry under `.mdspecmap` fields
- **mappings: field table** — new `groups` row
- **New `#groups` section** — full syntax, resolution order, per-platform behaviour, validation rules
- **Agent prompt** — list `groups:` as a supported optional mapping field with the two pattern forms

---

*End of Pattern-Grouped Parents Specification*
