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
  { label: 'Distributed maps', href: '#distributed' },
  { label: 'mappings:', href: '#mappings' },
  { label: 'default:', href: '#default' },
  { label: 'specs:', href: '#specs' },
  { label: 'Generating the file', href: '#generating' },
  { label: 'CI setup', href: '#ci' },
  { label: 'CLI reference', href: '#cli' },
  { label: 'Spec files', href: '#specfiles' },
  { label: 'Skip patterns', href: '#skip' },
  { label: 'Depth limiting', href: '#depth' },
  { label: 'Multiple integrations', href: '#multi' },
  { label: 'S3 integration', href: '#s3' },
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
              A <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> file can be placed in any folder in your repo.
              Its location defines its scope — the folder it lives in and all subfolders will be synced according to the mappings declared inside it.
              All routing, IDs, titles, and task wiring live in these files. Spec files are plain markdown with no special syntax.
            </p>
            <p className="text-sm text-muted-foreground">The file has three top-level sections:</p>
            <Table
              headers={['Section', 'Purpose']}
              rows={[
                ['`mappings`', 'Required. Maps folders to integrations.'],
                ['`default`', 'Optional. Fallback integration and parent applied to any mapping that omits them.'],
                ['`specs`', 'Optional. Per-spec config keyed by file path — title, agent, task link.'],
              ]}
            />
            <p className="text-sm text-muted-foreground">A full example:</p>
            <CodeBlock>{`# docs/specs/.mdspecmap
version: 1

sync_all_on_first_run: false

# Optional — applies to all mappings that don't specify their own integration/parent
default:
  integration: clickup
  parent: alias:eng-docs        # alias: prefix → dashboard alias

mappings:
  - skip:                       # inherits default integration + parent
      - DRAFT_*.md

# Optional — per-spec config keyed by repo-relative file path
specs:
  docs/specs/auth/sso-setup.md:
    title: SSO Setup Guide

  docs/specs/checkout-retry.md:
    title: Checkout Retry Policy
    agent: task_template
    id: CU-182

  docs/specs/sla-policy.md:
    id: CU-305`}</CodeBlock>
          </section>

          <Separator />

          {/* Distributed maps */}
          <section id="distributed" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Distributed maps</h2>
            <p className="text-sm text-muted-foreground">
              Place a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> in any folder — you are not limited to one at the root.
              Each file owns the subtree it sits in. Teams in a monorepo can manage their own map files independently without touching each other&apos;s config.
            </p>
            <CodeBlock>{`repo/
├── docs/
│   ├── api/
│   │   ├── .mdspecmap    ← syncs docs/api/ and subfolders
│   │   └── auth.md
│   └── tasks/
│       ├── .mdspecmap    ← syncs docs/tasks/ and subfolders
│       └── sprint-24.md
└── .mdspecmap            ← syncs root (same rules as any other)`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              The <strong>nearest ancestor</strong> wins. A file in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">docs/api/</code> is governed by the map file there, not by any file higher up in the tree.
            </p>
            <h3 className="text-sm font-semibold">sub_folders</h3>
            <p className="text-sm text-muted-foreground">
              By default, a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> syncs its folder and all subfolders recursively.
              Set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">sub_folders: false</code> to restrict it to direct children only.
            </p>
            <CodeBlock>{`# docs/tasks/.mdspecmap
version: 1

sub_folders: false   # only files directly in docs/tasks/ — no deeper

mappings:
  - integration: clickup
    parent: alias:sprint-tasks
    target: task`}</CodeBlock>
            <Table
              headers={['`sub_folders`', 'What syncs']}
              rows={[
                ['omitted or `true`', 'This folder and all subfolders recursively'],
                ['`false`', 'Direct children only — equivalent to depth: 1'],
              ]}
            />
            <h3 className="text-sm font-semibold">No folder: key</h3>
            <p className="text-sm text-muted-foreground">
              Mappings have no <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">folder:</code> field.
              The file&apos;s location is its scope — place the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> inside the folder you want to sync.
              To route a subfolder differently, put a separate <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> inside that subfolder.
            </p>
            <CodeBlock>{`# docs/api/.mdspecmap
version: 1

mappings:
  - integration: notion
    parent: alias:api-docs`}</CodeBlock>
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
                ['`integration`', 'No', 'Target: notion, confluence, clickup, or s3.'],
                ['`parent`', 'No', 'Target container. Three forms: alias:<name> (dashboard alias), id:<nativeId> (raw ID directly), or bare value (tries alias first, falls back to raw ID). For S3, the alias resolves to a key prefix (the "parent directory").'],
                ['`target`', 'No', 'For ClickUp only: document (default) or task. task publishes specs as ClickUp tasks.'],
                ['`format`', 'No', 'S3 only: md (default) or html. md uploads raw markdown; html converts and wraps in a minimal HTML shell. Controls the file extension and Content-Type of the uploaded object.'],
                ['`depth`', 'No', 'Max subfolder depth. 1 = direct children only. Omit for unlimited depth.'],
                ['`skip`', 'No', 'Glob patterns for files to exclude. Matched against filename and path relative to this file\'s location.'],
                ['`list_id`', 'No', 'ClickUp list ID for task_list mode. Use id:<listId> prefix. Required when target: task.'],
                ['`parent_doc`', 'No', 'ClickUp doc that specs publish inside as pages. Use id:<docId> prefix. Doc mode only.'],
                ['`space_id`', 'No', 'ClickUp space or folder ID. Use id:<spaceId> prefix. Omit for workspace root.'],
                ['`custom_task_ids`', 'No', 'true to use ClickUp custom task IDs. task_list mode only.'],
                ['`agent`', 'No', 'Agent template name to apply before publishing. Must match a template defined in Dashboard → Map → Templates.'],
              ]}
            />
            <CodeBlock>{`# src/.mdspecmap — governs src/ and all subfolders
mappings:
  - integration: clickup
    parent_doc: id:2kzm3ftx-5278   # specs publish as pages inside this doc

---

# src/utils/.mdspecmap — governs src/utils/ (nearest ancestor wins)
mappings:
  - integration: clickup
    target: task
    list_id: id:901812098656
    custom_task_ids: true
    agent: Task Template`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              A file at <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">src/utils/SPEC7.md</code> is governed by <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">src/utils/.mdspecmap</code>, not <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">src/.mdspecmap</code> — nearest ancestor wins.
            </p>
          </section>

          <Separator />

          {/* default */}
          <section id="default" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">default:</h2>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">default:</code> block sets a fallback integration and parent for any mapping that omits them. Useful when most or all folders publish to the same integration.
            </p>
            <Table
              headers={['Field', 'What it does']}
              rows={[
                ['`integration`', 'Fallback integration type: clickup, notion, confluence, or s3.'],
                ['`parent`', 'Fallback alias name used as the parent container.'],
                ['`target`', 'Fallback target mode: document (default) or task.'],
                ['`agent`', 'Fallback agent template applied to all mappings that don\'t specify one.'],
              ]}
            />
            <p className="text-sm text-muted-foreground">
              Per-mapping fields always win over the default. Set any field on a specific mapping to override only that field — the rest still inherit from <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">default:</code>.
            </p>
            <CodeBlock>{`# docs/specs/.mdspecmap
default:
  integration: clickup
  parent: alias:eng-docs        # alias: — references a dashboard alias

mappings:
  - {}                          # uses clickup + eng-docs from default

---

# docs/tasks/.mdspecmap
default:
  integration: clickup

mappings:
  - parent: alias:dev-tasks     # overrides default parent
    target: task

---

# docs/archive/.mdspecmap
mappings:
  - integration: clickup
    parent: id:90181844797      # id: — raw ClickUp space ID, no alias needed`}</CodeBlock>
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
                ['`id`', 'Native ID of an existing page, doc, or task in the target tool. On first publish, mdspec adopts it and updates it from then on. Works across all integrations.'],
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

            <p className="text-sm text-muted-foreground">
              Keys with spaces must be quoted: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">&quot;docs/my auth spec.md&quot;</code>. Unquoted keys with spaces are invalid YAML and will cause the CLI to error at publish time.
            </p>

            <h3 className="text-sm font-semibold">Examples</h3>
            <CodeBlock>{`specs:
  # Just override the title
  docs/specs/auth/sso-setup.md:
    title: SSO Setup Guide

  # Title + agent template + task link
  docs/specs/checkout-retry.md:
    title: Checkout Retry Policy
    agent: task_template
    id: CU-182

  # Just link a task — nothing else needed
  docs/specs/sla-policy.md:
    id: CU-305`}</CodeBlock>

            <h3 className="text-sm font-semibold">Renames</h3>
            <p className="text-sm text-muted-foreground">
              If a file is renamed, the key in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs:</code> becomes stale. Title overrides, agent config, and task links stop applying until the user updates the key to the new path. Git rename detection still fires on that commit and the page in the target tool updates in-place regardless.
            </p>

            <h3 className="text-sm font-semibold">id: adoption details</h3>
            <p className="text-sm text-muted-foreground">
              On first publish of a spec with an <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id:</code> entry, mdspec looks up that ID in the target tool and adopts the existing page, doc, or task — updating it rather than creating a new one. Works across all integrations: Notion page ID, Confluence page ID, ClickUp doc or task ID. The native ID is stored in the mdspec ledger and subsequent publishes update the same record without re-resolving. Remove the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id:</code> field to have mdspec create a new record on the next publish.
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
                    Fetches your project config and aliases, then writes a starter <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> to the current directory.
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
            <CodeBlock>{`# docs/api/.mdspecmap
mappings:
  - integration: clickup
    parent: alias:eng-docs
    skip:
      - DRAFT_*.md        # skip drafts by filename
      - _*.md             # skip private files
      - "**/scratch/**"   # skip scratch subdirectory (path relative to this file)

  # Subfolder override with its own skip list
  - folder: internal
    integration: notion
    parent: alias:api-internal
    skip:
      - README.md`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Patterns are matched against both the filename and the path <em>relative to the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> file&apos;s location</em>, not from the repo root.
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
    parent: alias:arch-docs

  - folder: docs/architecture
    integration: confluence
    parent: id:12345678

  - folder: docs/architecture
    integration: s3
    parent: alias:eng-specs
    format: md`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Each spec is published independently to all three. Failure on one does not block the others.
            </p>
            <p className="text-sm text-muted-foreground">
              Note: the most-specific-folder rule applies per integration independently. A spec can match different mappings for different integrations simultaneously.
            </p>
          </section>

          <Separator />

          {/* S3 integration */}
          <section id="s3" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">S3 integration</h2>
            <p className="text-sm text-muted-foreground">
              When a mapping targets S3, specs are uploaded as static files to an S3 bucket. The repo&apos;s folder structure is mirrored as an S3 key prefix hierarchy — no special config needed to preserve nesting.
            </p>

            <h3 className="text-sm font-semibold">Connect an S3 integration</h3>
            <p className="text-sm text-muted-foreground">
              Go to Dashboard → Integrations → Connect → S3. You need four fields:
            </p>
            <Table
              headers={['Field', 'Description']}
              rows={[
                ['AWS Access Key ID', 'IAM access key ID'],
                ['AWS Secret Access Key', 'IAM secret access key'],
                ['Bucket name', 'Must already exist — mdspec does not create buckets'],
                ['Region', 'e.g. us-east-1'],
              ]}
            />
            <p className="text-sm text-muted-foreground">
              The IAM user needs <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:PutObject</code>, <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:GetObject</code>, and <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:DeleteObject</code> on the bucket. mdspec validates credentials on connect by putting and deleting a sentinel object.
            </p>

            <h3 className="text-sm font-semibold">Parent directory — the alias</h3>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">parent</code> alias for S3 resolves to a <strong>root key prefix</strong> — the S3 equivalent of a parent page or parent doc. Define it in Dashboard → Integrations → [S3 integration] → Aliases, giving it a prefix path like <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs/</code>. Leave blank to publish at the bucket root.
            </p>
            <p className="text-sm text-muted-foreground">
              Multiple folder mappings can share the same alias — their specs all land under the same S3 root, preserving their full paths beneath it. This is the S3 equivalent of multiple ClickUp mappings sharing a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">parent_doc</code>.
            </p>

            <h3 className="text-sm font-semibold">Key structure</h3>
            <p className="text-sm text-muted-foreground">
              The S3 object key is <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{'{alias_prefix}/{spec_path_from_repo_root}.{ext}'}</code>:
            </p>
            <CodeBlock>{`# Alias eng-specs → prefix: content/
# Spec: docs/specs/payments/checkout-retry.md
# Format: md

→ S3 key: content/docs/specs/payments/checkout-retry.md
→ URL:    https://acme-specs.s3.us-east-1.amazonaws.com/content/docs/specs/payments/checkout-retry.md`}</CodeBlock>

            <h3 className="text-sm font-semibold">Example .mdspecmap</h3>
            <CodeBlock>{`# docs/specs/.mdspecmap
mappings:
  - integration: s3
    parent: alias:eng-specs   # resolves to prefix: content/
    format: md                # md (default) or html

  - integration: s3
    parent: alias:eng-specs   # same alias — co-located under content/
    format: html              # second copy as rendered HTML`}</CodeBlock>

            <h3 className="text-sm font-semibold">Publish behaviour</h3>
            <Table
              headers={['Behaviour', 'Detail']}
              rows={[
                ['Always overwrites', 'S3 PutObject is idempotent — every publish replaces the object at that key. No create vs update distinction.'],
                ['Content-unchanged skip', 'If the spec\'s content hash is unchanged and the object key is already stored in the ledger, the upload is skipped.'],
                ['No deletion', 'Deleting a spec file from the repo does not delete the S3 object. The object is orphaned. V1 constraint.'],
                ['No bucket provisioning', 'The bucket must already exist. mdspec does not create or configure buckets.'],
                ['external_url', 'Stored as the direct S3 URL: https://{bucket}.s3.{region}.amazonaws.com/{key}'],
              ]}
            />

            <h3 className="text-sm font-semibold">AWS setup walkthrough</h3>
            <p className="text-sm text-muted-foreground">
              If you don&apos;t have a bucket and IAM user yet, follow these steps. Takes about five minutes in the AWS Console.
            </p>

            <p className="text-sm font-medium mt-2">Step 1 — Create the bucket</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground pl-1">
              <li>Open the <strong>S3 console</strong> → <strong>Create bucket</strong>.</li>
              <li>Enter a bucket name (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">acme-specs</code>). Names must be globally unique.</li>
              <li>Choose the AWS region closest to your team (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">us-east-1</code>). Use the same region when connecting in mdspec.</li>
              <li>Leave <strong>Block all public access</strong> enabled (default). mdspec accesses the bucket via IAM credentials — the bucket does not need to be public.</li>
              <li>Leave versioning, encryption, and all other settings at their defaults. Click <strong>Create bucket</strong>.</li>
            </ol>

            <p className="text-sm font-medium mt-2">Step 2 — Create an IAM policy</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground pl-1">
              <li>Open the <strong>IAM console</strong> → <strong>Policies</strong> → <strong>Create policy</strong>.</li>
              <li>Switch to the <strong>JSON</strong> editor and paste the policy below. Replace <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">acme-specs</code> with your bucket name.</li>
            </ol>
            <CodeBlock>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::acme-specs/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::acme-specs"
    }
  ]
}`}</CodeBlock>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground pl-1" start={3}>
              <li>Click <strong>Next</strong>, name the policy (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">mdspec-s3-acme-specs</code>), and click <strong>Create policy</strong>.</li>
            </ol>
            <p className="text-sm text-muted-foreground">
              The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:ListBucket</code> permission on the bucket resource (not the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/*</code> path) is needed for the connection health check. The three object-level permissions cover publishing.
            </p>

            <p className="text-sm font-medium mt-2">Step 3 — Create an IAM user and attach the policy</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground pl-1">
              <li>In the IAM console → <strong>Users</strong> → <strong>Create user</strong>.</li>
              <li>Enter a name (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">mdspec-publisher</code>). No console access needed — leave that unchecked.</li>
              <li>On the permissions screen, choose <strong>Attach policies directly</strong> and select the policy you just created.</li>
              <li>Complete the wizard and click <strong>Create user</strong>.</li>
            </ol>

            <p className="text-sm font-medium mt-2">Step 4 — Generate access keys</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground pl-1">
              <li>Open the user you just created → <strong>Security credentials</strong> tab → <strong>Create access key</strong>.</li>
              <li>Select <strong>Application running outside AWS</strong> as the use case.</li>
              <li>Click through and copy both the <strong>Access Key ID</strong> and <strong>Secret Access Key</strong>. The secret is shown only once.</li>
            </ol>

            <p className="text-sm font-medium mt-2">Step 5 — Connect in mdspec</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground pl-1">
              <li>Go to <strong>Dashboard → Integrations → Connect → S3</strong>.</li>
              <li>Paste in your Access Key ID, Secret Access Key, bucket name, and region.</li>
              <li>Click <strong>Connect S3</strong>. mdspec runs a health check and saves the credentials if it succeeds.</li>
              <li>Go to the integration&apos;s <strong>Aliases</strong> tab and create an alias with a key prefix (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs/</code>) or leave it blank to publish at the bucket root.</li>
              <li>Reference the alias in your <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> as <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">parent: alias:&lt;name&gt;</code>.</li>
            </ol>
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
            <CodeBlock>{`This project uses mdspec to publish markdown spec files to external tools (Notion, ClickUp, S3, etc.).

Rules for working with spec files:

1. Spec files are plain markdown — no YAML frontmatter, no special syntax.
   Any .md file in a folder with a .mdspecmap file (or a .mdspecmap in any parent folder)
   is automatically picked up by mdspec on the next CI run.

2. .mdspecmap files can live anywhere in the repo. A file governs the folder it lives in
   and all subfolders. The nearest .mdspecmap ancestor wins for any given spec file.
   Each .mdspecmap has two sections:
   - mappings: — maps this folder (and optionally subfolders) to integrations
   - specs:    — optional per-spec config, keyed by file path

   The parent: field in mappings supports three forms:
     parent: alias:<name>      # dashboard alias
     parent: id:<nativeId>     # raw native ID (ClickUp space/list/doc ID, Notion page ID, etc.)
     parent: <bare>            # tries alias first, falls back to raw ID

   For S3 integrations, the parent alias resolves to an S3 key prefix (the "parent directory").
   The format: field controls the file extension: md (default) or html.

3. When you CREATE a new spec file:
   - If it needs a custom title (different from the H1 heading or filename), add an entry:
     specs:
       path/to/new-file.md:
         title: Human Readable Title

4. When you CREATE a spec that should link to an existing page, doc, or task in the target tool:
   - Add the native ID under the file path:
     specs:
       path/to/new-file.md:
         id: CU-123        # ClickUp task/doc ID, Notion page ID, Confluence page ID, etc.

5. When you RENAME or MOVE a spec file:
   - Update the key in specs: to the new path if an entry exists.
   - The old key becomes stale and the title/task config stops applying.
   - Example:
       # Before
       specs:
         docs/old-name.md:
           title: My Spec
           id: CU-123

       # After rename to docs/new-name.md
       specs:
         docs/new-name.md:
           title: My Spec
           id: CU-123

6. When you DELETE a spec file:
   - Remove its entry from specs: if one exists.
   - Do not remove the folder mapping — other files may still use it.

7. If a file path contains spaces, quote the key in .mdspecmap:
     specs:
       "docs/specs/my auth spec.md":
         title: Auth Spec
   Unquoted keys with spaces are invalid YAML and will cause the CLI to error.

8. Never add mdspec_id, mdspec_taskid, or any mdspec frontmatter to spec files.
   All configuration belongs in .mdspecmap.`}</CodeBlock>
          </section>
        </main>
      </div>
    </div>
  )
}
