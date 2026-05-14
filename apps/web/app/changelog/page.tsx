import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

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
  launch: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/50',
  feature: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50',
  fix: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/50',
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto border-b border-border">
        <Link href="/" className="text-lg font-semibold tracking-tight">mdspec</Link>
        <div className="flex items-center gap-3">
          <Link href="/docs/api-reference" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Docs</Link>
          <Link href="/pricing" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Pricing</Link>
          <Link href="/login" className={buttonVariants({ size: 'sm' })}>Sign in</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Changelog</h1>
          <p className="text-muted-foreground">
            Release history for mdspec. Detailed technical notes are on the{' '}
            <a href="https://blog.mdspec.dev" className="underline hover:text-foreground">blog</a>.
          </p>
        </div>

        <Separator />

        <div className="space-y-10">
          {RELEASES.map((release) => (
            <div key={release.version} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold tracking-tight">v{release.version}</h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${TAG_STYLES[release.tag]}`}>
                  {release.tag}
                </span>
                <span className="text-sm text-muted-foreground">{release.date}</span>
              </div>
              <ul className="space-y-1">
                {release.items.map((item, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-muted-foreground/40 select-none">—</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>

      <Separator className="max-w-3xl mx-auto mt-12" />
      <footer className="px-6 py-8 max-w-3xl mx-auto flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Link href="/docs/api-reference" className="hover:text-foreground transition-colors">Docs</Link>
        <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
        <Link href="/security" className="hover:text-foreground transition-colors">Security</Link>
        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
      </footer>
    </div>
  )
}
