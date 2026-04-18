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
  { label: '.mdspecmap file', href: '#mdspecmap' },
  { label: 'Field reference', href: '#fields' },
  { label: 'Generating the file', href: '#generating' },
  { label: 'CI setup', href: '#ci' },
  { label: 'CLI reference', href: '#cli' },
  { label: 'Frontmatter reference', href: '#frontmatter' },
  { label: 'Skip patterns', href: '#skip' },
  { label: 'Depth limiting', href: '#depth' },
  { label: 'Multiple integrations', href: '#multi' },
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

          {/* .mdspecmap */}
          <section id="mdspecmap" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Step 1 — Create your <code className="font-mono text-base bg-muted px-1.5 py-0.5 rounded">.mdspecmap</code> file</h2>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> file lives at the root of your repo.
              It tells mdspec which folders to sync and where they should go.
            </p>
            <CodeBlock>{`# .mdspecmap
version: 1

sync_all_on_first_run: false

mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    depth: 1          # only docs/specs/*.md — no subdirectories
    skip:
      - DRAFT_*.md

  - folder: docs/tasks
    integration: clickup
    parent: dev-tasks`}</CodeBlock>
          </section>

          {/* Field reference */}
          <section id="fields" className="scroll-mt-20 space-y-4">
            <h3 className="text-base font-semibold">Field reference</h3>
            <Table
              headers={['Field', 'What it does']}
              rows={[
                ['`folder`', 'Which folder in your repo to watch'],
                ['`integration`', 'Where to sync: notion, confluence, or clickup'],
                ['`parent`', 'An alias pointing to the target page/space (set up in the Dashboard)'],
                ['`depth`', 'Max subfolder depth to sync. 1 = direct children only, 2 = one level of nesting. Omit to sync all depths.'],
                ['`skip`', 'Glob patterns for files to ignore'],
                ['`sync_all_on_first_run`', 'false (default) starts empty. true syncs everything on first push.'],
              ]}
            />
          </section>

          {/* Generating */}
          <section id="generating" className="scroll-mt-20 space-y-4">
            <h3 className="text-base font-semibold">Generating the file</h3>
            <p className="text-sm text-muted-foreground">You don&apos;t have to write it by hand. Two options:</p>
            <div className="space-y-4">
              <Card>
                <CardContent className="p-5 space-y-2">
                  <p className="text-sm font-medium">From the Dashboard</p>
                  <p className="text-sm text-muted-foreground">
                    Go to your project&apos;s Map page and click <strong>Download .mdspecmap</strong>. The file is generated from your current integration setup.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-2">
                  <p className="text-sm font-medium">From the CLI</p>
                  <CodeBlock>{`MDSPEC_TOKEN=mds_xxx npx mdspeci init --project <project-id>`}</CodeBlock>
                  <p className="text-sm text-muted-foreground">
                    Fetches your project config and defined aliases, then writes a starter <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> to your repo root.
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

          {/* Frontmatter reference */}
          <section id="frontmatter" className="scroll-mt-20 space-y-6">
            <h2 className="text-xl font-semibold tracking-tight">Frontmatter reference</h2>
            <p className="text-sm text-muted-foreground">
              Add a YAML frontmatter block to any spec file to control how mdspec handles it.
              All fields are optional.
            </p>

            <Table
              headers={['Field', 'Type', 'When to use', 'What it does']}
              rows={[
                ['`mdspec_skip`', 'boolean', 'Any file', 'Set to true to exclude this file from all syncing. Overrides all folder mappings.'],
                ['`mdspec_id`', 'string', 'Any file', 'Stable identifier for this spec (lowercase alphanumeric + underscores, max 64 chars). Use this to rename a file without creating a new page in the target tool.'],
                ['`mdspec_taskid`', 'string', 'ClickUp task_list mappings only', 'Links this spec to an existing ClickUp task by its task ID. On first publish, mdspec adopts the existing task and updates it from then on. Has no effect on doc or non-ClickUp mappings.'],
                ['`title`', 'string', 'Any file', 'Sets the page title in the target tool. If omitted, mdspec derives the title from the filename (hyphens and underscores replaced with spaces).'],
              ]}
            />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Skip a file</h3>
              <p className="text-xs text-muted-foreground">Exclude a single file from syncing without adding it to skip patterns in .mdspecmap.</p>
              <CodeBlock>{`---
mdspec_skip: true
---

# Draft: New Auth Flow

This file won't be published until the flag is removed.`}</CodeBlock>

              <h3 className="text-sm font-semibold">Stable ID for safe renames</h3>
              <p className="text-xs text-muted-foreground">
                Without an ID, mdspec tracks files by path. Renaming a file creates a new page and orphans the old one.
                With <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">mdspec_id</code>, the page in the target tool is updated in-place regardless of the filename.
              </p>
              <CodeBlock>{`---
mdspec_id: auth_spec_v2
---

# Authentication Spec

Content here...`}</CodeBlock>

              <h3 className="text-sm font-semibold">Custom title</h3>
              <p className="text-xs text-muted-foreground">Override what appears as the page title in Notion, Confluence, or ClickUp.</p>
              <CodeBlock>{`---
title: "Authentication — v2 (internal)"
---

# Auth Spec

The frontmatter title takes precedence over the heading.`}</CodeBlock>

              <h3 className="text-sm font-semibold">Link to an existing ClickUp task</h3>
              <p className="text-xs text-muted-foreground">
                For <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">target: task</code> mappings only.
                On first publish, mdspec adopts the existing task and updates it going forward.
                Do not confuse with <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">mdspec_id</code> — that is a rename tracker, not a task link.
              </p>
              <CodeBlock>{`---
mdspec_taskid: 86ev2bkbk
title: "Long Job Conversion"
---

# Long Job Conversion Spec

mdspec will find task 86ev2bkbk in ClickUp and update it.
Remove this field to have mdspec create a new task instead.`}</CodeBlock>

              <h3 className="text-sm font-semibold">All fields together</h3>
              <CodeBlock>{`---
mdspec_id: payments_overview
title: "Payments Service Overview"
---

# Payments

Everything here will be published under the custom title,
tracked by the stable ID, and never skipped.`}</CodeBlock>
            </div>
          </section>

          <Separator />

          {/* Skip patterns */}
          <section id="skip" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Skip patterns</h2>
            <p className="text-sm text-muted-foreground">Exclude files with glob patterns in your <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code>:</p>
            <CodeBlock>{`mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    skip:
      - DRAFT_*.md        # skip drafts
      - _*.md             # skip private files
      - "**/scratch/**"   # skip scratch directories

  # Project-wide skips (no integration, just exclusions)
  - folder: /
    skip:
      - CHANGELOG.md
      - README.md`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              You can also skip individual files using frontmatter — see <a href="#frontmatter" className="underline underline-offset-2">Frontmatter reference</a>.
            </p>
          </section>

          <Separator />

          {/* Depth */}
          <section id="depth" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Depth limiting</h2>
            <p className="text-sm text-muted-foreground">
              By default, a folder mapping syncs all files recursively — including every subdirectory, no matter how deeply nested.
              Use <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">depth</code> to cap how far down the tree mdspec will look.
            </p>
            <CodeBlock>{`mappings:
  - folder: docs/specs
    integration: notion
    parent: eng-docs
    depth: 1          # only docs/specs/*.md — subdirectories are ignored`}</CodeBlock>
            <Table
              headers={['Value', 'What syncs']}
              rows={[
                ['omitted', 'Everything under the folder, at any depth'],
                ['`depth: 1`', 'Direct children only — docs/specs/auth.md syncs, docs/specs/api/auth.md does not'],
                ['`depth: 2`', 'One level of nesting — docs/specs/api/auth.md syncs, docs/specs/api/v2/auth.md does not'],
              ]}
            />
            <p className="text-sm text-muted-foreground">
              Specs that exceed the depth limit are still saved to the mdspec ledger — they just won&apos;t be published to the integration.
              If a file is covered by two mappings and one has no depth limit, it will be synced via that mapping.
            </p>
          </section>

          <Separator />

          {/* Multiple integrations */}
          <section id="multi" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Multiple integrations</h2>
            <p className="text-sm text-muted-foreground">The same folder can sync to multiple integrations:</p>
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
          </section>
        </main>
      </div>
    </div>
  )
}
