# mdspec Test Plan

Comprehensive unit and integration test specifications for the mdspec platform. Organized by layer: CLI, API, Worker, and UI.

Test framework: Vitest. Mocking: msw for API calls, Supabase test helpers for DB.

---

## 1. CLI — `apps/cli`

### 1.1 `.mdspecmap` Reader

**File:** `src/commands/publish.ts` → `readMdspecMap()`

| # | Test | Input | Expected |
|---|---|---|---|
| 1.1.1 | Valid minimal config | `version: 1\nmappings:\n  - folder: /` | Returns parsed config |
| 1.1.2 | Valid full config | All fields populated | Returns parsed config with all fields |
| 1.1.3 | Missing file | No `.mdspecmap` in cwd | Exits with error: ".mdspecmap not found" |
| 1.1.4 | Invalid YAML | `version: 1\nmappings: {broken` | Exits with error: "not valid YAML" |
| 1.1.5 | Wrong version | `version: 2` | Exits with error: "version: must be 1" |
| 1.1.6 | Missing mappings | `version: 1` (no mappings key) | Exits with error: "mappings: must be an array" |
| 1.1.7 | Missing folder in mapping | `mappings:\n  - integration: notion` | Exits with error: "mappings[0].folder: required" |
| 1.1.8 | Invalid integration type | `integration: notiom` | Exits with error including "did you mean 'notion'?" |
| 1.1.9 | Invalid target value | `target: page` | Exits with error: "must be 'document' or 'task'" |
| 1.1.10 | Skip-only mapping (no integration) | `- folder: /\n  skip:\n    - README.md` | Valid — no error |

### 1.2 Skip Pattern Application

| # | Test | Config | Files | Expected |
|---|---|---|---|---|
| 1.2.1 | Global skip by filename | `folder: /` skip `DRAFT_*.md` | `docs/DRAFT_foo.md` | Skipped |
| 1.2.2 | Global skip by path | `folder: /` skip `**/scratch/**` | `docs/scratch/foo.md` | Skipped |
| 1.2.3 | Folder-level skip | `folder: docs` skip `_*.md` | `docs/_internal.md` | Skipped |
| 1.2.4 | Folder skip doesn't affect other folders | `folder: docs` skip `_*.md` | `src/_util.md` | Not skipped |
| 1.2.5 | Global + folder combined | Both patterns | File matches folder pattern | Skipped |
| 1.2.6 | No skip patterns | Empty skip arrays | Any `.md` file | Not skipped |
| 1.2.7 | Frontmatter `mdspec_skip: true` | N/A | File with frontmatter flag | Skipped (in buildSpecArtifact) |

### 1.3 Change Detection

**Function:** `detectChangedFiles()`

| # | Test | git diff output | Expected |
|---|---|---|---|
| 1.3.1 | Modified file | `M\tdocs/auth.md` | In `changed` set |
| 1.3.2 | Added file | `A\tdocs/new.md` | In `changed` set |
| 1.3.3 | Deleted file | `D\tdocs/old.md` | Not in `changed`, logged as "deleted" |
| 1.3.4 | Renamed file | `R090\tdocs/old.md\tdocs/new.md` | In `changed`, `renames` maps `new.md → old.md` |
| 1.3.5 | Non-md file ignored | `M\tsrc/app.ts` | Not in `changed` |
| 1.3.6 | File outside spec dirs | `M\tother/file.md` | Not in `changed` (when dirs != root) |
| 1.3.7 | Root spec dir includes all | Dirs = `[""]` | All `.md` files included |
| 1.3.8 | git diff fails (unknown revision) | Error thrown | Returns null (publish all fallback) |

### 1.4 First Run Handling

| # | Test | GITHUB_EVENT_BEFORE | sync_all_on_first_run | Expected |
|---|---|---|---|---|
| 1.4.1 | First run, sync all true | all zeros | `true` | All specs published |
| 1.4.2 | First run, sync all false | all zeros | `false` | Exit: "No specs published" |
| 1.4.3 | First run, undefined before | undefined | `false` | Exit: "No specs published" |
| 1.4.4 | Normal run | valid SHA | N/A | Uses git diff |

### 1.5 Spec Artifact Builder

**Function:** `buildSpecArtifact()`

