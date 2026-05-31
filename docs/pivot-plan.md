# mdspec Pivot Plan
**Companion to [new-pivot.md](new-pivot.md) — codebase analysis and execution sequence**

---

## 0. Premise

- The routing model is defined in [new-pivot.md](new-pivot.md): frontmatter declares destination, files without frontmatter are silently ignored.
- **No existing users.** Delete freely. No migration commands. No parallel paths. No backwards-compat shims.

---

## 1. Resolved Decisions

These were open questions in an earlier draft; settled on this iteration:

| # | Question | Decision | Implication |
|---|---|---|---|
| D1 | When does mdspec publish? | **Only on push to `main`** (= after PR merge — squash, rebase, or merge commit all produce a push to main). No per-branch publishing. | CI snippet stays as `on: push: branches: [main]`. No webhooks. No GitHub App. |
| D2 | Where do branch publishes land? | **N/A — no branch publishes.** No preview pages. Single canonical destination per spec, overwritten on each merge. | No "Previews" UI in any integration. No cleanup story needed. |
| D3 | Branch-encoded routing (e.g. `feature/CU-182-…` → linked to CU-182)? | **Dropped.** Pure frontmatter routing. Ticket IDs go in frontmatter as `parent: CU-182` or `id: CU-182`. | One source of truth. The branch-routing layer disappears entirely — no extraction, no CI plumbing, no regex configuration. |
| D4 | Which `type` values does v1 ship? | **Only `task` and `wiki`.** Other 8 types from spec §3.2 deferred. `task` → task-mode on ClickUp/Jira, doc-mode elsewhere. `wiki` → doc-mode everywhere, no transformation. Agent transformation applied per type so frontmatter stays minimal. | Templates page has 2 rows, not 10. Spec §3.2 reads as the roadmap; v1 implements the first two. |
| D5 | First-time setup UX (no `sync_all_on_first_run`) | **Ship `mdspec publish --all` in v1.** Walks the repo, publishes every file with frontmatter regardless of git diff. | Replaces the dropped first-sync probe. Small CLI flag (~30 LOC). |
| D6 | Notion parent fallback | When `parent:` is absent and no project default resolves a parent, publish at **workspace root**. | Removes the "no parent → error" path. Always publishes somewhere. |
| D7 | Confluence parent fallback | When `parentId` is null, page lands at **space content root**. | Same semantics as Notion. |
| D8 | Test suite | **Wipe all existing tests in step 2.** Write new ones alongside each new file in step 3. | Cleaner than incremental migration. Existing tests are coupled to the old model. |
| D9 | Marketing site | **All references to `.mdspecmap` / folder-mapping / Map Page get updated.** Find-and-replace pass at the end. | Affects `HeroDiagram`, `SnippetSlider`, `HowItWorksFlow`, marketing pages, `llms.txt`, `llms-full.txt`. |
| D10 | GitHub App | **Not in v1.** Webhook routes for it (if any) get deleted in step 2. Paddle billing webhooks stay. | Removes a dependency surface. §15 of spec already lists it as optional. |
| D11 | `projects.registered_repo` | **Keep.** First publish registers the repo; subsequent publishes must match or get 403. | Already in current schema and §8.1 of spec — explicit retain. |
| D12 | Default type + minimal-frontmatter UX | **Add `projects.default_type text not null default 'wiki'`** to schema. `type:` becomes optional in frontmatter and falls back to the project default. Settings UI auto-selects the first connected integration as the suggested default when none is set. | Empty `---\n---` blocks become valid — users only need frontmatter to opt files in, not to declare every field. |

The pivot collapses to: **pure frontmatter routing, two types (`task` + `wiki`), main-only trigger, single destination, single overwrite per merge.** With project defaults set, frontmatter is opt-in but minimal — files inherit `type` and `integration` from the project. This is the v1 surface.

---

## 2. Retain — keep largely as-is

Load-bearing pieces unchanged by the pivot:

