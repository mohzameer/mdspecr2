import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Changelog — mdspec',
  description: 'Release history and updates for mdspec.',
  alternates: { canonical: 'https://mdspec.dev/changelog' },
}

const RELEASES = [
  {
    version: '1.4',
    date: 'May 2026',
    tag: 'feature',
    items: [
      'Confluence Cloud adapter: full create / update / adopt-by-ID support',
      'sub_folders: string[] — restrict recursion to named globs',
      'frontmatter_map per mapping — rename id and title keys',
    ],
  },
  {
    version: '1.3',
    date: 'March 2026',
    tag: 'feature',
    items: [
      'Notion database-row mode (data source model, pinned to Notion-Version 2025-09-03)',
      'link: prefix for parent — paste a browser URL, CLI extracts the native ID',
      'sync_all_on_first_run: false option',
    ],
  },
  {
    version: '1.2',
    date: 'January 2026',
    tag: 'feature',
    items: [
      'Agent template support — assign Claude Haiku transforms to folders or individual specs',
      'ClickUp task mode (target: task with list_id)',
      'custom_task_ids support for ClickUp',
    ],
  },
  {
    version: '1.1',
    date: 'November 2025',
    tag: 'feature',
    items: [
      'S3 integration with maintain_hierarchy option',
      'Distributed .mdspecmap — place map files in any folder',
      'depth limiting per mapping',
    ],
  },
  {
    version: '1.0',
    date: 'September 2025',
    tag: 'launch',
    items: [
      'Initial public launch',
      'Notion and ClickUp doc-page adapters',
      'GitHub Actions CI integration',
      'npx mdspeci publish and npx mdspeci init CLI commands',
      'Alias system for decoupling map files from raw integration IDs',
    ],
  },
]

const TAG_STYLES: Record<string, string> = {
  launch: 'bg-green-50 text-green-700 border-green-200',
  feature: 'bg-brand/10 text-brand border-brand/20',
  fix: 'bg-orange-50 text-orange-700 border-orange-200',
}

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand">Changelog</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Release history</h1>
      <p className="mt-3 text-muted-foreground">
        Everything we&apos;ve shipped. Detailed technical notes are on the{' '}
        <a href="https://blog.mdspec.dev" className="text-brand underline-offset-2 hover:underline">blog</a>.
      </p>

      <div className="mt-12 space-y-10 border-l border-border/70 pl-6">
        {RELEASES.map((release) => (
          <div key={release.version} className="relative">
            <span className="absolute -left-[31px] top-1 size-2.5 rounded-full bg-brand ring-4 ring-background" />
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">v{release.version}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TAG_STYLES[release.tag]}`}>
                {release.tag}
              </span>
              <span className="text-sm text-muted-foreground">{release.date}</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {release.items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="select-none text-brand/50">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