| # | Test | Input | Expected |
|---|---|---|---|
| 1.5.1 | Normal markdown | File with frontmatter + content | Returns artifact with hash, frontmatter, content |
| 1.5.2 | `mdspec_skip: true` | Frontmatter has skip flag | Returns null |
| 1.5.3 | Valid `mdspec_id` | `mdspec_id: auth_v2` | Preserved in frontmatter |
| 1.5.4 | Invalid `mdspec_id` | `mdspec_id: "INVALID!"` | Deleted from frontmatter, warning logged |
| 1.5.5 | Renamed file | `previousPath` provided | `previous_path` set in artifact |
| 1.5.6 | File read error | Non-existent file | Returns null, error logged |
| 1.5.7 | No frontmatter | Plain markdown, no `---` block | Empty frontmatter object |

### 1.6 Payload Construction

| # | Test | Expected |
|---|---|---|
| 1.6.1 | Payload includes config | `config` field matches parsed `.mdspecmap` |
| 1.6.2 | Payload includes commit_timestamp | `commit_timestamp` is a valid unix timestamp |
| 1.6.3 | Renamed spec has previous_path | `specs[].previous_path` set for renamed files |

### 1.7 CLI Error Handling

| # | Test | Server response | Expected CLI output |
|---|---|---|---|
| 1.7.1 | 401 | `{ error: "invalid_token" }` | "Authentication failed" |
| 1.7.2 | 402 | `{ error: "spec_limit_reached" }` | "Spec limit reached" + upgrade URL |
| 1.7.3 | 403 | `{ error: "repo_mismatch" }` | "Rejected repo mismatch" |
| 1.7.4 | 422 unresolved aliases | `{ error: "unresolved_aliases", aliases: [...] }` | Lists each alias with suggestion |
| 1.7.5 | Network error | Fetch throws | "Network error" |

### 1.8 Init Command

**File:** `src/commands/init.ts`

| # | Test | Condition | Expected |
|---|---|---|---|
| 1.8.1 | Generates .mdspecmap | Valid project config + aliases | File written with correct YAML |
| 1.8.2 | File already exists | `.mdspecmap` present | Exits with error |
| 1.8.3 | Missing token | No MDSPEC_TOKEN | Exits with error |
| 1.8.4 | API error | 404 response | Exits with "Project not found" |
| 1.8.5 | No aliases | API returns empty aliases | File generated with commented-out parent |

---

## 2. API — `apps/web/app/api`

### 2.1 Publish Route (`POST /api/publish`)

#### Authentication

| # | Test | Token | Expected |
|---|---|---|---|
| 2.1.1 | Valid token | Correct bcrypt-matched token | 202 |
| 2.1.2 | Missing auth header | No Authorization header | 401 |
| 2.1.3 | Invalid format | `Bearer invalid` | 401 |
| 2.1.4 | Token for wrong project | Valid token, wrong project_id | 401 |
| 2.1.5 | Revoked token | Token marked revoked in DB | 401 |

#### Payload Validation

| # | Test | Payload | Expected |
|---|---|---|---|
| 2.1.6 | Missing config | No `config` field | 400 "missing_or_invalid_config" |
| 2.1.7 | Invalid config version | `config.version: 2` | 400 |
| 2.1.8 | Missing required fields | No `project_id` | 400 |
| 2.1.9 | Empty specs array | `specs: []` | 400 |

#### Repo Enforcement

| # | Test | Condition | Expected |
|---|---|---|---|
| 2.1.10 | First publish registers repo | No registered_repo | Repo saved, 202 |
| 2.1.11 | Matching repo | registered_repo matches | 202 |
| 2.1.12 | Mismatched repo | Different repo_name | 403 "repo_mismatch" |

#### Free Tier

| # | Test | Condition | Expected |
|---|---|---|---|
| 2.1.13 | Under limit | 5 synced + 3 new | 202 |
| 2.1.14 | At limit | 10 synced + 1 new | 402 |
| 2.1.15 | Nudge at 8 | 7 synced + 1 new | 202 with `upgrade_nudge: true` |
| 2.1.16 | Pro plan bypasses limit | Pro subscription | 202 (no limit check) |

#### Alias Resolution

