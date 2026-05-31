import { NextResponse } from 'next/server'

const CONTENT = `# mdspec — Full Reference (v2: frontmatter routing)

> CI-based markdown publishing to Notion, Confluence, ClickUp, Jira, and S3. Routing is declared in each spec's frontmatter — no external config file.

The CLI package is **\`mdspeci\`** (trailing i). Invoke as \`npx mdspeci publish --project <project-id>\`.

## Frontmatter schema

Every markdown file declares its routing in frontmatter:

\`\`\`yaml
---
id: checkout-retry         # optional — stable spec identifier (deduplication)
type: wiki                 # required — 'wiki' or 'task' (v1)
integration: notion        # optional — overrides project default integration
parent: eng-docs           # optional — alias, native ID, or URL
---
\`\`\`

### Field reference

- \`id\` (optional) — stable identifier. Falls back to file path if absent.
- \`type\` (required) — \`wiki\` (publish as-is) or \`task\` (agent-transformed).
- \`integration\` (optional) — target integration. Falls back to project default.
- \`parent\` (optional) — alias / native ID / URL. Falls back to integration root.

### Type values (v1)

- **wiki** — General documentation. No agent transformation. Published as-is.
- **task** — Task/feature spec. Transformed by the Task Template before publishing.

### Integration values

\`notion\`, \`clickup\`, \`confluence\`, \`jira\`, \`s3\`.

### Parent values

Three formats, auto-detected:

- **Alias** (recommended): \`parent: eng-docs\` resolves to the alias defined in Dashboard → Integrations.
- **Native ID**: \`parent: abc123def456\` (e.g. Notion page ID, ClickUp list ID).
- **URL**: \`parent: https://notion.so/Engineering-abc123\`. Resolved to native ID on first publish.

Absent: spec publishes at the integration root.

## Files without frontmatter are silently ignored

There is no opt-out config, no allowlist, no skip patterns. Add frontmatter → it syncs. Don't → it doesn't.

## CLI

\`\`\`bash
npx mdspeci publish --project <project-id>
\`\`\`

Reads git diff against the previous commit on main, parses frontmatter on each changed \`.md\` file, posts a payload to the mdspec API.

### Flags

- \`--project <project-id>\` (required) — your mdspec project ID.
- \`--all\` — walk the entire repo and publish every file with frontmatter, ignoring git diff. Useful for first-time setup.

### Environment

- \`MDSPEC_TOKEN\` (required) — your project token (\`mds_...\`).
- \`MDSPEC_API_URL\` (optional) — override the API host. Defaults to \`https://mdspec.dev\`.
- \`GITHUB_EVENT_BEFORE\` — set automatically in GitHub Actions; used as the base ref for git diff.

## GitHub Actions example

\`\`\`yaml
name: mdspec sync
on:
  push:
    branches: [main]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: npx mdspeci publish --project <project-id>
        env:
          MDSPEC_TOKEN: \${{ secrets.MDSPEC_TOKEN }}
          GITHUB_EVENT_BEFORE: \${{ github.event.before }}
\`\`\`

## Integrations

### Notion

OAuth-based. The integration owns a workspace root page; per-spec \`parent:\` can target any sub-page or alias. Type-agnostic: both \`wiki\` and \`task\` publish as Notion pages.

### Confluence

Atlassian OAuth. Bound to a single space (configured at connect time). Per-spec \`parent:\` targets a page within the space.

### ClickUp

OAuth or personal API token. Two modes driven by spec \`type\`:

- \`type: wiki\` → ClickUp Doc with one page. \`parent:\` is a space or folder ID.
- \`type: task\` → ClickUp task. \`parent:\` is a list ID. Description = full markdown body.

### Jira

Atlassian OAuth. Issues are created in the configured project. Issue type defaults to \`Task\`. Description converted from markdown to Atlassian Document Format (ADF).

### S3

AWS access key pair. \`parent:\` becomes the S3 key prefix. Object key: \`{parent}/{filename}.md\` (or just \`{filename}.md\` if no parent).

## Agent transformation

Specs with \`type: task\` are transformed by the org's Task Template (Claude Haiku) before publishing. The template is editable in Dashboard → Templates. Wikis are published as-is.

## Aliases

Aliases are short names mapping to native IDs in your integrations. Define in Dashboard → Integrations → Aliases. Reference as \`parent:\` in frontmatter.

## Behaviour notes

- **Trigger**: only \`push: branches: [main]\`. No per-branch publishing.
- **Idempotent updates**: content hash is stored; republishing an unchanged spec is a no-op.
- **Append-only**: removing a file from the repo does NOT delete it from the target tool.
- **Renames**: in v1, a renamed file is treated as a new file (the old published version stays put). Rename handling will be added when first requested.
- **Self-healing**: if the stored external ID points to a deleted page/task, mdspec recreates and updates the ledger.
- **Rate limits**: enforced per-integration via QStash flow control. Confluence/Jira/Notion are slower than ClickUp/S3.

## Pricing

- **Free**: 1 project, 15 published docs.
- **Pro**: $9/month or $100/year. Unlimited projects, docs, integrations.
`

export function GET() {
  return new NextResponse(CONTENT, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