| Component | Path | Notes |
|---|---|---|
| Integration adapters | [apps/web/lib/publish/adapters/](../apps/web/lib/publish/adapters/) | Touched only to strip folder-mapping context. Core publish-to-X logic stays. |
| Integration OAuth flows | [apps/web/app/api/integrations/](../apps/web/app/api/integrations/) | Notion, ClickUp, Confluence, Jira, S3 — all stay. |
| Agent template engine | [apps/web/lib/agents/](../apps/web/lib/agents/) | Re-keyed from per-folder to per-`type`. Code unchanged. |
| Credentials vault | [apps/web/lib/credentials.ts](../apps/web/lib/credentials.ts) | Untouched. |
| Auth / billing / members / org | Most of [apps/web/app/api/](../apps/web/app/api/) | Untouched. |
| Activity feed | [components/ActivityFeed.tsx](../apps/web/components/ActivityFeed.tsx), `(dashboard)/projects/[projectId]/activity/` | Shows `type` field instead of folder. |
| CLI shell | [apps/cli/src/index.ts](../apps/cli/src/index.ts) | Arg parsing, git diff invocation, payload POST, exit codes — stay. |
| Aliases (data layer) | [apps/web/app/api/aliases/](../apps/web/app/api/aliases/) + `aliases` table | Still resolve `parent:` values per §3.4 of the spec. UI moves inline into Integrations page. |
| Rate limits / QStash dispatch | [apps/web/app/api/publish/route.ts](../apps/web/app/api/publish/route.ts) `RATE_LIMITS` block | Per-integration flow control unchanged. |
| Email notifier | [apps/web/lib/emailNotifier.ts](../apps/web/lib/emailNotifier.ts) | Unhealthy-integration emails unchanged. |

---

## 3. Simplify — file/concept stays, body collapses

| File | Now | After | What changes |
|---|---|---|---|
| [apps/web/app/api/publish/route.ts](../apps/web/app/api/publish/route.ts) | 703 LOC | ~250 | Delete `.mdspecmap` config validation, `resolveMapping`, `parseParent` prefix system (`alias:`/`id:`/`link:`). Add per-spec routing: `integration ?? default`, `parent` 3-format resolver (alias / native ID / URL-with-cache). |
| [apps/web/lib/publish/processor.ts](../apps/web/lib/publish/processor.ts) | 762 LOC | ~300 | Drop the entire `GroupContext` (folderMapping\*, isMultiMode, sectionPageIds, preserveHierarchy, s3Hierarchy, frontmatterMap, jiraIssueType). Keep credential refresh + adapter dispatch + agent inline run. |
| [apps/cli/src/commands/publish.ts](../apps/cli/src/commands/publish.ts) | 1080 LOC | ~280 | Delete the whole `MdspecMapConfig` tree, `.mdspecmap` discovery + parsing, `sub_folders`/`depth`/`skip` walking, `micromatch`, first-sync probe. Keep git diff, frontmatter parse, rename detection. |
| `lib/types.ts` `MdspecMapConfig` | bulky nested types | gone | Replace with the `SpecArtifact` shape from §6.4 of the spec. |
| Database schema | 30+ migrations | one fresh initial migration | New tables: `specs`, `spec_publish_targets`, `aliases`, `integrations`, `templates`, `sync_runs`. `projects.default_integration text` and `projects.default_type text not null default 'wiki'` added per §9.3 of the spec (D12). |
| Dashboard sidebar | Map / Activity / Integrations / Settings | Activity / Integrations / **Templates** / Settings | Map gone; Templates is a fresh standalone page with **2 rows** (wiki = None; task = Task Template) per D4. Reuses [TemplateEditor.tsx](../apps/web/app/(dashboard)/projects/[projectId]/map/TemplateEditor.tsx) extracted before delete. |
| Webhook routes | [apps/web/app/api/webhooks/](../apps/web/app/api/webhooks/) (Paddle + possibly GitHub App) | Paddle only | Audit during step 2 — delete any GitHub App route per D10. Paddle billing webhook stays untouched. |
| Marketing site | References `.mdspecmap`, folder mapping, Map Page | Updated to frontmatter routing | Per D9 — find-and-replace pass in step 4. Affects components, marketing pages, llms\*.txt. |