| # | Test | Config aliases | DB aliases | Expected |
|---|---|---|---|---|
| 2.1.17 | All aliases resolve | `[eng-docs]` | `eng-docs` exists | 202, specs routed |
| 2.1.18 | Unknown alias | `[eng-doc]` | `eng-docs` exists | 422 with suggestion "eng-docs" |
| 2.1.19 | Multiple unknown aliases | `[a, b]` | Neither exists | 422 listing both |
| 2.1.20 | Alias type mismatch | `eng-docs` alias→notion, mapping→clickup | Type mismatch | 422 "alias_integration_mismatch" |
| 2.1.21 | Mapping without parent | `folder: /` no parent | N/A | Routes by integration type |

#### Spec Routing

| # | Test | Config | Specs | Expected |
|---|---|---|---|---|
| 2.1.22 | Spec matches folder mapping | `folder: docs` | `docs/auth.md` | Routed to integration |
| 2.1.23 | Spec outside all mappings | `folder: docs` | `src/readme.md` | Not routed |
| 2.1.24 | Root folder catches all | `folder: /` | Any path | Routed |
| 2.1.25 | Multiple mappings same folder | 2 mappings for `docs` | `docs/auth.md` | Routed to both |
| 2.1.26 | ClickUp task target | `target: task` | Any spec | `clickup_mode: task_list` |

#### Rename Handling

| # | Test | Spec | DB state | Expected |
|---|---|---|---|---|
| 2.1.27 | Rename updates path | `previous_path: old.md` | `old.md` exists in DB | Path updated to new |
| 2.1.28 | Rename with no existing | `previous_path: old.md` | `old.md` not in DB | Normal upsert |

#### Config Reconciliation

| # | Test | Condition | Expected |
|---|---|---|---|
| 2.1.29 | First config | No existing config timestamp | DB updated |
| 2.1.30 | Newer config | New timestamp > existing | DB updated |
| 2.1.31 | Older config | New timestamp < existing | DB not updated |

### 2.2 Aliases CRUD

#### `GET /api/aliases`

| # | Test | Expected |
|---|---|---|
| 2.2.1 | Unauthenticated | 401 |
| 2.2.2 | Authenticated, has aliases | Returns array with integration join |
| 2.2.3 | Authenticated, no aliases | Returns empty array |

#### `POST /api/aliases`

| # | Test | Body | Expected |
|---|---|---|---|
| 2.2.4 | Valid alias | `{ name: "eng-docs", integration_id: "...", native_id: "..." }` | 201 |
| 2.2.5 | Duplicate name | Same name as existing | 409 |
| 2.2.6 | Invalid name format | `name: "ENG DOCS!"` | 400 |
| 2.2.7 | Missing required fields | No native_id | 400 |
| 2.2.8 | Non-admin user | Member role | 403 |
| 2.2.9 | Integration not connected | Disconnected integration_id | 400 |
| 2.2.10 | Integration not in org | Foreign integration_id | 404 |

#### `PATCH /api/aliases/:aliasId`

| # | Test | Body | Expected |
|---|---|---|---|
| 2.2.11 | Update name | `{ name: "new-name" }` | 200, name updated |
| 2.2.12 | Update native_id | `{ native_id: "new-id" }` | 200 |
| 2.2.13 | Name conflict | Existing name | 409 |
| 2.2.14 | Invalid name | Bad format | 400 |
| 2.2.15 | Not found | Non-existent aliasId | 404 |

#### `DELETE /api/aliases/:aliasId`

| # | Test | Expected |
|---|---|---|
| 2.2.16 | Delete existing alias | 200 `{ deleted: true }` |
| 2.2.17 | Non-admin user | 403 |

### 2.3 Project Config

#### `GET /api/projects/:projectId/config`

| # | Test | Auth | Expected |
|---|---|---|---|
| 2.3.1 | CLI token auth | Valid Bearer token | Returns spec_dirs, name |
| 2.3.2 | Invalid CLI token | Wrong token | 401 |
| 2.3.3 | Session auth | Browser cookies | Returns spec_dirs, name |
| 2.3.4 | Project not found | Bad projectId | 404 |

### 2.4 Generate .mdspecmap

#### `GET /api/projects/:projectId/generate-mdspecmap`

