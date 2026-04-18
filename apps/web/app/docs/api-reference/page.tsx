'use client'

import { useState } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

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
  { label: 'The .mdspecmap file', href: '#mdspecmap' },
  { label: 'mappings:', href: '#mappings' },
  { label: 'specs:', href: '#specs' },
  { label: 'Generating the file', href: '#generating' },
  { label: 'CI setup', href: '#ci' },
  { label: 'CLI reference', href: '#cli' },
  { label: 'Spec files', href: '#specfiles' },
  { label: 'Skip patterns', href: '#skip' },
  { label: 'Depth limiting', href: '#depth' },
  { label: 'Multiple integrations', href: '#multi' },
  { label: 'Tell your agent', href: '#agent-prompt' },
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto border-b border-border">
        <Link href="/" className="text-lg font-semibold tracking-tight">mdspec</Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Pricing
          </Link>
          <Link href="/login" className={buttonVariants({ size: 'sm' })}>
            Sign in
          </Link>
        </div>
      </nav>

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
                  className="block text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 space-y-12">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Getting started</h1>
            <p className="text-muted-foreground">Two steps. That&apos;s it.</p>
          </div>

          <Separator />

          {/* .mdspecmap overview */}
          <section id="mdspecmap" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">
              Step 1 — Create your{' '}
              <code className="font-mono text-base bg-muted px-1.5 py-0.5 rounded">.mdspecmap</code> file
            </h2>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> file lives at the root of your repo.
              It is the single source of configuration for mdspec — all routing, IDs, titles, and task wiring live here.
              Spec files are plain markdown with no special syntax.
            </p>
            <p className="text-sm text-muted-foreground">The file has two top-level sections:</p>
            <Table
              headers={['Section', 'Purpose']}
              rows={[
                ['`mappings`', 'Required. Maps folders to integrations.'],
                ['`specs`', 'Optional. Per-spec config keyed by file path — title, agent, task link.'],
              ]}
            />
            <p className="text-sm text-muted-foreground">A full example:</p>
            <CodeBlock>{`# .mdspecmap
version: 1

sync_all_on_first_run: false

mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    skip:
      - DRAFT_*.md

  - folder: docs/tasks
    integration: clickup
    parent: dev-tasks
    target: task

# Optional — per-spec config keyed by file path
specs:
  docs/specs/auth/sso-setup.md:
    title: SSO Setup Guide

  docs/specs/checkout-retry.md:
    title: Checkout Retry Policy
    agent: task_template
    task: CU-182

  docs/specs/sla-policy.md:
    task: CU-305`}</CodeBlock>
          </section>

          <Separator />

          {/* mappings */}
          <section id="mappings" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">mappings:</h2>
            <p className="text-sm text-muted-foreground">
              Each entry maps a folder in your repo to an integration. mdspec routes each spec to exactly one mapping — the most specific (longest prefix) folder that matches. Subfolders with their own mapping are never double-published by a parent mapping.
            </p>
            <Table
              headers={['Field', 'Required', 'What it does']}
              rows={[
                ['`folder`', 'Yes', 'Folder path relative to repo root. Use / or leave blank for repo root.'],
                ['`integration`', 'No', 'Target: notion, confluence, clickup, or s3.'],
                ['`parent`', 'No', 'Alias name pointing to the target page/container (set up in Dashboard → Map → Aliases).'],
                ['`target`', 'No', 'For ClickUp only: document (default) or task. task publishes specs as ClickUp tasks.'],
                ['`depth`', 'No', 'Max subfolder depth. 1 = direct children only. Omit for unlimited depth.'],
                ['`skip`', 'No', 'Glob patterns for files to exclude from this mapping.'],
              ]}
            />
            <CodeBlock>{`mappings:
  # Root-level specs → Notion
  - folder: /
    integration: notion
    parent: eng-docs
    depth: 1                # only root *.md files

  # src/ specs → Notion, nested
  - folder: src
    integration: notion
    parent: eng-docs

  # src/utils/ specs → ClickUp tasks (overrides src/ for this subfolder)
  - folder: src/utils
    integration: clickup
    parent: dev-tasks
    target: task`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              In the example above, a file at <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">src/utils/SPEC7.md</code> goes only to the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">src/utils</code> mapping — not to <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">src</code> or <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/</code>.
            </p>
          </section>

          <Separator />

          {/* specs */}
          <section id="specs" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">specs:</h2>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs:</code> section is optional. It is a map keyed by file path. Add an entry only when you need to override the title, set an agent, or link a task. Specs not listed here are auto-configured from their path.
            </p>

            <Table
              headers={['Field', 'What it does']}
              rows={[
                ['`title`', 'Page title in the target tool. Overrides H1 heading and filename derivation.'],
                ['`agent`', 'Agent template name to apply before publishing. Set to none to opt out of a folder-level agent.'],
                ['`task`', 'Task ID in ClickUp or Jira. On first publish, mdspec adopts the existing task and updates it from then on. Only applies to target: task mappings.'],
              ]}
            />

            <h3 className="text-sm font-semibold">Title resolution order</h3>
            <Table
              headers={['Priority', 'Source']}
              rows={[
                ['1', 'specs[path].title in .mdspecmap'],
                ['2', 'First # H1 heading in the file'],
                ['3', 'Filename without extension (hyphens and underscores → spaces)'],
              ]}
            />

            <h3 className="text-sm font-semibold">Examples</h3>
            <CodeBlock>{`specs:
  # Just override the title
  docs/specs/auth/sso-setup.md:
    title: SSO Setup Guide

  # Title + agent template + task link
  docs/specs/checkout-retry.md:
    title: Checkout Retry Policy
    agent: task_template
    task: CU-182

  # Just link a task — nothing else needed
  docs/specs/sla-policy.md:
    task: CU-305`}</CodeBlock>

            <h3 className="text-sm font-semibold">Renames</h3>
            <p className="text-sm text-muted-foreground">
              If a file is renamed, the key in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs:</code> becomes stale. Title overrides, agent config, and task links stop applying until the user updates the key to the new path. Git rename detection still fires on that commit and the page in the target tool updates in-place regardless.
            </p>

            <h3 className="text-sm font-semibold">Task wiring details</h3>
            <p className="text-sm text-muted-foreground">
              On first publish of a spec with a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">task:</code> entry, mdspec resolves the task ID in ClickUp and adopts that existing task — updating it rather than creating a new one. The native task ID is stored in the mdspec ledger. Subsequent publishes update the same task without re-resolving. Remove the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">task:</code> field to have mdspec create a new task on the next publish.
            </p>
          </section>

          <Separator />

          {/* Generating */}
          <section id="generating" className="scroll-mt-20 space-y-4">
            <h3 className="text-base font-semibold">Generating the file</h3>
            <p className="text-sm text-muted-foreground">You don&apos;t have to write it by hand. Two options:</p>
            <div className="space-y-4">
              <Card>
                <CardContent className="p-5 space-y-2">
                  <p className="text-sm font-medium">From the Dashboard</p>
                  <p className="text-sm text-muted-foreground">
                    Go to your project&apos;s <strong>Map</strong> page and click <strong>Download .mdspecmap</strong>. The file is generated from your current folder mappings and aliases.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-2">
                  <p className="text-sm font-medium">From the CLI</p>
                  <CodeBlock>{`MDSPEC_TOKEN=mds_xxx npx mdspeci init --project <project-id>`}</CodeBlock>
                  <p className="text-sm text-muted-foreground">
                    Fetches your project config and aliases, then writes a starter <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> to your repo root.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          <Separator />

          {/* CI setup */}
          <section id="ci" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Step 2 — Add the CI action</h2>
            <p className="text-sm text-muted-foreground">
              Add this to your GitHub Actions workflow at <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.github/workflows/mdspec.yml</code>:
            </p>
            <CodeBlock>{`name: mdspec sync
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
          GITHUB_EVENT_BEFORE: \${{ github.event.before }}`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Add your <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">MDSPEC_TOKEN</code> as a GitHub Actions secret under Settings → Secrets → Actions.
            </p>
            <p className="text-sm text-muted-foreground font-medium">
              That&apos;s it. Every push to main syncs changed specs to your connected integrations.
            </p>
          </section>

          <Separator />

          {/* CLI reference */}
          <section id="cli" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">CLI reference</h2>
            <CodeBlock>{`# Publish specs (reads .mdspecmap, detects changes, syncs)
npx mdspeci publish --project <project-id>

# Publish all specs, ignoring git diff
npx mdspeci publish --project <project-id> --skip-diff

# Use a specific base ref for change detection
npx mdspeci publish --project <project-id> --base origin/main

# Generate a starter .mdspecmap
npx mdspeci init --project <project-id>`}</CodeBlock>
            <h3 className="text-sm font-semibold">Environment variables</h3>
            <Table
              headers={['Variable', 'Required', 'Description']}
              rows={[
                ['`MDSPEC_TOKEN`', 'Yes', 'Project token — generate in Dashboard → Project → Settings → Tokens'],
                ['`GITHUB_EVENT_BEFORE`', 'No', 'Previous commit SHA. Set automatically by GitHub Actions.'],
                ['`MDSPEC_API_URL`', 'No', 'API base URL. Defaults to https://mdspec.app'],
              ]}
            />
          </section>

          <Separator />

          {/* Spec files */}
          <section id="specfiles" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Spec files</h2>
            <p className="text-sm text-muted-foreground">
              Spec files are plain markdown. No YAML frontmatter, no special syntax. Any <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.md</code> file in a mapped folder is a valid spec.
            </p>
            <CodeBlock>{`# Checkout Retry Policy

This spec describes the retry behaviour for the checkout service.

## Overview

On transient failures, the checkout service retries up to 3 times...`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              All configuration — IDs, titles, task wiring, skip rules — lives in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code>. Teams can adopt mdspec without touching any existing spec files.
            </p>
          </section>

          <Separator />

          {/* Skip patterns */}
          <section id="skip" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Skip patterns</h2>
            <p className="text-sm text-muted-foreground">
              Exclude files with glob patterns in the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">skip:</code> field of any mapping:
            </p>
            <CodeBlock>{`mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    skip:
      - DRAFT_*.md        # skip drafts
      - _*.md             # skip private files
      - "**/scratch/**"   # skip scratch directories

  # Project-wide skips — no integration, just exclusions
  - folder: /
    skip:
      - CHANGELOG.md
      - README.md`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Patterns are matched against both the filename and the full relative path.
            </p>
          </section>

          <Separator />

          {/* Depth */}
          <section id="depth" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Depth limiting</h2>
            <p className="text-sm text-muted-foreground">
              By default, a mapping syncs all files recursively. Use <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">depth</code> to cap how deep mdspec looks.
            </p>
            <CodeBlock>{`mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    depth: 1          # only docs/specs/*.md — subdirectories ignored`}</CodeBlock>
            <Table
              headers={['Value', 'What syncs']}
              rows={[
                ['omitted', 'Everything under the folder, at any depth'],
                ['`depth: 1`', 'Direct children only — docs/specs/auth.md syncs, docs/specs/api/auth.md does not'],
                ['`depth: 2`', 'One level of nesting — docs/specs/api/auth.md syncs, docs/specs/api/v2/auth.md does not'],
              ]}
            />
          </section>

          <Separator />

          {/* Multiple integrations */}
          <section id="multi" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Multiple integrations</h2>
            <p className="text-sm text-muted-foreground">
              The same folder can sync to multiple integrations by adding multiple mappings with the same folder path:
            </p>
            <CodeBlock>{`mappings:
  - folder: docs/architecture
    integration: notion
    parent: arch-docs

  - folder: docs/architecture
    integration: confluence
    parent: arch-confluence`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Each spec is published independently to both. Failure on one does not block the other.
            </p>
            <p className="text-sm text-muted-foreground">
              Note: the most-specific-folder rule applies per integration independently. A spec can match different mappings for different integrations simultaneously.
            </p>
          </section>

          <Separator />

          {/* Tell your agent */}
          <section id="agent-prompt" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Tell your agent</h2>
            <p className="text-sm text-muted-foreground">
              If you use an AI code editor (Cursor, Windsurf, Claude, Copilot), paste this prompt into your project rules or context file.
              It tells the agent to keep your <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> in sync as it writes and moves spec files.
            </p>
            <p className="text-sm text-muted-foreground">This is a suggestion — adapt it to your project structure.</p>
            <CodeBlock>{`This project uses mdspec to publish markdown spec files to external tools (Notion, ClickUp, etc.).

Rules for working with spec files:

1. Spec files are plain markdown — no YAML frontmatter, no special syntax.
   Any .md file in a mapped folder is automatically picked up by mdspec on the next CI run.

2. The .mdspecmap file at the repo root controls all per-spec configuration.
   It has two sections:
   - mappings: — maps folders to integrations (do not edit unless changing routing)
   - specs:    — optional per-spec config, keyed by file path

3. When you CREATE a new spec file:
   - If it needs a custom title (different from the H1 heading or filename), add an entry:
     specs:
       path/to/new-file.md:
         title: Human Readable Title

4. When you CREATE a spec that should link to an existing ClickUp task:
   - Add the task ID under the file path:
     specs:
       path/to/new-file.md:
         task: CU-123

5. When you RENAME or MOVE a spec file:
   - Update the key in specs: to the new path if an entry exists.
   - The old key becomes stale and the title/task config stops applying.
   - Example:
       # Before
       specs:
         docs/old-name.md:
           title: My Spec
           task: CU-123

       # After rename to docs/new-name.md
       specs:
         docs/new-name.md:
           title: My Spec
           task: CU-123

6. When you DELETE a spec file:
   - Remove its entry from specs: if one exists.
   - Do not remove the folder mapping — other files may still use it.

7. Never add mdspec_id, mdspec_taskid, or any mdspec frontmatter to spec files.
   All configuration belongs in .mdspecmap.`}</CodeBlock>
          </section>
        </main>
      </div>
    </div>
  )
}
