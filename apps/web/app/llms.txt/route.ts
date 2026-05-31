import { NextResponse } from 'next/server'

const CONTENT = `# mdspec

> Audit-ready, git-native markdown publishing for engineering teams.

mdspec is a CI-based markdown publishing platform for engineering teams. Add four lines of frontmatter to any markdown file, add one line to GitHub Actions, and on every push to main your markdown specs publish automatically to Notion, Confluence, ClickUp, Jira, or S3 — with a full audit trail.

Routing is per-file via frontmatter: every spec declares its own \`type\`, \`integration\`, and \`parent\`. Files without frontmatter are silently skipped. No config file. No folder mapping.

The CLI package is \`mdspeci\` (note the trailing i) — invoke it as \`npx mdspeci publish --project <project-id>\`.

## Docs

- [Getting Started & API Reference](https://mdspec.dev/docs/api-reference): Frontmatter schema, CLI commands, integrations (Notion, ClickUp, Confluence, Jira, S3), CI setup, and worked examples.
- [Machine-readable reference](https://mdspec.dev/llms-full.txt): Condensed schema and CLI reference — optimised for LLM context windows.

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
