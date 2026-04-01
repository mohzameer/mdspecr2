# mdspec — Map Page Specification
**Folder-to-Integration Mapping + Agent Transformation Layer**

---

## 1. Overview

The Map Page is a per-project configuration surface where users define:

1. **Which folders publish to which integrations** — each folder in the spec directory can be mapped to one or more target integrations (Notion, Confluence, ClickUp)
2. **Which agent transformation template applies** — each folder or frontmatter-flagged spec can be assigned a template that transforms the raw markdown before publishing

The Map Page replaces the need to configure targets in frontmatter for every individual spec file. It provides a visual, centralized routing and transformation control plane at the project level.

---

## 2. Where It Lives

```
Dashboard → Projects → [Project Name] → Map
```

Accessible by project `admin` and org `admin` / `owner`. Project `member` and `viewer` can view but not edit mappings.

---

## 3. Folder Mapping

### 3.1 What It Does

Each configured spec directory in a project is scanned and its top-level folders are displayed as mappable units. Users assign one or more target integrations to each folder. When a spec inside that folder is published, it is delivered to all mapped integrations simultaneously.

### 3.2 Visual Layout

```
Map — Payments Service

Spec Directories
┌─────────────────────────────────────────────────────────────────┐
│ specs/                                                           │
│                                                                  │
│   payments/          →  [ Notion: payments-docs ]  [ + Add ]    │
│   auth/              →  [ Notion: eng-wiki ] [ ClickUp: docs ]  │
│   infrastructure/    →  [ Confluence: infra-space ]             │
│   ── (unmapped)      →  [ + Map this folder ]                   │
│                                                                  │
│ docs/rfc/                                                        │
│                                                                  │
│   architecture/      →  [ Notion: arch-docs ]                   │
│   decisions/         →  [ Confluence: adr-space ]               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Mapping Rules

- A folder can map to **one or more integrations** simultaneously
- A spec published from `specs/payments/checkout-retry.md` inherits the mapping of `specs/payments/`
- Unmapped folders are still ingested into the ledger but not published to any target tool
- Frontmatter `targets` on individual specs **override** the folder mapping for that spec only
- Child folders inherit parent mapping unless explicitly overridden

**Inheritance example:**
```
specs/                    → Notion: eng-docs (parent)
  payments/               → Notion: payments-docs (overrides parent)
    checkout-retry.md     → inherits payments/ mapping
  auth/                   → inherits specs/ mapping → Notion: eng-docs
```

### 3.4 Mapping Resolution Order

```
1. Spec frontmatter targets         (highest priority)
2. Folder-level mapping (Map Page)
3. Parent folder mapping (inherited)
4. Project default targets          (lowest priority)
```

### 3.5 Integration Selection UI

Clicking `+ Add` on a folder opens an integration picker:

```
Select integration for specs/payments/

[ Notion        ▼ ]  [ Select workspace page ▼ ]  [ Add ]
[ Confluence    ▼ ]  [ Select space           ▼ ]  [ Add ]
[ ClickUp       ▼ ]  [ Select doc location    ▼ ]  [ Add ]

Currently mapped:
  ● Notion → payments-docs        [ Remove ]
  ● ClickUp → space_xyz/docs      [ Remove ]
```

Only integrations connected at the org level appear in the picker.

---

## 4. Agent Transformation Layer

### 4.1 What It Does

An agent transformation takes raw markdown content from a spec and runs it through a template before publishing to the target tool. The output is an enriched, structured document — not the raw markdown as-is.

The agent runs **asynchronously** via BullMQ on the Railway worker after the spec is ingested. It does not block the CI publish response.

### 4.2 When Agents Run

Agents are triggered per spec based on two configuration methods, evaluated in this order:

**Method 1 — Folder-level agent assignment (Map Page)**
A template is assigned to a folder in the Map Page. Every spec published from that folder automatically runs through the assigned template.

**Method 2 — Frontmatter flag**
A spec can declare its template in frontmatter, overriding the folder assignment:

```yaml
---
title: Checkout Retry Policy
mdspec_agent: task_template
---
```

If neither method applies, the spec is published as raw markdown with no transformation.

**Trigger evaluation order:**
```
1. Frontmatter mdspec_agent value    (overrides folder assignment)
2. Folder agent assignment (Map Page)
3. Parent folder agent assignment (inherited)
4. No agent → publish raw markdown
```

### 4.3 Map Page — Agent Column

The Map Page shows a third column for agent assignment alongside the integration mapping:

```
Map — Payments Service

