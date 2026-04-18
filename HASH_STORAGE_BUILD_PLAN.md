# Hash Storage Build Plan
**Store hashes (not content) in the `specs` table; title derived from frontmatter or filename**

---

## Context

Currently the `specs` table stores the full markdown `content` of every spec. This is wasteful — the content is only needed at publish time, and it already flows through the job queue payload to the worker. The DB row is a **ledger entry** (what was published, when, from which commit), not a content store.

This plan removes `content` from DB storage, adds a first-class `title` column derived at ingest time, and removes the now-redundant `title_source` project setting.

**Title rule:** `frontmatter.title` if set, otherwise the filename stem with hyphens/underscores replaced by spaces (existing `getSpecTitle` logic).

---

## Scope of changes

| Layer | What changes |
|---|---|
| DB migration | Drop `content`, add `title text not null` on `specs` |
| `lib/types.ts` | `Spec` row type: remove `content`, add `title` |
| `lib/types.ts` | `SpecArtifact`: remove `content` (CLI no longer sends it) |
| `lib/types.ts` | `PublishGroupJobData` / `PublishGroupSpec`: remove `content`, add `title` |
| `lib/types.ts` | Remove `title_source` from `PublishGroupJobData` |
| API publish route | Derive title; stop persisting content; stop passing `title_source` |
| Worker publish processor | Use `spec.title` directly; remove `title_source` branch |
| Worker adapters | Pass `spec.title` to `getSpecTitle`-call sites (or inline) |
| CLI | Remove reading/sending `content` from `SpecArtifact` |
| DB migration | Drop `title_source` column from `projects` table |

---

## Phase 1 — Database migration

**File:** `supabase/migrations/20240419000000_specs_hash_only.sql`

```sql
-- Remove content, add title to specs
alter table public.specs
  drop column content,
  add column title text not null default '';

-- Remove the now-redundant title_source project setting
alter table public.projects
  drop column if exists title_source;
```

> `default ''` is only for the migration to avoid NOT NULL violation on existing rows.
> A follow-up `UPDATE` can backfill titles from frontmatter/filenames before dropping the default,
> or the default can simply stay as an empty string sentinel for legacy rows.

---

## Phase 2 — Shared types (`apps/web/lib/types.ts`)

### `SpecArtifact` — remove `content`

```ts
// Before
export interface SpecArtifact {
  path: string
  previous_path?: string
  hash: string
  frontmatter: Record<string, unknown>
  content: string           // <-- remove
}

// After
export interface SpecArtifact {
  path: string
  previous_path?: string
  hash: string
  frontmatter: Record<string, unknown>
}
```

### `PublishGroupSpec` — replace `content` with `title`

```ts
// Before
export interface PublishGroupSpec {
  spec_id: string
  spec_publish_target_id: string
  path: string
  content: string           // <-- remove
  content_hash: string
  frontmatter: Record<string, unknown>
}

// After
export interface PublishGroupSpec {
  spec_id: string
  spec_publish_target_id: string
  path: string
  title: string             // <-- add (resolved at API ingest)
  content_hash: string
  frontmatter: Record<string, unknown>
}
```

### `PublishGroupJobData` — remove `title_source`

```ts
// Before
export interface PublishGroupJobData {
  ...
  title_source?: 'first_heading' | 'filename'   // <-- remove
}

// After — field simply dropped
```

### `Spec` DB row type — remove `content`, add `title`

```ts
// Before
export interface Spec {
  ...
  content_hash: string
  content: string           // <-- remove
  frontmatter: Record<string, unknown> | null
}

// After
export interface Spec {
  ...
  content_hash: string
  title: string             // <-- add
  frontmatter: Record<string, unknown> | null
}
```

---

## Phase 3 — API publish route (`apps/web/app/api/publish/route.ts`)

### Title resolution helper

Add a local helper (or import from a shared util):

