# mdspec — S3 Integration Specification
**Publishing Specs as Static Files to Amazon S3**

---

## 1. Overview

This spec adds **Amazon S3** as a new integration target in mdspec. When a folder mapping points to an S3 integration, specs are published as static markdown (and optionally rendered HTML) files stored in an S3 bucket, mirroring the spec directory structure as a key prefix hierarchy.

The primary use case is teams that want a portable, version-independent snapshot of their specs accessible via S3 — for static site generators, internal documentation portals, compliance archiving, or downstream automation that reads specs from object storage.

Typical workflow:

1. A team configures an S3 integration with their bucket credentials once
2. Folder mappings route spec directories to the bucket (with an optional key prefix per mapping)
3. Every publish pushes the latest spec content as an object; the S3 key mirrors the spec file path
4. The external URL returned is either the direct S3 object URL or a custom CloudFront/CDN URL if configured

---

## 2. Credentials and Configuration

### 2.1 Required credentials

```typescript
export interface S3Credentials {
  bucket: string           // e.g. "acme-specs"
  region: string           // e.g. "us-east-1"
  access_key_id: string
  secret_access_key: string
  key_prefix?: string      // optional root prefix, e.g. "docs/" — no leading slash
  cdn_base_url?: string    // optional, e.g. "https://docs.acme.com" — overrides S3 URL in external_url
  format: 's3_md' | 's3_html'  // default 's3_md'
}
```

- `key_prefix` is a bucket-wide prefix applied to all objects published through this integration. Per-folder prefixes come from the folder mapping (see §4).
- `cdn_base_url` is a vanity URL base (CloudFront, Cloudflare, etc.). When set, `external_url` stored in `spec_publish_targets` uses this base instead of the raw S3 URL.
- `format` controls the file extension and content type:
  - `s3_md` → `.md`, `Content-Type: text/markdown`
  - `s3_html` → `.html`, `Content-Type: text/html` (spec content converted from markdown to HTML)

### 2.2 IAM permissions required

