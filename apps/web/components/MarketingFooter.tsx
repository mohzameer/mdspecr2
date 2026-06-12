import Link from 'next/link'

const LINKS = [
  { href: '/docs/api-reference', label: 'Docs' },
  { href: 'https://github.com/mohzameer/mdspecr2', label: 'GitHub', external: true },
  { href: 'https://blog.mdspec.dev', label: 'Blog', external: true },
  { href: '/changelog', label: 'Changelog' },
  { href: '/security', label: 'Security' },
  { href: '/status', label: 'Status' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/contact', label: 'Contact' },
  { href: '/login', label: 'Sign in' },
]

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-muted-foreground sm:flex-row">
        <span className="flex items-center gap-2">
          <img src="/icon.svg" alt="" width={16} height={16} className="rounded-[3px]" />
          mdspec · open source
        </span>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {LINKS.map((l) =>
            l.external ? (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">
                {l.label}
              </a>
            ) : (
              <Link key={l.label} href={l.href} className="transition-colors hover:text-foreground">
                {l.label}
              </Link>
            )
          )}
        </div>
      </div>
    </footer>
  )
}
