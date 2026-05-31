'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { InfoIcon } from 'lucide-react'

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group">
      <pre className="bg-muted rounded-md p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 text-xs font-medium rounded border border-border bg-background opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th key={h} className="text-left py-2 pr-6 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-6 text-sm align-top">
                  {cell.startsWith('`') ? (
                    <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{cell.replace(/`/g, '')}</code>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const NAV = [
  { label: 'Quick start', href: '#quickstart' },
  { label: 'Frontmatter', href: '#frontmatter' },
  { label: 'type:', href: '#type' },
  { label: 'integration:', href: '#integration' },
  { label: 'parent:', href: '#parent' },
  { label: 'id:', href: '#id' },
  { label: 'CLI reference', href: '#cli' },
  { label: 'CI setup', href: '#ci' },
  { label: 'Aliases', href: '#aliases' },
  { label: 'Templates', href: '#templates' },
  { label: 'Notion integration', href: '#notion' },
  { label: 'ClickUp integration', href: '#clickup' },
  { label: 'Confluence integration', href: '#confluence' },
  { label: 'Jira integration', href: '#jira' },
  { label: 'S3 integration', href: '#s3' },
  { label: 'Behaviour notes', href: '#behaviour' },
  { label: 'Example scenarios', href: '#scenarios' },
  { label: 'Tell your agent', href: '#agent-prompt' },
]

export default function DocsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 flex gap-12 py-12">
      {/* Sidebar */}
      <aside className="hidden lg:block w-48 shrink-0">
        <div className="sticky top-8">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Docs</p>
          <nav className="space-y-0.5">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="block text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 max-w-3xl space-y-12">
        <header>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Reference</p>
          <h1 className="text-3xl font-semibold tracking-tight mb-3">Getting started &amp; API reference</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            mdspec routes markdown specs to destinations using frontmatter declared in each file. No external config.
            Each spec declares its own <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">type</code>,{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">integration</code>, and{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">parent</code>. Files without frontmatter are silently skipped.
          </p>
        </header>

        {/* Quick start */}
        <section id="quickstart">
          <h2 className="text-xl font-semibold mb-3">Quick start</h2>
          <ol className="text-sm leading-relaxed space-y-2 list-decimal list-inside text-muted-foreground mb-5">
            <li>Sign up, create an org and a project, generate a CI token.</li>
            <li>Connect an integration (Notion, ClickUp, Confluence, Jira, or S3) in the dashboard.</li>
            <li>Add the GitHub Actions step to your workflow.</li>
            <li>Add frontmatter to any markdown file you want to sync.</li>
          </ol>

          <p className="text-sm text-muted-foreground mb-3">Minimal spec:</p>
          <CodeBlock>{`---
type: wiki
integration: notion
---

# Auth flow

This document describes how authentication works...`}</CodeBlock>
        </section>

        <Separator />

        {/* Frontmatter */}
        <section id="frontmatter">
          <h2 className="text-xl font-semibold mb-3">Frontmatter schema</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Every spec declares its routing in YAML frontmatter at the top of the file. All fields fall back to project-level defaults — an empty frontmatter block is valid as long as the project has a default type and integration set.
          </p>

          <Table
            headers={['Field', 'Required', 'Description']}
            rows={[
              ['`id`', 'No', 'Stable identifier. Used for deduplication. Falls back to file path.'],
              ['`type`', 'No', "'wiki' or 'task'. Falls back to project default_type (wiki by default)."],
              ['`integration`', 'No', 'Target integration. Falls back to project default_integration.'],
              ['`parent`', 'No', 'Alias, native ID, or URL. Falls back to integration root.'],
            ]}
          />

          <Alert className="mt-5">
            <InfoIcon className="h-4 w-4" />
            <AlertTitle>v1 ships with two types</AlertTitle>
            <AlertDescription>
              Only <code className="font-mono text-xs">wiki</code> and <code className="font-mono text-xs">task</code> are supported. Specs declaring other types are rejected with a clear error. Additional types (ADR, RFC, runbook, etc.) ship later.
            </AlertDescription>
          </Alert>
        </section>

        {/* type: */}
        <section id="type">
          <h2 className="text-lg font-semibold mb-3"><code className="font-mono">type:</code></h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Determines whether the spec is transformed before publishing.
          </p>
          <Table
            headers={['Value', 'Behaviour']}
            rows={[
              ['`wiki`', 'Published as raw markdown. No transformation.'],
              ['`task`', 'Transformed by your org\'s Task Template (Claude Haiku) before publishing.'],
            ]}
          />
          <p className="text-sm text-muted-foreground mt-4">
            On ClickUp, <code className="font-mono text-xs">type</code> also picks the publishing mode: <code className="font-mono text-xs">wiki</code> → Doc, <code className="font-mono text-xs">task</code> → Task.
          </p>
        </section>

        {/* integration: */}
        <section id="integration">
          <h2 className="text-lg font-semibold mb-3"><code className="font-mono">integration:</code></h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Picks the destination integration. Falls back to the project&apos;s default integration if absent.
          </p>
          <CodeBlock>{`notion
clickup
confluence
jira
s3`}</CodeBlock>
          <p className="text-sm text-muted-foreground mt-4">
            Set the project default in Dashboard → Project Settings → General. With a default set, <code className="font-mono text-xs">integration:</code> becomes optional in frontmatter.
          </p>
        </section>

        {/* parent: */}
        <section id="parent">
          <h2 className="text-lg font-semibold mb-3"><code className="font-mono">parent:</code></h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Where the spec lands inside the integration. Three formats — auto-detected:
          </p>
          <Table
            headers={['Format', 'Example', 'Notes']}
            rows={[
              ['Alias', '`parent: eng-docs`', 'Recommended. Defined in Dashboard → Integrations → Aliases.'],
              ['Native ID', '`parent: abc123def456`', 'Raw page/list/folder ID from the target system.'],
              ['URL', '`parent: https://notion.so/Engineering-abc123`', 'Resolved to native ID on first publish.'],
            ]}
          />
          <p className="text-sm text-muted-foreground mt-4">
            If <code className="font-mono text-xs">parent:</code> is absent, the spec publishes at the integration root (Notion workspace root, Confluence space root, S3 bucket root, etc.).
          </p>
        </section>

        {/* id: */}
        <section id="id">
          <h2 className="text-lg font-semibold mb-3"><code className="font-mono">id:</code></h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Optional stable identifier. Used for deduplication across renames and as the ledger key. If absent, the file path is used.
          </p>
          <CodeBlock>{`---
id: checkout-retry
type: task
integration: clickup
parent: dev-sprint-list
---`}</CodeBlock>
          <p className="text-sm text-muted-foreground mt-4">
            With an <code className="font-mono text-xs">id:</code>, renaming the file keeps it linked to the same published target. Without one, a rename creates a fresh published doc.
          </p>
        </section>

        <Separator />

        {/* CLI reference */}
        <section id="cli">
          <h2 className="text-xl font-semibold mb-3">CLI reference</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            The CLI package is <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">mdspeci</code> (trailing <em>i</em>). Invoke via <code className="font-mono text-xs">npx</code>.
          </p>

          <Alert className="mb-5">
            <InfoIcon className="h-4 w-4" />
            <AlertTitle>Don&apos;t confuse the package name</AlertTitle>
            <AlertDescription>
              Use <code className="font-mono text-xs">npx mdspeci</code> — not <code className="font-mono text-xs">npx mdspec</code>. The latter installs an unrelated third-party package.
            </AlertDescription>
          </Alert>

          <h3 className="text-sm font-medium mb-2 mt-5">publish</h3>
          <CodeBlock>{`npx mdspeci publish --project <project-id>`}</CodeBlock>
          <p className="text-sm text-muted-foreground mt-3 mb-2">
            Reads git diff against the previous commit, parses frontmatter on each changed <code className="font-mono text-xs">.md</code>, posts the payload to the mdspec API.
          </p>

          <h3 className="text-sm font-medium mb-2 mt-5">Flags</h3>
          <Table
            headers={['Flag', 'Description']}
            rows={[
              ['`--project <id>`', 'Required. Your mdspec project ID.'],
              ['`--all`', 'Walk the entire repo and publish every file with frontmatter, ignoring git diff. Useful for first-time setup.'],
            ]}
          />

          <h3 className="text-sm font-medium mb-2 mt-5">Environment</h3>
          <Table
            headers={['Variable', 'Required', 'Description']}
            rows={[
              ['`MDSPEC_TOKEN`', 'Yes', 'Your project token (mds_...). Add as a GitHub Actions secret.'],
              ['`GITHUB_EVENT_BEFORE`', 'In CI', 'Base ref for git diff. Set automatically by GitHub Actions.'],
              ['`MDSPEC_API_URL`', 'No', 'Override the API host. Defaults to https://mdspec.dev.'],
            ]}
          />
        </section>

        <Separator />

        {/* CI setup */}
        <section id="ci">
          <h2 className="text-xl font-semibold mb-3">CI setup</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            One job in your GitHub Actions workflow. Triggers on every push to main.
          </p>
          <CodeBlock>{`name: mdspec sync
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
          GITHUB_EVENT_BEFORE: \${{ github.event.before }}`}</CodeBlock>

          <p className="text-sm text-muted-foreground mt-4">
            <strong className="text-foreground">First publish:</strong> use <code className="font-mono text-xs">--all</code> once to pick up all existing files with frontmatter. After that, the diff-based default is fast and incremental.
          </p>
        </section>

        <Separator />

        {/* Aliases */}
        <section id="aliases">
          <h2 className="text-xl font-semibold mb-3">Aliases</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Aliases are short, human-readable names that map to native IDs in your integrations. Define them in Dashboard → Integrations → Aliases, then reference them as <code className="font-mono text-xs">parent:</code> in your specs.
          </p>

          <p className="text-sm text-muted-foreground mb-2">Example: an alias <code className="font-mono text-xs">eng-docs</code> points to a Notion page ID.</p>
          <CodeBlock>{`---
type: wiki
integration: notion
parent: eng-docs
---`}</CodeBlock>

          <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
            Aliases are scoped to <em>both</em> the org and a specific integration. <code className="font-mono text-xs">eng-docs</code> on Notion and <code className="font-mono text-xs">eng-docs</code> on ClickUp are independent.
          </p>
        </section>

        <Separator />

        {/* Templates */}
        <section id="templates">
          <h2 className="text-xl font-semibold mb-3">Templates</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Templates drive the agent transformation applied when <code className="font-mono text-xs">type: task</code> is set. Edit the Task Template at Dashboard → Templates.
          </p>

          <Table
            headers={['Type', 'Template']}
            rows={[
              ['`wiki`', 'None — publish as-is.'],
              ['`task`', 'Task Template (default, editable). Transforms a spec into a structured task document.'],
            ]}
          />

          <p className="text-sm text-muted-foreground mt-4">
            The Task Template seeds automatically when your org is created. You can edit the prompt to shape how specs are restructured before publishing.
          </p>
        </section>

        <Separator />

        {/* Notion */}
        <section id="notion">
          <h2 className="text-xl font-semibold mb-3">Notion integration</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            OAuth-based. The integration is granted access to specific pages in your workspace; pick one as the root at connect time.
          </p>

          <h3 className="text-sm font-medium mb-2 mt-4">Connect</h3>
          <ol className="text-sm leading-relaxed space-y-1 list-decimal list-inside text-muted-foreground mb-5">
            <li>Dashboard → Integrations → Notion → Connect.</li>
            <li>Approve the OAuth flow and select the pages the integration can access.</li>
            <li>Choose a default root page. All specs without <code className="font-mono text-xs">parent:</code> publish here.</li>
          </ol>

          <h3 className="text-sm font-medium mb-2 mt-4">Per-spec parent</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Use any Notion page ID, page URL, or alias. The page must be shared with the integration.
          </p>
          <CodeBlock>{`---
type: wiki
integration: notion
parent: https://notion.so/Engineering-abc123def4567890
---`}</CodeBlock>

          <h3 className="text-sm font-medium mb-2 mt-5">Behaviour</h3>
          <ul className="text-sm leading-relaxed space-y-1 list-disc list-inside text-muted-foreground">
            <li>Every spec becomes one Notion page under the resolved parent.</li>
            <li>Updates replace the page&apos;s blocks (no merge).</li>
            <li>Title comes from the first <code className="font-mono text-xs"># Heading</code> in the file, falling back to the filename.</li>
          </ul>
        </section>

        <Separator />

        {/* ClickUp */}
        <section id="clickup">
          <h2 className="text-xl font-semibold mb-3">ClickUp integration</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            OAuth-based. Two publishing modes driven by spec <code className="font-mono text-xs">type</code>:
          </p>

          <Table
            headers={['type', 'Mode', '`parent:` is']}
            rows={[
              ['`wiki`', 'ClickUp Doc with one page', 'space or folder ID'],
              ['`task`', 'ClickUp task', 'list ID'],
            ]}
          />

          <h3 className="text-sm font-medium mb-2 mt-5">Doc mode (type: wiki)</h3>
          <CodeBlock>{`---
type: wiki
integration: clickup
parent: product-docs   # alias → space or folder ID
---

# API rate limits

...`}</CodeBlock>
          <p className="text-sm text-muted-foreground mt-3">
            Each spec becomes its own Doc with one page. The doc title and page title come from the first heading.
          </p>

          <h3 className="text-sm font-medium mb-2 mt-5">Task mode (type: task)</h3>
          <CodeBlock>{`---
id: checkout-retry-task
type: task
integration: clickup
parent: dev-sprint-list   # alias → list ID
---

# Checkout retry policy

When a payment attempt fails...`}</CodeBlock>
          <p className="text-sm text-muted-foreground mt-3">
            The first heading becomes the task name; the full markdown body becomes the task description. Priority, status, tags, and due date are not set by mdspec in v1.
          </p>

          <h3 className="text-sm font-medium mb-2 mt-5">Custom task IDs</h3>
          <p className="text-sm text-muted-foreground">
            If your workspace has Custom Task IDs enabled, you can put the custom ID (e.g. <code className="font-mono text-xs">CU-182</code>) in <code className="font-mono text-xs">id:</code> to link the spec to an existing task.
          </p>
        </section>

        <Separator />

        {/* Confluence */}
        <section id="confluence">
          <h2 className="text-xl font-semibold mb-3">Confluence integration</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Atlassian OAuth. Bound to a single Confluence space, chosen at connect time. Per-spec <code className="font-mono text-xs">parent:</code> targets a page within that space.
          </p>

          <h3 className="text-sm font-medium mb-2 mt-4">Connect</h3>
          <ol className="text-sm leading-relaxed space-y-1 list-decimal list-inside text-muted-foreground mb-5">
            <li>Dashboard → Integrations → Confluence → Connect.</li>
            <li>Approve the Atlassian OAuth flow.</li>
            <li>Pick the Atlassian site and the space to publish into.</li>
          </ol>

          <CodeBlock>{`---
type: wiki
integration: confluence
parent: arch-decisions   # alias → Confluence page ID
---

# ADR 001 — Queue technology choice

## Context
...`}</CodeBlock>

          <p className="text-sm text-muted-foreground mt-4">
            Markdown is converted to Confluence storage format (headings, lists, code blocks). When <code className="font-mono text-xs">parent:</code> is absent, the page lands at the space content root.
          </p>
        </section>

        <Separator />

        {/* Jira */}
        <section id="jira">
          <h2 className="text-xl font-semibold mb-3">Jira integration</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Atlassian OAuth. Bound to a single Jira project, chosen at connect time. Specs become Jira issues.
          </p>

          <h3 className="text-sm font-medium mb-2 mt-4">Connect</h3>
          <ol className="text-sm leading-relaxed space-y-1 list-decimal list-inside text-muted-foreground mb-5">
            <li>Dashboard → Integrations → Jira → Connect.</li>
            <li>Approve the Atlassian OAuth flow.</li>
            <li>Pick the Atlassian site and the Jira project to publish into.</li>
          </ol>

          <CodeBlock>{`---
type: task
integration: jira
---

# Add bulk import endpoint

Description body becomes the issue description.`}</CodeBlock>

          <p className="text-sm text-muted-foreground mt-4">
            Issue type defaults to <code className="font-mono text-xs">Task</code>. Markdown is converted to Atlassian Document Format (ADF). <code className="font-mono text-xs">parent:</code> is not used by Jira in v1.
          </p>
        </section>

        <Separator />

        {/* S3 */}
        <section id="s3">
          <h2 className="text-xl font-semibold mb-3">S3 integration</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            AWS access key pair. Specs are written to the configured bucket. <code className="font-mono text-xs">parent:</code> becomes the key prefix.
          </p>

          <h3 className="text-sm font-medium mb-2 mt-4">Connect</h3>
          <ol className="text-sm leading-relaxed space-y-1 list-decimal list-inside text-muted-foreground mb-5">
            <li>Dashboard → Integrations → S3 → Connect.</li>
            <li>Provide an Access Key ID and Secret Access Key with <code className="font-mono text-xs">s3:PutObject</code> permission on the bucket.</li>
            <li>Provide the bucket name and region.</li>
          </ol>

          <CodeBlock>{`---
type: wiki
integration: s3
parent: docs/eng-specs   # S3 key prefix
---

# Auth flow

...`}</CodeBlock>

          <p className="text-sm text-muted-foreground mt-4">
            Object key: <code className="font-mono text-xs">&#123;parent&#125;/&#123;filename&#125;.md</code>. Without a parent, the file lands at the bucket root.
          </p>
        </section>

        <Separator />

        {/* Behaviour notes */}
        <section id="behaviour">
          <h2 className="text-xl font-semibold mb-3">Behaviour notes</h2>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside text-muted-foreground">
            <li>
              <strong className="text-foreground">Trigger:</strong> only <code className="font-mono text-xs">push: branches: [main]</code>. No per-branch publishing in v1.
            </li>
            <li>
              <strong className="text-foreground">Idempotent updates:</strong> content hash is stored. Republishing an unchanged spec is a no-op.
            </li>
            <li>
              <strong className="text-foreground">Append-only:</strong> removing a file from the repo does not delete it from the target tool. Clean up manually if needed.
            </li>
            <li>
              <strong className="text-foreground">Renames:</strong> in v1, a renamed file is treated as a new file. Set <code className="font-mono text-xs">id:</code> to make renames safe — the published doc updates instead of duplicating.
            </li>
            <li>
              <strong className="text-foreground">Self-healing:</strong> if the stored external ID points to a deleted page or task, mdspec recreates it and updates the ledger.
            </li>
            <li>
              <strong className="text-foreground">Rate limits:</strong> enforced per-integration via QStash flow control. Slower integrations (Confluence, Jira, Notion) are throttled lower than fast ones (ClickUp, S3).
            </li>
            <li>
              <strong className="text-foreground">No content storage:</strong> only metadata (hashes, IDs, URLs, frontmatter) is persisted on our side. Your spec content flows through and never lands in our database.
            </li>
          </ul>
        </section>

        <Separator />

        {/* Example scenarios */}
        <section id="scenarios">
          <h2 className="text-xl font-semibold mb-3">Example scenarios</h2>

          <Card className="mb-5">
            <CardContent className="space-y-3 pt-5">
              <h3 className="text-base font-semibold">Engineering wiki across Notion and Confluence</h3>
              <p className="text-sm text-muted-foreground">
                Most docs go to your team wiki on Notion. Architecture decisions go to Confluence so they&apos;re reviewable alongside other Atlassian docs.
              </p>
              <CodeBlock>{`# docs/wiki/onboarding.md
---
type: wiki
integration: notion
parent: eng-wiki
---

# docs/adrs/0042-queue-choice.md
---
type: wiki
integration: confluence
parent: arch-decisions
---`}</CodeBlock>
            </CardContent>
          </Card>

          <Card className="mb-5">
            <CardContent className="space-y-3 pt-5">
              <h3 className="text-base font-semibold">Sprint specs as ClickUp tasks</h3>
              <p className="text-sm text-muted-foreground">
                Each spec in <code className="font-mono text-xs">docs/sprints/</code> becomes a ClickUp task in the active sprint list. The agent reshapes the spec into a task brief.
              </p>
              <CodeBlock>{`---
id: checkout-retry
type: task
integration: clickup
parent: dev-sprint-list
---

# Checkout retry policy

When a payment attempt fails, we need to retry with backoff...`}</CodeBlock>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-5">
              <h3 className="text-base font-semibold">Static markdown to S3</h3>
              <p className="text-sm text-muted-foreground">
                Spec docs land in an S3 bucket as static files. The default integration is set to <code className="font-mono text-xs">s3</code>, so you can omit <code className="font-mono text-xs">integration:</code> in frontmatter.
              </p>
              <CodeBlock>{`# Project Settings → Default Integration: s3

# docs/specs/auth-flow.md
---
type: wiki
parent: docs/eng-specs
---`}</CodeBlock>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Tell your agent */}
        <section id="agent-prompt">
          <h2 className="text-xl font-semibold mb-3">Tell your agent</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Paste this snippet into your AI assistant&apos;s context (Cursor, Copilot Chat, Claude Code) so it can add mdspec frontmatter to your specs without further prompting.
          </p>

          <CodeBlock>{`When I create or edit a markdown file under the docs/ directory, add mdspec
frontmatter at the top of the file so it syncs to our docs tool.

Schema:
  ---
  type: <wiki | task>           # required (v1 supports wiki and task only)
  integration: <notion | clickup | confluence | jira | s3>   # optional
  parent: <alias or ID>         # optional
  id: <stable-id>               # optional, recommended for files that may be renamed
  ---

Rules:
- type: wiki for general docs and ADRs
- type: task for sprint specs that should land in ClickUp/Jira as a task
- If integration: is omitted, the project default is used
- If parent: is omitted, the spec publishes at the integration root
- Files without frontmatter are skipped silently

Don't run the publish CLI yourself — that's handled by CI on push to main.`}</CodeBlock>
        </section>
      </div>
    </div>
  )
}
