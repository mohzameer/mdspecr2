# mdspec — S3 Integration
**Publishing Specs as Static Files to Amazon S3**

---

## 1. Overview

This document covers the full S3 integration in mdspec — from `.mdspecmap` configuration to key structure, alias resolution, shared parent directories, and publish behaviour.

When a folder mapping points to an S3 integration, specs are published as static markdown (or rendered HTML) files stored in an S3 bucket. Each mapping is defined in a `.mdspecmap` file dropped alongside the specs it covers — the alias set as `parent` resolves to an S3 key prefix that acts as the root container for those specs. In S3 terms, the **parent directory** is the analogue of the **parent doc** used in ClickUp or the **parent page** used in Notion.

**Primary use cases:**

- Static site generators and internal documentation portals that read from S3
- Compliance archiving — immutable, versioned snapshots of engineering specs
- Downstream automation that consumes spec content from object storage
- Teams that want a portable, self-hosted documentation store independent of third-party doc tools

**What S3 does not have that other integrations do:**

| Concept | Notion / ClickUp | S3 |
|---|---|---|
| Hierarchical container | Page tree / Doc | Key prefix hierarchy |
| Per-object addressability | Page ID | Object key |
| Native search | Yes | No |
| Create vs update distinction | Yes | No — `PutObject` always overwrites |
| Rich content format | Blocks / Markdown | Raw `.md` or rendered `.html` |

---

## 2. How S3 Fits with Other Integrations

S3 is a first-class integration type alongside Notion, Confluence, and ClickUp. All integrations operate independently — a folder mapping can publish to S3 and Notion simultaneously, with each processing independently.

