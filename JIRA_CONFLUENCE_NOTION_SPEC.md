# mdspec — JIRA, Confluence & Notion Integration Specification
**Publishing Specs as JIRA Issues, Confluence Pages, and Notion Pages**

---

## 1. Overview

This spec covers three documentation and project management integrations in mdspec:

| Integration | Storage type | Primary use case |
|---|---|---|
| **JIRA** | Issues (tickets) | Engineering task tracking, sprint planning |
| **Confluence** | Wiki pages | Team knowledge base, ADRs, RFCs |
| **Notion** | Pages | Engineering wikis, onboarding docs, design docs |

Confluence and Notion are already implemented as publish adapters. This spec defines:
- **JIRA** as a new integration type (net-new adapter)
- Enhancements to the **Confluence** adapter to support page hierarchies beyond the current flat model
- Enhancements to the **Notion** adapter to improve block reliability and add database-row publishing as an alternative to page publishing

All three integrations share the same folder mapping and agent template pipeline. The same spec can be published to all three simultaneously via multiple folder mappings.

---

## 2. JIRA Integration (New)

### 2.1 How it works

When a folder mapping points to a JIRA integration, specs are published as **JIRA issues** (stories or tasks) inside a configured project. This is the documentation-as-code counterpart to ClickUp task list mode — teams managing work in JIRA can keep their specs and issues in sync.

Typical workflow:

1. An engineer writes a spec and optionally puts the JIRA issue key in frontmatter to link to a pre-existing issue
2. On first publish, mdspec creates the issue (or updates the linked one) with content from the spec
3. Every subsequent publish updates the issue description — no further frontmatter management needed

### 2.2 Credentials

```typescript
export interface JiraCredentials {
  base_url: string          // e.g. "https://acme.atlassian.net"
  email: string             // Atlassian account email
  api_token: string         // Atlassian API token (not password)
  project_key: string       // e.g. "ENG"
  issue_type: string        // e.g. "Story", "Task", "Bug" — default "Task"
}
```

### 2.3 UI — Add Integration modal

```
Integration type: [ JIRA ▼ ]

Base URL:          [ https://acme.atlassian.net    ]
Email:             [ eng@acme.com                  ]
API Token:         [ ••••••••••••••                 ]
Project key:       [ ENG                           ]
Default issue type:
  ● Task
  ○ Story
  ○ Bug

[ Connect JIRA ]  [ Cancel ]
```

On submit, the API performs a health check: `GET /rest/api/3/project/{project_key}` to verify credentials and confirm the project exists.

### 2.4 Frontmatter — linking to an existing issue

```yaml
---
title: Checkout Retry Policy
jira_issue_key: ENG-1042
---
```

**Behaviour:**

- On first publish, mdspec finds `jira_issue_key` in frontmatter and writes it to `spec_publish_targets.external_page_id`
- From that point on, every publish updates the issue via the stored key — no frontmatter lookup needed
- If the issue key in frontmatter does not exist in JIRA, mdspec creates a new issue and stores the returned key (graceful fallback)
- If no frontmatter key is present, mdspec creates a new issue automatically

### 2.5 Create vs Update logic

```
On publish for a (spec, JIRA integration) pair:
  1. Look up spec_publish_targets.external_page_id (stored issue key)
  2. If found → PUT /rest/api/3/issue/{issueKey}  (update summary + description)
  3. If not found AND frontmatter has jira_issue_key → store it, then PUT
  4. If not found AND no frontmatter → POST /rest/api/3/issue  (create), store returned key
```

On 404 during update: treat as not found and create a new issue.

### 2.6 Agent template output for JIRA issues

The agent pipeline is unchanged. A task-oriented template outputs structured markdown that the adapter parses into JIRA fields:

```markdown
## Summary
Checkout Retry Policy — add exponential backoff

## Description
[full spec content, enriched by agent template]

## Priority
High

## Labels
payments, reliability
```

Field mapping:

| Markdown heading | JIRA issue field | Default if absent |
|---|---|---|
| `## Summary` | `summary` (title) | Spec filename |
| `## Description` | `description` (ADF body) | Full spec content |
| `## Priority` | `priority.name` | None (JIRA project default) |
| `## Labels` | `labels` (comma-separated) | None |
| `## Story Points` | `story_points` custom field | None |

If no agent template is assigned, the raw spec markdown becomes the issue description and the spec filename becomes the summary.

### 2.7 Description format — Atlassian Document Format (ADF)

JIRA's REST API v3 accepts issue descriptions as **Atlassian Document Format (ADF)** JSON, not markdown. The adapter converts the spec markdown to ADF before publishing.

The conversion handles:

| Markdown | ADF node |
|---|---|
| `# Heading` | `heading` (level 1–3) |
| `- list item` | `bulletList` > `listItem` |
| ` ```code``` ` | `codeBlock` |
| Paragraph text | `paragraph` |
| `**bold**` | `strong` mark |
| `_italic_` | `em` mark |
| `[text](url)` | `link` mark |

### 2.8 New adapter: `apps/worker/src/adapters/jira.ts`

```typescript
export interface JiraCredentials {
  base_url: string
  email: string
  api_token: string
  project_key: string
  issue_type: string
}

export async function publishToJira(
  credentials: JiraCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  existingIssueKey: string | null
): Promise<{ issue_key: string; issue_url: string }>
```

Auth is HTTP Basic: `email:api_token` base64-encoded in the `Authorization` header.

### 2.9 New API endpoint — JIRA project validation

**POST `/api/integrations/jira/validate`**

Validates credentials and confirms the project key exists before saving the integration.

```json
{
  "base_url": "https://acme.atlassian.net",
  "email": "eng@acme.com",
  "api_token": "...",
  "project_key": "ENG"
}
```

Response:
```json
{ "ok": true, "project_name": "Engineering" }
```

---

## 3. Confluence Integration (Enhancements)

The existing Confluence adapter publishes specs as pages inside a configured space. The current implementation resolves ancestor folders as parent pages, creating the hierarchy on demand.

### 3.1 Enhancements in this spec

#### 3.1.1 Root page pinning

Currently, all pages are created directly under the space root. Add a `root_page_id` credential field to pin the hierarchy under a specific existing page:

```typescript
export interface ConfluenceCredentials {
  base_url: string
  email: string
  token: string
  space_key: string
  root_page_id?: string   // NEW — optional, pin all pages under this parent
}
```

When set, the first folder level is created as a child of `root_page_id` rather than the space root.

#### 3.1.2 Page labels

Specs published to Confluence now receive the label `mdspec-managed` on create. This enables teams to filter and manage mdspec pages in Confluence without a separate manifest.

The label is added via `POST /wiki/rest/api/content/{id}/label` immediately after create. It is not added during updates to avoid overwriting user-applied labels.

#### 3.1.3 Health check on integration connect

Add a `GET /wiki/rest/api/space/{space_key}` call during the Connect Confluence flow (same as the JIRA validate pattern). Currently there is no pre-save validation.

### 3.2 No changes to publish flow or worker dispatch

The Confluence adapter changes are internal to `apps/worker/src/adapters/confluence.ts`. The worker dispatch, `PublishGroupJobData`, and `spec_publish_targets` schema are unchanged.

### 3.3 Updated credentials UI

```
Integration type: [ Confluence ▼ ]

Base URL:          [ https://acme.atlassian.net    ]
Email:             [ eng@acme.com                  ]
API Token:         [ ••••••••••••••                 ]
Space key:         [ ENG                           ]
Root page:         [ Engineering Specs (optional)  ]  ← NEW, searchable dropdown

[ Connect Confluence ]  [ Cancel ]
```

The "Root page" field is a searchable dropdown populated by:
```
GET /wiki/rest/api/content?type=page&spaceKey={space_key}&title={query}&limit=10
```
It is optional — when empty, pages are created under the space root as today.

---

## 4. Notion Integration (Enhancements)

The existing Notion adapter publishes specs as child pages nested under a root page. All folder hierarchy is created as intermediate pages.

### 4.1 Enhancements in this spec

#### 4.1.1 Database-row publishing mode