---

## 4. Delete

### Files / folders

| Path | LOC | Reason |
|---|---|---|
| [apps/web/lib/folder-mapping.ts](../apps/web/lib/folder-mapping.ts) | 57 | Folder-based routing gone. |
| [apps/web/lib/folder-hierarchy.ts](../apps/web/lib/folder-hierarchy.ts) | 17 | Ancestor walking unused. |
| [apps/web/app/(dashboard)/projects/[projectId]/map/](../apps/web/app/(dashboard)/projects/[projectId]/map/) (whole folder) | ~2,800 | Map Page removed entirely. Salvage [TemplateEditor.tsx](../apps/web/app/(dashboard)/projects/[projectId]/map/TemplateEditor.tsx), [templatePresets.ts](../apps/web/app/(dashboard)/projects/[projectId]/map/templatePresets.ts), [AliasesTab.tsx](../apps/web/app/(dashboard)/projects/[projectId]/map/AliasesTab.tsx) before deleting. |
| [apps/web/app/mdspecmap.schema.json](../apps/web/app/mdspecmap.schema.json) | — | JSON schema for the dead config. |
| [apps/cli/src/commands/init.ts](../apps/cli/src/commands/init.ts) | 112 | The `.mdspecmap` scaffolder. Defer rewriting as `add-frontmatter` (§7 of the spec) — not a launch blocker. |
| Stale docs | — | [docs/mdspecmap-config-file.md](mdspecmap-config-file.md), [docs/mdspecmap-distributed-pivot.md](mdspecmap-distributed-pivot.md), [docs/mdspecmap-spec.md](mdspecmap-spec.md), [docs/MAP_SPEC.md](../MAP_SPEC.md), [docs/MAP_BUILD_PLAN.md](../MAP_BUILD_PLAN.md), [docs/parent-link-support.md](parent-link-support.md), [docs/pattern-grouped-parents.md](pattern-grouped-parents.md), [docs/NO_FRONTMATTER_PIVOT.md](../NO_FRONTMATTER_PIVOT.md) |
| All `folder_mappings` migrations | — | Squash into fresh initial schema. |

### Concepts

| Concept | Fate |
|---|---|
| `.mdspecmap` discovery + parsing | Pure delete — frontmatter replaces it |
| `sub_folders`, `depth`, `skip` patterns | Pure delete — presence of frontmatter is the inclusion filter |
| `default:` block merging / inheritance | Replaced (narrower) — only `default_integration` at project level |
| `parent:` prefix system (`alias:` / `id:` / `link:`) | Replaced — implicit detection in `resolveParent` (URL → URL; matches alias → alias; otherwise → native ID) |
| Map Page sidebar entry | Split into 3 surfaces — Templates page, Aliases inline in Integrations, no folder-mapping UI |
| `frontmatter_map` per-folder canonical → key remapping | Pure delete — no canonical attributes to remap after D4 + §8.4 |
| ClickUp shared-folder-doc + section pages | Pure delete — every spec is its own doc with one page |
| S3 `maintain_hierarchy` + `parent_dir` | Replaced — `parent:` in frontmatter becomes the bucket prefix; no hierarchy |
| Jira per-folder issue-type override | Pure delete — always `'Task'` in v1 |
| `sync_all_on_first_run` | Replaced by `mdspec publish --all` flag per D5 |
| First-sync probe endpoint | Pure delete — only existed to drive the above |
| `previous_path` rename handling | **Deferred, not deleted.** Until added, renaming = orphan old page + create new page |

### Files / folders — also delete in step 2

- **All tests** (D8): `apps/web/lib/__tests__/`, `apps/web/lib/publish/__tests__/`, `apps/web/app/api/__tests__/`, `apps/web/components/__tests__/`, `apps/cli/src/__tests__/`, plus per-route `__tests__/` folders
- **Webhook routes for GitHub App** (D10): audit [apps/web/app/api/webhooks/](../apps/web/app/api/webhooks/) — delete GitHub App routes; keep Paddle