| # | Test | DB state | Expected |
|---|---|---|---|
| 2.4.1 | With folder mappings + aliases | Mappings and aliases exist | YAML with parent fields filled |
| 2.4.2 | No folder mappings | Empty folder_mappings | YAML with commented-out example from spec_dirs |
| 2.4.3 | Mapping without alias | No alias for integration_id | YAML with comment placeholder |
| 2.4.4 | Content-Type | Any | `text/yaml; charset=utf-8` |
| 2.4.5 | Content-Disposition | Any | `attachment; filename=".mdspecmap"` |

### 2.5 Tokens

| # | Test | Condition | Expected |
|---|---|---|---|
| 2.5.1 | Generate token | < 3 active | 201 with raw token |
| 2.5.2 | Max tokens | 3 active tokens | 422 "Maximum 3 active tokens" |
| 2.5.3 | Token format | Generated token | Matches `mds_<8char>_<32hex>` |
| 2.5.4 | Non-admin | Member role | 403 |

### 2.6 Organizations

| # | Test | Condition | Expected |
|---|---|---|---|
| 2.6.1 | Create org | First org for user | 201 with org + owner membership |
| 2.6.2 | Already owns org | User has owner role | 409 "already_owns_org" |
| 2.6.3 | Switch org | Valid org_id | Cookie set |

### 2.7 Integrations

| # | Test | Condition | Expected |
|---|---|---|---|
| 2.7.1 | Connect integration | Valid credentials | Upserted, status "connected" |
| 2.7.2 | Reconnect same type | Already exists | Updated (upsert) |
| 2.7.3 | Disconnect | Connected integration | Status set to "disconnected" |
| 2.7.4 | List integrations | 2 connected | Returns array of 2 |

### 2.8 Folder Mappings

| # | Test | Condition | Expected |
|---|---|---|---|
| 2.8.1 | Create mapping | Valid folder + integration | 201 + backfill enqueued |
| 2.8.2 | Root folder normalization | `folder_path: "/"` | Stored as `""` |
| 2.8.3 | Path traversal blocked | `folder_path: "../etc"` | 400 |
| 2.8.4 | Duplicate mapping | Same (project, folder, integration, mode) | Upserted |
| 2.8.5 | Delete mapping | Valid mappingId | Deleted |

---

## 3. Worker — `apps/worker`

### 3.1 Publish Processor

| # | Test | Job data | Expected |
|---|---|---|---|
| 3.1.1 | Notion doc publish | target_type: notion | Notion API called, status → published |
| 3.1.2 | Confluence doc publish | target_type: confluence | Confluence API called |
| 3.1.3 | ClickUp doc mode | target_type: clickup, mode: doc | ClickUp doc API called |
| 3.1.4 | ClickUp task mode | target_type: clickup, mode: task_list | ClickUp task API called |
| 3.1.5 | Integration error | API returns 500 | status → failed, last_error set |
| 3.1.6 | Rate limit handling | API returns 429 | Retried with backoff |

### 3.2 Agent Processor

| # | Test | Condition | Expected |
|---|---|---|---|
| 3.2.1 | Template-based transform | Valid template + content | LLM called, transformed_content saved |
| 3.2.2 | No template | template_id null | Skips agent, publishes raw content |
| 3.2.3 | LLM error | OpenAI returns error | agent_run.status → failed |

---

## 4. UI Components

### 4.1 Integrations Page — Aliases Section

| # | Test | Action | Expected |
|---|---|---|---|
| 4.1.1 | Shows "Connect integration" message | No connected integrations | Message displayed, no "New Alias" button |
| 4.1.2 | Shows "New Alias" button | Has connected integration | Button visible |
| 4.1.3 | Create alias form | Click "New Alias" | Form appears with name, integration, native_id fields |
| 4.1.4 | Name auto-lowercased | Type "Eng-Docs" | Input shows "eng-docs" |
| 4.1.5 | Submit creates alias | Fill form, submit | POST /api/aliases called, list refreshed |
| 4.1.6 | Duplicate name error | Submit existing name | Error message shown |
| 4.1.7 | Edit alias | Click "Edit" | Inline form with current values |
| 4.1.8 | Delete alias | Click "Delete", confirm | DELETE called, removed from list |
| 4.1.9 | Delete requires confirmation | Click "Delete" | Confirm dialog shown |

