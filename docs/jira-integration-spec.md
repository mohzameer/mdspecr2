# Jira Integration Spec

## Overview

Publish markdown specs as Jira issues. Each spec maps to a Jira issue (Story, Task, or Epic) with its content rendered in the description field using Atlassian Document Format (ADF). Folder mappings tie a project subfolder to a Jira project and issue type, and the processor self-heals when remote issues are deleted or reparented.

Jira shares the same OAuth provider as Confluence (`auth.atlassian.com`) so the OAuth flow is nearly identical — we get a `cloud_id` per accessible Atlassian site and issue API calls against `https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/`.

---

## Publish Modes

| Mode | Description |
|------|-------------|
| **issue** | Each spec becomes one Jira issue. Spec filename → issue summary. Folder maps to a Jira project + issue type. |
| **epic-child** | A shared Epic is created per folder mapping. Each spec becomes a child Story/Task linked under that Epic. |

The `issue` mode is the MVP. `epic-child` mode matches ClickUp multi-mode behaviour and can be built in a follow-up.

---

## Credential Shape

```typescript
interface JiraOAuthCredentials {
  access_token: string
  refresh_token: string
  expires_at: number      // Unix ms — same as Confluence pattern
  cloud_id: string        // Atlassian site ID
  site_url: string        // e.g. https://your-org.atlassian.net
  project_key: string     // Default project (overridable per folder mapping)
}
```

Stored in Supabase Vault via `create_integration_secret`. The `config` column on the `integrations` row stores only `{ site_url, project_key }` (public, non-secret).

---

## Database Changes

### 1. Extend the `type` check constraint

```sql
ALTER TABLE public.integrations
  DROP CONSTRAINT integrations_type_check,
  ADD  CONSTRAINT integrations_type_check
       CHECK (type IN ('notion', 'confluence', 'clickup', 's3', 'jira'));
```

### 2. Extend `spec_publish_targets.target_type`

```sql
ALTER TABLE public.spec_publish_targets
  DROP CONSTRAINT spec_publish_targets_target_type_check,
  ADD  CONSTRAINT spec_publish_targets_target_type_check
       CHECK (target_type IN ('notion', 'confluence', 'clickup', 's3', 'jira'));
```

### 3. New `folder_mappings` columns (optional, MVP can reuse `target_id`)

| Column | Type | Purpose |
|--------|------|---------|
| `jira_project_key` | `text` | Override project per folder mapping |
| `jira_issue_type` | `text` | `Story` / `Task` / `Epic` (default: `Task`) |
| `jira_epic_id` | `text` | Shared epic key for `epic-child` mode |

For MVP, `target_id` on `folder_mappings` holds the Jira project key override (consistent with how `target_id` works for Confluence parent page ID and ClickUp space/folder ID).

---

## OAuth Flow

Shares the Atlassian OAuth infrastructure with Confluence. The scopes differ — Jira needs:

```
read:jira-work manage:jira-project manage:jira-configuration
read:jira-user write:jira-work offline_access
```

### Routes to create

```
app/api/integrations/jira/
├── authorize/route.ts        # Redirect to Atlassian with Jira scopes
├── callback/route.ts         # Exchange code, fetch accessible resources, set cookie
├── pending/route.ts          # Frontend polls for OAuth session data
├── projects/route.ts         # Fetch projects for selected cloud_id
└── complete/route.ts         # Store final credentials, upsert integrations row
```

### Step-by-step

**1. `GET /api/integrations/jira/authorize`**
- Generate random `state` CSRF token
- Set `httpOnly` cookie `jira_oauth_state` (10 min TTL)
- Redirect to:
  ```
  https://auth.atlassian.com/authorize
    ?audience=api.atlassian.com
    &client_id={JIRA_CLIENT_ID}
    &scope=read:jira-work manage:jira-project write:jira-work offline_access read:me
    &redirect_uri={APP_URL}/api/integrations/jira/callback
    &state={state}
    &response_type=code
    &prompt=consent
  ```

**2. `GET /api/integrations/jira/callback?code=...&state=...`**
- Validate `state` against cookie
- Exchange `code` for tokens:
  ```
  POST https://auth.atlassian.com/oauth/token
  { grant_type, client_id, client_secret, code, redirect_uri }
  → { access_token, refresh_token, expires_in }
  ```
- Fetch accessible resources:
  ```
  GET https://api.atlassian.com/oauth/token/accessible-resources
  Authorization: Bearer {access_token}
  → [{ id (cloud_id), url, name, scopes, avatarUrl }]
  ```
- Filter sites that have Jira scopes (check for `manage:jira-project` in `scopes`)
- Store `{ access_token, refresh_token, expires_at }` in Vault → `pendingSecretId`
- Set cookie `jira_pending = { pendingSecretId, sites }` (10 min TTL)
- Redirect to `/integrations?setup=jira`