S3 has no modes (unlike ClickUp's `doc` / `task_list`). Every S3 folder mapping publishes static files. The only per-integration choice is **format**: Markdown or HTML.

```
A spec change triggers publishing to all mapped integrations in parallel:

  docs/specs/checkout-retry.md  ──→  Notion (eng-docs)
                                ──→  S3     (eng-specs / md)
                                ──→  ClickUp (Sprint Backlog)
```

Each destination is independent. Failure on one does not block the others.

---

## 3. `.mdspecmap` Configuration for S3

### 3.1 Basic mapping

```yaml
# .mdspecmap
version: 1

mappings:
  - folder: docs/specs
    integration: s3
    parent: eng-specs         # S3 alias — resolves to bucket + root prefix
    format: md                # 'md' (default) or 'html'
    skip:
      - DRAFT_*.md
```

### 3.2 Field reference — S3-specific fields

| Field | Required | Description |
|---|---|---|
| `integration` | Yes | `s3` |
| `parent` | Yes | Alias name resolving to an S3 bucket + optional root key prefix |
| `format` | No | `md` (default) or `html`. Controls file extension and `Content-Type`. |
| `skip` | No | Glob patterns. Same semantics as all other integrations. |

`format` is the only S3-specific field beyond `parent`. Everything else (`folder`, `skip`, `agent`) is identical to other integrations.

### 3.3 Format values

| Value | Extension | Content-Type | When to use |
|---|---|---|---|
| `md` | `.md` | `text/markdown` | Static site generators, downstream tooling, raw consumption |
| `html` | `.html` | `text/html` | Browser-readable URLs, documentation portals reading from S3 |

### 3.4 Multiple integrations per folder

S3 can coexist with other integrations on the same folder:

```yaml
- folder: docs/architecture
  integration: notion
  parent: arch-docs

- folder: docs/architecture
  integration: s3
  parent: eng-specs
  format: html

- folder: docs/architecture
  integration: confluence
  parent: arch-confluence
```

Each spec in `docs/architecture/` publishes to all three independently.

---

## 4. Aliases for S3

### 4.1 What an S3 alias resolves to

An alias in the S3 context resolves to an **optional root key prefix** within the bucket. This is the S3 equivalent of a Notion page alias or a ClickUp Doc alias.

The bucket, region, and credentials all come from the connected integration record — the alias only names a prefix path within that bucket.

```
alias: eng-specs  →  root prefix: specs/
                      (bucket + credentials from the integration)
```

When the server resolves `parent: eng-specs`, it applies the prefix to the key computation for every spec in that mapping. The `.mdspecmap` file never contains bucket names or credentials — only the alias name.

### 4.2 Defining S3 aliases

Dashboard → Integrations → [S3 integration] → Aliases

```
Dashboard → Integrations → Acme S3 → Aliases

eng-specs        → specs/            [ Edit ] [ Delete ]
rfc-archive      → rfcs/             [ Edit ] [ Delete ]
compliance-docs  → archive/specs/    [ Edit ] [ Delete ]

[ + New Alias ]
```

When creating an alias:
1. Enter a name (lowercase, hyphens allowed, unique per org)
2. Optionally enter a root key prefix (no leading slash, trailing slash optional — normalised by the server). Leave blank to publish at the bucket root.
3. Save — alias is immediately available in `.mdspecmap`

### 4.3 Alias resolution at publish time

At publish time, `parent: eng-specs` is resolved to `{ root_prefix: "specs/" }`. The integration credentials (access key, secret, bucket, region) are loaded separately from the integration record. Both are combined to compute the object key and URL.

### 4.4 Unknown alias — hard block

Same as all integrations. If `.mdspecmap` references an unknown alias, the entire publish is blocked before any jobs are enqueued:

```
✗ Rejected   unknown alias 'eng-spec' in .mdspecmap (folder: docs/specs, integration: s3)
             Did you mean 'eng-specs'?
             Define aliases in Dashboard → Integrations → Acme S3 → Aliases
```

---

## 5. S3 Key Structure and Parent Directory

### 5.1 Key composition

The S3 object key for a spec is composed as:

```
{alias_root_prefix}/{spec_path_relative_to_repo_root}.{ext}
```

Where:
- `alias_root_prefix` — the prefix stored in the alias (e.g. `docs/`)
- `spec_path_relative_to_repo_root` — the full relative path of the spec file from the repo root, **including** any subdirectory hierarchy
- `ext` — `md` or `html` depending on format

**Example:**

Given:
- Alias `eng-specs` → `bucket: acme-engineering-specs`, `root_prefix: docs/`
- Spec path: `docs/specs/payments/checkout-retry.md`
- Format: `md`

Resulting S3 key:
```
docs/docs/specs/payments/checkout-retry.md
```

If the alias root prefix is empty (no prefix):
```
docs/specs/payments/checkout-retry.md
```

### 5.2 The parent directory is the alias root prefix

The **alias root prefix** is the S3 equivalent of the **parent doc** in ClickUp or the **parent page** in Notion. It is the root container in S3 under which all specs from that mapping (and any other mappings sharing the same alias) are organised.

```
S3 bucket: acme-engineering-specs

docs/                          ← parent directory (alias root prefix)
  docs/specs/
    payments/
      checkout-retry.md        ← spec
      refund-policy.md         ← spec
    auth/
      sso-setup.md             ← spec
  docs/rfc/
    microservices-migration.md ← spec from a different folder mapping, same alias
```

Multiple folder mappings that share the same `parent` alias all deposit their specs under the same S3 root — exactly as multiple folder mappings that share a ClickUp `parent_doc` all create pages inside the same document.

### 5.3 Subfolder hierarchy is preserved automatically

The full relative path of each spec (including all intermediate directories) becomes part of the S3 key. No configuration is needed to preserve nesting. The hierarchy emerges from the file paths themselves.

```
Repo:                                       S3 key (alias prefix: docs/):
docs/specs/payments/checkout-retry.md   →   docs/docs/specs/payments/checkout-retry.md
docs/specs/payments/refund-policy.md    →   docs/docs/specs/payments/refund-policy.md
docs/specs/auth/sso-setup.md            →   docs/docs/specs/auth/sso-setup.md
docs/rfc/microservices-migration.md     →   docs/docs/rfc/microservices-migration.md
```

---

## 6. Shared Parent Directory — Multiple Mappings

### 6.1 Concept

Multiple folder mappings can reference the same `parent` alias. All their specs land under the same S3 root prefix, with their full paths preserved beneath it. This is the S3 equivalent of multiple ClickUp folder mappings sharing one `parent_doc`.

**`.mdspecmap` example — two folders, one parent alias:**

```yaml
mappings:
  - folder: docs/specs
    integration: s3
    parent: eng-specs          # same alias
    format: md

  - folder: docs/rfc
    integration: s3
    parent: eng-specs          # same alias — shares the same S3 root
    format: md
```

**Resulting S3 layout** (alias root prefix: `docs/`):

```
docs/
  docs/specs/
    payments/
      checkout-retry.md
      refund-policy.md
    auth/
      sso-setup.md
  docs/rfc/
    microservices-migration.md
    event-streaming.md
```

Both folder mappings are independent jobs — a failure in one does not block the other — but their output is co-located under the same S3 prefix.

### 6.2 Comparison to ClickUp parent_doc

| | ClickUp | S3 |
|---|---|---|
| Shared container config | `parent_doc: id:2kzm3ftx-5278` on each mapping | Same `parent` alias on each mapping |
| Container type | ClickUp Doc | S3 key prefix (directory) |
| Content nesting | Pages nested inside the Doc | Objects nested under the prefix |
| Container must pre-exist | Yes — Doc must exist in ClickUp | Yes — bucket must exist in S3 |
| Server verifies container on publish | Yes — falls back to single-mode if Doc deleted | No — `PutObject` succeeds regardless of prefix existence |
| Multiple mappings share one container | Yes | Yes |

### 6.3 Isolating folders into separate roots

If you want specs from different folders in separate S3 roots, use different aliases:

```yaml
- folder: docs/specs
  integration: s3
  parent: eng-specs        # → acme-bucket / docs/

- folder: docs/rfc
  integration: s3
  parent: rfc-archive      # → acme-bucket / rfcs/
```

```
S3 bucket: acme-engineering-specs

docs/
  docs/specs/
    payments/checkout-retry.md

rfcs/
  docs/rfc/
    microservices-migration.md
```

---

## 7. Publish Behaviour

### 7.1 Idempotent PutObject — no create vs update

S3 `PutObject` unconditionally overwrites any existing object at the same key. There is no separate "create" vs "update" branch in the S3 adapter. Every publish puts the object.

```
First publish:   PutObject → creates object at key
Second publish:  PutObject → overwrites object at same key
```

This simplifies both the adapter and the ledger: `spec_publish_targets.external_page_id` stores the S3 object key on first publish; all subsequent publishes compute the same key and put directly without any lookup.

### 7.2 No frontmatter adoption

Unlike ClickUp task_list mode (which supports `clickup_task_id` in frontmatter to adopt an existing task), S3 has no adoption mechanism. There is no pre-existing S3 object to link to — the key is always derived deterministically from the spec path and alias prefix. Frontmatter is ignored by the S3 adapter.

### 7.3 What is stored in the ledger

```
spec_publish_targets row for an S3 publish:

  external_page_id:  "docs/docs/specs/payments/checkout-retry.md"   (object key)
  external_url:      "https://acme-specs.s3.us-east-1.amazonaws.com/specs/payments/checkout-retry.md"
  status:            "published"
  published_at:      2026-04-21T10:00:00Z
```

The object key in `external_page_id` is sufficient to reconstruct the S3 URL on any subsequent publish without a lookup.

---

## 8. HTML Conversion

When `format: html`, the worker converts the spec markdown to HTML before upload, wrapped in a minimal shell:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{spec_title}</title>
</head>
<body>
  {converted_html}
</body>
</html>
```

Where `{spec_title}` is derived from:
1. The `title` frontmatter field, if present
2. The first `# H1` heading in the spec content
3. The filename without extension (fallback)

No external stylesheet is embedded in V1.

The same markdown parser used elsewhere in the worker handles the conversion — no new dependency.

---

## 9. UI Changes

### 9.1 Add Integration modal — S3 form

```
Dashboard → Integrations → S3 → Connect

AWS Access Key ID:      [ AKIA...        ]
AWS Secret Access Key:  [ ************** ]
Bucket name:            [ acme-specs     ]
Region:                 [ us-east-1      ]

[ Connect S3 ]  [ Cancel ]
```

All four fields are required. mdspec stores the credentials encrypted via Supabase Vault; the worker calls S3 directly via `@aws-sdk/client-s3`.

On submit, the API performs a health check — `PutObject` + `DeleteObject` on `__mdspec_healthcheck__` — before saving.

### 9.2 Folder Mappings table — S3 entry

```
┌──────────────────┬──────────────────────────────────────────┬──────────────────────┐
│ Folder           │ Integrations                             │ Agent Template       │
├──────────────────┼──────────────────────────────────────────┼──────────────────────┤
│ docs/specs/      │ ● S3 [md]  ● Notion  [ + ]              │ — none —             │
│ docs/rfc/        │ ● S3 [html]  [ + ]                       │ RFC Template  [ ▼ ] │
└──────────────────┴──────────────────────────────────────────┴──────────────────────┘
```

Hovering the `[md]` / `[html]` badge shows a tooltip: `acme-engineering-specs · us-east-1 · prefix: docs/`.

---

## 10. Credentials and IAM

### 10.1 Credentials shape (stored in `integrations.credentials`, encrypted at rest via Supabase Vault)

```json
{
  "access_key_id": "AKIA...",
  "secret_access_key": "...",
  "bucket": "acme-specs",
  "region": "us-east-1"
}
```

All four fields are required. `external_url` in `spec_publish_targets` is always the direct S3 object URL: `https://{bucket}.s3.{region}.amazonaws.com/{key}`. CDN/CloudFront support is out of scope for V1.

### 10.2 Required IAM permissions

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::acme-engineering-specs/*"
}
```

For the connection health check, `s3:ListBucket` on the bucket (not the prefix) is also required.

---

## 11. Database Changes

### 11.1 `IntegrationType` — new value

```typescript
// apps/web/lib/types.ts
export type IntegrationType = 'notion' | 'confluence' | 'clickup' | 's3'
```

### 11.2 `folder_mappings` — new column

```sql
-- Format for S3 folder mappings
alter table folder_mappings
  add column s3_format text check (s3_format in ('md', 'html')) default 'md';
```

`s3_format` is only relevant when `target_type = 's3'`. For all other integrations it is null/ignored.

### 11.3 No changes to `spec_publish_targets`

`external_page_id` stores the S3 object key. `external_url` stores the direct S3 object URL. No new columns needed.

### 11.4 `aliases` table — S3 alias shape

S3 aliases use the existing `aliases` table. The `native_id` column stores just the key prefix:

```
native_id:    "specs/"                  (root key prefix, empty string if none)
native_url:   null                      (unused for S3 in V1)
display_name: "Engineering Specs"
```

The bucket and credentials come from the integration record. The alias only contributes the prefix applied to every object key under that mapping.

---

## 12. New API Endpoint — S3 Health Check

**POST `/api/integrations/s3/validate`**

Called during the Connect S3 flow before saving credentials. Attempts to put and immediately delete a sentinel object.

Request body:
```json
{
  "bucket": "acme-engineering-specs",
  "region": "us-east-1",
  "access_key_id": "AKIA...",
  "secret_access_key": "..."
}
```

Response on success:
```json
{ "ok": true }
```

Response on failure:
```json
{
  "ok": false,
  "error": "Access denied. Ensure the key has s3:PutObject and s3:DeleteObject on the bucket."
}
```

---

## 13. Worker / Adapter

### 13.1 New adapter: `apps/worker/src/adapters/s3.ts`

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export interface S3AdapterCredentials {
  bucket: string
  region: string
  access_key_id: string
  secret_access_key: string
  format: 'md' | 'html'
}

export async function publishToS3(
  credentials: S3AdapterCredentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  objectKey: string              // pre-computed by caller
): Promise<{ object_key: string; object_url: string }>
```

**Logic:**

1. Construct `S3Client` with `region`, `access_key_id`, `secret_access_key`
2. If `format = 'html'`, convert `spec.content` from markdown to HTML (see §8)
3. Derive `spec_title` from frontmatter `title`, first `# H1`, or filename (for HTML `<title>`)
4. Call `PutObjectCommand`:
   - `Bucket`: `credentials.bucket`
   - `Key`: `objectKey`
   - `Body`: spec content (md or html string)
   - `ContentType`: `text/markdown` or `text/html`
5. Build and return `object_url`:
   - `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`

### 13.2 Object key computation

```typescript
function buildS3Key(
  specPath: string,
  aliasRootPrefix: string | undefined,
  format: 'md' | 'html'
): string {
  const prefix = aliasRootPrefix?.replace(/\/$/, '') ?? ''
  const normalised = specPath.replace(/^\//, '').replace(/\.md$/, `.${format}`)
  return prefix ? `${prefix}/${normalised}` : normalised
}
```

The spec path already includes the full relative path from repo root. No additional folder-path stripping is needed — the full path is intentionally preserved to keep objects addressable without a manifest.

### 13.3 Dispatch in `processOneSpec`

```typescript
case 's3':
  const rawCreds = JSON.parse(decryptedCredentials)
  const [bucket, aliasPrefix] = parseAliasNativeId(folderMapping.alias_native_id)
  const s3Creds: S3AdapterCredentials = {
    ...rawCreds,
    format: folderMapping.s3_format ?? 'md',
  }
  const objectKey = buildS3Key(spec.path, aliasPrefix, s3Creds.format)
  result = await publishToS3(s3Creds, specPayload, objectKey)
  externalPageId = result.object_key
  externalUrl = result.object_url
  break
```

### 13.4 Dependencies

Add `@aws-sdk/client-s3` to `apps/worker/package.json`. No other new dependencies.

---

## 14. Publish Flow

```
CI triggers mdspec publish
  └─ CLI detects changed specs
  └─ POST /api/publish → 202 Accepted

Worker
  └─ Reads integration credentials (type = 's3'): access_key, secret, bucket, region
  └─ Resolves alias → root_prefix
  └─ Reads s3_format from folder_mapping
  └─ For each spec in group:
        └─ Resolve agent template (unchanged)
        └─ If agent assigned: run transform → final content
        └─ buildS3Key(spec.path, aliasRootPrefix, format)
        └─ publishToS3(credentials, spec, objectKey)
              └─ PutObject → S3 bucket (unconditional overwrite)
        └─ Store object_key in spec_publish_targets.external_page_id
        └─ Store object_url in spec_publish_targets.external_url
        └─ Update status → 'published', published_at
```

No group setup step (unlike ClickUp multi-mode which sets up a shared root page). Each spec is fully independent. Specs from different folder mappings sharing the same alias are published in their respective jobs — no coordination needed.

---

## 15. Activity Feed

```
docs/specs/payments/checkout-retry.md
  ✓ Published → S3 (acme-engineering-specs)     [ Open ↗ ]

docs/rfc/microservices-migration.md
  ✓ Published → S3 (acme-engineering-specs)     [ Open ↗ ]
```

"Published" is always shown — there is no "Updated" state since S3 has no create/update distinction. The `[ Open ↗ ]` link opens the direct S3 object URL.

---

## 16. `.mdspecmap` Validation

### 16.1 S3-specific validation rules

```
✗ Error   .mdspecmap validation failed:
          - mappings[2].format: unknown value 'markdown' (valid: 'md', 'html')
          - mappings[2].parent: required when integration is 's3'
```

### 16.2 Valid integration + format combinations

```
integration: s3
format: md      (default if omitted)
format: html
```

If `format` is omitted, `md` is assumed. No error.

---

## 17. V1 Scope Constraints

- **No object deletion.** Deleting a spec file from the repo does not delete the S3 object. The object is orphaned. Deletion is out of scope for V1.
- **No bucket provisioning.** The bucket must already exist. mdspec does not create or configure buckets.
- **No per-object ACL.** Objects are written with the bucket's default ACL/policy. Public vs private access is a bucket-level configuration outside mdspec.
- **No S3 versioning integration.** mdspec does not interact with S3 object versioning. Every publish replaces the current version. Object history is managed by S3 if versioning is enabled on the bucket.
- **No CDN / CloudFront support.** `external_url` is always the direct S3 object URL. CDN integration is out of scope for V1.
- **Single region per integration.** Multi-region replication is handled outside mdspec.
- **Markdown or HTML per mapping, not both.** To publish both formats, create two folder mappings with different `format` values pointing to the same alias (or different aliases with different prefixes).
- **No folder-level key prefix override in `.mdspecmap`.** The key prefix is an alias-level concern only. If you need different prefixes for different folders, create separate aliases.

---

## 18. Comparison Reference

| Concept | Notion | ClickUp (doc mode) | S3 |
|---|---|---|---|
| Container type | Page tree | Doc with pages | Key prefix (directory) |
| `parent` alias resolves to | Page ID | Space/folder ID | Root key prefix (bucket from credentials) |
| "Parent doc" equivalent | Parent page | `parent_doc: id:xxx` | Alias root prefix |
| Subfolder hierarchy | Auto-created page tree | Auto-created section pages | Preserved in key path |
| Multiple mappings share container | Yes — same alias | Yes — same `parent_doc` | Yes — same alias |
| Create vs update | Separate logic | Separate logic | Always PutObject |
| External ID stored | Page UUID | Page/doc UUID | Object key string |
| Frontmatter adoption | No | `clickup_task_id` | No |
| Content format | Rich blocks | Markdown | Raw `.md` or rendered `.html` |

---

*End of S3 Integration Specification — mdspec V1*