Add a second Notion publish mode: **database row**. When the target is a Notion database (rather than a page), each spec is published as a row in the database. This enables teams to use Notion database views (tables, boards, filters) to manage their specs.

New credential field:

```typescript
export interface NotionCredentials {
  token: string
  root_page_id: string
  mode: 'page' | 'database'         // NEW — default 'page'
  database_id?: string              // NEW — required when mode = 'database'
}
```

In `database` mode:
- Each spec becomes a row in the Notion database
- The row's `Name` property is set to the spec title
- The row's `Content` property (rich text) receives the spec body, truncated to Notion's 2000-char property limit
- Full spec content is appended as child blocks on the row page
- `external_page_id` stores the Notion page ID of the row (same as page mode)

#### 4.1.2 Incremental block update

The current update path deletes all existing blocks and re-appends — this causes flicker and loses any user annotations. Replace with a diff-based approach:

1. Fetch existing blocks
2. Compare count and content hash to determine if a rebuild is needed
3. If content is unchanged (`content_hash` matches stored value): skip re-append entirely
4. If changed: delete all blocks and re-append (current behaviour, unchanged for now)

The content hash check (`spec_publish_targets.content_hash` is already stored) allows the worker to skip the Notion API call entirely when the spec content has not changed since last publish.

#### 4.1.3 Health check on connect

Add a `GET /v1/pages/{root_page_id}` call during the Connect Notion flow to confirm the token has access to the root page.

### 4.2 UI — Add Integration modal (updated)

```
Integration type: [ Notion ▼ ]

Integration token: [ secret_...                   ]
Publish mode:
  ● Pages           Publish each spec as a Notion page
  ○ Database rows   Publish each spec as a row in a database

Root page:          [ paste Notion page ID         ]

(when Database rows selected)
Database:           [ paste Notion database ID     ]

[ Connect Notion ]  [ Cancel ]
```

### 4.3 Updated `NotionCredentials` type

```typescript
// apps/worker/src/adapters/notion.ts
export interface NotionCredentials {
  token: string
  root_page_id: string
  mode: 'page' | 'database'
  database_id?: string
}
```

The `mode` and `database_id` fields default to `'page'` / `undefined` so existing integrations require no migration.

---

## 5. Shared Database Changes

### 5.1 `IntegrationType` — new value

```typescript
// apps/web/lib/types.ts
export type IntegrationType = 'notion' | 'confluence' | 'clickup' | 's3' | 'jira'
```

### 5.2 No schema changes to `folder_mappings` or `spec_publish_targets`

`external_page_id` stores:
- JIRA: the issue key (e.g. `ENG-1042`)
- Confluence: the Confluence page ID (existing)
- Notion: the Notion page ID (existing)

`external_url` stores the human-accessible URL in all three cases.

### 5.3 `integrations.credentials` shapes

**JIRA:**
```json
{
  "base_url": "https://acme.atlassian.net",
  "email": "eng@acme.com",
  "api_token": "...",
  "project_key": "ENG",
  "issue_type": "Task"
}
```

**Confluence (with new field):**
```json
{
  "base_url": "https://acme.atlassian.net",
  "email": "eng@acme.com",
  "token": "...",
  "space_key": "ENG",
  "root_page_id": "123456789"
}
```

**Notion (with new fields):**
```json
{
  "token": "secret_...",
  "root_page_id": "abc123",
  "mode": "database",
  "database_id": "def456"
}
```

---

## 6. Worker Dispatch Changes

### 6.1 JIRA dispatch (new branch in `processOneSpec`)

```typescript
case 'jira':
  const jiraCreds = JSON.parse(decryptedCredentials) as JiraCredentials
  result = await publishToJira(jiraCreds, specPayload, existingPageId ?? null)
  externalPageId = result.issue_key
  externalUrl = result.issue_url
  break
```

### 6.2 `jira_issue_key` frontmatter adoption

Identical pattern to ClickUp's `clickup_task_id` adoption (see CLICKUP_TASKS_SPEC §9.4):

