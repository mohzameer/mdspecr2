'use client'

import { useState } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
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
  { label: 'The .mdspecmap file', href: '#mdspecmap' },
  { label: 'Distributed maps', href: '#distributed' },
  { label: 'mappings:', href: '#mappings' },
  { label: 'parent: link: prefix', href: '#parent-link' },
  { label: 'default:', href: '#default' },
  { label: 'specs:', href: '#specs' },
  { label: 'Generating the file', href: '#generating' },
  { label: 'CI setup', href: '#ci' },
  { label: 'CLI reference', href: '#cli' },
  { label: 'Spec files', href: '#specfiles' },
  { label: 'Frontmatter', href: '#frontmatter' },
  { label: 'Skip patterns', href: '#skip' },
  { label: 'Depth limiting', href: '#depth' },
  { label: 'Multiple integrations', href: '#multi' },
  { label: 'S3 integration', href: '#s3' },
  { label: 'Notion integration', href: '#notion' },
  { label: 'ClickUp integration', href: '#clickup' },
  { label: 'Confluence integration', href: '#confluence' },
  { label: 'Example scenarios', href: '#scenarios' },
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
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
              <InfoIcon className="text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-900 dark:text-amber-200">Sub-folder maps override the parent</AlertTitle>
              <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
                A <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">.mdspecmap</code> in a sub-folder takes precedence over any ancestor map for files in that subtree. If a sub-folder has no map of its own, the nearest ancestor&apos;s mappings apply recursively — unless the ancestor opts out with <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">sub_folders: false</code>.
              </AlertDescription>
            </Alert>
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
              Set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">sub_folders: false</code> to restrict it to direct children only,
              or pass a list of micromatch globs to allow recursion only into specific subfolders. Globs match the file path relative to the scope; files at the scope root are always included.
            </p>
            <CodeBlock>{`# docs/tasks/.mdspecmap
version: 1

sub_folders: false   # only files directly in docs/tasks/ — no deeper

mappings:
  - integration: clickup
    parent: alias:sprint-tasks
    target: task`}</CodeBlock>
            <CodeBlock>{`# docs/.mdspecmap
version: 1

sub_folders:         # include docs/api/** and docs/guides/** only
  - api/**
  - guides/**

mappings:
  - integration: notion
    parent: alias:api-docs`}</CodeBlock>
            <Table
              headers={['`sub_folders`', 'What syncs']}
              rows={[
                ['omitted or `true`', 'This folder and all subfolders recursively'],
                ['`false`', 'Direct children only — equivalent to depth: 1'],
                ['`string[]`', 'Scope-root files plus subfolders matching any glob (e.g. `api/**`)'],
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
                ['`parent`', 'No', 'Target container. Four forms: alias:<name> (dashboard alias), id:<nativeId> (raw ID directly), link:<url> (browser URL — mdspec extracts the native ID), or bare value (tries alias first, falls back to raw ID). For S3, the alias resolves to a key prefix (the "parent directory"). See Parent link: prefix for extraction rules and failure behaviour.'],
                ['`target`', 'No', 'For ClickUp only: document (default) or task. task publishes specs as ClickUp tasks.'],
                ['`depth`', 'No', 'Max subfolder depth. 1 = direct children only. Omit for unlimited depth.'],
                ['`maintain_hierarchy`', 'No', 'S3 only. true preserves the spec\'s subfolder path under the alias prefix; false (default) flattens to the basename only.'],
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

          {/* parent link: prefix */}
          <section id="parent-link" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">
              parent: <code className="font-mono text-base bg-muted px-1.5 py-0.5 rounded">link:</code> prefix
            </h2>
            <p className="text-sm text-muted-foreground">
              If you are editing <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> directly in your editor, you can paste the browser URL of the target container straight into the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">parent</code> field using the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">link:</code> prefix. The CLI extracts the native ID at publish time — no alias setup required.
            </p>
            <CodeBlock>{`mappings:
  - integration: notion
    parent: link:https://www.notion.so/my-workspace/Engineering-Docs-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4

  - integration: confluence
    parent: link:https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Platform+Docs

  - integration: clickup
    parent: link:https://app.clickup.com/90181234/v/s/90181844797`}</CodeBlock>

            <h3 className="text-sm font-semibold">Extraction rules per platform</h3>
            <Table
              headers={['Integration', 'URL pattern', 'What is extracted']}
              rows={[
                ['Notion', '`https://notion.so/[workspace/]<title>-<id>` or `.../[workspace/]<id>`', '32-char hex ID at the end of the path, with or without title prefix'],
                ['Confluence Cloud', '`https://<domain>.atlassian.net/wiki/spaces/<KEY>/pages/<pageId>/...`', 'Numeric `pageId` from the fixed fourth path segment after `/wiki/`'],
                ['ClickUp (space)', '`.../v/s/<spaceId>`', '`spaceId`'],
                ['ClickUp (list)', '`.../li/<listId>`', '`listId`'],
                ['ClickUp (doc)', '`.../docs/<docId>`', '`docId`'],
              ]}
            />

            <h3 className="text-sm font-semibold">What is not supported</h3>
            <Table
              headers={['Case', 'Reason']}
              rows={[
                ['S3 integrations', 'S3 parents are plain key prefixes (e.g. `docs/specs/`) — not opaque IDs. Type the prefix directly; `link:` does not apply to S3.'],
                ['Short links (`notion.so/xyz`, ClickUp share links)', 'The ID is not present in the short-link path. The CLI does not follow redirects. Use the full browser URL.'],
                ['Confluence Data Center `/display/SPACEKEY/Page+Title`', 'No page ID in this URL format. Use `id:<pageId>` instead — get it from the page via ··· → Page Information.'],
                ['Mobile app URLs', 'URL shapes from mobile clients may differ from desktop. Use the desktop browser URL.'],
              ]}
            />

            <h3 className="text-sm font-semibold">Failure behaviour</h3>
            <p className="text-sm text-muted-foreground">
              If the CLI cannot extract an ID from a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">link:</code> value the publish is hard-blocked — no specs are sent. The error names the URL, explains why extraction failed, and tells you what to use instead:
            </p>
            <CodeBlock>{`✗ Error   Cannot extract a page ID from:
          link:https://acme.atlassian.net/display/ENG/Auth+Flow

          Confluence Data Center URLs (/display/...) do not contain a page ID.
          Go to the page → ··· → Page Information and copy the numeric Page ID
          from the URL bar, then use:
          parent: id:<pageId>

---

✗ Error   Cannot extract a native ID from:
          link:https://notion.so/some/unexpected/path

          The URL did not match any known Notion page pattern.
          Paste the URL directly from the page in your browser, or use:
          parent: id:<nativeId>`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              No partial publishes. Fix the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">parent</code> value and push again.
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
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
              <InfoIcon className="text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-900 dark:text-amber-200">The CLI package is <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">mdspeci</code> — note the trailing i</AlertTitle>
              <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
                The product is <strong>mdspec</strong> but the npm package and CLI binary are <strong>mdspeci</strong>. Always invoke it as <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">npx mdspeci</code> — <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">npx mdspec</code> will install an unrelated package.
              </AlertDescription>
            </Alert>
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
                ['`MDSPEC_API_URL`', 'No', 'API base URL. Defaults to https://mdspec.dev. Internal override — not intended for general use.'],
              ]}
            />
            <p className="text-sm text-muted-foreground">
              <strong>Finding your project ID:</strong> Go to Dashboard → Project → Settings → Overview. The project ID is shown at the top of the page. It looks like a short alphanumeric string (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">abc123</code>) and is distinct from your project name.
            </p>
          </section>

          <Separator />

          {/* Spec files */}
          <section id="specfiles" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Spec files</h2>
            <p className="text-sm text-muted-foreground">
              Spec files are plain markdown. Any <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.md</code> file in a mapped folder is a valid spec. YAML frontmatter is optional — see <a href="#frontmatter" className="underline hover:text-foreground">Frontmatter</a> for declaring native IDs and titles directly in the file.
            </p>
            <CodeBlock>{`# Checkout Retry Policy

This spec describes the retry behaviour for the checkout service.

## Overview

On transient failures, the checkout service retries up to 3 times...`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Configuration can live in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> (centralized) or in per-file frontmatter (decentralized). Frontmatter wins when both are present — the file is the source of truth.
            </p>
          </section>

          <Separator />

          {/* Frontmatter */}
          <section id="frontmatter" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Frontmatter</h2>
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
              <InfoIcon className="text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-900 dark:text-amber-200">Frontmatter is the source of truth</AlertTitle>
              <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
                When the same field is declared in both the spec file&apos;s frontmatter and in <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">.mdspecmap</code> (e.g. <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">specs[].title</code> or <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">specs[].id</code>), <strong>frontmatter always wins</strong>. The user wrote it explicitly in the file, so we treat the file as authoritative and re-point bindings on every publish.
              </AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground">
              Spec files may begin with a YAML frontmatter block. mdspec strips the block before publishing — the remote document never contains <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">---</code> markers — and the content hash is computed from the stripped body, so editing frontmatter does not invalidate the hash on its own.
            </p>
            <CodeBlock>{`---
title: Checkout Retry Policy
id: 86abc123
---

# Checkout Retry Policy

On transient failures, the checkout service retries up to 3 times...`}</CodeBlock>

            <h3 className="text-base font-semibold pt-2">Native ID key</h3>
            <p className="text-sm text-muted-foreground">
              Use <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id:</code> to bind a spec to an existing remote page, doc, or task. mdspec adopts that ID instead of creating a new record. The file is authoritative: if the ID changes in frontmatter, the binding re-points on the next publish. Works across all integrations — Notion page ID, Confluence page ID, ClickUp doc or task ID, S3 object key.
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>ClickUp task_list mode:</strong> the value can be a custom task ID (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">CU-123</code>) — mdspec resolves it to a native task ID before adoption when the mapping has <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">custom_task_ids: true</code>.
            </p>

            <h3 className="text-base font-semibold pt-2">Copy-paste snippet</h3>
            <p className="text-sm text-muted-foreground">
              Drop this at the top of your spec file, replace the ID, and publish:
            </p>
            <CodeBlock>{`---
title: My Spec
id: <native-id>
---`}</CodeBlock>

            <h3 className="text-base font-semibold pt-2">Title</h3>
            <p className="text-sm text-muted-foreground">
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">title:</code> in frontmatter takes precedence over both <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs[].title</code> in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> and the H1 heading in the body.
            </p>

            <h3 className="text-base font-semibold pt-2">Renaming the keys (frontmatter_map)</h3>
            <p className="text-sm text-muted-foreground">
              If your team already uses a different convention (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">task:</code> instead of <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id:</code>), set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">frontmatter_map</code> on the folder mapping. It accepts <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id</code> (native ID lookup) and <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">title</code>.
            </p>
            <CodeBlock>{`mappings:
  - integration: clickup
    target: task
    list_id: id:901812345
    frontmatter_map:
      id: task          # look up "task:" instead of "id:"
      title: heading    # look up "heading:" instead of "title:"`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Per-mapping <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">frontmatter_map</code> values can also be edited directly from the project map UI.
            </p>

            <h3 className="text-base font-semibold pt-2">Precedence</h3>
            <p className="text-sm text-muted-foreground">
              When more than one source declares the same value, frontmatter always wins:
            </p>
            <Table
              headers={['Field', 'Order (highest first)']}
              rows={[
                ['Title', 'frontmatter `title:` → `.mdspecmap` `specs[].title` → first H1 → filename'],
                ['Native ID', 'frontmatter native ID key → `.mdspecmap` `specs[].id` → DB binding'],
              ]}
            />
            <p className="text-sm text-muted-foreground">
              Other frontmatter keys (numbers, booleans, arrays) are preserved on the artifact but ignored by adapters unless mapped explicitly.
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
      - "**/scratch/**"   # skip scratch subdirectory (path relative to this file)`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              To apply a different skip list to a subfolder, place a separate <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> inside that subfolder — there is no <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">folder:</code> key in mappings.
            </p>
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
            <CodeBlock>{`# docs/specs/.mdspecmap
mappings:
  - integration: notion
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
            <CodeBlock>{`# docs/architecture/.mdspecmap
mappings:
  - integration: notion
    parent: alias:arch-docs

  - integration: confluence
    parent: id:12345678

  - integration: s3
    parent: alias:eng-specs`}</CodeBlock>
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
              When a mapping targets S3, specs are uploaded as static files to an S3 bucket. Each mapping in a <code>.mdspecmap</code> file declares a <code>parent</code> alias that resolves to an S3 key prefix — that prefix is the root container for all specs covered by that mapping.
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
              The IAM user needs <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:PutObject</code>, <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:GetObject</code>, and <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:DeleteObject</code> on the bucket for publishing. mdspec validates credentials on connect by putting and deleting a sentinel object. Additionally, <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:ListBucket</code> on the bucket ARN (not <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/*</code>) is needed for the parent folder picker in the mapping UI.
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
# maintain_hierarchy: true

→ S3 key: content/docs/specs/payments/checkout-retry.md
→ URL:    https://acme-specs.s3.us-east-1.amazonaws.com/content/docs/specs/payments/checkout-retry.md`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              By default mdspec flattens to the basename — <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">content/checkout-retry.md</code>. Set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">maintain_hierarchy: true</code> on the mapping to preserve the spec&apos;s subfolder path under the alias prefix as shown above.
            </p>

            <h3 className="text-sm font-semibold">Example .mdspecmap</h3>
            <CodeBlock>{`# docs/specs/.mdspecmap
mappings:
  - integration: s3
    parent: alias:eng-specs        # resolves to prefix: content/
    maintain_hierarchy: true       # preserve subfolder paths under content/`}</CodeBlock>

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
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:PutObject</code> and <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:GetObject</code> are used for publishing. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:DeleteObject</code> is used <em>only</em> to clean up the Connect-time sentinel object mdspec puts to validate credentials — published spec objects are never deleted (see <a href="#s3" className="underline hover:text-foreground">No deletion</a> behaviour). <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">s3:ListBucket</code> on the bucket resource (not the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/*</code> path) is used by the web UI to populate the parent folder dropdown — without it the dropdown falls back to a text input.
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

          {/* Notion integration */}
          <section id="notion" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Notion integration</h2>
            <p className="text-sm text-muted-foreground">
              Notion has two publish modes — <strong>pages</strong> (the default) and <strong>database rows</strong>. The mode is configured on the integration in the dashboard, not in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code>. A given integration uses one mode; create a second integration to publish to a different target.
            </p>

            <h3 className="text-sm font-semibold">API version</h3>
            <p className="text-sm text-muted-foreground">
              mdspec pins <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Notion-Version: 2025-09-03</code> on every request. This adopts Notion&apos;s data sources model — databases are containers that hold one or more <em>data sources</em> (the actual tables of rows). Pages in a database are created under a data source, not directly under the database.
            </p>

            <h3 className="text-sm font-semibold">Page mode (default)</h3>
            <p className="text-sm text-muted-foreground">
              Each spec is published as a child page under a configured root page. Repo folder structure is mirrored as intermediate pages: a spec at <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs/payments/checkout-retry.md</code> lands at <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">&lt;root&gt; / specs / payments / Checkout Retry</code>. Connect requires the integration token and the root page ID.
            </p>

            <h3 className="text-sm font-semibold">Database mode</h3>
            <p className="text-sm text-muted-foreground">
              Each spec is published as a row in a configured Notion data source — useful when teams manage specs through table, board, or filter views. Connect requires the integration token, the database ID, and (for multi-source databases) a picked data source.
            </p>
            <p className="text-sm text-muted-foreground">The target data source must have at minimum:</p>
            <Table
              headers={['Property', 'Type', 'Required']}
              rows={[
                ['`Name`', 'title', 'yes'],
                ['`Content`', 'rich_text', 'yes'],
              ]}
            />
            <p className="text-sm text-muted-foreground">
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Name</code> receives the spec title; <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Content</code> holds the spec body, chunked into 2000-character segments to fit Notion&apos;s rich_text limit. The full structured content (headings, code blocks, lists) is also appended as child blocks on the row&apos;s underlying page. mdspec does <strong>not</strong> create or modify database schemas — Connect-time validation rejects the integration if either property is missing or has the wrong type.
            </p>

            <h3 className="text-sm font-semibold">Frontmatter</h3>
            <p className="text-sm text-muted-foreground">
              Both modes use the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id</code> frontmatter key to link a spec to an existing Notion page or row. See <a href="#frontmatter" className="underline hover:text-foreground">Frontmatter</a>.
            </p>

            <h3 className="text-sm font-semibold">Connect a Notion integration</h3>
            <p className="text-sm font-medium mt-2">Step 1 — Create a Notion integration</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="underline hover:text-foreground">notion.so/my-integrations</a> and sign in with the account that owns the workspace.</li>
              <li>Click <strong>+ New integration</strong>, enter a name (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">mdspec</code>), and select the target workspace.</li>
              <li>Under <strong>Capabilities</strong>, ensure <strong>Read content</strong>, <strong>Update content</strong>, and <strong>Insert content</strong> are all checked.</li>
              <li>Click <strong>Save</strong>.</li>
            </ol>

            <p className="text-sm font-medium mt-2">Step 2 — Copy the integration token</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>On the integration settings page, under <strong>Secrets</strong>, click <strong>Show</strong> then <strong>Copy</strong>.</li>
              <li>The token starts with <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">ntn_</code> (newer workspaces) or <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">secret_</code>.</li>
            </ol>

            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
              <InfoIcon className="text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-900 dark:text-amber-200">You must share the page with the integration</AlertTitle>
              <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
                Notion does not grant integrations automatic access. Even with a valid token, the API returns <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">object not found</code> until you explicitly share the target page or database.
              </AlertDescription>
            </Alert>

            <p className="text-sm font-medium mt-2">Step 3 — Share the target page or database with the integration</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Open the target page or database in Notion.</li>
              <li>Click <strong>…</strong> (top-right) → <strong>Connections → Add a connection</strong>.</li>
              <li>Search for your integration by name and select it.</li>
            </ol>
            <p className="text-sm text-muted-foreground">Sub-pages of a shared page are automatically accessible — share only the top-level parent.</p>

            <p className="text-sm font-medium mt-2">Step 4 — Get the page or database ID</p>
            <p className="text-sm text-muted-foreground">
              Paste the page or database URL directly into the connect form — mdspec extracts the ID automatically. Database URLs contain a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">?v=</code> parameter; mdspec detects this and switches to database mode.
            </p>
            <CodeBlock>{`# Example page URL — the 32-char hex at the end is the page ID
https://www.notion.so/myworkspace/Engineering-Specs-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`}</CodeBlock>

            <p className="text-sm font-medium mt-2">Step 5 — Connect in mdspec</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Go to <strong>Dashboard → Integrations → Connect → Notion</strong>.</li>
              <li>Paste the integration token and the page or database URL.</li>
              <li>Optionally select a sub-page from the dropdown to narrow where specs publish.</li>
              <li>Click <strong>Save</strong>. mdspec validates against the Notion API before saving.</li>
            </ol>

            <Table
              headers={['Error', 'Likely cause']}
              rows={[
                ['`object not found` / 401', 'Integration not shared with the page — repeat step 3'],
                ['Could not extract page ID', 'Paste the full Notion page URL'],
                ['No sub-pages visible', 'Integration lacks Insert / Update content capability'],
              ]}
            />
          </section>

          <Separator />

          {/* ClickUp integration */}
          <section id="clickup" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">ClickUp integration</h2>
            <p className="text-sm text-muted-foreground">
              ClickUp supports two publish modes: <strong>doc pages</strong> (specs become pages inside a ClickUp Doc) and <strong>tasks</strong> (specs become tasks in a list). The mode is configured per folder mapping in <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> via the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">target</code> field.
            </p>

            <h3 className="text-sm font-semibold">Connect a ClickUp integration</h3>

            <p className="text-sm font-medium mt-2">Step 1 — Generate your Personal API token</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Sign in to <a href="https://app.clickup.com" target="_blank" rel="noreferrer" className="underline hover:text-foreground">app.clickup.com</a>.</li>
              <li>Click your <strong>avatar</strong> (upper-right corner) → <strong>Settings</strong>.</li>
              <li>In the left sidebar, scroll down and click <strong>Apps</strong>.</li>
              <li>Under <strong>API Token</strong>, click <strong>Generate</strong> (or <strong>Regenerate</strong> if one already exists).</li>
              <li>Copy the token — it starts with <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">pk_</code>.</li>
            </ol>
            <p className="text-sm text-muted-foreground">Your personal token grants the same access your account has in the browser and covers all workspaces your account belongs to.</p>

            <p className="text-sm font-medium mt-2">Step 2 — Find your Workspace URL</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>While logged in to ClickUp, copy the URL from your browser address bar. It looks like:</li>
            </ol>
            <CodeBlock>{`https://app.clickup.com/90181844797/v/l/...`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              mdspec automatically extracts the numeric workspace ID (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">90181844797</code>) from the URL and displays it below the field for confirmation.
            </p>

            <p className="text-sm font-medium mt-2">Step 3 — Connect in mdspec</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Go to <strong>Dashboard → Integrations → Connect → ClickUp</strong>.</li>
              <li>Paste your <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">pk_...</code> token and your full workspace URL.</li>
              <li>Click <strong>Save</strong>.</li>
            </ol>

            <Table
              headers={['Error', 'Likely cause']}
              rows={[
                ['Workspace ID not found', 'Paste the full https://app.clickup.com/... URL including the numeric segment'],
                ['`401 Unauthorized`', 'Token was regenerated — generate a new one and reconnect'],
                ['`403 Forbidden`', 'Account lacks access to the selected workspace or Doc'],
              ]}
            />

            <h3 className="text-sm font-semibold pt-2">Frontmatter</h3>
            <p className="text-sm text-muted-foreground">
              Use <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id</code> in frontmatter to bind a spec to an existing ClickUp task or doc page. See <a href="#frontmatter" className="underline hover:text-foreground">Frontmatter</a>.
            </p>
          </section>

          <Separator />

          {/* Confluence integration */}
          <section id="confluence" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Confluence integration</h2>
            <p className="text-sm text-muted-foreground">
              Specs are published as pages in a Confluence space. The space and parent page are configured via aliases in the dashboard, referenced from <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> as usual.
            </p>

            <h3 className="text-sm font-semibold">Connect a Confluence integration</h3>

            <p className="text-sm font-medium mt-2">Step 1 — Generate an Atlassian API token</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Go to <a href="https://id.atlassian.com/manage/api-tokens" target="_blank" rel="noreferrer" className="underline hover:text-foreground">id.atlassian.com/manage/api-tokens</a> and sign in.</li>
              <li>Click <strong>Create API token</strong>, give it a label (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">mdspec</code>), and set an expiry date.</li>
              <li>Click <strong>Create</strong> then <strong>Copy to clipboard</strong> immediately — the token is shown only once.</li>
            </ol>
            <p className="text-sm text-muted-foreground">Tokens expire after 1 year by default. When it expires, revoke the old token, generate a new one, and reconnect the integration in the dashboard.</p>

            <p className="text-sm font-medium mt-2">Step 2 — Find your Base URL</p>
            <p className="text-sm text-muted-foreground">
              Your base URL is the root Atlassian Cloud domain with no trailing path:
            </p>
            <CodeBlock>{`https://yourcompany.atlassian.net`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Do not include <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/wiki</code> or any path after the domain — mdspec appends <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/wiki/rest/api/...</code> automatically.
            </p>

            <p className="text-sm font-medium mt-2">Step 3 — Find your Space key</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>In Confluence, navigate to the target space and click <strong>Space settings</strong> in the left sidebar.</li>
              <li>The <strong>Space key</strong> is shown under <strong>Space details</strong> — a short uppercase string, e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">ENG</code>.</li>
            </ol>
            <p className="text-sm text-muted-foreground">Alternatively, read it from the URL:</p>
            <CodeBlock>{`https://yourcompany.atlassian.net/wiki/spaces/ENG/...
#                                               ^^^
#                                           space key`}</CodeBlock>

            <p className="text-sm font-medium mt-2">Step 4 — Check permissions</p>
            <p className="text-sm text-muted-foreground">
              The Atlassian account whose token you use must have <strong>Create and edit pages</strong> permission on the target space. Verify under <strong>Space settings → Permissions</strong>.
            </p>

            <p className="text-sm font-medium mt-2">Step 5 — Connect in mdspec</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Go to <strong>Dashboard → Integrations → Connect → Confluence</strong>.</li>
              <li>Fill in all four fields:</li>
            </ol>
            <Table
              headers={['Field', 'Example']}
              rows={[
                ['Base URL', '`https://yourcompany.atlassian.net`'],
                ['Email', 'The email on your Atlassian account'],
                ['API token', 'The token copied in step 1'],
                ['Space key', '`ENG`'],
              ]}
            />
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground" start={3}>
              <li>Click <strong>Save</strong>. mdspec validates the space key and credentials before saving.</li>
            </ol>

            <Table
              headers={['Error', 'Likely cause']}
              rows={[
                ['`Invalid credentials`', 'Wrong email, expired token, or extra whitespace in the token'],
                ['Space not found', 'Space key is wrong or the account cannot see that space'],
                ['Could not reach Confluence', 'Base URL has a trailing slash or extra path segment'],
                ['`403 Forbidden`', 'Account lacks Create / Edit page permissions in the space'],
              ]}
            />

            <h3 className="text-sm font-semibold pt-2">Frontmatter</h3>
            <p className="text-sm text-muted-foreground">
              Use <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id</code> in frontmatter to bind a spec to an existing Confluence page. See <a href="#frontmatter" className="underline hover:text-foreground">Frontmatter</a>.
            </p>
          </section>

          <Separator />

          {/* Example scenarios */}
          <section id="scenarios" className="scroll-mt-20 space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">Example scenarios</h2>
              <p className="text-sm text-muted-foreground">
                Worked examples for the two integrations with the most configuration surface — ClickUp and S3.
                Each scenario lists the repo layout, the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.mdspecmap</code> file(s), and the resulting routing.
              </p>
            </div>

            {/* Scenario 1 — ClickUp doc pages */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">1. ClickUp — specs as nested doc pages</h3>
              <p className="text-sm text-muted-foreground">
                Engineering specs publish as pages inside an existing ClickUp doc. Folder hierarchy is preserved — subfolders become nested page groups. Use this when you want long-form review, comments, and threaded discussion against your specs.
              </p>
              <CodeBlock>{`repo/
└── eng/
    └── specs/
        ├── .mdspecmap
        ├── overview.md
        ├── auth.md
        └── billing/
            ├── plans.md
            └── refunds.md`}</CodeBlock>
              <CodeBlock>{`# eng/specs/.mdspecmap
version: 1

mappings:
  - integration: clickup
    parent_doc: id:2kzm3ftx-5278   # the ClickUp doc all specs publish into
    skip:
      - DRAFT_*.md`}</CodeBlock>
              <p className="text-sm text-muted-foreground">
                <strong>Result:</strong> each <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.md</code> file becomes a page inside the configured doc. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">billing/plans.md</code> and <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">billing/refunds.md</code> publish under a <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">billing</code> page group. Drafts are skipped at the CLI before being uploaded.
              </p>
            </div>

            {/* Scenario 2 — ClickUp tasks (sprint board) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">2. ClickUp — sprint markdown as tasks with custom IDs</h3>
              <p className="text-sm text-muted-foreground">
                A sprint folder where every <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.md</code> file represents one work item. Each file becomes a ClickUp task in a configured list, with custom task IDs and an agent template that fills in status, priority, and tags from the markdown body.
              </p>
              <CodeBlock>{`repo/
└── eng/
    └── sprints/
        ├── .mdspecmap
        ├── 2026-W18-checkout-retries.md
        ├── 2026-W18-payment-webhook.md
        └── 2026-W18-flaky-test-cleanup.md`}</CodeBlock>
              <CodeBlock>{`# eng/sprints/.mdspecmap
version: 1

sub_folders: false              # sprint files are flat — never recurse

mappings:
  - integration: clickup
    target: task
    list_id: id:901812098656    # ClickUp list these tasks land in
    space_id: id:90185234       # space/folder containing the list
    custom_task_ids: true       # use ClickUp custom-task-id (e.g. ENG-1234)
    agent: Sprint Task Template # parses status/priority/tags from the body`}</CodeBlock>
              <p className="text-sm text-muted-foreground">
                <strong>Result:</strong> three tasks land in the configured ClickUp list. The <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Sprint Task Template</code> agent runs first and populates structured fields (status, priority, due date, tags) from the markdown — those fields then flow into ClickUp via the task adapter. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">sub_folders: false</code> keeps the sprint folder strictly flat.
              </p>
            </div>

            {/* Scenario 3 — Adopting existing ClickUp tasks */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">3. ClickUp — adopting existing tasks via specs[]</h3>
              <p className="text-sm text-muted-foreground">
                You already have ClickUp tasks for some of your specs and want mdspec to start updating them instead of creating duplicates. Use the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">specs:</code> block to bind specific files to native task IDs on first publish.
              </p>
              <CodeBlock>{`repo/
└── eng/
    └── tasks/
        ├── .mdspecmap
        ├── checkout-retry-policy.md      ← adopt CU-182
        ├── sla-policy.md                 ← adopt CU-305
        └── new-payment-flow.md           ← create new task`}</CodeBlock>
              <CodeBlock>{`# eng/tasks/.mdspecmap
version: 1

mappings:
  - integration: clickup
    target: task
    list_id: id:901812098656
    custom_task_ids: true

specs:
  checkout-retry-policy.md:
    title: Checkout Retry Policy   # overrides the body H1
    id: CU-182                     # bind to existing custom task ID
    agent: Task Template

  sla-policy.md:
    id: CU-305                     # bind only — no title override needed`}</CodeBlock>
              <p className="text-sm text-muted-foreground">
                <strong>Result:</strong> on first publish, mdspec resolves <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">CU-182</code> and <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">CU-305</code> to the existing tasks and stores the binding in the ledger. Subsequent edits update those tasks. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">new-payment-flow.md</code> has no <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">id</code> — it creates a fresh task in the configured list.
              </p>
            </div>

            {/* Scenario 4 — ClickUp docs + tasks split */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">4. ClickUp — docs and tasks side by side</h3>
              <p className="text-sm text-muted-foreground">
                One repo, two ClickUp modes. Long-form specs publish as doc pages for review; tracked work items publish as tasks. Two map files keep the routing isolated.
              </p>
              <CodeBlock>{`repo/
└── eng/
    ├── specs/
    │   ├── .mdspecmap        ← doc-page mode
    │   ├── auth.md
    │   └── billing/
    │       └── plans.md
    └── sprints/
        ├── .mdspecmap        ← task mode
        └── 2026-W18.md`}</CodeBlock>
              <CodeBlock>{`# eng/specs/.mdspecmap
version: 1
mappings:
  - integration: clickup
    parent_doc: id:2kzm3ftx-5278

---

# eng/sprints/.mdspecmap
version: 1
sub_folders: false
mappings:
  - integration: clickup
    target: task
    list_id: id:901812098656
    custom_task_ids: true
    agent: Sprint Task Template`}</CodeBlock>
              <p className="text-sm text-muted-foreground">
                <strong>Result:</strong> spec markdown becomes nested doc pages; sprint markdown becomes tasks. The same ClickUp connection serves both — the difference is purely in the mapping config (<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">parent_doc</code> vs. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">target: task</code> with <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">list_id</code>).
              </p>
            </div>

            {/* Scenario 5 — S3 flat markdown bucket */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">5. S3 — flat markdown archive</h3>
              <p className="text-sm text-muted-foreground">
                Push raw markdown to an S3 prefix for long-term storage or downstream consumption (search indexing, mirroring, etc.). With the default <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">maintain_hierarchy: false</code>, every spec lands as a flat object at <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{'<alias-prefix>/<basename>.md'}</code>.
              </p>
              <CodeBlock>{`repo/
└── docs/
    ├── .mdspecmap
    ├── auth.md
    ├── billing.md
    └── api/
        └── ratelimit.md`}</CodeBlock>
              <CodeBlock>{`# docs/.mdspecmap
version: 1

mappings:
  - integration: s3
    parent: alias:docs-archive   # alias → bucket key prefix, e.g. "docs/"
    skip:
      - DRAFT_*.md`}</CodeBlock>
              <CodeBlock>{`# resulting S3 keys (alias resolves to "docs/")
docs/auth.md
docs/billing.md
docs/ratelimit.md          ← flattened: no api/ prefix`}</CodeBlock>
              <p className="text-sm text-muted-foreground">
                <strong>Result:</strong> filenames are deduplicated against the alias prefix and uploaded flat — folder hierarchy is dropped by default. Use this when you want a simple, predictable file list at one prefix. To preserve subfolder structure, see scenario 6.
              </p>
            </div>

            {/* Scenario 6 — S3 with maintained hierarchy */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">6. S3 — preserve folder hierarchy under the alias prefix</h3>
              <p className="text-sm text-muted-foreground">
                A handbook with nested topics. You want the S3 layout to mirror the repo so downstream consumers (a static-site renderer, a search indexer, a cross-link crawler) can navigate by path. Set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">maintain_hierarchy: true</code> on the mapping.
              </p>
              <CodeBlock>{`repo/
└── handbook/
    ├── .mdspecmap
    ├── index.md
    ├── engineering/
    │   ├── onboarding.md
    │   └── oncall.md
    └── people/
        └── benefits.md`}</CodeBlock>
              <CodeBlock>{`# handbook/.mdspecmap
version: 1

mappings:
  - integration: s3
    parent: alias:handbook-site   # alias → "handbook/" key prefix
    maintain_hierarchy: true`}</CodeBlock>
              <CodeBlock>{`# resulting S3 keys (alias resolves to "handbook/")
handbook/index.md
handbook/engineering/onboarding.md
handbook/engineering/oncall.md
handbook/people/benefits.md`}</CodeBlock>
              <p className="text-sm text-muted-foreground">
                <strong>Result:</strong> the subfolder path under the mapping&apos;s scope (<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">handbook/</code>) is appended to the alias prefix, preserving the tree. Compare with scenario 5 where the same files would all collapse into <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">handbook/onboarding.md</code>, <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">handbook/oncall.md</code>, etc. — and basename collisions across folders would clobber each other.
              </p>
            </div>
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
            <CodeBlock>{`This project uses mdspec to publish markdown spec files to external tools (Notion, ClickUp, Confluence, S3, etc.).

Rules for working with spec files:

────────────────────────────────────────
SPEC FILES
────────────────────────────────────────

1. Spec files are plain markdown. Any .md file in a folder governed by a .mdspecmap is
   automatically picked up by mdspec on the next CI run. YAML frontmatter is optional —
   see rule 12 below.

────────────────────────────────────────
.mdspecmap FILE STRUCTURE
────────────────────────────────────────

2. A .mdspecmap file governs the folder it lives in and all subfolders (by default).
   The nearest .mdspecmap ancestor wins for any given spec file — a subfolder map takes
   full precedence over any ancestor map for files in that subtree.

   When to create a new .mdspecmap:
   - Put one in any subfolder that needs different integration, parent, or routing rules.
   - Do NOT add a folder: key inside mappings — location IS the scope.

3. Every .mdspecmap must start with:
     version: 1

   Top-level sections (all optional except mappings):
     version:   (required) always 1
     default:   fallback integration/parent/target/agent for mappings that omit them
     mappings:  (required) list of routing rules
     specs:     per-spec overrides, keyed by file path
     sub_folders: controls recursion (see rule 6)

────────────────────────────────────────
MAPPINGS
────────────────────────────────────────

4. Each mapping entry routes this folder's specs to one integration. Fields:

     integration:  notion | confluence | clickup | s3
     parent:       where specs publish inside the target tool (see rule 5)
     skip:         glob list of filenames/paths to exclude (see rule 7)
     depth:        max subfolder depth — omit for unlimited, 1 = direct children only
     agent:        agent template name to run before publishing
     target:       (ClickUp only) document (default) or task
     list_id:      (ClickUp task mode) id:<listId> — required when target: task
     parent_doc:   (ClickUp doc mode) id:<docId> — specs publish as pages inside this doc
     space_id:     (ClickUp) id:<spaceId> — space or folder containing the list/doc
     custom_task_ids: (ClickUp task mode) true to use custom task IDs (e.g. ENG-1234)
     maintain_hierarchy: (S3 only) true preserves subfolder paths under the alias prefix;
                         false (default) flattens to the basename

   Multiple mappings for the same folder = publishes to multiple integrations:
     mappings:
       - integration: notion
         parent: alias:eng-docs
       - integration: s3
         parent: alias:eng-specs

5. The parent: field supports four forms:
     parent: alias:<name>   # dashboard alias (most common)
     parent: id:<nativeId>  # raw native ID (ClickUp space/list/doc, Notion page ID, etc.)
     parent: link:<url>     # browser URL — CLI extracts the native ID at publish time
     parent: <bare>         # tries alias first, falls back to raw ID

6. Recursion — sub_folders: controls which subfolders are included:
     sub_folders: true      # (default/omitted) this folder and all subfolders recursively
     sub_folders: false     # direct children only — equivalent to depth: 1
     sub_folders:           # only the listed glob patterns (relative to this file's location)
       - api/**
       - guides/**

   depth: caps recursion depth regardless of sub_folders:
     depth: 1               # direct children only
     depth: 2               # one level of nesting

7. Skip patterns exclude files from publishing. Matched against filename AND path relative
   to the .mdspecmap file's location:
     skip:
       - DRAFT_*.md         # by filename pattern
       - _*.md
       - "**/scratch/**"    # by path pattern (quote globs with **)

8. default: sets fallback values for mappings that omit them:
     default:
       integration: clickup
       parent: alias:eng-docs
       target: document
       agent: My Template

   Per-mapping fields always override default. Mix freely:
     default:
       integration: clickup
       parent: alias:eng-docs
     mappings:
       - {}                          # inherits both from default
       - parent: alias:other-docs    # overrides parent only, inherits integration

────────────────────────────────────────
specs: SECTION
────────────────────────────────────────

9. When you CREATE a new spec file that needs a custom title, ID, or agent, add an entry:
     specs:
       path/to/new-file.md:
         title: Human Readable Title    # overrides H1 heading and filename derivation
         id: CU-123                     # binds to existing page/task in target tool
         agent: My Template             # agent template for this file only

   Title resolution order (highest priority first):
     1. frontmatter title:
     2. specs[path].title in .mdspecmap
     3. First # H1 heading in the file
     4. Filename (hyphens/underscores → spaces)

10. When you RENAME or MOVE a spec file:
    - Update the key in specs: to the new path.
    - The old key becomes stale — title overrides, agent, and ID bindings stop applying.
    Example:
      # Before
      specs:
        docs/old-name.md:
          title: My Spec
          id: CU-123
      # After
      specs:
        docs/new-name.md:
          title: My Spec
          id: CU-123

11. When you DELETE a spec file:
    - Remove its entry from specs: if one exists.
    - Do not remove the folder mapping — other files in the folder still use it.

    If a path contains spaces, quote the key:
      specs:
        "docs/my auth spec.md":
          title: Auth Spec
    Unquoted keys with spaces are invalid YAML and will cause a publish error.

────────────────────────────────────────
FRONTMATTER (per-file, overrides .mdspecmap)
────────────────────────────────────────

12. YAML frontmatter is optional. When present it takes precedence over .mdspecmap.
    Allowed keys: title, id, agent. Other keys are preserved on the artifact but ignored
    by adapters unless mapped explicitly via frontmatter_map.

      ---
      title: Human Readable Title
      id: 86abc123     # native ID of an existing page, doc, or task in the target tool
      agent: My Template
      ---
      # H1 here

    - Frontmatter is stripped before publishing — the remote doc never contains --- markers.
    - id: binds the spec to an existing remote page/task (all integrations).
      Changing it re-points the binding on the next publish.
    - title: overrides specs[].title in .mdspecmap and the body H1.
    - agent: runs this template instead of the folder-level agent.
    - To use a custom key name instead of id: (e.g. task:), set frontmatter_map on the
      mapping in .mdspecmap:
        mappings:
          - integration: clickup
            target: task
            list_id: id:901812345
            frontmatter_map:
              id: task       # read "task:" from frontmatter instead of "id:"
              title: heading # read "heading:" instead of "title:"`}</CodeBlock>
          </section>
        </main>
      </div>
    </div>
  )
}
