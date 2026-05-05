# mdspec — Notion Integration Specification
**Publishing Specs as Notion Pages and Database Rows**

---

## 1. Overview

mdspec publishes specs to Notion as child pages nested under a configurable root page. Folder hierarchy in the repo is mirrored as intermediate Notion pages. This spec covers:

- **Page mode** (existing) — each spec is a Notion page under a root page, with folders rendered as parent pages
- **Database mode** (new) — each spec is a row in a Notion **data source** inside a database, enabling table/board/filter views over specs
- Reliability improvements to the page-update path (incremental block updates, content-hash skip)
- A health check on the Connect Notion flow
- Adoption of Notion's **data sources** model (introduced in `Notion-Version: 2025-09-03`)

The agent transformation pipeline is unchanged. The template author controls the page/row output shape via the prompt template, exactly as for other publish targets.

### 1.1 Notion API version

mdspec pins `Notion-Version: 2025-09-03` (or later) on every request. This version introduced the data sources model, where a single Notion **database** now contains one or more **data sources** (the actual tables of rows). Pages are created under a data source, not directly under a database.

| Concern | Pre-2025-09-03 | 2025-09-03 onward |
|---|---|---|
| Create row | `parent.database_id` | `parent.data_source_id` |
| Query rows | `POST /v1/databases/{id}/query` | `POST /v1/data_sources/{id}/query` |
| Retrieve schema | `GET /v1/databases/{id}` | `GET /v1/data_sources/{id}` |

`POST /v1/databases/{id}/query` and `parent.database_id` still work on older API versions but are **legacy** under the pinned header. mdspec uses the new endpoints exclusively.

---

## 2. How the Two Notion Modes Coexist

A Notion integration now has a **mode** field:

| Mode | What happens | Target config |
|---|---|---|
| `page` | Spec published as a child page nested under `root_page_id` | Root page (existing) |
| `database` | Spec published as a row inside a Notion data source | Database ID + resolved Data Source ID (new) |

Both modes can exist simultaneously on different integrations. A single integration maps to **one mode**.

Existing integrations default to `mode = 'page'` and require no migration.

---

## 3. Credentials

```typescript
// apps/worker/src/adapters/notion.ts
export interface NotionCredentials {
  token: string                       // Notion integration token (ntn_… or secret_…)
  root_page_id: string                // Page the integration has access to (page mode)
  mode: 'page' | 'database'           // NEW — default 'page'
  database_id?: string                // NEW — required when mode = 'database' (the container)
  data_source_id?: string             // NEW — required when mode = 'database' (the actual table)
}
```

`integrations.credentials` JSON shape (database mode):

```json
{
  "token": "ntn_...",
  "root_page_id": "abc123",
  "mode": "database",
  "database_id": "def456",
  "data_source_id": "ghi789"
}
```

**Why both IDs?** Under `Notion-Version: 2025-09-03`, the database is a container; rows live on a data source. The user picks the database in the UI, and Connect resolves the underlying data source(s). For a database with a single data source (the common case), the resolved `data_source_id` is stored automatically. For multi-source databases, the user picks one explicitly (see §4.2).

---

## 4. UI — Add Integration Modal

```
Integration type: [ Notion ▼ ]

Integration token: [ ntn_...                       ]
Publish mode:
  ● Pages           Publish each spec as a Notion page
  ○ Database rows   Publish each spec as a row in a database

Root page:          [ paste Notion page ID         ]

(when "Database rows" selected)
Database:           [ paste Notion database ID     ]
Data source:        [ (resolved on Connect) ▼      ]   ← only shown for multi-source DBs

[ Connect Notion ]  [ Cancel ]
```

### 4.1 Health check on Connect

Run during Connect, in this order:

1. **Page mode:** `GET /v1/pages/{root_page_id}` — confirms the token has access to the root page.
2. **Database mode:**
   - `GET /v1/databases/{database_id}` — returns the database object including a `data_sources` array of `{ id, name }`.
   - If the array has exactly one entry, store `data_source_id` automatically.
   - If multiple, return the array to the UI; the user picks one in the second dropdown.
   - Then `GET /v1/data_sources/{data_source_id}` to read schema and confirm the required `Name` (title) and `Content` (rich_text) properties exist.

The integration is only saved when all health-check steps succeed.