### Migrations

All 30+ migration files (entire `supabase/migrations/`). Replace with one initial migration for the new schema. Safe because there's no production data to preserve.

---

## 5. Execution Plan

Sequenced for a single contributor on a clean branch.

**Status (live):** all five steps complete except 3f (tests deferred) and the historical changelog entry under §5.4. Build and typecheck are green on both `apps/web` and `apps/cli`.

### 5.1 Step 1 — Salvage  ✓ done

Before the nuke PR, lift these files out of the Map folder so they can be reused later:
- [TemplateEditor.tsx](../apps/web/app/(dashboard)/projects/[projectId]/map/TemplateEditor.tsx) → `apps/web/components/TemplateEditor.tsx`
- [templatePresets.ts](../apps/web/app/(dashboard)/projects/[projectId]/map/templatePresets.ts) → `apps/web/lib/templatePresets.ts` (rekey from folder-pattern to per-`type`)
- [AliasesTab.tsx](../apps/web/app/(dashboard)/projects/[projectId]/map/AliasesTab.tsx) → keep nearby for the Integrations-page inline use

### 5.2 Step 2 — The nuke PR  ✓ done

Single PR. Build goes red; nothing else lands until step 3 fixes it.

- Delete `apps/web/lib/folder-mapping.ts`, `folder-hierarchy.ts`
- Delete `apps/web/app/(dashboard)/projects/[projectId]/map/` (after salvage)
- Delete `apps/web/app/mdspecmap.schema.json`
- Wipe `supabase/migrations/*` → replace with `20260601000000_initial.sql` (schema design in §9)
- Empty `apps/cli/src/commands/publish.ts` and `init.ts`
- Strip `MdspecMapConfig` and related types from `lib/types.ts`
- Remove Map entry from the sidebar
- **Wipe all test files** (D8) — list in §4
- **Audit `apps/web/app/api/webhooks/`** — delete GitHub App routes per D10; keep Paddle billing route
- Delete stale docs listed in §4

### 5.3 Step 3 — Core publish path  ✓ done (tests deferred)

Rewrite against the existing adapters:
- New `/api/publish/route.ts` (~250 LOC): token auth, payload validate, per-spec resolution chain per §5 of the spec, QStash enqueue with existing rate limits. Per D4: reject any `type` other than `task`/`wiki` with a clear error.
- New `lib/publish/processor.ts` (~300 LOC): credentials + OAuth refresh + adapter dispatch + agent inline. Per D6: Notion falls back to workspace root when no parent resolves. Per D7: Confluence falls back to space content root.
- New `cli/commands/publish.ts` (~300 LOC): git diff, frontmatter parse, payload POST. Per D5: add `--all` flag that walks the repo and includes every file with frontmatter regardless of git diff (~30 LOC of the 300).
- `lib/types.ts` `SpecArtifact` + `PublishPayload` shapes per §6.4 of the spec. Per D12: `SpecArtifact.type` is `string | null` — server resolves the fallback.
- Per D12: route resolves `resolvedType = spec.type ?? project.default_type`, rejects only if both absent.
- New tests written alongside each new file (per D8) — **deferred to step 3f; not blocking v1**

Adapter changes (full detail in §8):
- **ClickUp**: complete rewrite — `publishAsDoc` + `publishAsTask`, ~250 LOC. Self-heal helpers retained.
- **Confluence**: delete the `getAncestorFolders` page-hierarchy loop. ~10 LOC.
- **S3**: collapse `buildS3Key` to `{prefix}/{filename}`, drop `maintainHierarchy`. ~15 LOC.
- **Notion**: `publishToNotion` accepts a per-call `parentPageId`; `root_page_id` becomes fallback. ~10 LOC.
- **Jira**: drop `projectKeyOverride` + per-folder `issueType` params; default to 'Task'. ~5 LOC.

Defer: `previous_path` rename handling. Add later when first user asks.

