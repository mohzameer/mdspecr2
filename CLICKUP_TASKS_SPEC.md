# mdspec — ClickUp Task List Sync Specification
**Publishing Specs as ClickUp Tasks inside Lists**

---

## 1. Overview

Today mdspec publishes specs to ClickUp as **Docs** (pages inside a shared document). This spec adds a second ClickUp publish mode: **Task List**, where specs are published as **Tasks inside a ClickUp List**.

This enables teams who manage work in ClickUp tasks — rather than docs — to keep their specs and tasks in sync. The typical workflow is:

1. A task already exists in ClickUp (created by the team before writing the spec)
2. The engineer writes the spec and puts the task ID in frontmatter once to link it
3. Every subsequent publish updates that task — no further frontmatter management needed
4. For new specs with no existing task, mdspec creates the task automatically and tracks the ID

The agent transformation pipeline is unchanged. The template author controls the task output shape (title, description, and any structured fields) via the prompt template, exactly as for doc publishing today.

---

## 2. How the Two ClickUp Modes Coexist

A folder mapping for a ClickUp integration now has a **mode** field:

| Mode | What happens | Target config |
|---|---|---|
| `doc` | Spec published as a page in a ClickUp Doc | Space or folder picker (existing) |
| `task_list` | Spec published as a task in a ClickUp List | Space → List picker (new) |

Both modes can exist simultaneously on different folder mappings, even pointing to the same integration. A single folder maps to **one mode** per integration.

---

## 3. UI Changes — Folder Mappings Tab

### 3.1 Integration Picker — Adding a ClickUp Mapping

When a user adds a ClickUp integration to a folder, they now see a mode selector before the target picker:

```
Add integration for specs/payments/

Integration:  [ ClickUp ▼ ]

Publish mode:
  ○ Doc          Publish specs as pages in a ClickUp Doc
  ● Task List    Publish specs as tasks in a ClickUp List

Target List:
  Space:  [ Engineering ▼ ]
  List:   [ Sprint Backlog ▼ ]

[ Add ]  [ Cancel ]
```

- **Doc mode** shows the existing space/folder picker (unchanged)
- **Task List mode** shows a chained Space → List picker
  - Space dropdown loads from existing `GET /api/integrations/{id}/clickup-targets`
  - List dropdown loads lazily after a space is selected (new endpoint)
  - Both are required before saving

### 3.2 Folder Mappings Table

The Integrations column shows the mode badge alongside the integration name:

```
┌──────────────────┬─────────────────────────────────────────┬──────────────────────┐
│ Folder           │ Integrations                            │ Agent Template       │
├──────────────────┼─────────────────────────────────────────┼──────────────────────┤
│ payments/        │ ● Notion  ● ClickUp [doc]  [ + ]        │ Task Template [ ▼ ] │
│ auth/            │ ● ClickUp [task list]  [ + ]            │ Task Template [ ▼ ] │
│ infrastructure/  │ ● Confluence  [ + ]                     │ RFC Template  [ ▼ ] │
└──────────────────┴─────────────────────────────────────────┴──────────────────────┘
```

Hovering over `[task list]` shows a tooltip: `Sprint Backlog · Engineering space`.

---

## 4. Frontmatter — Adopting an Existing Task

Since the typical dev workflow creates the task in ClickUp **before** the spec is written, a single frontmatter field allows the user to link the spec to the pre-existing task:

```yaml
---
title: Checkout Retry Policy
clickup_task_id: abc123xyz
---
```

**Behaviour:**

- On first publish, mdspec finds `clickup_task_id` in frontmatter and writes that ID into `spec_publish_targets.external_page_id`
- From that point on, every publish updates the task using the stored ID — no frontmatter lookup needed again
- If the frontmatter field is later removed or the spec is republished without it, the stored ID is already in the DB and the update still works
- If the task ID in frontmatter does not exist in ClickUp, mdspec creates a new task and stores the returned ID (graceful fallback, no error)

**No other frontmatter is required.** All task field content (title, description, priority, status, etc.) comes from the agent template output.

