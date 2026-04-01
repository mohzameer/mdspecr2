# mdspec Map Page — Build Plan

**Based on:** MAP_SPEC.md + full codebase audit

---

## Architecture Decisions

1. **`/api/publish` stays thin.** Folder mapping resolution happens in the worker (`publishProcessor`), not the API route. The route stores specs and enqueues jobs as today.

2. **`agentProcessor` is fully replaced.** The placeholder switch/case is discarded. The new processor implements the real LLM pipeline from spec section 5.5.

3. **LLM client uses the `openai` npm package** (OpenAI-API-compatible). Add it to `apps/worker`. Model is configurable via env var, defaulting to `gpt-4o-mini`.

4. **Templates and FolderMappings are project-scoped.** RLS mirrors the existing `specs` / `project_members` pattern: org members can read, only org/project admins can write.

5. **Map Page is a Server Component shell with Client Component islands** for interactive dropdowns and the template editor — same pattern as `settings/general/page.tsx`.

6. **No new queue.** The existing `agentsQueue` carries `RunAgentJobData`. The type is extended, not replaced.

7. **Folder mapping resolution is a worker utility** (`resolveFolderMapping.ts`) called by `publishProcessor` before deciding what to enqueue. The publish route stays stateless.

---

## Critical Path

```
Phase 1 (DB) → Phase 2 (Types) → Phase 3 (Templates API) ──┐
                                → Phase 4 (Folder Mappings API) ──┤
                                                               Phase 5 (Map Page UI)
                                                               Phase 6 (Agent Pipeline)
                                                               Phase 7 (Publish Flow)
                                                               Phase 8 (CLI)
                                                               Phase 9 (Sidebar + Activity)
```

- Phases 3 and 4 can be built in parallel once Phase 2 is done.
- Phase 5 depends on Phases 3 and 4.
- Phase 6 depends on Phase 2.
- Phase 7 depends on Phases 4 and 6.
- Phase 8 is independent — can run any time after Phase 2.
- Phase 9 is additive — can be threaded in after Phase 6 is running.

---

## Phase 1 — Database Migration

**File to create:** `supabase/migrations/20240103000000_map_page_tables.sql`

### Tables

**`templates`**
```sql
id              uuid primary key default gen_random_uuid()
project_id      uuid references projects(id) on delete cascade
name            text not null
description     text
instructions    text not null check (char_length(instructions) <= 4000)
is_default      boolean default false
created_by      uuid references auth.users(id)
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

**`folder_mappings`**
```sql
id              uuid primary key default gen_random_uuid()
project_id      uuid references projects(id) on delete cascade
folder_path     text not null
integration_id  uuid references integrations(id) on delete cascade
template_id     uuid references templates(id) on delete set null
created_at      timestamptz default now()
updated_at      timestamptz default now()