### 4.2 Map Page — Download Button

| # | Test | Action | Expected |
|---|---|---|---|
| 4.2.1 | Download button visible | Page loaded | "Download .mdspecmap" button present |
| 4.2.2 | Click triggers download | Click button | Blob downloaded as `.mdspecmap` |
| 4.2.3 | Downloaded file is valid YAML | Parse downloaded file | Valid YAML with version: 1 |

### 4.3 Onboarding Flow

| # | Test | Step | Expected |
|---|---|---|---|
| 4.3.1 | 6 steps in progress bar | Page loaded | 6 step indicators |
| 4.3.2 | Step 3 has sync checkbox | On step 3 | Checkbox visible, unchecked by default |
| 4.3.3 | Step 5 is .mdspecmap download | On step 5 | Download button + summary |
| 4.3.4 | Downloaded file reflects settings | Set sync_all=true, dirs=[docs] | File has `sync_all_on_first_run: true` and `folder: docs` |
| 4.3.5 | Step 6 is integration | On step 6 | Integration buttons shown |
| 4.3.6 | Skip org with param | `?skip_org=1` | Starts at step 2 |

---

## 5. Database — Migration Integrity

### 5.1 Aliases Table

| # | Test | Expected |
|---|---|---|
| 5.1.1 | Table exists | `aliases` table created |
| 5.1.2 | Unique constraint | `(org_id, name)` unique |
| 5.1.3 | Name format check | Rejects `"INVALID!"`, accepts `"eng-docs"` |
| 5.1.4 | FK cascade on org delete | Aliases deleted when org deleted |
| 5.1.5 | FK cascade on integration delete | Aliases deleted when integration deleted |

### 5.2 Projects Columns

| # | Test | Expected |
|---|---|---|
| 5.2.1 | New columns exist | `last_config_commit_sha`, `last_config_commit_timestamp`, `last_config_reconciled_at` |
| 5.2.2 | Nullable by default | All three null on existing projects |

### 5.3 RLS Policies

| # | Test | User | Expected |
|---|---|---|---|
| 5.3.1 | Org member can read aliases | Member of org | SELECT succeeds |
| 5.3.2 | Non-member cannot read | Not in org | SELECT returns empty |
| 5.3.3 | Admin can insert | Admin role | INSERT succeeds |
| 5.3.4 | Member cannot insert | Member role | INSERT denied |
| 5.3.5 | Admin can update | Admin role | UPDATE succeeds |
| 5.3.6 | Admin can delete | Admin role | DELETE succeeds |

---

## 6. Integration Tests (End-to-End)

### 6.1 Full Publish Flow

| # | Test | Steps | Expected |
|---|---|---|---|
| 6.1.1 | First publish with sync_all=true | Create project, alias, publish with sync_all | All specs saved + queued |
| 6.1.2 | First publish with sync_all=false | Create project, publish with sync_all=false | No specs published |
| 6.1.3 | Subsequent publish | Change one file, publish again | Only changed file saved + queued |
| 6.1.4 | Rename flow | Rename file, publish | Old path updated, no orphan |
| 6.1.5 | Skip pattern respected | Add DRAFT_foo.md, skip DRAFT_* | File not in payload |
| 6.1.6 | Unknown alias blocks publish | Reference bad alias | 422, no specs saved |
| 6.1.7 | Multiple integrations | Same folder → 2 integrations | Both targets get specs |

### 6.2 Alias Lifecycle

| # | Test | Steps | Expected |
|---|---|---|---|
| 6.2.1 | Create alias → use in publish | Create alias, publish with it | Specs routed to alias target |
| 6.2.2 | Update alias → publish | Change native_id, publish | Specs routed to new target |
| 6.2.3 | Delete alias → publish | Delete alias, publish | 422 unresolved |

### 6.3 Config Reconciliation

| # | Test | Steps | Expected |
|---|---|---|---|
| 6.3.1 | Config updates folder_mappings | Publish with config | DB folder_mappings mirror config |
| 6.3.2 | Newer config wins | Publish twice, newer timestamp second | DB reflects newer config |
| 6.3.3 | Older config loses | Process older commit after newer | DB unchanged |
