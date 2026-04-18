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
  { label: 'links:', href: '#links' },
  { label: 'Generating the file', href: '#generating' },
  { label: 'CI setup', href: '#ci' },
  { label: 'CLI reference', href: '#cli' },
  { label: 'Spec files', href: '#specfiles' },
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
            <p className="text-sm text-muted-foreground">The file has three optional top-level sections beyond <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">mappings</code>:</p>
            <Table
              headers={['Section', 'Purpose']}
              rows={[
                ['`mappings`', 'Required. Maps folders to integrations.'],
                ['`specs`', 'Optional. Assigns stable IDs, custom titles, agent templates, and publish mode per spec.'],
                ['`links`', 'Optional. Wires specs to external tasks (ClickUp, Jira) by mdspec ID.'],
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

# Optional — stable IDs, titles, agent config per spec
specs:
  auth_spec_v2:
    path: docs/specs/auth/sso-setup.md
    title: SSO Setup Guide

  checkout_retry:
    path: docs/specs/checkout-retry.md
    title: Checkout Retry Policy
    agent: task_template
    publish: on-merge

# Optional — wire specs to external tasks
links:
  checkout_retry: CU-182
  auth_spec_v2: CU-291
  docs/specs/sla-policy.md: CU-305   # auto-ID spec — use path as key`}</CodeBlock>
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
              The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs:</code> section is optional. Use it to assign a stable ID to a spec, override its title, configure an agent template, or set its publish mode.
            </p>
            <p className="text-sm text-muted-foreground">
              Specs <em>not</em> listed here get an auto-ID equal to their file path. Auto-IDs change if the file is moved — the old page in the target tool is orphaned. Listing a spec under <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs:</code> gives it a stable ID that survives renames.
            </p>

            <Table
              headers={['Field', 'Required', 'What it does']}
              rows={[
                ['`path`', 'Yes', 'File path relative to repo root. Must be unique across all specs: entries.'],
                ['`title`', 'No', 'Page title in the target tool. Overrides H1 heading and filename derivation.'],
                ['`agent`', 'No', 'Agent template name to apply before publishing. Set to none to opt out of a folder-level agent.'],
                ['`publish`', 'No', 'on-merge (default) or manual. manual specs are saved to the ledger but not queued for integration sync.'],
              ]}
            />

            <h3 className="text-sm font-semibold">ID resolution order</h3>
            <CodeBlock>{`specs:
  auth_spec_v2:                       # ← this is the mdspec_id
    path: docs/specs/auth/sso-setup.md

# A spec with no entry here gets:
#   mdspec_id = "docs/specs/sla-policy.md"  (the file path)`}</CodeBlock>

            <h3 className="text-sm font-semibold">Title resolution order</h3>
            <p className="text-sm text-muted-foreground">When no explicit title is set, the CLI resolves in this order:</p>
            <Table
              headers={['Priority', 'Source']}
              rows={[
                ['1', 'specs[id].title in .mdspecmap'],
                ['2', 'First # H1 heading in the markdown file'],
                ['3', 'Filename without extension (hyphens and underscores → spaces)'],
              ]}
            />

            <h3 className="text-sm font-semibold">Safe renames</h3>
            <p className="text-sm text-muted-foreground">
              Without a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs:</code> entry, moving a file changes its auto-ID — mdspec creates a new page in the target tool and the old one is orphaned.
              With a stable ID, update the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">path</code> value in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> and the existing page updates in-place.
            </p>
            <CodeBlock>{`# Before rename
specs:
  auth_spec_v2:
    path: docs/specs/auth/sso-setup.md

# After file moved to docs/auth.md — update path, ID stays the same
specs:
  auth_spec_v2:
    path: docs/auth.md                # page in Notion updates in-place`}</CodeBlock>
          </section>

          <Separator />

          {/* links */}
          <section id="links" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">links:</h2>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">links:</code> section wires specs to external tasks. It is the only place task wiring is declared — there is no per-file frontmatter equivalent.
            </p>
            <p className="text-sm text-muted-foreground">
              Keys are mdspec IDs — either an explicit key from the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs:</code> section, or the file path for auto-ID specs.
              Values are task IDs in the target tool.
            </p>
            <CodeBlock>{`links:
  checkout_retry: CU-182              # explicit mdspec_id → ClickUp task
  auth_spec_v2: CU-291
  docs/specs/sla-policy.md: CU-305   # auto-ID spec — key is the file path`}</CodeBlock>

            <h3 className="text-sm font-semibold">How it works</h3>
            <p className="text-sm text-muted-foreground">
              On the first publish of a spec with a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">links:</code> entry, mdspec looks up the task ID in ClickUp and adopts that existing task — updating it rather than creating a new one. The native task ID is then stored in the mdspec ledger. Subsequent publishes update the same task without re-resolving the ID.
            </p>
            <p className="text-sm text-muted-foreground">
              Remove the entry from <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">links:</code> to have mdspec create a new task on the next publish.
            </p>

            <h3 className="text-sm font-semibold">Only applies to task_list mappings</h3>
            <p className="text-sm text-muted-foreground">
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">links:</code> has no effect on <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">document</code> mode mappings or non-ClickUp integrations. The entry is silently ignored for those specs.
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
        </main>
      </div>
    </div>
  )
}