All requests use the header `Notion-Version: 2025-09-03`.

### 4.2 Multi-source databases

A Notion database can host multiple data sources (e.g. one DB containing both "Active Specs" and "Archived Specs" tables). mdspec writes to **one** data source per integration. To publish to a second data source on the same database, create a second integration.

---

## 5. Page Mode (existing, enhanced)

### 5.1 Folder hierarchy

Repo folder structure is mirrored as parent pages under `root_page_id`:

```
specs/payments/checkout-retry.md
  → Notion: <root> / specs / payments / Checkout Retry
```

`getAncestorFolders(spec.path)` resolves the folder chain. For each folder, `ensureFolderPage()` looks for an existing child page with that name and creates one if missing. Folder-page IDs are cached per `(integration, folderPath)` for the duration of a worker run.

### 5.2 Create vs Update

```
On publish for a (spec, Notion integration) pair:
  1. Look up spec_publish_targets.external_page_id (stored Notion page ID)
  2. If found and content_hash unchanged → skip entirely (no Notion API call)
  3. If found and content_hash changed → update existing page (see 5.3)
  4. If not found → create new page under resolved folder hierarchy
```

### 5.3 Incremental block update

The current update path deletes all existing blocks and re-appends. This causes flicker and loses any user-added annotations. The enhanced path:

1. Compare `spec_publish_targets.content_hash` against the new spec hash
2. If unchanged: **skip** — no Notion API call at all
3. If changed: delete existing blocks and re-append (current behaviour)

The hash check is the primary win — most "publish" runs touch only a few specs, and unchanged specs incur zero Notion API cost. True line-level block diffing is out of scope for V1.

---

## 6. Database Mode (new)

### 6.1 How it works

When `mode = 'database'`, each spec is published as a **row** in the configured Notion data source:

- The row's `Name` property (title) is set to the spec title (frontmatter `title` → first H1 → filename)
- The row's `Content` property (rich text) is filled by **chunking** the spec body into multiple `rich_text` segments, each ≤ 2000 chars (Notion's per-segment limit). The total property still appears as one continuous string in the Notion UI.
- Full spec content is also appended as **child blocks** on the row's underlying page (same as page mode), since rich_text properties don't render headings, code blocks, lists, etc.
- `external_page_id` stores the Notion page ID of the row (identical shape to page mode)
- `external_url` stores the row's page URL

**Create request shape:**

```json
{
  "parent": { "type": "data_source_id", "data_source_id": "ghi789" },
  "properties": {
    "Name":    { "title":     [{ "text": { "content": "Checkout Retry Policy" } }] },
    "Content": { "rich_text": [
      { "text": { "content": "first 2000 chars…" } },
      { "text": { "content": "next 2000 chars…" } }
    ] }
  },
  "children": [ /* up to 100 blocks; rest appended after create */ ]
}
```

### 6.2 Required data source schema

The configured data source must already contain:

| Property | Type | Required |
|---|---|---|
| `Name` | title | yes |
| `Content` | rich_text | yes |
| `Folder` | rich_text | optional (see §6.3) |

mdspec does **not** create or modify schemas. Connect-time validation reads the data source's properties via `GET /v1/data_sources/{data_source_id}` and rejects the integration if either required property is missing or has the wrong type.

### 6.3 Folder hierarchy in database mode

Folder hierarchy is **not** rendered as parent pages in database mode (database rows have a flat structure). Instead, the folder path is stored on the row in an optional `Folder` rich_text property if the database has one. If no `Folder` property exists, folder context is dropped.

### 6.4 Create vs Update

```
On publish for a (spec, Notion DB integration) pair:
  1. Look up spec_publish_targets.external_page_id (stored row page ID)
  2. If found and content_hash unchanged → skip
  3. If found and content_hash changed:
       PATCH /v1/pages/{page_id}    (update Name, Content, Folder)
       Replace child blocks         (delete then append in chunks of 100)
  4. If not found:
       POST  /v1/pages              (parent.data_source_id)
       Append remaining blocks      (chunks of 100)
```

All requests pin `Notion-Version: 2025-09-03`. The `children` array on create is capped at **100 blocks**; remaining blocks go through `PATCH /v1/blocks/{page_id}/children` in 100-block batches. Total payload is also capped at 1000 block elements / 500KB per request — the adapter chunks accordingly.

