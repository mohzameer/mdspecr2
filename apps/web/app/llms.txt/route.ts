import { NextResponse } from 'next/server'

const CONTENT = `# mdspec

> Keep writing markdown. We'll handle the rest.

mdspec is a CI-first spec publishing platform for engineering teams. Drop a .mdspecmap file in any folder in your repo, add one line to GitHub Actions, and every markdown spec file auto-syncs to your connected tools on every push.

The CLI package is \`mdspeci\` (note the trailing i) — invoke it as \`npx mdspeci publish --project <project-id>\`.

## Docs

- [Getting Started & Configuration Reference](https://mdspec.dev/docs/api-reference): Complete reference for .mdspecmap schema, CLI commands, frontmatter, integrations (S3, Notion, ClickUp, Confluence), CI setup, skip patterns, depth limiting, agent templates, and worked example scenarios.

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
