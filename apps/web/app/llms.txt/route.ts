import { NextResponse } from 'next/server'

const CONTENT = `# mdspec

> Audit-ready, git-native markdown publishing for engineering teams.

mdspec is a CI-based markdown publishing platform for engineering teams. Drop a yml file in your repo, add one line to GitHub Actions, and on every commit or merge your markdown specs publish automatically to Notion, Confluence, ClickUp, or S3 — with a full audit trail.

The CLI package is \`mdspeci\` (note the trailing i) — invoke it as \`npx mdspeci publish --project <project-id>\`.

## Docs

- [Getting Started & Configuration Reference](https://mdspec.dev/docs/api-reference): Complete reference for .mdspecmap schema, CLI commands, frontmatter, integrations (S3, Notion, ClickUp, Confluence), CI setup, skip patterns, depth limiting, agent templates, and worked example scenarios.
- [Machine-readable full reference](https://mdspec.dev/llms-full.txt): Condensed .mdspecmap schema, CLI reference, and integration details — optimised for LLM context windows.

## Optional

- [Pricing](https://mdspec.dev/pricing): Free tier (1 project, 15 docs); Pro tier ($9/mo or $100/yr, unlimited everything).
- [Terms of Service](https://mdspec.dev/terms)
- [Privacy Policy](https://mdspec.dev/privacy)
- [Contact](https://mdspec.dev/contact): zameer@xadlabs.com — XAD Labs (PVT) Ltd, Sri Lanka
`

export function GET() {
  return new NextResponse(CONTENT, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