### 5.4 Step 4 — Dashboard + marketing  ✓ done

- New top-level **Templates** page (reuses salvaged `TemplateEditor.tsx`, `templatePresets.ts`). Two rows per D4: `wiki` (None — publish as-is) and `task` (Task Template, editable).
- **Aliases** UI inline in the per-integration detail view (reuses salvaged `AliasesTab.tsx`).
- **Default Integration + Default Type** dropdowns in Project Settings → General (§10.3 of the spec; D12). UI auto-selects the first connected integration when no default is set.
- Activity feed: shows `→ Integration  type  status  time-ago` per spec §10.2.
- **Marketing update pass** (D9): find-replace `.mdspecmap` / "folder mapping" / "Map Page" across `apps/web/app/(marketing)/`, `components/HeroDiagram.tsx`, `components/SnippetSlider.tsx`, `components/HowItWorksFlow.tsx`, `components/AgentTemplatesSection.tsx`, `app/llms.txt`, `app/llms-full.txt`, and `app/(marketing)/docs/api-reference/page.tsx` (full rewrite, 1540 → ~600 LOC).

### 5.5 Step 5 — Defer until first user asks  ✓ scoped

- `mdspec add-frontmatter` helper (§7 of the spec)
- `previous_path` rename handling
- 8 additional `type` values from spec §3.2 (adr, rfc, api, runbook, data-model, security, release, sprint)
- Jira issue-type-from-frontmatter (Epic, Story, etc.)
- ClickUp task metadata (priority, status, tags, due_date)
- GitHub App
- Non-GitHub-Actions CI documentation

---

## 6. LOC Budget

| Bucket | Delete | Add | Net |
|---|---|---|---|
| Routing layer (publish route + processor + CLI publish + `--all` flag) | ~2,545 | ~860 | **−1,685** |
| Folder libs | 74 | 0 | **−74** |
| Map page (entire) | ~2,800 | 0 | **−2,800** |
| Templates page (new top-level, 2 rows per D4) | 0 | ~250 | **+250** |
| Schema (squash 30+ migrations into one) | ~600 | ~250 | **−350** |
| Adapter changes (see §8.6) | ~554 | ~265 | **−289** |
| Tests (wipe per D8, write new alongside step 3) | ~1,500 | ~600 | **−900** |
| Webhook GitHub App routes (per D10) | ~100 | 0 | **−100** |
| Marketing copy updates | ~50 | ~50 | **0** |
| Stale docs | ~3,000 | 0 | **−3,000** |
| **Total** | | | **~−8,950 LOC** |

Net deletion of roughly 9k LOC. Healthy pivot.

---

## 7. Risks and Open Threads

- **ClickUp adapter rewrite** is the biggest single step. Surface defined in §8 (`publishAsDoc` + `publishAsTask`, ~250 LOC). Budget 1–2 days. Self-heal helpers retained, so not greenfield.
- **Aliases inline in Integrations page** needs an integration-detail view that doesn't currently exist as a dedicated page. Likely a sheet/modal off the Integrations list. Not a blocker.
- **Webhooks audit** — needs to actually read [apps/web/app/api/webhooks/](../apps/web/app/api/webhooks/) during step 2 to confirm what's GitHub App vs Paddle. ~30 minutes.

D1–D12 closed all prior open threads.

---

## 8. Adapter Rewrites

### 8.1 Summary

| Adapter | Verdict | LOC delta |
|---|---|---|
| **ClickUp** | Complete rewrite | 514 → ~250 |
| Confluence | Surgical edit | ~−10 |
| S3 | Surgical edit | ~−15 |
| Notion | Parameter change | net ~+5 |
| Jira | Minor cleanup | ~−5 |

ClickUp is the only real rewrite. The other four are folded into step 3 of the execution plan as small targeted edits — no separate sub-step needed.

### 8.2 ClickUp — new adapter surface

Two publish functions plus retained helpers. The whole "shared folder doc + section pages keyed by sub-folder" mental model is gone.

