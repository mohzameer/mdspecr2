# mdspec API Reference

Base URL: `https://mdspec.app`

All endpoints return JSON. Session-authenticated endpoints use Supabase Auth cookies. CLI endpoints use Bearer token authentication.

---

## Authentication

### Session auth (Dashboard)

All browser-facing endpoints authenticate via Supabase Auth session cookies. The current org is determined by the `current_org_id` cookie.

### Bearer token auth (CLI)

CLI endpoints use project tokens in the format `mds_<8char>_<32hex>`. Pass via `Authorization: Bearer <token>`.

```
Authorization: Bearer mds_a1b2c3d4_0123456789abcdef0123456789abcdef
```

---

## Publish

### `POST /api/publish`

**Auth:** Bearer token (CLI)

The primary endpoint. Receives specs and `.mdspecmap` config from the CLI, resolves aliases, routes specs to integrations, and enqueues sync jobs.

**Request body:**

```json
{
  "project_id": "uuid",
  "repo_name": "owner/repo",
  "branch": "main",
  "commit_sha": "abc123...",
  "commit_timestamp": 1713400000,
  "specs": [
    {
      "path": "docs/specs/auth.md",
      "previous_path": "docs/specs/authentication.md",
      "hash": "sha256:...",
      "frontmatter": { "title": "Auth Spec" },
      "content": "# Auth\n..."
    }
  ],
  "config": {
    "version": 1,
    "sync_all_on_first_run": false,
    "mappings": [
      {
        "folder": "docs/specs",
        "integration": "notion",
        "parent": "eng-docs",
        "skip": ["DRAFT_*.md"]
      }
    ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `project_id` | uuid | Yes | Project ID (must match token) |
| `repo_name` | string | Yes | `owner/repo` format |
| `branch` | string | Yes | Git branch name |
| `commit_sha` | string | Yes | Full commit SHA |
| `commit_timestamp` | number | Yes | Unix timestamp of the commit |
| `specs` | SpecArtifact[] | Yes | Array of changed spec files |
| `specs[].path` | string | Yes | Relative file path from repo root |
| `specs[].previous_path` | string | No | Set on rename (old path) |
| `specs[].hash` | string | Yes | `sha256:<hex>` content hash |
| `specs[].frontmatter` | object | Yes | Parsed YAML frontmatter |
| `specs[].content` | string | Yes | Markdown content (without frontmatter) |
| `config` | MdspecMapConfig | Yes | Parsed `.mdspecmap` file |

**Responses:**

| Status | Body | Meaning |
|---|---|---|
| `202` | `{ accepted: true, saved: 3, queued: 3, upgrade_nudge?: true }` | Success |
| `400` | `{ error: "missing_required_fields" }` | Invalid payload |
| `401` | `{ error: "invalid_token" }` | Bad or mismatched token |
| `402` | `{ error: "spec_limit_reached", limit: 10, upgrade_url: "..." }` | Free tier limit |
| `403` | `{ error: "repo_mismatch", registered: "...", received: "..." }` | Repo doesn't match |
| `422` | `{ error: "unresolved_aliases", aliases: [...] }` | Unknown alias in config |

**422 alias error detail:**

```json
{
  "error": "unresolved_aliases",
  "aliases": [
    { "alias": "eng-doc", "folder": "docs/specs", "suggestion": "eng-docs" }
  ]
}
```

---

## Project Config

### `GET /api/projects/:projectId/config`

**Auth:** Bearer token (CLI) or session (Dashboard)

Returns project configuration. Used by `mdspec init` to generate a starter `.mdspecmap`.

**Response:**

```json
{
  "spec_dirs": ["docs/specs", "docs/tasks"],
  "name": "Payments Service"
}
```

### `GET /api/projects/:projectId/generate-mdspecmap`

**Auth:** Session

Generates and downloads a `.mdspecmap` file from the current project configuration, folder mappings, and aliases.

**Response:** `text/yaml` file download.

---

## Aliases

Aliases map human-readable names to native container IDs in connected integrations. Referenced in `.mdspecmap` as the `parent` field.

### `GET /api/aliases`

**Auth:** Session

Lists all aliases for the current org.

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "eng-docs",
    "native_id": "abc123def456",
    "native_url": "https://notion.so/Engineering-abc123",
    "display_name": "Engineering Docs",
    "integration_id": "uuid",
    "integrations": { "id": "uuid", "type": "notion", "status": "connected" },
    "created_at": "2024-01-15T...",
    "updated_at": "2024-01-15T..."
  }
]
```

### `POST /api/aliases`

**Auth:** Session (org admin/owner)

Creates a new alias.

**Request body:**