---

## 5. Create vs Update Logic

The spec file path is the stable key. `spec_publish_targets` already has a unique constraint on `(spec_id, integration_id)`, and `spec_id` maps 1:1 to a file path. This means:

```
On publish for a (spec, integration) pair:
  1. Look up spec_publish_targets.external_page_id
  2. If found → call updateTask(task_id, ...)
  3. If not found AND frontmatter has clickup_task_id → store it, call updateTask(...)
  4. If not found AND no frontmatter → call createTask(...), store returned task_id
```

No user action needed for the ongoing create/update cycle. The user only touches frontmatter once (step 3) when linking to a pre-existing task.

**Stale ID handling:** Before updating, if the ClickUp API returns 404 for the stored task ID, mdspec treats it as not found and creates a new task, storing the new ID. This mirrors the existing doc-mode behaviour.

---

## 6. Agent Template Output for Tasks

The agent pipeline is unchanged. The template author writes instructions that produce structured output, and the worker uses that output to populate the task. A task-oriented template would typically output:

```markdown
## Title
Checkout Retry Policy — add exponential backoff

## Description
[full spec content, transformed and enriched]

## Priority
high

## Status
to do
```

The task adapter parses these sections from the LLM output to map to ClickUp task fields. The exact section names and mapping are defined by the adapter (see §8.3). Templates do not need to know about field names — the adapter handles extraction.

If no agent template is assigned, the raw spec markdown is used as the task description and the spec filename as the title.

---

## 7. New API Endpoint — ClickUp Lists

**GET `/api/integrations/[integrationId]/clickup-lists`**

Query params:
- `space_id` — required, the ClickUp space ID (without prefix)

Returns the lists directly inside a space (not inside folders, for simplicity in V1):

```json
{
  "lists": [
    { "id": "12345", "name": "Sprint Backlog" },
    { "id": "12346", "name": "Icebox" },
    { "id": "12347", "name": "Bug Triage" }
  ]
}
```

Calls ClickUp API v2:
```
GET https://api.clickup.com/api/v2/space/{space_id}/list?archived=false
```

Auth and error handling follow the same pattern as the existing `clickup-targets` route.

---

## 8. Database Changes

### 8.1 `folder_mappings` — new columns

```sql
-- Mode for this folder → integration mapping
alter table folder_mappings
  add column clickup_mode text check (clickup_mode in ('doc', 'task_list')) default 'doc';

-- ClickUp List ID when mode is 'task_list'
alter table folder_mappings
  add column clickup_list_id text;
```

`clickup_mode` is only relevant when `target_type = 'clickup'`. For all other integrations it is null/ignored.

`clickup_list_id` stores the bare ClickUp list ID (e.g. `"12345"`), without any prefix.

### 8.2 `spec_publish_targets` — no changes

`external_page_id` already stores the ClickUp ID — it will store the task ID when mode is `task_list`, the same as it stores the doc/page ID today.

### 8.3 Task field mapping (adapter internal)

The adapter parses the LLM output markdown and extracts known headings. Fields not present in the output fall back to defaults:

| Markdown heading | ClickUp task field | Default if absent |
|---|---|---|
| `## Title` | `name` | Spec filename |
| `## Description` | `description` | Full content |
| `## Priority` | `priority` | none |
| `## Status` | `status` | List default |
| `## Due Date` | `due_date` | none |
| `## Tags` | `tags` | none |

---

## 9. Worker / Adapter Changes

### 9.1 Group Context

`setupClickupGroupContext` reads the new `clickup_mode` and `clickup_list_id` from the folder mapping and adds them to the context:

```typescript
interface GroupContext {
  // ... existing fields ...
  clickupMode: 'doc' | 'task_list'   // new
  clickupListId: string | null        // new — only set when clickupMode = 'task_list'
}
```

### 9.2 Dispatch

In `processOneSpec`, the existing ClickUp dispatch block gains a third branch:

```typescript
case 'clickup':
  if (ctx.clickupMode === 'task_list') {
    result = await publishAsTask(
      clickupCreds,
      specPayload,
      existingPageId,      // stored task ID, or null
      ctx.clickupListId    // required — the target list
    )
  } else if (ctx.isMultiMode && ctx.groupFolderName) {
    // existing multi-mode (doc pages)
    result = await publishSpecAsPage(...)
  } else {
    // existing single-mode (standalone doc)
    result = await publishSingleSpec(...)
  }
```

### 9.3 New adapter function: `publishAsTask`

**File:** `apps/web/lib/publish/adapters/clickup.ts`

```typescript
export async function publishAsTask(
  credentials: ClickUpCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingTaskId: string | null,
  listId: string
): Promise<{ task_id: string; task_url: string }>
```

**Logic:**
1. Parse task fields from spec content (title, description, priority, status, tags, due_date)
2. If `existingTaskId`:
   - `PUT /api/v2/task/{task_id}` with parsed fields
   - On 404: fall through to create
3. If no `existingTaskId` or 404:
   - `POST /api/v2/list/{list_id}/task` with parsed fields
   - Return `{ task_id, task_url }`

**ClickUp task API endpoints used:**
```
POST  https://api.clickup.com/api/v2/list/{list_id}/task
PUT   https://api.clickup.com/api/v2/task/{task_id}
```

### 9.4 `clickup_task_id` frontmatter adoption

In `processOneSpec`, before the existing "fetch current publish target state" step, add:

```typescript
// Adopt existing task ID from frontmatter (one-time link)
if (target_type === 'clickup' && !existingTaskId) {
  const frontmatterTaskId = spec.frontmatter?.clickup_task_id
  if (typeof frontmatterTaskId === 'string' && frontmatterTaskId.length > 0) {
    existingPageId = frontmatterTaskId
    // Persist immediately so future publishes use DB lookup
    await supabase
      .from('spec_publish_targets')
      .update({ external_page_id: frontmatterTaskId })
      .eq('id', spec_publish_target_id)
  }
}
```

---

## 10. Publish Flow — Task List Mode

```
CI triggers mdspec publish
  └─ CLI detects changed specs
  └─ POST /api/publish → 202 Accepted

QStash Worker
  └─ setupClickupGroupContext
        └─ reads clickup_mode = 'task_list', clickup_list_id from folder_mappings
  └─ For each spec:
        └─ Resolve agent template (unchanged)
        └─ If agent assigned: run transform → structured task content
        └─ Check spec_publish_targets for existing task ID
        └─ If none: check frontmatter for clickup_task_id → adopt if present
        └─ publishAsTask(credentials, spec, existingTaskId, listId)
              └─ If existingTaskId → PUT /api/v2/task/{id}   (update)
              └─ If none → POST /api/v2/list/{list_id}/task  (create)
        └─ Store returned task_id in spec_publish_targets.external_page_id
        └─ Update status, external_url, published_at
```

---

## 11. Activity Feed — Task Mode Entries

```
specs/auth/sso-setup.md
  ✓ Agent: Task Template applied        180ms
  ✓ Published → ClickUp task (Sprint Backlog)   [ Open task ↗ ]

specs/payments/checkout-retry.md
  ✓ Agent: Task Template applied        210ms
  ✓ Updated → ClickUp task (Sprint Backlog)     [ Open task ↗ ]
```

"Published" is shown on first create; "Updated" on subsequent syncs.

---

## 12. V1 Scope Constraints

- **Lists directly inside a space only.** Lists inside folders are not surfaced in the list picker in V1. This keeps the API call simple and covers the common case.
- **One list per folder mapping.** A folder maps to exactly one list. To publish to multiple lists, create multiple mappings.
- **No custom field mapping.** ClickUp custom fields are not targeted in V1. Only native task fields (name, description, priority, status, tags, due_date) are written.
- **No task deletion.** Deleting a spec file does not delete the ClickUp task. The task is orphaned in ClickUp. Deletion is out of scope for V1.
- **No sub-tasks.** All tasks are created at the top level of the list.

---

*End of ClickUp Task List Sync Specification — mdspec V1*