┌──────────────────┬───────────────────────────────┬─────────────────────────┐
│ Folder           │ Integrations                  │ Agent Template          │
├──────────────────┼───────────────────────────────┼─────────────────────────┤
│ specs/payments/  │ Notion, ClickUp               │ Task Template  [ ▼ ]   │
│ specs/auth/      │ Notion                        │ None           [ ▼ ]   │
│ specs/infra/     │ Confluence                    │ RFC Template   [ ▼ ]   │
│ docs/rfc/        │ Notion                        │ None           [ ▼ ]   │
└──────────────────┴───────────────────────────────┴─────────────────────────┘
```

Dropdown options: `None` + all templates created within the project.

---

## 5. Templates

### 5.1 What a Template Is

A template is a free-form transformation instruction written by the user (typically a CTO or senior engineer) that tells the agent how to restructure and enrich the spec before publishing.

Templates are **free-form text** — not fixed schemas. This gives technical users full flexibility to define exactly how they want specs transformed. The template pool provides structured building blocks that users can reference within their free-form instructions.

### 5.2 Template Pool (V1)

The pool is a set of standard spec sections that mdspec understands and can extract, generate, or validate from raw markdown content. Users reference pool items in their template instructions.

**V1 pool items:**

| Pool Item | ID | Description |
|---|---|---|
| Acceptance Criteria | `acceptance_criteria` | Conditions that must be met for the spec to be considered complete |
| Non-Functional Requirements | `non_functional_requirements` | Performance, scalability, security, reliability constraints |
| API Contract | `api_contract` | Endpoint definitions, request/response shapes, status codes |
| Sequence Flow | `sequence_flow` | Step-by-step interaction or process flow |
| Error Handling | `error_handling` | How errors are caught, surfaced, and recovered |
| Security Considerations | `security_considerations` | Auth, encryption, data handling, threat model |
| Performance Benchmarks | `performance_benchmarks` | Latency targets, throughput, SLA thresholds |
| Dependencies | `dependencies` | External services, libraries, teams this spec relies on |
| Open Questions | `open_questions` | Unresolved decisions or items needing clarification |

Pool items are referenced in templates using `{{pool_item_id}}` syntax.

### 5.3 Default Template — Task Template

Every project ships with one built-in default template called **Task Template**. It cannot be deleted but can be cloned and modified.

**Task Template default instruction:**

```
You are a technical documentation agent. Transform the provided engineering spec into a structured task document.

Extract or generate the following sections from the spec content:

## {{acceptance_criteria}}
List clear, testable acceptance criteria based on the spec requirements.

## {{non_functional_requirements}}
Extract any non-functional requirements mentioned. If none are explicit, infer reasonable ones from context.

## {{dependencies}}
List all external services, APIs, teams, or libraries this spec depends on.

## {{open_questions}}
List any unresolved questions, ambiguities, or decisions not yet made in the spec.

## {{error_handling}}
Describe how errors should be handled based on the spec context.

Preserve the original spec content above these sections.
Output clean markdown suitable for publishing to {{target_integration}}.
```

### 5.4 Creating a Template

Users create templates from Dashboard → Projects → [Project] → Templates → New Template.

**Template creation form:**

```
Template Name
[ RFC Transformation Template              ]

Description (optional)
[ Transforms raw RFCs into structured architecture decision records ]

Template Instructions (free-form)
┌─────────────────────────────────────────────────────────────────┐
│ You are a technical documentation agent. Transform the          │
│ provided RFC into an Architecture Decision Record (ADR).        │
│                                                                 │
│ Structure the output as follows:                                │
│                                                                 │
│ ## Context                                                      │
│ Summarise the problem being solved.                             │
│                                                                 │
│ ## {{acceptance_criteria}}                                      │
│ Extract acceptance criteria from the RFC.                       │
│                                                                 │
│ ## {{security_considerations}}                                  │
│ Extract or infer security considerations.                       │
│                                                                 │
│ ## Decision                                                     │
│ State the decision made in the RFC.                             │
│                                                                 │
│ ## {{open_questions}}                                           │
│ List unresolved questions.                                      │
└─────────────────────────────────────────────────────────────────┘

Pool items available:
[ acceptance_criteria ] [ non_functional_requirements ] [ api_contract ]
[ sequence_flow ] [ error_handling ] [ security_considerations ]
[ performance_benchmarks ] [ dependencies ] [ open_questions ]
Click to insert into template.

[ Save Template ]  [ Cancel ]
```

### 5.5 Template Execution

When a spec triggers an agent run:

1. BullMQ enqueues an `run_agent` job with: spec content, template instructions, resolved pool items, target integration name
2. Railway worker picks up the job
3. Worker assembles the prompt:
   - System context: agent role and output format
   - Template instructions with `{{pool_item}}` references resolved to their descriptions
   - Raw spec markdown content
   - Target integration name injected as `{{target_integration}}`
4. LLM call made with assembled prompt
5. Output is the transformed markdown
6. Worker enqueues a `publish_spec` job with the transformed content
7. Transformed content is published to mapped integrations
8. Ledger updated with both raw and transformed content

### 5.6 Template Safety

Templates are free-form by design — technical users need full flexibility. The following light guardrails apply without restricting legitimate use:

- Template instructions are stored as plain text, never executed as code
- LLM output is markdown only — no code execution, no external calls from the agent
- Template content is visible to all project admins — no hidden instructions
- Output is published to the target tool as static content — it does not feed back into any system prompt or pipeline
- Max template instruction length: 4,000 characters

No hard content filtering is applied. The CTO or senior engineer configuring templates is trusted to write appropriate instructions for their team's needs.

---

## 6. Frontmatter Extensions for Map Page

Two new frontmatter keys are introduced:

```yaml
---
title: Checkout Retry Policy
mdspec_agent: task_template        # template ID to use for this spec
mdspec_no_agent: true              # explicitly opt this spec out of any folder agent
---
```

| Key | Description |
|---|---|
| `mdspec_agent` | Template ID to apply. Overrides folder agent assignment. |
| `mdspec_no_agent` | Set to `true` to skip agent transformation even if folder has one assigned. |

---

## 7. Database Schema

**`folder_mappings` table:**
```sql
id              uuid primary key default gen_random_uuid()
project_id      uuid references projects(id)
folder_path     text not null      -- e.g. 'specs/payments'
integration_id  uuid references integrations(id)
template_id     uuid references templates(id) null  -- null = no agent
created_at      timestamptz default now()
updated_at      timestamptz default now()