unique(project_id, folder_path, integration_id)
```

**`agent_runs`**
```sql
id                   uuid primary key default gen_random_uuid()
spec_id              uuid references specs(id) on delete cascade
template_id          uuid references templates(id) on delete set null
trigger              text not null check (trigger in ('folder_mapping', 'frontmatter'))
raw_content          text not null
transformed_content  text
status               text not null check (status in ('queued','running','completed','failed'))
error                text
duration_ms          int
created_at           timestamptz default now()
completed_at         timestamptz
```

### RLS Policies

- `templates` and `folder_mappings`: `select` for org members; `insert/update/delete` for org admin/owner or project admin.
- `agent_runs`: `select` for org members; writes are service-role only (worker bypasses RLS).

### Seed Trigger

Add a Postgres function `handle_new_project_templates()` with a trigger `on_project_created` on the `projects` table. When a project is created, insert the default Task Template row (`is_default = true`) using the instruction text from MAP_SPEC.md section 5.3. This ensures every project has the Task Template without any application-layer seeding.

### Indexes
```sql
idx_templates_project_id          on templates(project_id)
idx_folder_mappings_project_id    on folder_mappings(project_id)
idx_folder_mappings_lookup        on folder_mappings(project_id, folder_path)
idx_agent_runs_spec_id            on agent_runs(spec_id)
idx_agent_runs_status             on agent_runs(status)
```

---

## Phase 2 — Shared Types

**File to modify:** `apps/web/lib/types.ts`

### Replace `RunAgentJobData`

Remove the old `template: 'full_publish' | 'task_summary' | 'release_notes'` union. New shape:

```typescript
export interface RunAgentJobData {
  spec_id: string
  spec_publish_target_id: string   // forward through so agent can re-enqueue correct publish job
  integration_id: string
  project_id: string
  template_id: string
  trigger: 'folder_mapping' | 'frontmatter'
  raw_content: string              // avoids a re-fetch in the worker
  target_integration_type: IntegrationType
  agent_run_id: string             // pre-created agent_runs row UUID
}
```

### Add new DB row types

```typescript
export interface Template {
  id: string
  project_id: string
  name: string
  description: string | null
  instructions: string
  is_default: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface FolderMapping {
  id: string
  project_id: string
  folder_path: string
  integration_id: string
  template_id: string | null
  created_at: string
  updated_at: string
}

export interface AgentRun {
  id: string
  spec_id: string
  template_id: string
  trigger: 'folder_mapping' | 'frontmatter'
  raw_content: string
  transformed_content: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  error: string | null
  duration_ms: number | null
  created_at: string
  completed_at: string | null
}
```

Remove `TaskSummaryJobData` from the `JobData` union — superseded by the new `RunAgentJobData`.

> **Note:** The worker re-declares job data types locally (it doesn't import from the web package). Keep the local definitions in `agentProcessor.ts` in sync with these manually. A shared `packages/types` workspace can be extracted post-V1.

---

## Phase 3 — Templates API

### Files to create

**`apps/web/app/api/projects/[projectId]/templates/route.ts`**

- `GET` — list all templates for the project, ordered by `is_default desc, created_at asc`. Include a `folder_count` derived from `folder_mappings` grouped by `template_id` (needed for the "Used in folders" column in the UI).
- `POST` — create template. Auth: org admin/owner or project admin. Validate `name` (required), `instructions` (required, ≤ 4000 chars). Insert with `is_default: false`, `created_by: user.id`.

**`apps/web/app/api/projects/[projectId]/templates/[templateId]/route.ts`**

- `PATCH` — update `name`, `description`, `instructions`. Allow editing even if `is_default = true`. Reject attempts to set `is_default = false` (ignore or return 400).
- `DELETE` — reject with 409 if `is_default = true`. The FK `on delete set null` on `folder_mappings.template_id` handles cleanup of any references automatically.

---

## Phase 4 — Folder Mappings API

### Files to create

**`apps/web/app/api/projects/[projectId]/folder-mappings/route.ts`**

- `GET` — returns a combined shape:
  ```typescript
  {
    mappings: FolderMapping[],           // joined with integration type/config
    available_integrations: Integration[], // connected integrations for this org
    templates: Template[]                 // all project templates
  }
  ```
  The UI needs all three to render the page without secondary fetches.

- `POST` — create/upsert a mapping. Body: `{ folder_path, integration_id, template_id? }`.
  - Validate `folder_path` is non-empty and does not contain `..`.
  - Validate `integration_id` belongs to the project's org and has `status = 'connected'`.
  - Upsert on `(project_id, folder_path, integration_id)`.

**`apps/web/app/api/projects/[projectId]/folder-mappings/[mappingId]/route.ts`**

- `PATCH` — update `template_id` only (null = remove agent assignment).
- `DELETE` — verify `project_id` matches before deleting.

---

## Phase 5 — Map Page UI

### Files to create

| File | Type | Purpose |
|---|---|---|
| `apps/web/app/(dashboard)/projects/[projectId]/map/page.tsx` | Server Component | Auth check, initial data fetch, renders `<MapPageClient>` |
| `apps/web/app/(dashboard)/projects/[projectId]/map/MapPageClient.tsx` | Client Component | Tab state, passes data to tab panels |
| `apps/web/app/(dashboard)/projects/[projectId]/map/FolderMappingsTab.tsx` | Client Component | Folder table with integration picker and agent dropdown |
| `apps/web/app/(dashboard)/projects/[projectId]/map/TemplatesTab.tsx` | Client Component | Template list with new/edit/delete/clone actions |
| `apps/web/app/(dashboard)/projects/[projectId]/map/TemplateEditor.tsx` | Client Component | Free-form textarea with pool item click-to-insert |

### `page.tsx`

- Use `createSupabaseServerClient()` + `getUser()`.
- Fetch project name and user role.
- Call `GET /api/projects/[projectId]/folder-mappings` for the combined data payload.
- Pass `initialData` and `canEdit: boolean` to `<MapPageClient>`.

### `MapPageClient.tsx`

- Uses the existing `<Tabs>` component from `components/ui/tabs.tsx`.
- Two `<TabsContent>` panels: `folder-mappings` and `templates`.
- Holds local state for optimistic UI after mutations; calls `router.refresh()` to rehydrate from server after each mutation settles.

### `FolderMappingsTab.tsx`

- Groups mappings by `folder_path`, then by spec directory prefix (from `project.spec_dirs: text[]`).
- "Agent Template" column uses a `<Select>` styled to match existing UI — options: `None` + all project templates.
- "+ Add" integration button opens a `<Dialog>` with the integration picker (integration type dropdown + target page/space picker).
- Each integration pill shows type name; clicking × removes the mapping.
- On mutation: call API, update local state optimistically, `router.refresh()`.

### `TemplatesTab.tsx`

- Table: Name | Used in folders | Actions.
- Default template row shows `[Clone]` only.
- User templates show `[Edit] [Delete]`.
- "New Template" / "Clone" / "Edit" all open `<TemplateEditor>` in a `<Dialog>`.

### `TemplateEditor.tsx`

- `<textarea>` with character counter (4000 max).
- Static `POOL_ITEMS` constant array with all 9 items from MAP_SPEC.md section 5.2.
- Clicking a pool item button inserts `{{pool_item_id}}` at current cursor position using `selectionStart`/`selectionEnd` — no rich-text library needed.
- Save calls `POST` (new) or `PATCH` (edit) on the templates API.

---

## Phase 6 — Agent Transformation Pipeline

### Files to create

| File | Purpose |
|---|---|
| `apps/worker/src/lib/poolItems.ts` | Static map of pool item IDs → descriptions (from MAP_SPEC.md section 5.2) |
| `apps/worker/src/lib/promptBuilder.ts` | Assembles final prompt from template instructions + spec content |
| `apps/worker/src/lib/llmClient.ts` | Thin wrapper around `openai` npm package |
| `apps/worker/src/lib/queue.ts` | Local worker queue definitions (mirrors `apps/web/lib/queue.ts`) |

### Files to modify

`apps/worker/src/processors/agentProcessor.ts` — full replacement.

### New dependency

Add `openai` (^4.x) to `apps/worker/package.json`.

### `poolItems.ts`

```typescript
export const POOL_ITEMS: Record<string, { id: string; label: string; description: string }> = {
  acceptance_criteria: { ... },
  non_functional_requirements: { ... },
  // ... all 9 items from MAP_SPEC.md section 5.2
}
```

### `promptBuilder.ts`

```typescript
export function buildPrompt(
  templateInstructions: string,
  specContent: string,
  targetIntegration: string
): string
```

- Replace `{{pool_item_id}}` tokens with the description from `POOL_ITEMS`.
- Replace `{{target_integration}}` with the integration type string.
- Append raw spec content with a delimiter.

### `llmClient.ts`

```typescript
export async function callLLM(prompt: string): Promise<string>
```

- Initialise `openai` with `process.env.OPENAI_API_KEY` and optionally `OPENAI_BASE_URL`.
- Model: `process.env.OPENAI_MODEL ?? 'gpt-4o-mini'`.
- Returns first choice content.
- Throws on timeout (30s limit) or API error — BullMQ handles retry.

### New `agentProcessor.ts` flow

```
1. Receive RunAgentJobData
2. Mark agent_runs row: status = 'running'
3. Fetch template.instructions from DB
4. buildPrompt(instructions, raw_content, target_integration_type)
5. Start timer
6. callLLM(prompt)  — may throw → BullMQ retries
7. Record duration_ms
8. Update agent_runs: status='completed', transformed_content, duration_ms, completed_at
9. Enqueue publishQueue job with transformed content
   — carry spec_publish_target_id + integration_id from RunAgentJobData
10. On error: update agent_runs: status='failed', error, completed_at; re-throw
```

### New env vars (Railway worker)

```
OPENAI_API_KEY=<key>
OPENAI_MODEL=gpt-4o-mini     # optional
OPENAI_BASE_URL=             # optional, for compatible APIs
```

---

## Phase 7 — Publish Flow Update

### New file

**`apps/worker/src/lib/resolveFolderMapping.ts`**

```typescript
interface MappingResolution {
  shouldRunAgent: boolean
  templateId: string | null
  trigger: 'folder_mapping' | 'frontmatter' | null
}

async function resolveFolderMapping(
  supabase: SupabaseClient,
  projectId: string,
  specPath: string,
  frontmatter: Record<string, unknown>
): Promise<MappingResolution>
```

**Resolution order (MAP_SPEC.md section 4.2):**
1. `frontmatter.mdspec_no_agent === true` → `{ shouldRunAgent: false }`
2. `frontmatter.mdspec_agent` is a non-empty string → `{ shouldRunAgent: true, templateId: value, trigger: 'frontmatter' }`
3. Query `folder_mappings` for project. Walk spec path from most-specific ancestor to root using `getAncestorFolders()` (already in `folderHierarchy.ts`). Return first match with non-null `template_id`.
4. No match → `{ shouldRunAgent: false, templateId: null, trigger: null }`

### Modify `apps/worker/src/processors/publishProcessor.ts`

Add a pre-step at the top of the processor (after fetching the integration, before calling the adapter):

```
resolution = await resolveFolderMapping(supabase, project_id, path, frontmatter)

if (resolution.shouldRunAgent) {
  // Insert agent_runs row (status='queued')
  // Enqueue agentsQueue job with RunAgentJobData
  //   — carry spec_publish_target_id + integration_id so agent can re-enqueue the correct publish job
  return  // skip adapter call — agent processor will re-enqueue publish after transformation
}
// else: fall through to existing adapter logic unchanged
```

This is the only change to `publishProcessor.ts`. All existing publish logic is untouched.

---

## Phase 8 — CLI Frontmatter Extensions

**File to audit/modify:** `apps/cli/src/commands/publish.ts`

The CLI already forwards all frontmatter keys to the API — no structural change needed. Two minor additions:

1. **Validation warnings** in `buildSpecArtifact`: warn if `mdspec_agent` is present but not a string; warn if `mdspec_no_agent` is present but not a boolean. Non-blocking — do not throw.
2. Follow the existing `mdspec_id` validation pattern at line 269–273.

---

## Phase 9 — Sidebar + Activity Feed

### 9a — Sidebar

**File to modify:** `apps/web/components/Sidebar.tsx`

When the active project is detected (`pathname.startsWith(/projects/${project.id})`), render sub-nav links beneath the project name:
- Specs → `/projects/${project.id}/specs`
- Map → `/projects/${project.id}/map`
- Activity → `/projects/${project.id}/activity`
- Settings → `/projects/${project.id}/settings`

Only render sub-items for the active project.

### 9b — Activity Feed

**Files to modify:**
- `apps/web/components/ActivityFeed.tsx`
- `apps/web/app/(dashboard)/projects/[projectId]/activity/page.tsx`

Extend the data fetch to also query `agent_runs` joined with `specs` for the project. Merge by `spec_id` in the component so each spec shows agent status alongside publish status:

```
specs/payments/checkout-retry.md
  ✓ Agent: Task Template applied   230ms
  ✓ Published → Notion (payments-docs)
  ✓ Published → ClickUp (space_xyz)

specs/auth/sso-setup.md
  — No agent configured
  ✓ Published → Notion (eng-wiki)

specs/infrastructure/db-schema.md
  ✗ Agent: RFC Template failed (LLM timeout)
  — Publish skipped (agent required)
```

Extend the Realtime subscription in `ActivityFeed.tsx` to listen on `postgres_changes` for the `agent_runs` table in addition to `spec_publish_targets`.

---

## File Manifest

| Phase | Action | Path |
|---|---|---|
| 1 | CREATE | `supabase/migrations/20240103000000_map_page_tables.sql` |
| 2 | MODIFY | `apps/web/lib/types.ts` |
| 3 | CREATE | `apps/web/app/api/projects/[projectId]/templates/route.ts` |
| 3 | CREATE | `apps/web/app/api/projects/[projectId]/templates/[templateId]/route.ts` |
| 4 | CREATE | `apps/web/app/api/projects/[projectId]/folder-mappings/route.ts` |
| 4 | CREATE | `apps/web/app/api/projects/[projectId]/folder-mappings/[mappingId]/route.ts` |
| 5 | CREATE | `apps/web/app/(dashboard)/projects/[projectId]/map/page.tsx` |
| 5 | CREATE | `apps/web/app/(dashboard)/projects/[projectId]/map/MapPageClient.tsx` |
| 5 | CREATE | `apps/web/app/(dashboard)/projects/[projectId]/map/FolderMappingsTab.tsx` |
| 5 | CREATE | `apps/web/app/(dashboard)/projects/[projectId]/map/TemplatesTab.tsx` |
| 5 | CREATE | `apps/web/app/(dashboard)/projects/[projectId]/map/TemplateEditor.tsx` |
| 6 | MODIFY | `apps/worker/src/processors/agentProcessor.ts` |
| 6 | CREATE | `apps/worker/src/lib/llmClient.ts` |
| 6 | CREATE | `apps/worker/src/lib/promptBuilder.ts` |
| 6 | CREATE | `apps/worker/src/lib/poolItems.ts` |
| 6 | CREATE | `apps/worker/src/lib/queue.ts` |
| 7 | CREATE | `apps/worker/src/lib/resolveFolderMapping.ts` |
| 7 | MODIFY | `apps/worker/src/processors/publishProcessor.ts` |
| 8 | MODIFY | `apps/cli/src/commands/publish.ts` |
| 9 | MODIFY | `apps/web/components/Sidebar.tsx` |
| 9 | MODIFY | `apps/web/components/ActivityFeed.tsx` |
| 9 | MODIFY | `apps/web/app/(dashboard)/projects/[projectId]/activity/page.tsx` |

**Total: 11 new files, 7 modified files, 1 new migration.**

---

## Risks and Mitigations

**LLM timeout holding a BullMQ worker slot**
Set a 30s timeout on the `openai` call. Catch `APIConnectionTimeoutError`, mark `agent_runs` as `failed`, re-throw for BullMQ retry. The queue already has `attempts: 3` with exponential backoff.

**Mapping resolution DB query on every publish job**
The `idx_folder_mappings_lookup` index on `(project_id, folder_path)` makes this a fast index scan. Acceptable for V1; caching can be added later.

**Agent re-enqueuing publish for the wrong integration**
`RunAgentJobData` carries `spec_publish_target_id` and `integration_id`. The agent processor must forward these exactly so the downstream publish job updates the correct row and targets the correct integration — not all integrations.

**Missing default template on old projects**
Projects created before the migration will have no `is_default = true` template. The Map Page must handle an empty template list gracefully. A backfill script can be added to the migration for existing projects.

**is_default protection**
The `DELETE` route checks `is_default = true` and returns 409. The `PATCH` route ignores or rejects any attempt to set `is_default = false`.