```typescript
if (target_type === 'jira' && !existingPageId) {
  const frontmatterKey = spec.frontmatter?.jira_issue_key
  if (typeof frontmatterKey === 'string' && frontmatterKey.length > 0) {
    existingPageId = frontmatterKey
    await supabase
      .from('spec_publish_targets')
      .update({ external_page_id: frontmatterKey })
      .eq('id', spec_publish_target_id)
  }
}
```

### 6.3 Confluence and Notion dispatch

Unchanged. Both adapters already exist. The enhancements (§3, §4) are internal to the adapters and do not affect the dispatch interface.

---

## 7. Folder Mappings Table — All Three Integrations

```
┌──────────────────┬────────────────────────────────────────────────────┬──────────────────────┐
│ Folder           │ Integrations                                       │ Agent Template       │
├──────────────────┼────────────────────────────────────────────────────┼──────────────────────┤
│ specs/payments/  │ ● JIRA [ENG]  ● Confluence  ● Notion  [ + ]       │ Task Template [ ▼ ] │
│ docs/rfc/        │ ● Confluence  ● Notion  [ + ]                      │ RFC Template  [ ▼ ] │
│ docs/onboarding/ │ ● Notion [db]  [ + ]                               │ Onboarding    [ ▼ ] │
└──────────────────┴────────────────────────────────────────────────────┴──────────────────────┘
```

Badges:
- JIRA: `[ENG]` shows the project key
- Confluence: no badge (space key visible on hover)
- Notion: `[db]` when in database mode; no badge when in page mode

---

## 8. Publish Flow — All Three Integrations

```
CI triggers mdspec publish
  └─ POST /api/publish → 202 Accepted

QStash Worker
  └─ For each (integration, folder) group:
        └─ Resolve agent template (unchanged)
        └─ If agent assigned: run transform → final content

        JIRA group:
          └─ Adopt frontmatter jira_issue_key if stored key absent
          └─ publishToJira(creds, spec, existingIssueKey)
                └─ Convert markdown → ADF
                └─ If key found → PUT /rest/api/3/issue/{key}
                └─ If none → POST /rest/api/3/issue
          └─ Store issue_key, issue_url

        Confluence group:
          └─ publishToConfluence(creds, spec, existingPageId)  (existing, enhanced)
                └─ Ensure ancestor folder pages (pinned under root_page_id if set)
                └─ Create or update page
                └─ On create: add mdspec-managed label
          └─ Store page_id, page_url

        Notion group:
          └─ publishToNotion(creds, spec, existingPageId)  (existing, enhanced)
                └─ If content_hash unchanged → skip
                └─ Ensure folder hierarchy
                └─ Create page or DB row / update existing
          └─ Store page_id, page_url
```

---

## 9. Activity Feed

```
specs/payments/checkout-retry.md
  ✓ Agent: Task Template applied              190ms
  ✓ Published → JIRA ENG-1042               [ Open issue ↗ ]
  ✓ Published → Confluence (ENG space)       [ Open page ↗ ]
  ✓ Published → Notion                       [ Open page ↗ ]

docs/onboarding/setup-guide.md
  ✓ Agent: Onboarding Doc Template applied   220ms
  ✓ Published → Notion database              [ Open row ↗ ]
```

---

## 10. V1 Scope Constraints

**JIRA:**
- **No sub-tasks.** All issues are created at the top level of the project's backlog.
- **No issue deletion.** Deleting a spec file does not delete the JIRA issue.
- **No custom field mapping beyond the table in §2.6.** Custom JIRA fields (epics, sprints, components) are out of scope.
- **Jira Cloud only.** Jira Server / Data Center is not supported in V1.

**Confluence:**
- **Root page pinning is optional.** Existing integrations without `root_page_id` continue to work as before.
- **Label is applied on create only.** Existing pages do not get retroactively labelled.

**Notion:**
- **Database mode requires a pre-existing database.** mdspec does not create Notion databases.
- **The `Name` and `Content` properties must exist in the database.** mdspec does not create or modify database schemas.
- **Incremental block diff is hash-based (skip or full replace).** True line-level diffing is out of scope for V1.

---

*End of JIRA, Confluence & Notion Integration Specification — mdspec V1*