---

## 7. Adapter Signature

```typescript
// apps/worker/src/adapters/notion.ts
export async function publishToNotion(
  credentials: NotionCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingPageId?: string | null
): Promise<{ page_id: string; page_url: string }>
```

Signature is unchanged. The adapter branches internally on `credentials.mode`:

```typescript
if (credentials.mode === 'database') {
  return publishAsDatabaseRow(notion, credentials, spec, existingPageId)
}
return publishAsPage(notion, credentials, spec, existingPageId)
```

---

## 8. Worker Dispatch

No changes to dispatch. The Notion branch in `processOneSpec` already calls `publishToNotion(creds, spec, existingPageId)`. All mode logic is internal to the adapter.

The content-hash skip (§5.3) executes inside the adapter, so the worker still records a successful publish target row — the skip is invisible to the caller.

---

## 9. Database Schema

No changes to `folder_mappings` or `spec_publish_targets`.

- `external_page_id` stores the Notion page ID (page mode) or row page ID (database mode)
- `external_url` stores the human-accessible Notion URL in both modes
- `content_hash` is already stored and is the basis for the skip check

---

## 10. Folder Mappings UI

```
┌──────────────────┬────────────────────────────────────┬──────────────────────┐
│ Folder           │ Integrations                       │ Agent Template       │
├──────────────────┼────────────────────────────────────┼──────────────────────┤
│ specs/payments/  │ ● Notion        [ + ]              │ Task Template [ ▼ ] │
│ docs/onboarding/ │ ● Notion [db]   [ + ]              │ Onboarding    [ ▼ ] │
└──────────────────┴────────────────────────────────────┴──────────────────────┘
```

Badge: `[db]` when the integration is in database mode; no badge in page mode.

---

## 11. Publish Flow

```
CI triggers mdspec publish
  └─ POST /api/publish → 202 Accepted

QStash Worker
  └─ For each (Notion integration, folder) group:
        └─ Resolve agent template (unchanged)
        └─ If agent assigned: run transform → final content
        └─ Compute content_hash

        publishToNotion(creds, spec, existingPageId)
          └─ If existingPageId AND content_hash unchanged → skip, return stored IDs
          └─ Branch on credentials.mode:

              page mode:
                └─ Ensure folder hierarchy under root_page_id
                └─ Create page or update existing (delete blocks → re-append)

              database mode:
                └─ Create row (POST /v1/pages with parent.data_source_id)
                  or update row (PATCH /v1/pages/{id} + replace child blocks)

        └─ Store page_id, page_url, content_hash
```

---

## 12. Activity Feed

```
specs/payments/checkout-retry.md
  ✓ Agent: Task Template applied              190ms
  ✓ Published → Notion                        [ Open page ↗ ]

docs/onboarding/setup-guide.md
  ✓ Agent: Onboarding Doc Template applied    220ms
  ✓ Published → Notion database               [ Open row ↗ ]

specs/payments/refund-flow.md
  ⊝ Notion: skipped (content unchanged)
```

---

## 13. V1 Scope Constraints

- **API version pin.** mdspec sends `Notion-Version: 2025-09-03` on every request. Older API versions and the legacy `parent.database_id` / `databases.query` paths are not used.
- **Database mode requires a pre-existing database with at least one data source.** mdspec does not create databases or data sources.
- **Required properties (`Name`, `Content`) must exist with the correct types** on the resolved data source. Connect-time validation rejects mismatches.
- **Multi-source databases require an explicit data source pick at Connect time.** A given integration writes to exactly one data source.
- **Folder hierarchy is page-mode only.** In database mode, the folder path is stored on an optional `Folder` rich_text property if present, otherwise dropped.
- **Incremental block diff is hash-based (skip or full replace).** True line-level block diffing is out of scope.
- **`Content` rich_text is chunked into ≤2000-char segments** (Notion's per-segment limit). Full structured content is always available on the row's child blocks.
- **Append batches respect Notion limits:** ≤100 blocks per request, ≤1000 block elements and ≤500KB per payload.
- **No deletion.** Deleting a spec file does not delete the Notion page or row.
- **Page-level archive is not exposed.** Use the Notion UI to archive stale pages.

---

*End of Notion Integration Specification — mdspec V1*