**3. `GET /api/integrations/jira/pending`**
- Return `{ pendingSecretId, sites }` from cookie
- Delete cookie on read

**4. `POST /api/integrations/jira/projects`**

Body: `{ pendingSecretId, cloud_id }`

- Decrypt pending secret → `access_token`
- Refresh if needed
- Call:
  ```
  GET https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/project/search
    ?expand=description&maxResults=50
  Authorization: Bearer {access_token}
  → { values: [{ id, key, name, projectTypeKey }] }
  ```
- Return `{ ok: true, projects: [{ key, name }] }`

**5. `POST /api/integrations/jira/complete`**

Body: `{ pendingSecretId, cloudId, siteUrl, projectKey }`

- Decrypt pending secret
- Build final credentials:
  ```typescript
  {
    access_token, refresh_token, expires_at,
    cloud_id: cloudId,
    site_url: siteUrl,
    project_key: projectKey
  }
  ```
- Store in Vault → new `secret_id`
- Upsert `integrations` row:
  ```typescript
  {
    org_id, type: 'jira', status: 'connected',
    credentials_secret_id: secret_id,
    config: { site_url: siteUrl, project_key: projectKey }
  }
  ```
- Delete old secret if one existed
- Return `{ ok: true }`

---

## Adapter: `apps/web/lib/publish/adapters/jira.ts`

```typescript
export interface JiraOAuthCredentials {
  access_token: string
  refresh_token: string
  expires_at: number
  cloud_id: string
  site_url: string
  project_key: string
}

export async function refreshJiraToken(creds: JiraOAuthCredentials): Promise<JiraOAuthCredentials>
// Same pattern as refreshConfluenceToken — checks expires_at with 5-min buffer,
// POST https://auth.atlassian.com/oauth/token with refresh_token grant.

export async function publishToJira(params: {
  credentials: JiraOAuthCredentials
  title: string               // Becomes issue summary
  markdownContent: string     // Converted to ADF for description
  existingIssueId?: string    // issue key e.g. "PROJ-42" (from spec_publish_targets)
  projectKey?: string         // Override from folder mapping target_id
  issueType?: string          // Default: 'Task'
}): Promise<{ issueId: string; issueUrl: string }>
```

### `publishToJira` logic

1. Refresh token if within 5-min window
2. Resolve `projectKey`: `params.projectKey ?? creds.project_key`
3. Convert markdown → ADF via `mdToAdf()` (see below)
4. If `existingIssueId` is set:
   - `GET /rest/api/3/issue/{existingIssueId}` — verify it exists
   - If 404 → fall through to create (see **Key Stability** note below)
   - If found → `PUT /rest/api/3/issue/{existingIssueId}` with updated summary + description
5. If creating:
   ```
   POST /rest/api/3/issue
   {
     fields: {
       project: { key: projectKey },
       summary: title,
       issuetype: { name: issueType },
       description: adfDocument
     }
   }
   → { id, key, self }
   ```
6. Store **both** `id` (numeric, stable) and `key` (human-readable) from the response
7. Build URL: `{site_url}/browse/{issue_key}`
8. Return `{ issueId: issue_key, issueNumericId: issue_id, issueUrl }`

### `mdToAdf(markdown: string): AtlassianDocumentFormat`

Jira descriptions use [Atlassian Document Format](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) — a JSON document model.

Use the `@atlaskit/adf-utils` package (or `@atlaskit/editor-markdown-transformer` if available). Fallback: convert markdown to a simple ADF with `paragraph` nodes preserving raw text, and add `codeBlock` nodes for fenced code blocks.

Minimal ADF wrapper:
```typescript
{
  version: 1,
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '...' }] },
    { type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ type: 'text', text: '...' }] }
  ]
}
```

For MVP, a hand-rolled converter covering: headings, paragraphs, bold/italic, code blocks, bullet lists, ordered lists, and links is sufficient. We can adopt a proper AST converter in a follow-up.

---

## Issue Key Adoption (Frontmatter `id`)

### How it differs from ClickUp

ClickUp has two parallel ID systems — native IDs (opaque strings like `abc123xyz`) and user-defined custom IDs (e.g., `TASK-001`). The adapter resolves the custom ID to the native ID via a separate `?custom_task_ids=true&team_id=` API call, then stores the native ID so future publishes never need the resolution step again. The `clickup_use_custom_task_ids` flag controls whether to attempt that lookup.

Jira has no such split. The issue key (`PROJ-42`) **is** the standard API identifier — `GET /rest/api/3/issue/PROJ-42` works without any flag or extra lookup. No `jira_use_custom_ids` flag is needed; the existing processor unified `id` block handles Jira adoption with zero Jira-specific code:

```typescript
// processor.ts (existing block, no change needed for Jira)
if (spec.id) {
  let resolved: string | null = spec.id
  if (target_type === 'clickup' && ctx.clickupMode === 'task_list') {
    resolved = await resolveToNativeTaskId(...)  // ClickUp-only step
  }
  // For Jira, spec.id IS the usable key — no resolution step
  if (resolved && resolved !== existingPageId) {
    existingPageId = resolved
    // update spec_publish_targets ...
  }
}
```

A user adding `id: PROJ-42` to a spec's frontmatter will cause the processor to adopt that issue on the next publish — no new code required.

### Key stability: issue key vs numeric ID

There is one edge case the ClickUp pattern doesn't have: **Jira issue keys change when an issue is moved between projects** (`PROJ-42` → `NEWPROJ-8`). The internal numeric ID is immutable.

To survive project moves, we store both identifiers:

| Field | Value | Used for |
|-------|-------|---------|
| `external_page_id` | `PROJ-42` (key) | Displayed in UI, used in URLs, what users put in frontmatter `id:` |
| `config->>'jira_numeric_id'` on the target row | `10042` (numeric) | Fallback lookup when key 404s |

Self-heal flow when stored key 404s:
1. Try `GET /rest/api/3/issue/{key}` → 404
2. If `jira_numeric_id` is stored → try `GET /rest/api/3/issue/{numeric_id}`
3. If found → the issue moved; update stored key to `response.key`, continue with update
4. If still 404 → issue truly deleted; clear both IDs, fall through to create

This adds one optional extra field to `spec_publish_targets`. The simplest approach is to stash it in a `jira_numeric_id` column on `spec_publish_targets` (like `clickup_list_id` lives on `folder_mappings`). Alternative: encode it as `{numericId}:{key}` in `external_page_id` — simpler schema, slightly messier adapter.

**MVP decision**: skip numeric ID fallback for now. Add it if users report issues with project moves. Track as open question #8 below.

---

## Processor Changes (`apps/web/lib/publish/processor.ts`)

### 1. Add `setupJiraGroupContext`

```typescript
async function setupJiraGroupContext(
  ctx: PublishGroupContext,
  rootFolder: string
): Promise<void>
```

- Query `folder_mappings` for `(project_id, integration_id, folder_path = rootFolder)`
- Extract `target_id` (Jira project key override), `frontmatter_map`
- Set on `ctx`

### 2. Extend `processOneSpec` for Jira

