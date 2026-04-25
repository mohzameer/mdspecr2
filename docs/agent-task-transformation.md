# Agent Task Transformation Pipeline

How a markdown spec file becomes a ClickUp task via the agent.

---

## Overview

```
.mdspecmap (agent: Task Template - 1)
        │
        ▼
   CLI publishes spec
        │
        ▼
  /api/publish  ──► saves spec to DB, enqueues worker job
        │
        ▼
  Worker picks up job
        │
        ▼
  resolveFolderMapping()  ──► finds template_id from folder_mappings DB row
        │
        ▼
  runAgentInline()  ──► fetches template instructions, builds prompt, calls LLM
        │
        ▼
  LLM output (transformed markdown)  ──► replaces raw spec content
        │
        ▼
  parseTaskFields()  ──► extracts ## title / ## description / ## priority etc.
        │
        ▼
  publishAsTask()  ──► creates or updates ClickUp task via API
```

---

## Step 1 — CLI reads `.mdspecmap` and publishes

The `.mdspecmap` in `src/hooks/` declares:

```yaml
mappings:
  - integration: clickup
    target: task
    list_id: id:901817533430
    agent: Task Template - 1
```

The CLI discovers this file, resolves the scope to `src/hooks`, and sends the spec
content + full config to `POST /api/publish`.

---

## Step 2 — `/api/publish` saves the spec and enqueues a job

- Upserts the spec row into the `specs` table
- Matches the spec path against config mappings using longest-prefix — `src/hooks/INFO7.md`
  matches the `src/hooks` mapping
- Creates a `spec_publish_targets` row with `status: queued`
- Enqueues a QStash job with the spec content, integration ID, list ID, and target type

---

## Step 3 — Worker resolves the folder mapping

`resolveFolderMapping()` queries the `folder_mappings` table for the project + spec path.
It walks ancestor folders from most-specific to root and finds the first row with a
`template_id` set.

```
src/hooks/INFO7.md
  → check folder_mappings WHERE folder_path = 'src/hooks'  ✓ found
  → template_id = 40b6ae53  (Task Template - 1)
  → shouldRunAgent = true
```

> The `folder_mappings` row is kept in sync by `reconcileFolderMappings()` on every
> publish — it reads the `agent:` field from `.mdspecmap` and resolves the template
> name to a UUID against the org's templates.

---

## Step 4 — `runAgentInline()` calls the LLM

**File:** `apps/web/lib/agents/processor.ts`

1. Inserts an `agent_runs` row with `status: running` and `raw_content`
2. Fetches the template instructions from the `templates` table by UUID
3. Calls `buildPrompt(instructions, rawContent, 'clickup')`
4. Calls the LLM (Claude Haiku) with the prompt
5. Updates the `agent_runs` row with `transformed_content` and `status: completed`
6. Returns the transformed string — this **replaces** the raw spec content for the rest
   of the pipeline

---

## Step 5 — `buildPrompt()` assembles what the LLM sees

**File:** `apps/web/lib/agents/prompt.ts`

```
{template instructions with {{target_integration}} → "clickup"}

---

## Spec Content

{raw markdown from the spec file}
```

The LLM receives the template instructions as the task, and the spec as the material
to work from. The system prompt locks it to clean markdown output only.

---

## Step 6 — LLM output format (what the template must produce)

**File:** `apps/web/lib/publish/adapters/clickup.ts` → `parseTaskFields()`

The worker parses the LLM output by scanning for `##` headings. Each heading becomes
a named section:

```markdown
## title
Implement useAnalytics hooks

## description
Add GA4 page tracking and event tracking hooks for the React frontend.

## priority
high

## status
in progress

## tags
analytics, hooks

## due date
2026-05-01
```

| Section | ClickUp field | Notes |
|---|---|---|
| `## title` | task `name` | Falls back to filename if missing |
| `## description` | `markdown_description` | Falls back to **entire LLM output** if missing |
| `## priority` | `priority` | urgent / high / normal / low |
| `## status` | `status` | Must match a status name in the list |
| `## tags` | `tags` | Comma-separated |
| `## due date` | `due_date` | Any parseable date string |

> **Important:** If the template does not produce a `## description` section, the
> entire LLM output is used as the description. This is why you saw the full expanded
> spec in ClickUp — the template was not producing structured sections.

---

## Step 7 — `publishAsTask()` writes to ClickUp

- On **first publish**: creates a new task in the list via `POST /task`
- On **subsequent publishes**: updates the existing task via `PUT /task/{id}` using
  the stored `external_page_id` (task ID) from `spec_publish_targets`
- The task ID is also read from `specs.INFO7.md.id: 86exam62a` in the `.mdspecmap`
  `specs:` block, which pre-wires the file to an existing task

---

## What the template instructions need to say

For `parseTaskFields` to extract clean structured data, the template should instruct
the LLM to output in the exact section format:

```
Transform the provided spec into a ClickUp task using ONLY these exact markdown sections:

## title
One-line actionable task name derived from the spec.

## description
Concise summary of what needs to be built and why.

## priority
One of: urgent / high / normal / low

## acceptance criteria
- [ ] ...
- [ ] ...
```

Sections not listed above are ignored by the parser.

---

## Data trail in the DB

| Table | What's stored |
|---|---|
| `specs` | path, content_hash, title, project_id |
| `spec_publish_targets` | spec_id, integration_id, status, external_page_id (ClickUp task ID) |
| `agent_runs` | spec_id, template_id, raw_content, transformed_content, duration_ms, status |
| `folder_mappings` | folder_path, integration_id, template_id (links folder → template) |
| `templates` | org_id, name, instructions (the prompt sent to the LLM) |