```json
{
  "name": "eng-docs",
  "integration_id": "uuid",
  "native_id": "abc123def456",
  "native_url": "https://notion.so/Engineering-abc123",
  "display_name": "Engineering Docs"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Lowercase alphanumeric + hyphens, 1-64 chars |
| `integration_id` | uuid | Yes | Must be a connected integration in the org |
| `native_id` | string | Yes | Container ID in the target tool |
| `native_url` | string | No | URL for display purposes |
| `display_name` | string | No | Human-readable label |

**Responses:**

| Status | Meaning |
|---|---|
| `201` | Alias created |
| `400` | Invalid name format or missing fields |
| `403` | Not org admin |
| `404` | Integration not found |
| `409` | Alias name already exists in org |

### `PATCH /api/aliases/:aliasId`

**Auth:** Session (org admin/owner)

Updates an existing alias. Send only the fields to update.

**Request body:**

```json
{
  "name": "eng-docs-v2",
  "native_id": "new-page-id",
  "display_name": "Engineering Docs V2"
}
```

**Responses:**

| Status | Meaning |
|---|---|
| `200` | Updated |
| `404` | Alias not found |
| `409` | Name conflict |

### `DELETE /api/aliases/:aliasId`

**Auth:** Session (org admin/owner)

Deletes an alias. Any `.mdspecmap` referencing this alias will fail on next publish with a 422 error.

**Response:** `{ "deleted": true }`

---

## Organizations

### `POST /api/org/create`

**Auth:** Session

Creates a new organization. Each user can own only one org.

**Request body:**

```json
{ "name": "Acme Corp" }
```

**Responses:**

| Status | Meaning |
|---|---|
| `201` | Org created. Returns org object. |
| `409` | User already owns an org |

### `POST /api/org/switch`

**Auth:** Session

Switches the active org (sets `current_org_id` cookie).

**Request body:**

```json
{ "org_id": "uuid" }
```

### `GET /api/org/current`

**Auth:** Session

Returns the current org ID and details.

### `PATCH /api/org/update`

**Auth:** Session (org admin/owner)

Updates org name.

---

## Projects

### `POST /api/projects/create`

**Auth:** Session (org admin/owner)

Creates a new project under the current org.

**Request body:**

```json
{
  "name": "Payments Service",
  "description": "Spec docs for payments",
  "spec_dirs": ["/", "docs/specs"]
}
```

**Response:** `201` with project object.

### `PATCH /api/projects/:projectId/update`

**Auth:** Session (project admin)

Updates project fields (name, description, title_source, spec_dirs).

### `GET /api/projects/:projectId/specs`

**Auth:** Session

Lists all specs for a project with their publish target statuses.

---

## Tokens

### `POST /api/tokens/generate`

**Auth:** Session (project admin)

Generates a new project token. Max 3 active tokens per project.

**Request body:**

```json
{ "project_id": "uuid" }
```

**Response:**

```json
{ "token": "mds_a1b2c3d4_0123456789abcdef0123456789abcdef" }
```

The raw token is returned once and never stored. Only the bcrypt hash is persisted.

### `GET /api/tokens/list`

**Auth:** Session (project admin)

Lists active tokens for a project. Returns token hints (last 6 chars) only.

### `POST /api/tokens/revoke`

**Auth:** Session (project admin)

Revokes a token by ID.

---

## Integrations

### `GET /api/integrations/list`

**Auth:** Session

Lists all integrations for the current org.

**Response:**

```json
[
  {
    "id": "uuid",
    "type": "notion",
    "status": "connected",
    "config": { "root_page_id": "..." }
  }
]
```

### `POST /api/integrations/connect`

**Auth:** Session (org admin/owner)

Connects an integration. Upserts by `(org_id, type)`.

**Request body:**

```json
{
  "type": "notion",
  "credentials": "{...}",
  "config": { "root_page_id": "..." }
}
```

### `POST /api/integrations/disconnect`

**Auth:** Session (org admin/owner)

Marks an integration as disconnected.

**Request body:**

```json
{ "type": "notion" }
```

---

## Folder Mappings

Folder mappings are now primarily managed via `.mdspecmap`. The API routes remain for the UI configuration assistant and backward display.

### `GET /api/projects/:projectId/folder-mappings`

**Auth:** Session

Returns all folder mappings, available integrations, and templates for a project.

**Response:**

```json
{
  "mappings": [...],
  "available_integrations": [...],
  "templates": [...]
}
```

### `POST /api/projects/:projectId/folder-mappings`

**Auth:** Session (project admin)

Creates or updates a folder mapping. Triggers a backfill enqueue for existing specs in the folder.

### `PATCH /api/projects/:projectId/folder-mappings/:mappingId`

**Auth:** Session (project admin)

Updates a folder mapping.

### `DELETE /api/projects/:projectId/folder-mappings/:mappingId`

**Auth:** Session (project admin)

Deletes a folder mapping.

---

## Members

### `POST /api/members/invite`

**Auth:** Session (org admin/owner)

Sends an org invite by email.

### `POST /api/members/accept-invite`

**Auth:** Session

Accepts an org invite using the invite token.

---

## Templates

### `GET /api/projects/:projectId/templates`

**Auth:** Session

Lists agent transformation templates for a project.

### `POST /api/projects/:projectId/templates`

**Auth:** Session (project admin)

Creates a new template.

### `PATCH /api/projects/:projectId/templates/:templateId`

**Auth:** Session (project admin)

Updates a template.

### `DELETE /api/projects/:projectId/templates/:templateId`

**Auth:** Session (project admin)

Deletes a template.

---

## Worker

### `POST /api/worker/process`

**Auth:** QStash signature verification

Internal endpoint called by QStash to process publish group jobs. Not intended for direct use.

---

## Webhooks

### `POST /api/webhooks/paddle`

**Auth:** Paddle signature verification

Handles Paddle subscription webhooks for billing events.

---

## Error format

All error responses follow the same shape:

```json
{
  "error": "error_code_or_message"
}
```

Common error codes:

| Code | Meaning |
|---|---|
| `unauthorized` | Missing or invalid auth |
| `forbidden` | Authenticated but insufficient permissions |
| `not_found` | Resource not found |
| `invalid_token` | CLI token invalid or doesn't match project |
| `repo_mismatch` | Repo name doesn't match registered repo |
| `spec_limit_reached` | Free tier limit exceeded |
| `unresolved_aliases` | Unknown alias name in `.mdspecmap` |
| `already_owns_org` | User already owns an organization |

---

## Rate limits

No explicit rate limits are enforced at the API layer. Integration-specific rate limits are handled by the worker (retry with exponential backoff).

## Free tier limits

- 10 synced specs per project
- Nudge at 8 specs
- Upgrade to Pro for unlimited specs