```typescript
// DOC MODE — every spec is its own doc with one page
export async function publishAsDoc(
  creds: ClickUpCredentials,
  spec: SpecPayload,
  parentTarget: string | null,        // 'space:<id>' | 'folder:<id>' | null = workspace root
  existing: { docId: string; pageId: string } | null
): Promise<{ doc_id: string; page_id: string; doc_url: string }>

// TASK MODE — spec → ClickUp task (summary + description only)
export async function publishAsTask(
  creds: ClickUpCredentials,
  spec: SpecPayload,
  listId: string,                     // resolved from frontmatter.parent at the route layer
  existingTaskId: string | null
): Promise<{ task_id: string; task_url: string; previousIdStale?: boolean }>

// Retained from current adapter — connect-time + self-heal
export async function listClickUpTargets(creds): Promise<ClickUpTarget[]>
export async function validateClickUpCredentials(creds): Promise<ValidationResult>   // NEW
export async function getClickUpDocParent(creds, docId)        // self-heal on parent change
export async function getClickUpTaskListId(creds, taskId)       // self-heal on list change
export async function resolveToNativeTaskId(creds, taskId, useCustomTaskIds)
export async function clickUpDocExists(creds, docId)
export async function clickUpPageExists(creds, docId, pageId)
```

### 8.3 ClickUp — what gets deleted

| Item | Reason |
|---|---|
| `publishSingleSpec` | Replaced by `publishAsDoc` (same behaviour, cleaner signature) |
| `publishSpecAsPage` | **Deleted entirely.** Shared-folder-doc + section-pages model is gone. |
| `sectionPageIds: Map<string, string>` parameter | Section pages don't exist anymore |
| `subFolder` derivation from `spec.path.split('/')` | No folder hierarchy concept in the new model |
| `parseTaskFields` heading-section parser | Task gets summary + description only — see §8.4 |
| `frontmatterMap` parameter on task update | Partial-update / per-folder canonical→key remap is gone |

### 8.4 ClickUp — task field policy

Task gets **summary** (resolved title) and **description** (full markdown body). Nothing else.

- No priority / status / tags / due_date set by mdspec
- User maintains those fields in ClickUp directly
- Frontmatter stays aligned with the §3 schema in new-pivot.md — no extra fields
- Description PUT always sends `markdown_description`; never partial updates

If demand emerges later for richer task metadata, add a `task_meta:` frontmatter sub-object then. Not in v1.

### 8.5 Other adapters — surgical edits