The access key must have at minimum:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::acme-specs/*"
}
```

For health check on connect, `s3:ListBucket` on the bucket (not the prefix) is also required.

---

## 3. UI Changes — Integration Setup

### 3.1 Add Integration modal — S3 form

```
Integration type: [ S3 ▼ ]

Bucket name:       [ acme-specs                    ]
Region:            [ us-east-1 ▼                   ]
Access Key ID:     [ AKIA...                        ]
Secret Access Key: [ ••••••••••••••                 ]
Key prefix:        [ docs/                          ]  (optional)
CDN base URL:      [ https://docs.acme.com          ]  (optional)
Publish format:
  ● Markdown (.md)
  ○ HTML (.html)

[ Connect S3 ]  [ Cancel ]
```

On submit, the API performs a health check (`s3:PutObject` + `s3:DeleteObject` on a sentinel object `__mdspec_healthcheck__`) to verify the credentials before saving.

### 3.2 Folder Mappings table — S3 entry

```
┌──────────────────┬───────────────────────────────────────────┬──────────────────────┐
│ Folder           │ Integrations                              │ Agent Template       │
├──────────────────┼───────────────────────────────────────────┼──────────────────────┤
│ specs/           │ ● S3 [md]  ● Notion  [ + ]               │ — none —             │
│ docs/rfc/        │ ● S3 [html]  [ + ]                        │ RFC Template  [ ▼ ] │
└──────────────────┴───────────────────────────────────────────┴──────────────────────┘
```

Hovering the `[md]` / `[html]` badge shows a tooltip: `acme-specs · us-east-1 · prefix: docs/`.

---

## 4. S3 Key Structure

The S3 object key for a spec is composed as:

```
{integration_key_prefix}/{folder_mapping_prefix}/{spec_path_relative_to_spec_dir}.{ext}
```

For example, given:
- Integration key prefix: `docs/`
- No folder mapping prefix set
- Spec path: `specs/payments/checkout-retry.md`
- Format: `s3_md`

The resulting key is:

```
docs/specs/payments/checkout-retry.md
```

With `s3_html`:

```
docs/specs/payments/checkout-retry.html
```

The full spec path (including the configured `spec_dirs` root) is preserved so objects are addressable and debuggable without a manifest.

---

## 5. Publish Behaviour — Create vs Update

S3 `PutObject` is idempotent — uploading the same key replaces the existing object. There is no separate "create" vs "update" branch. Every publish unconditionally puts the object.

`external_page_id` in `spec_publish_targets` stores the S3 object key (not an opaque ID). This allows the worker to construct the URL on subsequent publishes without a lookup:

```
external_page_id: "docs/specs/payments/checkout-retry.md"
external_url:     "https://docs.acme.com/specs/payments/checkout-retry.md"
                   (or "https://acme-specs.s3.us-east-1.amazonaws.com/docs/specs/payments/checkout-retry.md" if no CDN)
```

---

## 6. HTML Conversion

When `format = 's3_html'`, the worker converts the spec markdown to HTML before upload. The conversion uses the same markdown parser used elsewhere in the worker (no new dependency), wrapped in a minimal HTML shell:

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

No external stylesheet is embedded in V1. Teams that want styling configure their CDN or reverse proxy to inject it.

---

## 7. Database Changes

### 7.1 `IntegrationType` — new value

```typescript
// apps/web/lib/types.ts
export type IntegrationType = 'notion' | 'confluence' | 'clickup' | 's3'
```

### 7.2 No schema changes to `folder_mappings` or `spec_publish_targets`

`external_page_id` stores the S3 object key. `external_url` stores the accessible URL. No new columns are needed.

### 7.3 `integrations.credentials` shape (encrypted at rest, existing column)

```json
{
  "bucket": "acme-specs",
  "region": "us-east-1",
  "access_key_id": "AKIA...",
  "secret_access_key": "...",
  "key_prefix": "docs/",
  "cdn_base_url": "https://docs.acme.com",
  "format": "s3_md"
}
```

---

## 8. New API Endpoint — S3 Health Check

**POST `/api/integrations/s3/validate`**

Called during the Connect S3 flow before saving. Attempts to put and immediately delete a sentinel object in the bucket.

Request body:
```json
{
  "bucket": "acme-specs",
  "region": "us-east-1",
  "access_key_id": "AKIA...",
  "secret_access_key": "...",
  "key_prefix": "docs/"
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

## 9. Worker / Adapter

### 9.1 New adapter: `apps/worker/src/adapters/s3.ts`

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export interface S3Credentials {
  bucket: string
  region: string
  access_key_id: string
  secret_access_key: string
  key_prefix?: string
  cdn_base_url?: string
  format: 's3_md' | 's3_html'
}

export async function publishToS3(
  credentials: S3Credentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown> },
  objectKey: string   // pre-computed by caller
): Promise<{ object_key: string; object_url: string }>
```

**Logic:**

1. Construct the `S3Client` with `region`, `access_key_id`, `secret_access_key`
2. If `format = 's3_html'`, convert `spec.content` from markdown to HTML (see §6)
3. Call `PutObjectCommand` with:
   - `Bucket`: `credentials.bucket`
   - `Key`: `objectKey`
   - `Body`: spec content (md or html string)
   - `ContentType`: `text/markdown` or `text/html`
4. Build and return `object_url`:
   - If `cdn_base_url`: `${cdn_base_url.replace(/\/$/, '')}/${objectKey}`
   - Else: `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`

### 9.2 Object key computation (worker, pre-adapter)

```typescript
function buildS3Key(
  specPath: string,
  integrationKeyPrefix: string | undefined
): string {
  const prefix = integrationKeyPrefix?.replace(/\/$/, '') ?? ''
  const normalised = specPath.replace(/^\//, '')
  return prefix ? `${prefix}/${normalised}` : normalised
}
```

### 9.3 Dispatch in `processOneSpec`

```typescript
case 's3':
  const s3Creds = JSON.parse(decryptedCredentials) as S3Credentials
  const objectKey = buildS3Key(spec.path, s3Creds.key_prefix)
  result = await publishToS3(s3Creds, specPayload, objectKey)
  externalPageId = result.object_key
  externalUrl = result.object_url
  break
```

### 9.4 Dependencies

Add `@aws-sdk/client-s3` to `apps/worker/package.json`. No other new dependencies.

---

## 10. Publish Flow

```
CI triggers mdspec publish
  └─ CLI detects changed specs
  └─ POST /api/publish → 202 Accepted

QStash Worker
  └─ Reads integration credentials (type = 's3')
  └─ For each spec in group:
        └─ Resolve agent template (unchanged)
        └─ If agent assigned: run transform → final content
        └─ buildS3Key(spec.path, key_prefix)
        └─ publishToS3(credentials, spec, objectKey)
              └─ PutObject → S3 bucket
        └─ Store object_key in external_page_id
        └─ Store object_url in external_url
        └─ Update status → 'published', published_at
```

---

## 11. Activity Feed

```
specs/payments/checkout-retry.md
  ✓ Published → S3 (acme-specs)   [ Open ↗ ]

docs/rfc/microservices-migration.md
  ✓ Published → S3 (acme-specs)   [ Open ↗ ]
```

The external URL opens the CDN URL (if configured) or the direct S3 object URL.

---

## 12. V1 Scope Constraints

- **No object deletion.** Deleting a spec file does not delete the S3 object. The object is orphaned. Deletion is out of scope for V1.
- **No bucket creation.** The bucket must already exist. mdspec does not provision buckets.
- **No per-file ACL.** Objects are written with the bucket's default ACL/policy. Public vs private access is a bucket-level concern.
- **No versioning integration.** mdspec does not use S3 object versioning. Every publish overwrites the current version.
- **Single region per integration.** Cross-region replication is handled outside mdspec.
- **Markdown or HTML, not both.** A single integration is either `s3_md` or `s3_html`. To publish both formats, create two integrations pointing at the same bucket with different prefixes.

---

*End of S3 Integration Specification — mdspec V1*