```ts
function resolveTitle(path: string, frontmatter: Record<string, unknown>): string {
  if (frontmatter?.title && typeof frontmatter.title === 'string') {
    return frontmatter.title
  }
  const filename = path.split('/').pop() ?? path
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ')
}
```

### Upsert — stop persisting content, add title

```ts
// Before
await supabase.from('specs').upsert({
  ...
  content_hash: spec.hash,
  content: spec.content,       // <-- remove
  frontmatter: spec.frontmatter ?? null,
  ...
})

// After
await supabase.from('specs').upsert({
  ...
  content_hash: spec.hash,
  title: resolveTitle(spec.path, spec.frontmatter ?? {}),   // <-- add
  frontmatter: spec.frontmatter ?? null,
  ...
})
```

### Group accumulation — replace content with title

```ts
// Before
groups.get(groupKey)!.specs.push({
  ...
  content: spec.content,
  ...
})

// After
groups.get(groupKey)!.specs.push({
  ...
  title: resolveTitle(spec.path, spec.frontmatter ?? {}),
  ...
})
```

### Job data — remove `title_source`

```ts
// Before
const jobData: PublishGroupJobData = {
  ...
  title_source: (project.title_source as ...) ?? 'first_heading',
}

// After — field removed
const jobData: PublishGroupJobData = {
  ...
  // title_source removed
}
```

Also remove `title_source` from the `projects` DB select query:

```ts
// Before
.select('id, org_id, registered_repo, title_source')

// After
.select('id, org_id, registered_repo')
```

---

## Phase 4 — Worker publish processor (`apps/worker/src/processors/publishProcessor.ts`)

Remove `content` from destructured job data, remove any `title_source` usage:

```ts
// Before
const { spec_id, ..., content, path, frontmatter, ... } = job.data

// After
const { spec_id, ..., title, path, frontmatter, ... } = job.data
```

Pass `title` (not `content`) to adapter calls. The spec object passed to adapters becomes:

```ts
const spec = { path, title, frontmatter }   // content dropped
```

---

## Phase 5 — Worker adapters

All three adapters (`notion.ts`, `confluence.ts`, `clickup.ts`) currently call:

```ts
const title = getSpecTitle(spec.path, spec.frontmatter)
```

Since the title is now pre-resolved and stored, replace with:

```ts
const title = spec.title
```

Remove all imports of `getSpecTitle` from adapters once no longer needed.

> `getSpecTitle` in `folderHierarchy.ts` can be kept — it's still the canonical derivation
> logic, just now called once at API ingest instead of per-adapter at publish time.

---

## Phase 6 — CLI (`apps/cli/src/`)

Remove the step that reads file content before building the publish payload.

```ts
// Before — SpecArtifact included content
specs.push({
  path,
  hash,
  frontmatter,
  content: await fs.readFile(absPath, 'utf8'),   // <-- remove
})

// After
specs.push({
  path,
  hash,
  frontmatter,
})
```

This reduces payload size significantly for large spec trees.

---

## Phase 7 — Tests

- Update `apps/web/app/api/publish/__tests__/route.test.ts`:
  - Remove `content` from fixture `SpecArtifact` objects
  - Assert `specs` upsert does NOT include `content`
  - Assert `specs` upsert DOES include derived `title`
  - Assert job data does NOT include `title_source`
  - Assert job `PublishGroupSpec` has `title` not `content`

---

## Open questions

1. **Backfill existing rows** — existing `specs` rows have no title. The migration uses `default ''`. A one-time backfill script deriving titles from `frontmatter`/`path` stored in the DB is optional but recommended for dashboard display.

2. **`frontmatter` column retention** — `frontmatter` is still stored in the DB and remains the source for integration-specific frontmatter mappings (ClickUp task fields, etc.). No change needed there.

3. **Agent processor** — `agentProcessor.ts` also uses `PublishGroupSpec`. Verify it does not depend on `content` from the spec (it reads `raw_content` from a separate `agent_runs` table flow). If it does, that flow is out of scope for this plan and should be addressed separately.