unique(project_id, folder_path, integration_id)
```

**`templates` table:**
```sql
id              uuid primary key default gen_random_uuid()
project_id      uuid references projects(id)
name            text not null
description     text
instructions    text not null      -- free-form template content, max 4000 chars
is_default      boolean default false  -- true for Task Template only
created_by      uuid references auth.users(id)
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

**`agent_runs` table:**
```sql
id              uuid primary key default gen_random_uuid()
spec_id         uuid references specs(id)
template_id     uuid references templates(id)
trigger         text not null      -- 'folder_mapping' | 'frontmatter'
raw_content     text not null      -- original spec content
transformed_content text           -- agent output (null if failed)
status          text not null      -- 'queued' | 'running' | 'completed' | 'failed'
error           text
duration_ms     int
created_at      timestamptz default now()
completed_at    timestamptz
```

---

## 8. Map Page — Full UI Sections

```
Map — Payments Service
─────────────────────────────────────────

[ Folder Mappings ]  [ Templates ]        ← two tabs

─── Folder Mappings tab ───

Spec directory: specs/
┌──────────────────┬────────────────────────────┬──────────────────────┐
│ Folder           │ Integrations               │ Agent Template       │
├──────────────────┼────────────────────────────┼──────────────────────┤
│ payments/        │ ● Notion  ● ClickUp  [ + ] │ Task Template [ ▼ ] │
│ auth/            │ ● Notion              [ + ] │ None          [ ▼ ] │
│ infrastructure/  │ ● Confluence          [ + ] │ RFC Template  [ ▼ ] │
│ (root files)     │ [ + Map ]                  │ None          [ ▼ ] │
└──────────────────┴────────────────────────────┴──────────────────────┘

Spec directory: docs/rfc/
┌──────────────────┬────────────────────────────┬──────────────────────┐
│ Folder           │ Integrations               │ Agent Template       │
├──────────────────┼────────────────────────────┼──────────────────────┤
│ architecture/    │ ● Notion              [ + ] │ RFC Template  [ ▼ ] │
│ decisions/       │ ● Confluence          [ + ] │ None          [ ▼ ] │
└──────────────────┴────────────────────────────┴──────────────────────┘

─── Templates tab ───

[ + New Template ]

┌──────────────────────────┬───────────────────────────┬──────────────┐
│ Name                     │ Used in folders           │ Actions      │
├──────────────────────────┼───────────────────────────┼──────────────┤
│ Task Template (default)  │ payments/                 │ [ Clone ]    │
│ RFC Template             │ infrastructure/, arch/    │ [ Edit ] [ Delete ] │
└──────────────────────────┴───────────────────────────┴──────────────┘
```

---

## 9. Agent Run Visibility

Agent run status is visible in Dashboard → Project → Activity:

```
specs/payments/checkout-retry.md
  ✓ Agent: Task Template applied        230ms
  ✓ Published → Notion (payments-docs)
  ✓ Published → ClickUp (space_xyz)

specs/auth/sso-setup.md
  — No agent configured
  ✓ Published → Notion (eng-wiki)

specs/infrastructure/db-schema.md
  ✗ Agent: RFC Template failed (LLM timeout)
  — Publish skipped (agent required)
```

If an agent run fails, the publish to the target tool is skipped for that spec. The raw content remains in the ledger. The team can retry from the Dashboard.

---

## 10. Publish Flow with Agent (Updated)

```
CI triggers mdspec publish
  └─ CLI detects changed specs
  └─ POST /api/publish → 202 Accepted

Railway Worker
  └─ For each spec:
        └─ Resolve folder mapping (Map Page config)
        └─ Check frontmatter for mdspec_agent or mdspec_no_agent
        └─ If agent assigned:
              └─ Enqueue run_agent job
              └─ Agent assembles prompt from template + pool items + spec content
              └─ LLM call → transformed markdown
              └─ Log to agent_runs table
              └─ Enqueue publish_spec job with transformed content
        └─ If no agent:
              └─ Enqueue publish_spec job with raw content
        └─ publish_spec job delivers to all mapped integrations
        └─ Update spec_publish_targets + agent_runs in ledger
        └─ Supabase Realtime pushes status to Dashboard
```

---

*End of Map Page Specification — mdspec V1*