Self-healing logic:
- If `existingIssueId` is set → verify issue exists via `GET /rest/api/3/issue/{key}`
- If 404 and `jira_numeric_id` stored → try numeric ID lookup; if found, update stored key (project-move recovery — see **Key Stability** section above)
- If still 404 → clear stored ID, fall through to create
- No parent-move needed for `issue` mode (issues don't have mandatory parents)
- For `epic-child` mode (future): verify epic still exists and re-link if missing
- No `resolveToNativeTaskId` equivalent needed — issue keys are directly usable in all Jira REST API calls (unlike ClickUp's two-ID system)

### 3. Publish call

```typescript
case 'jira': {
  const result = await publishToJira({
    credentials: creds as JiraOAuthCredentials,
    title: resolvedTitle,
    markdownContent: processedContent,
    existingIssueId: target?.external_page_id ?? undefined,
    projectKey: ctx.jiraProjectKey,
    issueType: ctx.jiraIssueType ?? 'Task',
  })
  externalId  = result.issueId
  externalUrl = result.issueUrl
  break
}
```

---

## Type Changes (`apps/web/lib/types.ts`)

```typescript
// Before
type IntegrationType = 'notion' | 'confluence' | 'clickup' | 's3'

// After
type IntegrationType = 'notion' | 'confluence' | 'clickup' | 's3' | 'jira'
```

---

## UI: Integrations Page

Add a Jira card alongside the existing cards in `app/(dashboard)/integrations/page.tsx`.

### State additions

```typescript
const [jiraSetupStep, setJiraSetupStep] = useState<'idle' | 'selecting-site' | 'selecting-project' | 'done'>('idle')
const [jiraSites, setJiraSites] = useState<{ id: string; url: string; name: string }[]>([])
const [jiraProjects, setJiraProjects] = useState<{ key: string; name: string }[]>([])
const [jiraSelectedSite, setJiraSelectedSite] = useState('')
const [jiraSelectedProject, setJiraSelectedProject] = useState('')
const [jiraPendingSecretId, setJiraPendingSecretId] = useState('')
```

### OAuth detection (same as Confluence)

On mount / URL change, if `?setup=jira`:
1. Call `GET /api/integrations/jira/pending`
2. Set `jiraSites`, `jiraPendingSecretId`
3. `setJiraSetupStep('selecting-site')`

### Site → Project flow

On site select:
1. Call `POST /api/integrations/jira/projects` with `{ pendingSecretId, cloud_id }`
2. Populate `jiraProjects` dropdown
3. `setJiraSetupStep('selecting-project')`

On confirm:
1. Call `POST /api/integrations/jira/complete`
2. Refresh integration list
3. `setJiraSetupStep('done')`

### Card layout (mirrors Confluence card)

```
┌─────────────────────────────────────────────────────┐
│  [Jira logo]  Jira                          ● Connected │
│                                                      │
│  Publish specs as Jira issues. Supports Stories,    │
│  Tasks, and Epics across any Jira Cloud project.    │
│                                                      │
│  Project: MYPROJ   Site: org.atlassian.net          │
│                                [Disconnect]          │
└─────────────────────────────────────────────────────┘
```

Disconnected state shows "Connect with Atlassian" button (same style as Confluence).

---

## Folder Mapping UI

In the folder mapping drawer (wherever `confluence-pages` and `notion-targets` targets are configured), add a Jira section:

- **Project key override** — text input, falls back to integration default
- **Issue type** — dropdown: `Task` (default), `Story`, `Epic`, `Bug`

These write to `folder_mappings.target_id` (project key) and a new `jira_issue_type` column.

---

## Environment Variables

No new variables. The implementation **reuses the existing shared Atlassian OAuth app** — `ATLASSIAN_CLIENT_ID` / `ATLASSIAN_CLIENT_SECRET` (already wired for Confluence). The redirect URI is computed from `NEXT_PUBLIC_APP_URL`.

**Required setup in the Atlassian developer console** ([developer.atlassian.com](https://developer.atlassian.com/console/myapps/)):
1. Open the existing Atlassian OAuth 2.0 app (the one Confluence uses).
2. Add the Jira callback URL: `{NEXT_PUBLIC_APP_URL}/api/integrations/jira/callback`
3. Add the Jira scopes under **Permissions → Jira API**: `read:jira-work`, `write:jira-work`, `read:jira-user` (plus `offline_access`, already enabled).

If the app cannot host both products, register a separate Jira app and introduce `JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET` — the adapter and routes currently read `ATLASSIAN_CLIENT_ID`.

---

## New API Route: `[integrationId]/jira-projects/route.ts`

After integration is connected, the folder mapping UI needs to list available Jira projects (user may want a different project per folder).

```typescript
GET /api/integrations/{integrationId}/jira-projects

1. Fetch integration row → credentials_secret_id
2. Decrypt → JiraOAuthCredentials
3. Refresh token if needed
4. GET /rest/api/3/project/search?maxResults=100
5. Return { projects: [{ key, name }] }
```

---

## Implementation Order

1. **Schema migration** — add `'jira'` to check constraints; add `jira_issue_type` column
2. **Env vars** — register Atlassian app, wire `JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET`
3. **OAuth routes** — `authorize`, `callback`, `pending`, `complete`
4. **Projects route** — `jira/projects/route.ts` (pending flow) + `[integrationId]/jira-projects/route.ts` (post-connect)
5. **Adapter** — `lib/publish/adapters/jira.ts` with `refreshJiraToken`, `mdToAdf`, `publishToJira`
6. **Processor** — `setupJiraGroupContext` + `processOneSpec` Jira branch
7. **Types** — extend `IntegrationType`
8. **UI** — Jira card + OAuth state machine in `integrations/page.tsx`
9. **Folder mapping UI** — project key + issue type fields in the mapping drawer
10. **Tests** — unit tests for `mdToAdf`, `publishToJira`; e2e smoke test in testmdspecdocs repo

---

## Open Questions

| # | Question | Default assumption |
|---|----------|--------------------|
| 1 | Share the Atlassian OAuth app with Confluence, or separate? | Try to extend existing app first |
| 2 | Should issue title use `spec.title` frontmatter or filename? | Frontmatter `title` with filename fallback (same as other adapters) |
| 3 | Do we support linking issues together (e.g. "relates to")? | No — out of scope for MVP |
| 4 | Epic-child mode (shared Epic per folder)? | Defer to follow-up |
| 5 | Sync status back from Jira (open/closed)? | No — publish-only for now |
| 6 | Support Jira Data Center (on-prem)? | No — Jira Cloud only |
| 7 | ADF converter: hand-rolled or `@atlaskit` package? | Hand-rolled for MVP; adopt proper library after |
| 8 | Store numeric ID alongside issue key for project-move recovery? | Skip for MVP; add `jira_numeric_id` column on `spec_publish_targets` if users report it |