**Confluence** — [apps/web/lib/publish/adapters/confluence.ts:163-170](../apps/web/lib/publish/adapters/confluence.ts#L163-L170)
```diff
- const folders = getAncestorFolders(spec.path)
- let parentId: string | null = parentPageId ?? null
- if (!parentPageId) {
-   for (const folder of folders) {
-     parentId = await findOrCreatePage(credentials, spaceId, folder.name, parentId)
-   }
- }
+ const parentId = parentPageId ?? null    // null = space root
```
Also drop the `getAncestorFolders` import (line 2). Self-heal on parent change at [:183-185](../apps/web/lib/publish/adapters/confluence.ts#L183-L185) stays.

**S3** — [apps/web/lib/publish/adapters/s3.ts:10-29](../apps/web/lib/publish/adapters/s3.ts#L10-L29)
```diff
- export function buildS3Key(
-   specPath: string,
-   rootPrefix: string | null | undefined,
-   options: { maintainHierarchy?: boolean; matchedFolder?: string } = {}
- ): string {
-   const prefix = rootPrefix?.replace(/\/$/, '') ?? ''
-   let relativePath: string
-   if (options.maintainHierarchy && options.matchedFolder) {
-     const folderPrefix = options.matchedFolder.replace(/\/$/, '') + '/'
-     relativePath = specPath.startsWith(folderPrefix)
-       ? specPath.slice(folderPrefix.length)
-       : specPath
-   } else {
-     relativePath = specPath.split('/').pop() ?? specPath
-   }
-   const path = relativePath.replace(/^\//, '')
-   return prefix ? `${prefix}/${path}` : path
- }
+ export function buildS3Key(specPath: string, rootPrefix: string | null | undefined): string {
+   const prefix = rootPrefix?.replace(/\/$/, '') ?? ''
+   const filename = specPath.split('/').pop() ?? specPath
+   return prefix ? `${prefix}/${filename}` : filename
+ }
```

**Notion** — [apps/web/lib/publish/adapters/notion.ts:82-113](../apps/web/lib/publish/adapters/notion.ts#L82-L113)
- Change `publishAsPage` and `publishToNotion` to accept `parentPageId?: string | null`
- Use `parentPageId ?? credentials.root_page_id` as the actual parent
- Self-heal on parent change in the processor (Notion's `getNotionPageParentId` already exists)
- No new logic — just plumbing the per-spec parent through

**Jira** — [apps/web/lib/publish/adapters/jira.ts:149-155](../apps/web/lib/publish/adapters/jira.ts#L149-L155)
```diff
- export async function publishToJira(
-   credentials: JiraOAuthCredentials,
-   spec: { path: string; content: string; resolvedTitle: string },
-   existingIssueId?: string | null,
-   projectKeyOverride?: string | null,
-   issueType?: string | null,
- ): Promise<...>
+ export async function publishToJira(
+   credentials: JiraOAuthCredentials,
+   spec: { path: string; content: string; resolvedTitle: string },
+   existingIssueId?: string | null,
+ ): Promise<...>
```
`projectKey` always comes from `credentials.project_key`. `issueType` defaults to `'Task'`. If per-spec project/type is needed later, expose it as frontmatter then.

### 8.6 Where this fits in execution

The ClickUp rewrite is the bulk of step 3 (§5.3) — call it day 1 of step 3. The four surgical edits happen alongside processor rewrites on day 2.

LOC budget for adapter work:

| | Delete | Add | Net |
|---|---|---|---|
| ClickUp full rewrite | ~514 | ~250 | **−264** |
| Confluence loop delete | ~10 | 0 | **−10** |
| S3 key simplification | ~20 | ~5 | **−15** |
| Notion parent plumbing | ~5 | ~10 | **+5** |
| Jira param cleanup | ~5 | 0 | **−5** |
| **Adapter total** | | | **~−289** |

This was missing from the §6 budget — add it as a row, bringing net pivot LOC to roughly **−7,930**.

---

## 9. Initial Schema Design

A single fresh migration `supabase/migrations/20260601000000_initial.sql` replaces all 30+ existing migrations. No production data exists, so this is safe.

### 9.1 Tables in v1

| Table | Source | Notes |
|---|---|---|
| `orgs` | carry forward | unchanged shape |
| `org_members` | carry forward | unchanged shape (user_id, org_id, role) |
| `projects` | carry forward + new columns | adds `default_integration text` per D-spec §9.3; adds `default_type text not null default 'wiki'` per D12; keeps `registered_repo` per D11; keeps `publish_count`; **drops `title_source`** (no longer used) |
| `project_tokens` | carry forward | unchanged — `MDSPEC_TOKEN` auth |
| `integrations` | carry forward | unchanged — `org_id`, `type`, `credentials_secret_id`, `status` |
| `aliases` | renamed from `mdspecmap_aliases` | parent-resolution lookup; columns unchanged |
| `templates` | carry forward (already org-scoped per migration `20260425`) | now per-`type` instead of folder-pattern; only `wiki`/`task` rows in v1 per D4 |
| `sync_runs` | carry forward (added migration `20260518`) | activity-feed source |
| `user_email_notifications` | carry forward (added migration `20260427`) | unhealthy-integration emails |
| `specs` | **new shape** per spec §9.1 | see SQL below |
| `spec_publish_targets` | **simplified** per spec §9.2 | drops `clickup_mode` column (mode is derivable from `type`) |

### 9.2 Tables dropped from current state

| Table | Reason |
|---|---|
| `folder_mappings` (and all its migrations) | Folder-based routing gone |
| `support_tickets` | Already dropped per migration `20260501` — confirm absent |

### 9.3 Specs table (per spec §9.1)

```sql
CREATE TABLE specs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path              text NOT NULL,
  spec_id           text NOT NULL,          -- frontmatter.id or path
  type              text NOT NULL,          -- 'wiki' | 'task' (v1)
  commit_sha        text NOT NULL,
  content_hash      text NOT NULL,
  frontmatter       jsonb,                  -- full frontmatter
  deleted_from_repo boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, spec_id)
);

CREATE INDEX specs_project_idx ON specs(project_id);
CREATE INDEX specs_path_idx ON specs(project_id, path);
```

### 9.4 Spec publish targets (per spec §9.2)

```sql
CREATE TABLE spec_publish_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id         uuid NOT NULL REFERENCES specs(id) ON DELETE CASCADE,
  integration_id  uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id     text,                     -- native page/task ID
  external_page_id text,                    -- ClickUp doc page sub-id (null for non-ClickUp)
  external_url    text,
  status          text NOT NULL,            -- 'queued' | 'published' | 'failed'
  retry_count     int NOT NULL DEFAULT 0,
  last_error      text,
  published_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(spec_id, integration_id)
);

CREATE INDEX spt_spec_idx ON spec_publish_targets(spec_id);
```

### 9.5 Projects column additions

```sql
ALTER TABLE projects ADD COLUMN default_integration text;
ALTER TABLE projects ADD CONSTRAINT projects_default_integration_check
  CHECK (default_integration IN ('notion','clickup','confluence','jira','s3') OR default_integration IS NULL);

-- D12: minimal-frontmatter UX. spec.type falls back to project.default_type.
ALTER TABLE projects ADD COLUMN default_type text NOT NULL DEFAULT 'wiki';
ALTER TABLE projects ADD CONSTRAINT projects_default_type_check
  CHECK (default_type IN ('wiki','task'));
```

### 9.6 RLS policies

Carry forward the current RLS pattern (org-membership-scoped). The fix from migration `20240109` (`fix_projects_rls_recursion`) and `20240102` (`fix_rls_recursion`) must be baked into the initial migration — don't reintroduce the recursion bug.

### 9.7 What needs inspection before writing the file

Step 2 work, not pre-work:

1. Read current state of `orgs`, `org_members`, `projects`, `integrations`, `templates`, `sync_runs`, `user_email_notifications`, `project_tokens`, `aliases` from the existing migrations to capture the exact column shapes
2. Confirm `support_tickets` is gone
3. Capture the working RLS policies from `20240102` + `20240109`
4. Confirm `integrations.credentials_secret_id` and the Vault link from migration `20260505`
5. Confirm Paddle subscription table shape (`20240416_subscription_per_user`)
6. Write `20260601000000_initial.sql` as one CREATE TABLE per table + ALTER + RLS, in dependency order

Estimated migration file size: ~350–500 LOC.

---

## 10. What Still Requires Inspection (during step 2)

These are small audit tasks, not unresolved decisions:

| # | Task | Where | Effort |
|---|---|---|---|
| A1 | Inventory current `apps/web/app/api/webhooks/` routes — separate GitHub App from Paddle | [apps/web/app/api/webhooks/](../apps/web/app/api/webhooks/) | 30 min |
| A2 | Inspect all migrations to capture working table shapes for §9.7 | [supabase/migrations/](../supabase/migrations/) | 2 hours |
| A3 | List all `.mdspecmap` references in marketing copy + components | `grep -r mdspecmap apps/web/app/(marketing) components/` | 15 min |
| A4 | List all test files to wipe in step 2 | `find apps -path '*__tests__*'` | 15 min |
| A5 | Confirm Paddle subscription tables are independent of folder_mappings | [supabase/migrations/20240416_subscription_per_user.sql](../supabase/migrations/20240416_subscription_per_user.sql) | 15 min |

---

*End of pivot plan — see [new-pivot.md](new-pivot.md) for the routing spec itself.*
