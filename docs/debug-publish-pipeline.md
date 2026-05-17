# Debugging the Publish Pipeline

This runbook covers how to diagnose publish failures end-to-end: from a CI verify timeout down to the exact Supabase row and Notion/ClickUp object state.

---

## Tools you need

| Tool | How to get it |
|---|---|
| Supabase service role key | `apps/web/.env.local` → `SUPABASE_SERVICE_ROLE_KEY` |
| Supabase project URL | `apps/web/.env.local` → `NEXT_PUBLIC_SUPABASE_URL` |
| Notion token | `testmdspecdocs/.env` → `NOTION_TOKEN` |

All Supabase queries below use the REST API with the service role key so you can skip RLS. The pattern is always:

```bash
curl -s "https://<project>.supabase.co/rest/v1/<table>?<filters>" \
  -H "apikey: <service_role_key>" \
  -H "Authorization: Bearer <service_role_key>"
```

---

## Step 1 — Identify the failing check in CI

When a CI verify run fails, the output names exactly which check failed and why:

```
❌ Alias | Notion alias:backend-page → "Notion Alias Test Document" under Backend [exists]
   └─ timed out after 180s (29 attempts)
```

There are three distinct failure signatures:

| Signature | Meaning |
|---|---|
| `timed out after Ns (N attempts)` | Document never appeared in the target system. Publish may not have run. |
| `wrong parent: type=... id=...` | Document exists but landed in the wrong location. Alias/mapping misconfigured. |
| `This operation was aborted` | Transient API timeout in the verify script. Retry the CI run. |

---

## Step 2 — Check the spec and its publish target

Find the spec row by path:

```bash
curl -s "https://<project>.supabase.co/rest/v1/specs?path=like.*notion-alias*&select=id,path,project_id,updated_at" \
  -H "apikey: <key>" -H "Authorization: Bearer <key>"
```

Then check its publish target:

```bash
curl -s "https://<project>.supabase.co/rest/v1/spec_publish_targets?spec_id=eq.<spec_id>&select=id,status,external_page_id,external_url,last_error,published_at" \
  -H "apikey: <key>" -H "Authorization: Bearer <key>"
```

What to look for:

| `status` | `external_page_id` | `last_error` | Diagnosis |
|---|---|---|---|
| `published` | a valid ID | null | Published successfully — verify may be wrong or page was deleted after publish |
| `failed` | null | error text | Publish errored — read `last_error` |
| `published` | null | null | Publish marked done but no page created — likely a code bug |
| `pending` | null | null | Job never ran — check queue / worker health |

---

## Step 3 — Verify the external object still exists

### Notion

Retrieve the page directly to check if it exists, who its parent is, and whether it is trashed:

```bash
curl -s "https://api.notion.com/v1/pages/<page_id>" \
  -H "Authorization: Bearer <notion_token>" \
  -H "Notion-Version: 2022-06-28" | python3 -m json.tool | grep -A5 '"parent"'
```

Key fields to check:

```json
{
  "parent": { "type": "page_id", "page_id": "cc69bd0f-..." },
  "in_trash": true,
  "is_archived": false
}
```

- `in_trash: true` — page was moved to Notion trash. It no longer shows up in search, so the verify script cannot find it. The self-heal in the processor handles this, but only when the file is re-sent by the CLI (i.e., when it changes).
- `parent.page_id` differs from expected — page was published under the wrong parent. Self-heal will recreate it on next publish.

### ClickUp

ClickUp doc existence is checked by the processor automatically on each publish. For manual diagnosis, use the ClickUp API:

```bash
curl -s "https://api.clickup.com/api/v2/doc/<doc_id>" \
  -H "Authorization: <api_token>"
```

---

## Step 4 — Check alias resolution

If the `.mdspecmap` uses `parent: alias:<name>`, verify the alias exists in the DB:

```bash
curl -s "https://<project>.supabase.co/rest/v1/aliases?name=eq.<alias_name>&select=id,name,native_id,integration_id" \
  -H "apikey: <key>" -H "Authorization: Bearer <key>"
```

If the alias is missing, the publish route returns HTTP 422 `unresolved_aliases` and the spec is never sent to the worker. Fix: create the alias in the dashboard under **Projects → [project] → Map → Aliases**.

To confirm which integration the alias should belong to:

```bash
curl -s "https://<project>.supabase.co/rest/v1/integrations?type=eq.notion&select=id,type,status,org_id" \
  -H "apikey: <key>" -H "Authorization: Bearer <key>"
```

---

## Step 5 — Check folder mapping resolution

The publish processor uses `folder_mappings.target_id` to route a spec to the correct destination page. Verify the mapping was written:

```bash
curl -s "https://<project>.supabase.co/rest/v1/folder_mappings?integration_id=eq.<integration_id>&select=id,folder_path,target_id,updated_at" \
  -H "apikey: <key>" -H "Authorization: Bearer <key>" | python3 -m json.tool
```

`target_id` is set by the publish route when it reconciles `.mdspecmap` on each push:
- For `parent: alias:<name>` → resolved `native_id` from the `aliases` table
- For `parent: id:<uuid>` → the raw UUID
- For `parent: link:<url>` → the ID extracted from the URL

If `target_id` is null for a Notion mapping and the integration has a `root_page_id` in credentials, the processor falls back to that. If both are null, the publish fails with "No Notion destination configured."

---

## Step 6 — Fix stale external_page_id

When a page has been trashed or moved externally and the processor's self-heal hasn't triggered yet (because the file hasn't changed), clear the pointer manually so the next publish creates a fresh page:

```bash
curl -s -X PATCH "https://<project>.supabase.co/rest/v1/spec_publish_targets?id=eq.<target_id>" \
  -H "apikey: <key>" \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"external_page_id": null, "external_url": null}'
```

Then force the file to be re-sent by the CLI:

```bash
# Touch the file to change its content hash
echo "\nUpdated: $(date +%Y-%m-%d)" >> path/to/FILE.md
git add path/to/FILE.md
git commit -m "chore: republish <name>"
git push
```

After the push, the pipeline will create a fresh page at the correct destination.

---

## Step 7 — Check the verify script itself

The verify script (`testmdspecdocs/verify/verify.ts`) uses `pollUntil` to retry checks until a 180s deadline. Two failure modes to be aware of:

**Transient abort:** The Notion search fetch has a 10s timeout. If the Notion API is slow, the fetch throws `AbortError` ("This operation was aborted"). Since `pollUntil` now retries on non-fatal errors, this will self-heal on the next poll interval. Re-running the CI is also sufficient.

**Wrong parent (hard fail):** If a page exists but under the wrong parent, `notionPageExistsUnderPage` throws a `wrong parent: ...` error. `pollUntil` does not retry these — the error surfaces immediately and the CI fails fast. This is intentional: retrying won't fix a misconfigured parent.

---

## Quick reference: relevant DB tables

| Table | Key columns | Purpose |
|---|---|---|
| `integrations` | `id`, `type`, `status`, `org_id`, `credentials_secret_id` | One row per connected tool |
| `aliases` | `name`, `native_id`, `integration_id`, `org_id` | Named shortcuts used in `.mdspecmap` `parent: alias:<name>` |
| `folder_mappings` | `folder_path`, `target_id`, `integration_id`, `project_id` | Per-folder destination override; written by the publish route on each push |
| `specs` | `id`, `path`, `project_id`, `content_hash` | One row per tracked file |
| `spec_publish_targets` | `spec_id`, `integration_id`, `status`, `external_page_id`, `last_error` | Publish ledger; one row per (spec, integration) pair |
