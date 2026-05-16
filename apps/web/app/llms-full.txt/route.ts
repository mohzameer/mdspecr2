import { NextResponse } from 'next/server'

const CONTENT = `# mdspec — Configuration & CLI Reference

> Audit-ready, git-native markdown publishing for engineering teams.

mdspec publishes markdown spec files to Notion, ClickUp, Confluence, or S3 on every commit or merge — deterministically, with a full audit trail. Configuration lives in yml files placed in any folder of your repo. The CLI is invoked as \`npx mdspeci\` (the npm package is \`mdspeci\`, with a trailing i).

---

## .mdspecmap file

JSON Schema: https://mdspec.dev/mdspecmap.schema.json

A .mdspecmap file governs the folder it lives in and all subfolders. Its location is its scope — no \`folder:\` key is used inside mappings. Four top-level keys:

- \`version\` (required, always \`1\`): schema version — must be present or the CLI will reject the file
- \`mappings\` (required): routes specs to integrations
- \`default\` (optional): fallback integration/parent/target/agent for mappings that omit them
- \`specs\` (optional): per-spec overrides keyed by file path

### Full example

\`\`\`yaml
# docs/specs/.mdspecmap
version: 1

sync_all_on_first_run: false   # optional, default true — see sync_all_on_first_run section below

default:
  integration: clickup
  parent: alias:eng-docs

mappings:
  - skip:
      - DRAFT_*.md

specs:
  docs/specs/auth/sso-setup.md:
    title: SSO Setup Guide

  docs/specs/checkout-retry.md:
    title: Checkout Retry Policy
    agent: task_template
    id: CU-182

  docs/specs/sla-policy.md:
    id: CU-305
\`\`\`

---

## Distributed maps

Place a .mdspecmap in any folder — you are not limited to one at the root. The nearest ancestor .mdspecmap wins for any spec file. Set \`sub_folders: false\` to restrict a map to direct children only.

No \`folder:\` key — mappings have no folder field. The file's location is its scope. To route a subfolder differently, put a separate .mdspecmap inside that subfolder.

---

## mappings: fields

| Field | Required | Description |
|-------|----------|-------------|
| \`integration\` | No | notion, confluence, clickup, or s3 |
| \`parent\` | No | Four forms: alias:<name>, id:<nativeId>, link:<url>, or bare value |
| \`target\` | No | ClickUp only: document (default) or task |
| \`depth\` | No | Max subfolder depth. 1 = direct children only |
| \`maintain_hierarchy\` | No | S3 only. true preserves subfolder paths under the alias prefix |
| \`skip\` | No | Glob patterns for files to exclude |
| \`list_id\` | No | ClickUp: id:<listId>. Required when target: task |
| \`parent_doc\` | No | ClickUp doc that specs publish inside as pages |
| \`space_id\` | No | ClickUp space or folder ID |
| \`custom_task_ids\` | No | true to use ClickUp custom task IDs |
| \`agent\` | No | Agent template name to apply before publishing |

---

## parent: link: prefix

Paste a browser URL directly into the parent field using the link: prefix. The CLI extracts the native ID at publish time.

Supported: Notion pages, Confluence Cloud pages (/wiki/spaces/<KEY>/pages/<id>/...), ClickUp spaces/lists/docs.

Not supported: S3 (plain key prefix, not a URL), short links, Confluence Data Center /display/ URLs (use id:<pageId> instead), mobile URLs.

---

## default: fields

| Field | Description |
|-------|-------------|
| \`integration\` | Fallback integration: clickup, notion, confluence, s3 |
| \`parent\` | Fallback parent alias |
| \`target\` | Fallback target mode: document or task |
| \`agent\` | Fallback agent template |

---

## specs: fields

Keyed by file path. Add an entry only when you need to override title, set an agent, or link a task.

| Field | Description |
|-------|-------------|
| \`title\` | Page title — overrides H1 and filename derivation |
| \`agent\` | Agent template name for this spec only |
| \`id\` | Native ID of an existing page/doc/task to adopt on first publish |

Title resolution order (highest first): frontmatter title → specs[path].title → first H1 → filename.

---

## sync_all_on_first_run

Optional top-level boolean (default: \`true\`). Controls what happens the first time mdspec encounters a folder with no prior publish history.

| Value | Behaviour |
|-------|-----------|
| \`true\` (default) | All spec files in scope are published on first run, regardless of git diff |
| \`false\` | Only files changed in the triggering commit are published on first run |

Set to \`false\` when most specs already exist in the target tool and you want to avoid re-publishing everything.

---

## frontmatter_map

Optional field on a mapping. Renames the frontmatter keys mdspec reads for \`id\` and \`title\`, so teams can use their existing key conventions without renaming every spec file.

\`\`\`yaml
mappings:
  - integration: clickup
    target: task
    list_id: id:901812345
    frontmatter_map:
      id: task          # read "task:" frontmatter key instead of "id:"
      title: heading    # read "heading:" frontmatter key instead of "title:"
\`\`\`

Applies per-mapping. Omit to use the default keys (\`id\` and \`title\`).

---

## CI setup

\`\`\`yaml
name: mdspec sync
on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - run: npx mdspeci publish --project <project-id>
        env:
          MDSPEC_TOKEN: \${{ secrets.MDSPEC_TOKEN }}
          GITHUB_EVENT_BEFORE: \${{ github.event.before }}
\`\`\`

Find your project ID at Dashboard → Project → Settings → Overview.
Generate MDSPEC_TOKEN at Dashboard → Project → Settings → Tokens.

---

## CLI reference

\`\`\`
npx mdspeci publish --project <project-id>
npx mdspeci publish --project <project-id> --skip-diff
npx mdspeci publish --project <project-id> --base origin/main
npx mdspeci init --project <project-id>
\`\`\`

Environment variables:
- MDSPEC_TOKEN (required): project token
- GITHUB_EVENT_BEFORE (optional): previous commit SHA, set automatically by GitHub Actions

---

## Frontmatter

YAML frontmatter is optional. Supported keys: title, id, agent. Other keys are preserved on the artifact but ignored by adapters unless mapped explicitly.

\`\`\`markdown
---
title: My Spec
id: 86abc123
---

# Spec content here
\`\`\`

Frontmatter is stripped before publishing. id: binds the spec to an existing remote page/task. Use frontmatter_map on a mapping to rename the id or title key (see frontmatter_map section above).

---

## Skip patterns

\`\`\`yaml
mappings:
  - integration: clickup
    parent: alias:eng-docs
    skip:
      - DRAFT_*.md
      - _*.md
      - "**/scratch/**"
\`\`\`

Patterns match against filename and path relative to the .mdspecmap file's location.

---

## S3 integration

IAM permissions needed: s3:PutObject, s3:GetObject, s3:DeleteObject (on bucket/*), s3:ListBucket (on bucket ARN). s3:DeleteObject is required only for the Connect-time sentinel validation; published spec objects are never deleted.

Set maintain_hierarchy: true on a mapping to preserve subfolder paths under the alias prefix. Default is false (flatten to basename).

---

## Notion integration

mdspec pins Notion-Version: 2025-09-03. Two modes: page mode (each spec is a child page) and database mode (each spec is a row in a data source).

For database mode, the target data source must have a Name (title) and Content (rich_text) property. mdspec does not create or modify database schemas.

---

## Confluence integration

Supports Confluence Cloud only. Base URL must be https://yourcompany.atlassian.net (no /wiki path). Token generated at id.atlassian.com/manage/api-tokens.

Confluence Data Center /display/SPACEKEY/Page+Title URLs are not supported for link: extraction — use id:<pageId> obtained from the page via ··· → Page Information.

---

## ClickUp integration

Two modes: doc pages (target: document, default) and tasks (target: task with list_id). Mode is set per mapping in .mdspecmap. Personal API token starts with pk_.
`

export function GET() {
  return new NextResponse(CONTENT, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
